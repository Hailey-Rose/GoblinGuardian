const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');
const { spawn } = require('node:child_process');

const setupCommand = require('../commands/setup');
const { getGuildChannel, getGuildRole } = require('../utils/guildsetup');
const { getdata, updateData } = require('../utils/json');
const mutesTestFile = path.join(process.cwd(), '.test-goblin-guardian-mutes.json');
process.env.GOBLIN_GUARDIAN_MUTES_FILE = mutesTestFile;
const { applyMute, cleanupMuteRecord, getMuteRecord, removeMuteRecord, restoreMutes } = require('../utils/mutes');

function runJsonUpdate(file, key) {
	const jsonModule = path.join(process.cwd(), 'utils', 'json.js');
	const script = `const { updateData } = require(${JSON.stringify(jsonModule)}); updateData(${JSON.stringify(file)}, (data) => ({ ...data, [${JSON.stringify(key)}]: true })).catch((error) => { console.error(error); process.exitCode = 1; });`;
	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, ['-e', script], { cwd: process.cwd(), stdio: ['ignore', 'ignore', 'pipe'] });
		let stderr = '';
		child.stderr.on('data', (chunk) => { stderr += chunk; });
		child.on('error', reject);
		child.on('close', (code) => code === 0 ? resolve() : reject(new Error(stderr || `child exited with ${code}`)));
	});
}

test('setup exposes every guild-specific setting', () => {
	const optionNames = setupCommand.data.toJSON().options.map((option) => option.name);
	assert.deepEqual(optionNames, ['modlog', 'msglog', 'genlog', 'mutedrole']);
});

test('setup validation stays inside the current guild', async () => {
	const guild = {
		id: 'guild-a',
		channels: {
			fetch: async (channelId) => ({
				id: channelId,
				guildId: channelId === 'foreign-channel' ? 'guild-b' : 'guild-a',
				isTextBased: () => channelId !== 'voice-channel',
			}),
		},
		roles: {
			fetch: async (roleId) => ({
				id: roleId,
				guild: { id: roleId === 'foreign-role' ? 'guild-b' : 'guild-a' },
				managed: roleId === 'managed-role',
				position: roleId === 'everyone-role' ? 0 : 1,
			}),
		},
	};

	assert.ok(await getGuildChannel(guild, 'local-channel'));
	assert.equal(await getGuildChannel(guild, 'foreign-channel'), null);
	assert.equal(await getGuildChannel(guild, 'voice-channel'), null);
	assert.ok(await getGuildRole(guild, 'local-role'));
	assert.equal(await getGuildRole(guild, 'foreign-role'), null);
	assert.equal(await getGuildRole(guild, 'managed-role'), null);
});

test('concurrent guild updates preserve every guild record', async (t) => {
	const temporaryDirectory = await fs.mkdtemp(path.join(process.cwd(), '.test-goblin-guardian-'));
	t.after(() => fs.rm(temporaryDirectory, { recursive: true, force: true }));
	const file = path.join(temporaryDirectory, 'setups.json');

	await Promise.all(
		Array.from({ length: 8 }, (_, index) => updateData(file, (setups) => ({
			...setups,
			[`guild-${index}`]: { guildId: `guild-${index}` },
		}))),
	);

	const setups = await getdata(file);
	assert.equal(Object.keys(setups).length, 8);
	for (let index = 0; index < 8; index += 1) {
		assert.deepEqual(setups[`guild-${index}`], { guildId: `guild-${index}` });
	}
});

test('stale cleanup recovery preserves concurrent json writers', async (t) => {
	const temporaryDirectory = await fs.mkdtemp(path.join(process.cwd(), '.test-goblin-guardian-'));
	t.after(() => fs.rm(temporaryDirectory, { recursive: true, force: true }));
	const file = path.join(temporaryDirectory, 'setups.json');
	const lockFile = `${file}.lock`;
	const cleanupFile = `${lockFile}.cleanup`;
	const orphanedClaimFile = `${cleanupFile}.claim-crashed-cleaner`;
	const staleOwner = '99999999:0:dead';
	const staleTime = new Date(Date.now() - 20_000);

	await fs.writeFile(file, '{}');
	await fs.writeFile(lockFile, staleOwner);
	await fs.writeFile(cleanupFile, staleOwner);
	await fs.writeFile(orphanedClaimFile, staleOwner);
	await fs.utimes(lockFile, staleTime, staleTime);
	await fs.utimes(cleanupFile, staleTime, staleTime);
	await Promise.all(Array.from({ length: 4 }, (_, index) => runJsonUpdate(file, `guild-${index}`)));
	await fs.writeFile(lockFile, '');
	await fs.utimes(lockFile, staleTime, staleTime);
	await updateData(file, (data) => ({ ...data, 'empty-lock-recovered': true }));
	const setups = await getdata(file);

	assert.deepEqual(Object.keys(setups).sort(), ['empty-lock-recovered', 'guild-0', 'guild-1', 'guild-2', 'guild-3']);
});

