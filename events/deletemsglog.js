const { Events, EmbedBuilder } = require('discord.js');
const { msgLogs } = require('../config.json');

module.exports = {
	name: Events.MessageDelete,
	async execute(message) {
		if (!message.guild || message.author?.bot) return;

		const sendChannel = await message.guild.channels.fetch(msgLogs).catch((error) => {
			console.error(`Failed to fetch message log channel ${msgLogs}:`, error);
			return null;
		});

		if (!sendChannel?.isTextBased()) return;

		const attachments = [...message.attachments.values()].map((attachment) => attachment.url);
		const author = message.author;
		const deleteTime = `<t:${Math.floor(Date.now() / 1000)}:R>`;

		const embed = new EmbedBuilder()
			.setColor('Red')
			.setTitle('Message Deleted')
			.setDescription(`This message was deleted ${deleteTime}.`)
			.addFields(
				{ name: 'Message Content', value: `> ${message.content || 'No message content'}` },
				{ name: 'Message Author', value: author ? `> \`${author.username} (${author.id})\`` : '> Unknown author' },
				{ name: 'Message Channel', value: `> ${message.channel} (${message.channel.id})` },
			);

		if (attachments.length > 0) {
			embed.addFields({ name: 'Message Attachments', value: attachments.join(', ') });
		}

		await sendChannel.send({ embeds: [embed] });
	},
};
