const fs = require('node:fs/promises');
const path = require('node:path');
const { getdata, updateData } = require('./json');

const MUTES_FILE = process.env.GOBLIN_GUARDIAN_MUTES_FILE || path.join(__dirname, '..', 'data', 'mutes.json');
const timers = new Map();
const MAX_PENDING_MUTE_OPERATIONS = 32;
const MAX_TRACKED_MUTE_ROLES = 8;
const MAX_EXPIRATION_RETRIES = 5;
const MAX_ROLE_RESTORE_RETRIES = 5;
const ROLE_RESTORE_RETRY_MS = 60 * 1000;
const roleRetryTimers = new Map();
const retryTimers = new Map();
const MUTE_RETRY_MS = 60 * 1000;
const MAX_RECORD_RECOVERY_RETRIES = 5;
const RECORD_RECOVERY_RETRY_MS = 60 * 1000;
const recordRecoveryTimers = new Map();
const muteQueues = new Map();

function enqueueMuteOperation(guildId, operation) {
	let queue = muteQueues.get(guildId);
	if (!queue) {
		queue = { tail: Promise.resolve(), pending: 0 };
		muteQueues.set(guildId, queue);
	}
	if (queue.pending >= MAX_PENDING_MUTE_OPERATIONS) {
		return Promise.reject(new Error(`Too many pending mute operations for guild ${guildId}.`));
	}

	queue.pending += 1;
	const nextOperation = queue.tail.then(operation);
	queue.tail = nextOperation.then(
		() => undefined,
		() => undefined,
	);
	return nextOperation.finally(() => {
		queue.pending -= 1;
		if (queue.pending === 0 && muteQueues.get(guildId) === queue) muteQueues.delete(guildId);
	});
}

function asMuteList(value) {
	return Array.isArray(value) ? value : [];
}

async function readMutes() {
	return asMuteList(await getdata(MUTES_FILE));
}

async function updateMutes(updater) {
	await fs.mkdir(path.dirname(MUTES_FILE), { recursive: true });

	let updatedMutes;
	await updateData(MUTES_FILE, (storedMutes) => {
		updatedMutes = updater(asMuteList(storedMutes));
		if (!Array.isArray(updatedMutes)) {
			throw new TypeError('Mute updater must return an array.');
		}
		return updatedMutes;
	});
	return updatedMutes;
}

function muteKey(guildId, userId) {
	return `${guildId}:${userId}`;
}

function muteRoleIds(mute) {
	return [...new Set([mute.roleId, ...(Array.isArray(mute.roleIds) ? mute.roleIds : [])].filter(Boolean))];
}

function sameRoleSet(first, second) {
	const firstRoleIds = muteRoleIds(first).sort();
	const secondRoleIds = muteRoleIds(second).sort();
	return firstRoleIds.length === secondRoleIds.length && firstRoleIds.every((roleId, index) => roleId === secondRoleIds[index]);
}

function isSameMuteIdentity(first, second) {
	if (first.recordId || second.recordId) return first.recordId === second.recordId;
	return first.roleId === second.roleId && first.expiresAt === second.expiresAt;
}

function isSameMute(first, second) {
	return isSameMuteIdentity(first, second) && sameRoleSet(first, second);
}

async function getMuteRecord(guildId, userId) {
	const key = muteKey(guildId, userId);
	const mutes = await readMutes();
	return mutes.find((mute) => muteKey(mute.guildId, mute.userId) === key) ?? null;
}

async function removeMuteRecordNow(guildId, userId, expectedMute = null) {
	const key = muteKey(guildId, userId);
	let removed = false;

	await updateMutes((mutes) => mutes.filter((mute) => {
		if (muteKey(mute.guildId, mute.userId) !== key) return true;
		if (expectedMute && !isSameMute(mute, expectedMute)) return true;
		removed = true;
		return false;
	}));

	if (removed) clearMuteTimer(key, expectedMute);
}

