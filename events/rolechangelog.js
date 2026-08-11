const { Events, EmbedBuilder } = require('discord.js');
const { getGuildChannel, getGuildSetup } = require('../utils/guildsetup');
const { truncateText } = require('../utils/text');

module.exports = {
	name: Events.GuildMemberUpdate,
	async execute(oldMember, newMember) {
		const addedRoles = newMember.roles.cache.filter((role) => !oldMember.roles.cache.has(role.id));
		const removedRoles = oldMember.roles.cache.filter((role) => !newMember.roles.cache.has(role.id));
		if (!addedRoles.size && !removedRoles.size) return;

		const setup = await getGuildSetup(newMember.guild.id).catch((error) => {
			console.error('Failed to read guild setup:', error);
			return null;
		});
		const sendChannel = await getGuildChannel(newMember.guild, setup?.modLogs);
		if (!sendChannel) return;

		const updateTime = `<t:${Math.floor(Date.now() / 1000)}:R>`;
		const updated = new EmbedBuilder()
			.setColor('Blue')
			.setTitle('Role(s) Added/Removed')
			.setDescription(`Role(s) updated ${updateTime}`)
			.addFields(
				{ name: 'User', value: `${oldMember.user} || ${oldMember.displayName}` },
				{ name: 'Added Roles', value: truncateText(addedRoles.map((role) => role.name).join(', ') || 'None', 1024) },
				{ name: 'Removed Roles', value: truncateText(removedRoles.map((role) => role.name).join(', ') || 'None', 1024) },
			);

		await sendChannel.send({ embeds: [updated] }).catch((error) => {
			console.error('Failed to send role change log:', error);
		});
	},
};