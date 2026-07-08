const { Events } = require('discord.js');
const { removeMuteRecord } = require('../utils/mutes');
const { mutedRole: mutedRoleId } = require('../config.json');

module.exports = {
	name: Events.GuildMemberUpdate,
	async execute(oldMember, newMember) {
		if (oldMember.roles.cache.has(mutedRoleId) && !newMember.roles.cache.has(mutedRoleId)) {
			await removeMuteRecord(newMember.guild.id, newMember.id);
		}
	},
};