function clearMuteTimer(key, expectedMute = null) {
	const timerEntry = timers.get(key);
	if (timerEntry && expectedMute && !isSameMute(timerEntry.mute, expectedMute)) return;
	if (timerEntry) clearTimeout(timerEntry.timer);
	timers.delete(key);
	const retryTimer = retryTimers.get(key);
	if (retryTimer) clearTimeout(retryTimer);
	retryTimers.delete(key);
	const roleRetryTimer = roleRetryTimers.get(key);
	if (roleRetryTimer) clearTimeout(roleRetryTimer);
	roleRetryTimers.delete(key);
	const recordRecoveryTimer = recordRecoveryTimers.get(key);
	if (recordRecoveryTimer) clearTimeout(recordRecoveryTimer);
	recordRecoveryTimers.delete(key);
}

function removeMuteRecord(guildId, userId, expectedMute = null) {
	return enqueueMuteOperation(guildId, () => removeMuteRecordNow(guildId, userId, expectedMute));
}

async function restoreMuteIfMissingNow(client, mute, member = null) {
	if (member) {
		let currentMember;
		try {
			currentMember = await member.fetch(true);
		} catch (error) {
			if (error.code === 10004 || error.code === 10007) return false;
			throw error;
		}
		if (!muteRoleIds(mute).some((roleId) => currentMember.roles.cache.has(roleId))) return false;
	}

	const key = muteKey(mute.guildId, mute.userId);
	let restored = false;
	await updateMutes((mutes) => {
		if (mutes.some((item) => muteKey(item.guildId, item.userId) === key)) return mutes;
		restored = true;
		return [...mutes, mute];
	});
	if (!restored) return false;
	if (member) {
		let confirmedMember;
		try {
			confirmedMember = await member.fetch(true);
		} catch (error) {
			if (error.code === 10004 || error.code === 10007) {
				await removeMuteRecordNow(mute.guildId, mute.userId, mute);
				return false;
			}
			throw error;
		}
		if (!muteRoleIds(mute).some((roleId) => confirmedMember.roles.cache.has(roleId))) {
			await removeMuteRecordNow(mute.guildId, mute.userId, mute);
			return false;
		}
	}
	if (client) scheduleMuteNow(client, mute);
	return true;
}

function retryMuteRecordRecovery(client, mute, member, error, retryCount = 0) {
	console.error('Failed to restore missing mute record:', error);
	if (retryCount >= MAX_RECORD_RECOVERY_RETRIES) {
		console.error(`Mute record requires manual cleanup for guild ${mute.guildId}, user ${mute.userId}.`);
		return;
	}

	const key = muteKey(mute.guildId, mute.userId);
	const oldRecoveryTimer = recordRecoveryTimers.get(key);
	if (oldRecoveryTimer) clearTimeout(oldRecoveryTimer);
	const recoveryTimer = setTimeout(() => {
		recordRecoveryTimers.delete(key);
		void enqueueMuteOperation(mute.guildId, () => restoreMuteIfMissingNow(client, mute, member)).catch((retryError) => {
			retryMuteRecordRecovery(client, mute, member, retryError, retryCount + 1);
		});
	}, RECORD_RECOVERY_RETRY_MS);
	recordRecoveryTimers.set(key, recoveryTimer);
}