test('mute transactions do not roll back a newer record after role failure', async (t) => {
	t.after(() => fs.rm(mutesTestFile, { force: true }));
	await fs.rm(mutesTestFile, { force: true });
	const previousMute = {
		recordId: 'previous',
		guildId: 'guild-mute',
		userId: 'user-mute',
		roleId: 'role-previous',
		expiresAt: Date.now() + 60 * 60 * 1000,
		reason: 'previous',
	};
	await fs.writeFile(mutesTestFile, JSON.stringify([previousMute]));

	const member = {
		guild: { id: previousMute.guildId },
		id: previousMute.userId,
		fetch: async () => ({ roles: { cache: new Map() } }),
		roles: {
			add: async (roleId) => {
				if (roleId === 'role-failed') throw new Error('role add failed');
			},
			remove: async () => {},
		},
	};
	const failedMute = { ...previousMute, recordId: 'failed', roleId: 'role-failed' };
	const successfulMute = { ...previousMute, recordId: 'successful', roleId: 'role-successful' };
	const [failedResult, successfulResult] = await Promise.all([
		applyMute(null, member, failedMute),
		applyMute(null, member, successfulMute),
	]);

	assert.equal(failedResult.status, 'role-error');
	assert.equal(successfulResult.status, 'ok');
	const successfulRecord = await getMuteRecord(previousMute.guildId, previousMute.userId);
	assert.equal(successfulRecord.recordId, successfulMute.recordId);
	assert.deepEqual(successfulRecord.roleIds.sort(), ['role-previous', 'role-successful']);
	await removeMuteRecord(previousMute.guildId, previousMute.userId, successfulRecord);
});

test('ambiguous role failure keeps a verified mute record', async (t) => {
	t.after(() => fs.rm(mutesTestFile, { force: true }));
	await fs.rm(mutesTestFile, { force: true });
	const mute = {
		recordId: 'ambiguous',
		guildId: 'guild-ambiguous',
		userId: 'user-ambiguous',
		roleId: 'role-ambiguous',
		expiresAt: Date.now() + 60 * 60 * 1000,
		reason: 'ambiguous',
	};
	await fs.writeFile(mutesTestFile, JSON.stringify([]));
	const member = {
		guild: { id: mute.guildId },
		id: mute.userId,
		roles: {
			add: async () => { throw new Error('request result lost'); },
		},
		fetch: async () => ({ roles: { cache: new Map([[mute.roleId, {}]]) } }),
	};

	assert.equal((await applyMute(null, member, mute)).status, 'ok');
	assert.equal((await getMuteRecord(mute.guildId, mute.userId)).recordId, mute.recordId);
	await removeMuteRecord(mute.guildId, mute.userId, mute);
});

test('mute cleanup keeps a record when role restoration wins the race', async (t) => {
	t.after(() => fs.rm(mutesTestFile, { force: true }));
	await fs.rm(mutesTestFile, { force: true });
	const mute = {
		recordId: 'cleanup-race',
		guildId: 'guild-cleanup',
		userId: 'user-cleanup',
		roleId: 'role-muted',
		expiresAt: Date.now() + 60 * 60 * 1000,
		reason: 'cleanup',
	};
	await fs.writeFile(mutesTestFile, JSON.stringify([mute]));
	let fetchCount = 0;
	const member = {
		guild: { id: mute.guildId },
		id: mute.userId,
		fetch: async () => {
			fetchCount += 1;
			return { roles: { cache: fetchCount === 1 ? new Map() : new Map([[mute.roleId, {}]]) } };
		},
	};

	assert.equal(await cleanupMuteRecord(null, member, mute.roleId), false);
	assert.equal((await getMuteRecord(mute.guildId, mute.userId)).recordId, mute.recordId);

	member.fetch = async () => ({ roles: { cache: new Map() } });
	assert.equal(await cleanupMuteRecord(null, member, mute.roleId), true);
	assert.equal(await getMuteRecord(mute.guildId, mute.userId), null);
});

test('mute expiry removes roles retained across configuration changes', async (t) => {
	t.after(() => fs.rm(mutesTestFile, { force: true }));
	await fs.rm(mutesTestFile, { force: true });
	const mute = {
		recordId: 'expiry-roles',
		guildId: 'guild-expiry',
		userId: 'user-expiry',
		roleId: 'role-new',
		roleIds: ['role-new', 'role-old'],
		expiresAt: Date.now() - 1000,
		reason: 'expiry',
	};
	await fs.writeFile(mutesTestFile, JSON.stringify([mute]));
	const removedRoles = [];
	const client = {
		guilds: {
			fetch: async () => ({
				members: {
					fetch: async () => ({ roles: { remove: async (roleId) => removedRoles.push(roleId) } }),
				},
			}),
		},
	};

	await restoreMutes(client);
	assert.deepEqual(removedRoles.sort(), ['role-new', 'role-old']);
	assert.equal(await getMuteRecord(mute.guildId, mute.userId), null);
});
