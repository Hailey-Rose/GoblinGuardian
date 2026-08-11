const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

const MAX_PENDING_UPDATES = 32;
const LOCK_RETRY_MS = 25;
const LOCK_TIMEOUT_MS = 10_000;
const LOCK_HEARTBEAT_MS = 1_000;
const LOCK_STALE_MS = 10_000;
const MAX_CLEANUP_MARKERS = 32;
const MAX_PROCESS_START_CACHE = 128;
const updateQueues = new Map();
const PROCESS_OWNER_TOKEN = Math.random().toString(16).slice(2);
const PROCESS_START_TIME = Date.now() - Math.floor(process.uptime() * 1000);
const processStartTimes = new Map();

async function getdata(file) {
	try {
		return JSON.parse(await fs.readFile(file, 'utf8'));
	} catch (error) {
		if (error.code === 'ENOENT') {
			console.log(`File ${file} not found.`);
			return {};
		}
		throw error;
	}
}

async function removeStaleTemporaryFiles(file) {
	const directory = path.dirname(file);
	const prefix = `${path.basename(file)}.`;
	const entries = await fs.readdir(directory).catch((error) => {
		if (error.code === 'ENOENT') return [];
		throw error;
	});
	for (const entry of entries) {
		if (!entry.startsWith(prefix) || !entry.endsWith('.tmp')) continue;
		const temporaryFile = path.join(directory, entry);
		const stats = await fs.stat(temporaryFile).catch((error) => {
			if (error.code === 'ENOENT') return null;
			throw error;
		});
		if (stats && Date.now() - stats.mtimeMs > LOCK_STALE_MS) {
			await fs.unlink(temporaryFile).catch((error) => {
				if (error.code !== 'ENOENT') throw error;
			});
		}
	}
}
async function savedata(file, data) {
	await removeStaleTemporaryFiles(file);
	const temporaryFile = `${file}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;

	try {
		await fs.writeFile(temporaryFile, JSON.stringify(data, null, 2), 'utf8');
		await fs.rename(temporaryFile, file);
	} finally {
		await fs.unlink(temporaryFile).catch(() => {});
	}
}

function createLockOwner() {
	return `${process.pid}:${Math.floor(PROCESS_START_TIME)}:${PROCESS_OWNER_TOKEN}`;
}

async function removeDeadLockIdentities(lockPath) {
	const directory = path.dirname(lockPath);
	const prefix = `${path.basename(lockPath)}.identity-`;
	const entries = await fs.readdir(directory).catch((error) => {
		if (error.code === 'ENOENT') return [];
		throw error;
	});
	for (const entry of entries) {
		if (!entry.startsWith(prefix)) continue;
		const pid = Number.parseInt(entry.slice(prefix.length), 10);
		if (Number.isInteger(pid) && isProcessAlive(pid)) continue;
		await fs.unlink(path.join(directory, entry)).catch((error) => {
			if (error.code !== 'ENOENT') throw error;
		});
	}
}

async function registerLockOwner(lockPath) {
	await removeDeadLockIdentities(lockPath);
	await fs.writeFile(`${lockPath}.identity-${process.pid}`, PROCESS_OWNER_TOKEN, 'utf8');
}

function isProcessAlive(pid) {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return error.code === 'EPERM';
	}
}

async function removeLockIdentity(lockPath, lockOwner) {
	const token = lockOwner.trim().split(':')[2];
	if (!token) return;
	const identityPath = `${lockPath}.identity-${lockOwner.trim().split(':', 1)[0]}`;
	const registeredToken = await fs.readFile(identityPath, 'utf8').catch((error) => {
		if (error.code === 'ENOENT') return null;
		throw error;
	});
	if (registeredToken?.trim() === token) await fs.unlink(identityPath).catch((error) => {
		if (error.code !== 'ENOENT') throw error;
	});
}

async function getProcessStartTime(pid) {
	if (pid === process.pid) return PROCESS_START_TIME;
	const cached = processStartTimes.get(pid);
	if (cached && Date.now() - cached.checkedAt < 1000) return cached.startTime;

	let startTime = null;
	try {
		const result = await execFileAsync('ps', ['-p', String(pid), '-o', 'lstart='], { encoding: 'utf8', timeout: 1000 });
		const parsedStartTime = Date.parse(result.stdout.trim());
		if (Number.isFinite(parsedStartTime)) startTime = parsedStartTime;
	} catch {
		startTime = null;
	}
	processStartTimes.set(pid, { checkedAt: Date.now(), startTime });
	if (processStartTimes.size > MAX_PROCESS_START_CACHE) processStartTimes.delete(processStartTimes.keys().next().value);
	return startTime;
}

async function isLockOwnerAlive(lockOwner, lockPath, checkStartTime = true) {
	const [pidText, startTimeText, token] = lockOwner.trim().split(':');
	const pid = Number.parseInt(pidText, 10);
	const ownerStartTime = Number.parseInt(startTimeText, 10);
	if (!Number.isInteger(pid) || pid <= 0 || !isProcessAlive(pid)) return false;
	if (checkStartTime && Number.isFinite(ownerStartTime) && ownerStartTime > 0) {
		const actualStartTime = await getProcessStartTime(pid);
		if (actualStartTime !== null && Math.abs(actualStartTime - ownerStartTime) > 2000) return false;
	}
	if (token && lockPath) {
		const identityPath = `${lockPath}.identity-${pid}`;
		const registeredToken = await fs.readFile(identityPath, 'utf8').catch((error) => {
			if (error.code === 'ENOENT') return null;
			throw error;
		});
		if (registeredToken && registeredToken.trim() !== token) return false;
	}
	return true;
}

async function removeDeadLockTemps(lockPath) {
	const directory = path.dirname(lockPath);
	const prefix = `${path.basename(lockPath)}.`;
	const suffix = '.locktmp';
	const entries = await fs.readdir(directory).catch((error) => {
		if (error.code === 'ENOENT') return [];
		throw error;
	});
	for (const entry of entries) {
		if (!entry.startsWith(prefix) || !entry.endsWith(suffix)) continue;
		const pid = Number.parseInt(entry.slice(prefix.length, -suffix.length), 10);
		if (Number.isInteger(pid) && isProcessAlive(pid)) continue;
		await fs.unlink(path.join(directory, entry)).catch((error) => {
			if (error.code !== 'ENOENT') throw error;
		});
	}
}

async function createFileLock(lockPath, owner) {
	await removeDeadLockTemps(lockPath);
	const temporaryFile = `${lockPath}.${process.pid}.locktmp`;
	try {
		await fs.writeFile(temporaryFile, owner, 'utf8');
		await fs.link(temporaryFile, lockPath);
		return true;
	} catch (error) {
		if (error.code === 'EEXIST') return false;
		throw error;
	} finally {
		await fs.unlink(temporaryFile).catch(() => {});
	}
}

async function refreshLock(lockPath, owner) {
	try {
		if ((await fs.readFile(lockPath, 'utf8')).trim() !== owner) return;
		const now = new Date();
		await fs.utimes(lockPath, now, now);
		await fs.utimes(`${lockPath}.identity-${process.pid}`, now, now);
	} catch {
		return;
	}
}
function cleanupMarkerPrefix(lockPath) {
	return path.basename(`${lockPath}.cleanup`);
}

async function getCleanupMarkers(lockPath) {
	const directory = path.dirname(lockPath);
	const cleanupName = cleanupMarkerPrefix(lockPath);
	const entries = await fs.readdir(directory).catch((error) => {
		if (error.code === 'ENOENT') return [];
		throw error;
	});
	const markerEntries = entries.filter((entry) => entry === cleanupName || entry.startsWith(`${cleanupName}.claim-`) || entry.startsWith(`${cleanupName}.reclaim-`));
	return {
		markers: markerEntries.slice(0, MAX_CLEANUP_MARKERS).map((entry) => path.join(directory, entry)),
		truncated: markerEntries.length > MAX_CLEANUP_MARKERS,
	};
}

async function removeStaleCleanupMarkers(lockPath) {
	let active = false;
	for (const markerPath of (await getCleanupMarkers(lockPath)).markers) {
		const owner = await fs.readFile(markerPath, 'utf8').catch((error) => {
			if (error.code === 'ENOENT') return null;
			throw error;
		});
		if (owner && await isLockOwnerAlive(owner, lockPath, false)) {
			active = true;
			continue;
		}

		const reclaimedPath = `${markerPath}.reclaim-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
		try {
			await fs.rename(markerPath, reclaimedPath);
		} catch (error) {
			if (error.code === 'ENOENT') continue;
			throw error;
		}
		await fs.unlink(reclaimedPath).catch((error) => {
			if (error.code !== 'ENOENT') throw error;
		});
	}
	return active;
}