function cleanupMuteRecord(client, member, roleId) {
	return enqueueMuteOperation(member.guild.id, async () => {
		const mute = await getMuteRecord(member.guild.id, member.id);
		const trackedRoleIds = mute ? muteRoleIds(mute) : [];
		if (!mute || !trackedRoleIds.includes(roleId)) return false;

		let currentMember;
		try {
			currentMember = await member.fetch(true);
		} catch (error) {
			if (error.code === 10004 || error.code === 10007) {
				await removeMuteRecordNow(member.guild.id, member.id, mute);
				return true;
			}
			throw error;
		}

		if (currentMember.roles.cache.has(roleId)) return false;
		const presentRoleIds = trackedRoleIds.filter((muteRoleId) => currentMember.roles.cache.has(muteRoleId));
		const key = muteKey(member.guild.id, member.id);
		let changedMute = null;
		if (presentRoleIds.length > 0) {
			await updateMutes((mutes) => mutes.map((storedMute) => {
				if (muteKey(storedMute.guildId, storedMute.userId) !== key || !isSameMute(storedMute, mute)) return storedMute;
				changedMute = { ...storedMute, roleId: presentRoleIds[0], roleIds: presentRoleIds };
				return changedMute;
			}));
			if (!changedMute) return false;
		}
		const expectedMute = changedMute ?? mute;

		let finalMember;
		try {
			finalMember = await member.fetch(true);
		} catch (error) {
			if (error.code === 10004 || error.code === 10007) {
				const currentMute = await getMuteRecord(member.guild.id, member.id);
				if (currentMute && isSameMuteIdentity(currentMute, expectedMute)) await removeMuteRecordNow(member.guild.id, member.id, currentMute);
				return true;
			}
			try {
				const currentMute = await getMuteRecord(member.guild.id, member.id);
				if (currentMute && client) {
					clearMuteTimer(key);
					scheduleMuteNow(client, currentMute);
				}
			} catch (recoveryError) {
				error.recoveryError = recoveryError;
			}
			throw error;
		}

		const finalRoleIds = trackedRoleIds.filter((muteRoleId) => finalMember.roles.cache.has(muteRoleId));
		if (finalRoleIds.length > 0) {
			const reconciledMute = { ...expectedMute, roleId: finalRoleIds[0], roleIds: finalRoleIds };
			let updated = false;
			try {
				await updateMutes((mutes) => mutes.map((storedMute) => {
					if (muteKey(storedMute.guildId, storedMute.userId) !== key || !isSameMute(storedMute, expectedMute)) return storedMute;
					updated = true;
					return reconciledMute;
				}));
			} catch (error) {
				try {
					const currentMute = await getMuteRecord(member.guild.id, member.id);
					if (currentMute && client) {
						clearMuteTimer(key);
						scheduleMuteNow(client, currentMute);
					}
				} catch (recoveryError) {
					error.recoveryError = recoveryError;
				}
				throw error;
			}
			if (updated && client) {
				clearMuteTimer(key);
				scheduleMuteNow(client, reconciledMute);
			}
			return false;
		}

		const latestMute = await getMuteRecord(member.guild.id, member.id);
		if (!latestMute || !isSameMuteIdentity(latestMute, expectedMute)) return false;
		await removeMuteRecordNow(member.guild.id, member.id, latestMute);

		let afterDeleteMember;
		try {
			afterDeleteMember = await member.fetch(true);
		} catch (error) {
			if (error.code === 10004 || error.code === 10007) return true;
			try {
				await restoreMuteIfMissingNow(client, latestMute, member);
			} catch (recoveryError) {
				retryMuteRecordRecovery(client, latestMute, member, recoveryError);
				error.recoveryError = recoveryError;
			}
			throw error;
		}
		const afterDeleteRoleIds = trackedRoleIds.filter((muteRoleId) => afterDeleteMember.roles.cache.has(muteRoleId));
		if (afterDeleteRoleIds.length === 0) return true;
		const restoredMute = { ...latestMute, roleId: afterDeleteRoleIds[0], roleIds: afterDeleteRoleIds };
		try {
			await restoreMuteIfMissingNow(client, restoredMute, member);
		} catch (error) {
			retryMuteRecordRecovery(client, restoredMute, member, error);
			throw error;
		}
		return false;
	});
}

