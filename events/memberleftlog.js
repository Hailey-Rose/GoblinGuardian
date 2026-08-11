const { Events, EmbedBuilder } = require('discord.js');
const { getGuildChannel, getGuildSetup } = require('../utils/guildsetup');

module.exports = {
	name: Events.GuildMemberRemove,
	async execute(member) {
		const setup = await getGuildSetup(member.guild.id).catch((error) => {
			console.error('Failed to read guild setup:', error);
			return null;
		});
		const sendChannel = await getGuildChannel(member.guild, setup?.genLogs);
		if (!sendChannel) return;

		const updateTime = `<t:${Math.floor(Date.now() / 1000)}:R>`;
		const embed = new EmbedBuilder()
			.setColor('Blurple')
			.setTitle('Member Left')
			.setDescription(`Member left ${updateTime}`)
			.addFields(
				{ name: 'User', value: `${member.user} || ${member.user.tag}` },
				{ name: 'User ID', value: member.id },
			);

		await sendChannel.send({ embeds: [embed] }).catch((error) => {
			console.error('Failed to send member leave log:', error);
		});
	},
};