const { Events, EmbedBuilder } = require('discord.js');
const { getGuildChannel, getGuildSetup } = require('../utils/guildsetup');
const { truncateText } = require('../utils/text');

module.exports = {
	name: Events.MessageUpdate,
	async execute(oldMessage, newMessage) {
		if (!newMessage.guild || newMessage.author?.bot) return;

		const setup = await getGuildSetup(newMessage.guild.id).catch((error) => {
			console.error('Failed to read guild setup:', error);
			return null;
		});
		const sendChannel = await getGuildChannel(newMessage.guild, setup?.msgLogs);
		if (!sendChannel) return;

		const attachments = [...newMessage.attachments.values()].map((attachment) => attachment.url);
		const author = newMessage.author;
		const editTime = `<t:${Math.floor(Date.now() / 1000)}:R>`;

		const edited = new EmbedBuilder()
			.setColor('Blue')
			.setTitle('Message Edited')
			.setDescription(`This message was edited ${editTime}.`)
			.addFields(
				{ name: 'Before:', value: `> ${truncateText(oldMessage.content || 'No message content', 1021)}` },
				{ name: 'After:', value: `> ${truncateText(newMessage.content || 'No message content', 1021)}` },
				{ name: 'Message Author', value: author ? `> \`${author.username} (${author.id})\`` : '> Unknown author' },
				{ name: 'Message Channel', value: `> ${oldMessage.channel} (${oldMessage.channel.id})` },
			);

		await sendChannel.send({ embeds: [edited] }).catch((error) => {
			console.error('Failed to send edited message log:', error);
		});
	},
};