async function restoreMuteRecordNow(client, expectedMute, previousMute = null) {
	const key = muteKey(expectedMute.guildId, expectedMute.userId);
	let restored = false;
	await updateMutes((mutes) => mutes.flatMap((mute) => {
		if (muteKey(mute.guildId, mute.userId) !== key || !isSameMute(mute, expectedMute)) return [mute];
		restored = true;
		return previousMute ? [previousMute] : [];
	}));

	if (restored) {
		clearMuteTimer(key);
		if (previousMute) {
			const currentMute = await getMuteRecord(previousMute.guildId, previousMute.userId);
			if (currentMute && isSameMute(currentMute, previousMute)) scheduleMuteNow(client, previousMute);
		}
	}
	return restored;
}

function restoreMuteRecord(client, expectedMute, previousMute = null) {
	return enqueueMuteOperation(expectedMute.guildId, () => restoreMuteRecordNow(client, expectedMute, previousMute));
}

function applyMute(client, member, mute) {
	return enqueueMuteOperation(mute.guildId, async () => {
		let previousMute;
		try {
			previousMute = await getMuteRecord(mute.guildId, mute.userId);
		} catch (error) {
			return { status: 'read-error', error };
		}

		const previousRoleIds = previousMute ? muteRoleIds(previousMute) : [];
		if (previousRoleIds.length >= MAX_TRACKED_MUTE_ROLES && !previousRoleIds.includes(mute.roleId)) {
			return {
				status: 'role-limit-error',
				error: new Error(`Mute has too many retained roles for guild ${mute.guildId}, user ${mute.userId}.`),
			};
		}
		const storedMute = {
			...mute,
			roleIds: muteRoleIds({ ...mute, roleIds: previousRoleIds }),
		};
		try {
			await updateMutes((mutes) => [
				...mutes.filter((item) => item.guildId !== mute.guildId || item.userId !== mute.userId),
				storedMute,
			]);
		} catch (error) {
			return { status: 'save-error', error };
		}

		let roleWarning = null;
		try {
			await member.roles.add(storedMute.roleId, storedMute.reason);
		} catch (error) {
			let currentMember;
			try {
				currentMember = await member.fetch(true);
			} catch (verificationError) {
				scheduleMuteNow(client, storedMute);
				return { status: 'uncertain-error', error, verificationError };
			}
			if (currentMember.roles.cache.has(storedMute.roleId)) {
				roleWarning = error;
			} else {
				try {
					await restoreMuteRecordNow(client, storedMute, previousMute);
				} catch (rollbackError) {
					let recoveryError = null;
					try {
						const currentMute = await getMuteRecord(mute.guildId, mute.userId);
						if (currentMute) scheduleMuteNow(client, currentMute);
					} catch (errorDuringRecovery) {
						recoveryError = errorDuringRecovery;
					}
					return { status: 'rollback-error', error, rollbackError, recoveryError };
				}
				return { status: 'role-error', error };
			}
		}
		const failedPreviousRoleIds = [];
		for (const roleId of previousRoleIds) {
			if (roleId === storedMute.roleId) continue;
			try {
				await member.roles.remove(roleId, 'Replaced mute role');
			} catch (error) {
				failedPreviousRoleIds.push(roleId);
				console.error('Failed to remove replaced mute role:', error);
			}
		}
		const cleanupWarning = failedPreviousRoleIds.length > 0 ? new Error('Some previous mute roles remain tracked.') : null;

		let recoveryWarning = cleanupWarning;
		try {
			await restoreMuteIfMissingNow(client, storedMute, member);
		} catch (error) {
			recoveryWarning ??= error;
			scheduleMuteNow(client, storedMute);
		}
		try {
			const currentMute = await getMuteRecord(mute.guildId, mute.userId);
			if (!currentMute) {
				const recoveryError = new Error('Mute record disappeared after role application.');
				retryMuteRecordRecovery(client, storedMute, member, recoveryError);
				return { status: 'role-cleanup-error', error: recoveryError, applied: true, cleanupWarning: recoveryWarning };
			}
			scheduleMuteNow(client, currentMute);
		} catch (error) {
			retryMuteRecordRecovery(client, storedMute, member, error);
			return { status: 'role-cleanup-error', error, applied: true, cleanupWarning: recoveryWarning };
		}
		return {
			status: 'ok',
			warning: roleWarning,
			cleanupWarning: recoveryWarning,
		};
	});
}

