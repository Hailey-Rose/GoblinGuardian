const fs = require('node:fs/promises');
const path = require('node:path');

const MUTES_FILE = path.join(__dirname, '..', 'data', 'mutes.json');
const timers = new Map();

async function readMutes() {
	try {
		return JSON.parse(await fs.readFile(MUTES_FILE, 'utf8'));
	} catch (error) {
		if (error.code === 'ENOENT') return [];
		throw error;
	}
}

async function writeMutes(mutes) {
	await fs.mkdir(path.dirname(MUTES_FILE), { recursive: true });
	await fs.writeFile(MUTES_FILE, `${JSON.stringify(mutes, null, 2)}\n`, 'utf8');
}

function muteKey(guildId, userId) {
	return `${guildId}:${userId}`;
}

async function removeMuteRecord(guildId, userId) {
	const key = muteKey(guildId, userId);
	const timer = timers.get(key);
	if (timer) clearTimeout(timer);
	timers.delete(key);

	const mutes = await readMutes();
	await writeMutes(mutes.filter((mute) => mute.guildId !== guildId || mute.userId !== userId));
}

async function expireMute(client, mute) {
	const guild = await client.guilds.fetch(mute.guildId).catch(() => null);
	const member = await guild?.members.fetch(mute.userId).catch(() => null);
	if (member) await member.roles.remove(mute.roleId, 'Mute expired').catch(() => null);
	await removeMuteRecord(mute.guildId, mute.userId);
}

function scheduleMute(client, mute) {
	const delay = mute.expiresAt - Date.now();
	if (delay <= 0) {
		void expireMute(client, mute);
		return;
	}

	const key = muteKey(mute.guildId, mute.userId);
	const oldTimer = timers.get(key);
	if (oldTimer) clearTimeout(oldTimer);
	timers.set(key, setTimeout(() => void expireMute(client, mute), delay));
}

async function addMute(client, mute) {
	const mutes = await readMutes();
	const nextMutes = mutes.filter((item) => item.guildId !== mute.guildId || item.userId !== mute.userId);
	nextMutes.push(mute);
	await writeMutes(nextMutes);
	scheduleMute(client, mute);
}

async function restoreMutes(client) {
	const mutes = await readMutes();
	const activeMutes = mutes.filter((mute) => mute.expiresAt > Date.now());
	if (activeMutes.length !== mutes.length) await writeMutes(activeMutes);
	for (const mute of activeMutes) scheduleMute(client, mute);
	console.log(`Restored ${activeMutes.length} active mute(s).`);
}

module.exports = { addMute, removeMuteRecord, restoreMutes };
