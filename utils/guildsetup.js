const path = require('node:path');
const { getdata, updateData } = require('./json');

const SETUPS_FILE = path.join(__dirname, '..', 'setupids.json');

function isRecord(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function getGuildSetup(guildId) {
	const storedSetups = await getdata(SETUPS_FILE);
	return isRecord(storedSetups) && isRecord(storedSetups[guildId]) ? storedSetups[guildId] : null;
}

async function updateGuildSetup(guildId, updater) {
	let updatedSetup;

	await updateData(SETUPS_FILE, (storedSetups) => {
		const setups = isRecord(storedSetups) ? storedSetups : {};
		const currentSetup = isRecord(setups[guildId]) ? setups[guildId] : {};
		updatedSetup = updater(currentSetup);

		if (!isRecord(updatedSetup)) {
			throw new TypeError('Guild setup updater must return an object.');
		}

		setups[guildId] = { ...updatedSetup, guildId };
		return setups;
	});

	return updatedSetup;
}

async function getGuildChannel(guild, channelId) {
	if (!channelId) return null;

	const channel = await guild.channels.fetch(channelId).catch((error) => {
		console.error(`Failed to fetch configured channel ${channelId} for guild ${guild.id}:`, error);
		return null;
	});
	return channel?.guildId === guild.id && channel.isTextBased() ? channel : null;
}

async function getGuildRole(guild, roleId) {
	if (!roleId) return null;

	const role = await guild.roles.fetch(roleId).catch(() => null);
	return role?.guild.id === guild.id && role.id !== guild.id && role.position > 0 && !role.managed ? role : null;
}

module.exports = {
	getGuildChannel,
	getGuildRole,
	getGuildSetup,
	updateGuildSetup,
};