async function acquireCleanupLock(lockPath, cleanupOwner) {
	if (await removeStaleCleanupMarkers(lockPath)) return null;
	const cleanupPath = `${lockPath}.cleanup`;
	try {
		await fs.writeFile(cleanupPath, cleanupOwner, { encoding: 'utf8', flag: 'wx' });
		return cleanupPath;
	} catch (error) {
		if (error.code === 'EEXIST') return null;
		throw error;
	}
}

async function hasCleanupLock(lockPath) {
	return removeStaleCleanupMarkers(lockPath);
}

async function removeDeadLock(lockPath, expectedOwner) {
	await registerLockOwner(lockPath);
	const cleanupOwner = createLockOwner();
	const cleanupLeasePath = await acquireCleanupLock(lockPath, cleanupOwner);
	if (!cleanupLeasePath) return false;

	try {
		const currentOwner = await fs.readFile(lockPath, 'utf8').catch((error) => {
			if (error.code === 'ENOENT') return null;
			throw error;
		});
		if (currentOwner === null || currentOwner.trim() !== expectedOwner.trim() || (currentOwner && await isLockOwnerAlive(currentOwner, lockPath))) return false;
		await fs.unlink(lockPath).catch((error) => {
			if (error.code !== 'ENOENT') throw error;
		});
		await removeLockIdentity(lockPath, expectedOwner);
		return true;
	} finally {
		await fs.unlink(cleanupLeasePath).catch((error) => {
			if (error.code !== 'ENOENT') throw error;
		});
	}
}


