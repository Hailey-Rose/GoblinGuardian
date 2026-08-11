const { Events, EmbedBuilder } = require('discord.js');
const { getGuildChannel, getGuildSetup } = require('../utils/guildsetup');
const { truncateText } = require('../utils/text');

module.exports = {
	name: Events.MessageDelete,
	async execute(message) {
		if (!message.guild || message.author?.bot) return;

		const setup = await getGuildSetup(message.guild.id).catch((error) => {
			console.error('Failed to read guild setup:', error);
			return null;
		});
		const sendChannel = await getGuildChannel(message.guild, setup?.msgLogs);
		if (!sendChannel) return;

		const attachments = [...message.attachments.values()].map((attachment) => attachment.url);
		const author = message.author;
		const deleteTime = `<t:${Math.floor(Date.now() / 1000)}:R>`;

		const embed = new EmbedBuilder()
			.setColor('Red')
			.setTitle('Message Deleted')
			.setDescription(`This message was deleted ${deleteTime}.`)
			.addFields(
				{ name: 'Message Content', value: `> ${truncateText(message.content || 'No message content', 1021)}` },
				{ name: 'Message Author', value: author ? `> \`${author.username} (${author.id})\`` : '> Unknown author' },
				{ name: 'Message Channel', value: `> ${message.channel} (${message.channel.id})` },
			);

		if (attachments.length > 0) {
			embed.addFields({ name: 'Message Attachments', value: truncateText(attachments.join(', '), 1024) });
		}

		await sendChannel.send({ embeds: [embed] }).catch((error) => {
			console.error('Failed to send deleted message log:', error);
		});
	},
};