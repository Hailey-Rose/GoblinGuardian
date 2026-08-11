const { Events } = require('discord.js');
const { cleanupMuteRecord } = require('../utils/mutes');

module.exports = {
	name: Events.GuildMemberUpdate,
	async execute(oldMember, newMember, client) {
		const removedRoleIds = oldMember.roles.cache
			.filter((role) => !newMember.roles.cache.has(role.id))
			.map((role) => role.id);
		if (removedRoleIds.length === 0) return;

		try {
			for (const roleId of removedRoleIds) {
				await cleanupMuteRecord(client, newMember, roleId);
			}
		} catch (error) {
			console.error('Failed to clean up mute record:', error);
		}
	},
};