async function acquireFileLock(file) {
	const lockPath = `${file}.lock`;
	const owner = createLockOwner();
	await registerLockOwner(lockPath);
	const deadline = Date.now() + LOCK_TIMEOUT_MS;

	while (true) {
		try {
			if (!await createFileLock(lockPath, owner)) {
				const lockExistsError = new Error(`JSON lock already exists: ${file}.`);
				lockExistsError.code = 'EEXIST';
				throw lockExistsError;
			}
			let cleanupActive;
			try {
				cleanupActive = await hasCleanupLock(lockPath);
			} catch (error) {
				await fs.unlink(lockPath).catch(() => {});
				throw error;
			}
			if (cleanupActive) {
				await fs.unlink(lockPath);
				continue;
			}
			const heartbeat = setInterval(() => {
				void refreshLock(lockPath, owner);
			}, LOCK_HEARTBEAT_MS);
			return async () => {
				clearInterval(heartbeat);
				try {
					if ((await fs.readFile(lockPath, 'utf8')).trim() === owner) {
						await fs.unlink(lockPath);
					}
				} catch (error) {
					if (error.code !== 'ENOENT') throw error;
				} finally {
					await removeLockIdentity(lockPath, owner);
				}
			};
		} catch (error) {
			if (error.code !== 'EEXIST') {
				await removeLockIdentity(lockPath, owner);
				throw error;
			}

			try {
				const lockStats = await fs.stat(lockPath);
				if (Date.now() - lockStats.mtimeMs > LOCK_STALE_MS) {
					const lockOwner = await fs.readFile(lockPath, 'utf8').catch((lockError) => {
						if (lockError.code === 'ENOENT') return null;
						throw lockError;
					});
					if (lockOwner !== null && !await isLockOwnerAlive(lockOwner, lockPath) && await removeDeadLock(lockPath, lockOwner)) continue;
					}
			} catch (lockError) {
				if (lockError.code !== 'ENOENT') throw lockError;
			}
			if (Date.now() >= deadline) {
				await removeLockIdentity(lockPath, owner);
				throw new Error(`Timed out waiting for JSON lock ${file}.`, { cause: error });
			}

			await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_MS));
		}
	}
}

function updateData(file, updater) {
	let queue = updateQueues.get(file);
	if (!queue) {
		queue = { tail: Promise.resolve(), pending: 0 };
		updateQueues.set(file, queue);
	}
	if (queue.pending >= MAX_PENDING_UPDATES) {
		return Promise.reject(new Error(`Too many pending JSON updates for ${file}.`));
	}

	queue.pending += 1;
	const operation = queue.tail.then(async () => {
		const releaseLock = await acquireFileLock(file);
		try {
			const data = await getdata(file);
			const updatedData = await updater(data);
			await savedata(file, updatedData);
			return updatedData;
		} finally {
			await releaseLock();
		}
	});
	queue.tail = operation.then(
		() => undefined,
		() => undefined,
	);

	return operation.finally(() => {
		queue.pending -= 1;
		if (queue.pending === 0 && updateQueues.get(file) === queue) updateQueues.delete(file);
	});
}

module.exports = { getdata, savedata, updateData };