async function expireMuteNow(client, mute) {
	const currentMute = await getMuteRecord(mute.guildId, mute.userId);
	if (!currentMute || !isSameMuteIdentity(currentMute, mute)) {
		clearMuteTimer(muteKey(mute.guildId, mute.userId), mute);
		return;
	}

	let guild;
	try {
		guild = await client.guilds.fetch(currentMute.guildId);
	} catch (error) {
		if (error.code === 10004) {
			await removeMuteRecordNow(currentMute.guildId, currentMute.userId, currentMute);
			return;
		}
		throw error;
	}

	let member;
	try {
		member = await guild?.members.fetch(currentMute.userId);
	} catch (error) {
		if (error.code === 10007) {
			await removeMuteRecordNow(currentMute.guildId, currentMute.userId, currentMute);
			return;
		}
		throw error;
	}

	if (!member) {
		await removeMuteRecordNow(currentMute.guildId, currentMute.userId, currentMute);
		return;
	}

	for (const roleId of muteRoleIds(currentMute)) {
		try {
			await member.roles.remove(roleId, 'Mute expired');
		} catch (error) {
			let latestMute;
			try {
				latestMute = await getMuteRecord(currentMute.guildId, currentMute.userId);
			} catch (recoveryError) {
				error.recoveryError = recoveryError;
				throw error;
			}
			if (latestMute && !isSameMute(latestMute, currentMute)) {
				try {
					await restoreMuteRoleNow(client, latestMute);
				} catch (restoreError) {
					retryMuteRole(client, latestMute, restoreError);
				}
				return;
			}
			throw error;
		}
	}
	const latestMute = await getMuteRecord(currentMute.guildId, currentMute.userId);
	if (latestMute && !isSameMute(latestMute, currentMute)) {
		try {
			await restoreMuteRoleNow(client, latestMute);
		} catch (error) {
			retryMuteRole(client, latestMute, error);
		}
		return;
	}
	if (latestMute) await removeMuteRecordNow(latestMute.guildId, latestMute.userId, latestMute);
}

function expireMute(client, mute) {
	return enqueueMuteOperation(mute.guildId, () => expireMuteNow(client, mute));
}

function retryExpiration(client, mute, error, retryCount = 0) {
	console.error('Failed to expire mute:', error);
	if (retryCount >= MAX_EXPIRATION_RETRIES) {
		console.error(`Mute expiration requires manual cleanup for guild ${mute.guildId}, user ${mute.userId}, role ${mute.roleId}.`);
		return;
	}

	const key = muteKey(mute.guildId, mute.userId);
	const oldRetryTimer = retryTimers.get(key);
	if (oldRetryTimer) clearTimeout(oldRetryTimer);
	const retryTimer = setTimeout(() => {
		retryTimers.delete(key);
		void expireMute(client, mute).catch((retryError) => retryExpiration(client, mute, retryError, retryCount + 1));
	}, MUTE_RETRY_MS);
	retryTimers.set(key, retryTimer);
}

function scheduleMuteNow(client, mute) {
	const key = muteKey(mute.guildId, mute.userId);
	const runExpiration = () => {
		void expireMute(client, mute).catch((error) => retryExpiration(client, mute, error));
	};
	const delay = mute.expiresAt - Date.now();
	if (delay <= 0) {
		runExpiration();
		return;
	}

	clearMuteTimer(key);
	const timer = setTimeout(runExpiration, delay);
	timers.set(key, { mute, timer });
}

async function scheduleMute(client, mute) {
	return enqueueMuteOperation(mute.guildId, async () => {
		const currentMute = await getMuteRecord(mute.guildId, mute.userId);
		if (currentMute && isSameMute(currentMute, mute)) scheduleMuteNow(client, mute);
	});
}

function addMute(client, mute, { schedule = true } = {}) {
	return enqueueMuteOperation(mute.guildId, async () => {
		await updateMutes((mutes) => [
			...mutes.filter((item) => item.guildId !== mute.guildId || item.userId !== mute.userId),
			mute,
		]);
		if (schedule) scheduleMuteNow(client, mute);
		else clearMuteTimer(muteKey(mute.guildId, mute.userId));
	});
}

async function restoreMuteRoleNow(client, mute, reconcileDepth = 0) {
	const currentMute = await getMuteRecord(mute.guildId, mute.userId);
	if (!currentMute || !isSameMuteIdentity(currentMute, mute)) return;
	let guild;
	try {
		guild = await client.guilds.fetch(currentMute.guildId);
	} catch (error) {
		if (error.code === 10004) {
			await removeMuteRecordNow(currentMute.guildId, currentMute.userId, currentMute);
			return;
		}
		throw error;
	}

	let member;
	try {
		member = await guild?.members.fetch(currentMute.userId);
	} catch (error) {
		if (error.code === 10007) {
			await removeMuteRecordNow(currentMute.guildId, currentMute.userId, currentMute);
			return;
		}
		throw error;
	}

	if (!member) {
		await removeMuteRecordNow(currentMute.guildId, currentMute.userId, currentMute);
		return;
	}

	for (const roleId of muteRoleIds(currentMute)) {
		await member.roles.add(roleId, 'Mute restored');
	}

	const latestMute = await getMuteRecord(currentMute.guildId, currentMute.userId);
	if (!latestMute) {
		for (const roleId of muteRoleIds(currentMute)) {
			await member.roles.remove(roleId, 'Mute no longer active');
		}
		return;
	}
	if (!isSameMute(latestMute, currentMute) && reconcileDepth < 2) {
		try {
			await restoreMuteRoleNow(client, latestMute, reconcileDepth + 1);
		} catch (error) {
			retryMuteRole(client, latestMute, error);
		}
	}
}

function restoreMuteRole(client, mute) {
	return enqueueMuteOperation(mute.guildId, () => restoreMuteRoleNow(client, mute));
}

function retryMuteRole(client, mute, error, retryCount = 0) {
	console.error('Failed to restore mute role:', error);
	if (retryCount >= MAX_ROLE_RESTORE_RETRIES) {
		console.error(`Mute role restoration requires manual cleanup for guild ${mute.guildId}, user ${mute.userId}, role ${mute.roleId}.`);
		return;
	}

	const key = muteKey(mute.guildId, mute.userId);
	const oldRetryTimer = roleRetryTimers.get(key);
	if (oldRetryTimer) clearTimeout(oldRetryTimer);
	const retryTimer = setTimeout(() => {
		roleRetryTimers.delete(key);
		void restoreMuteRole(client, mute).catch((retryError) => {
			retryMuteRole(client, mute, retryError, retryCount + 1);
		});
	}, ROLE_RESTORE_RETRY_MS);
	roleRetryTimers.set(key, retryTimer);
}

async function restoreMutes(client) {
	const mutes = await readMutes();
	const activeMutes = mutes.filter((mute) => mute.expiresAt > Date.now());
	for (const mute of activeMutes) {
		await scheduleMute(client, mute);
		await restoreMuteRole(client, mute).catch((error) => retryMuteRole(client, mute, error));
	}
	for (const mute of mutes) {
		if (mute.expiresAt <= Date.now()) {
			await expireMute(client, mute).catch((error) => retryExpiration(client, mute, error));
		}
	}
	console.log(`Restored ${activeMutes.length} active mute(s).`);
}

module.exports = { addMute, applyMute, cleanupMuteRecord, getMuteRecord, removeMuteRecord, restoreMuteRecord, restoreMutes, scheduleMute };