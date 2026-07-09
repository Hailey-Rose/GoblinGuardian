const { Events, EmbedBuilder, MessageActivityType } = require('discord.js');
const { msgLogs } = require('../config.json');

module.exports = {
	name: Events.MessageUpdate,
	async execute(oldMessage, newMessage, message) {
                
		const sendChannel = await newMessage.guild.channels.fetch(msgLogs).catch((error) => {
			console.error(`Failed to fetch message log channel ${msgLogs}:`, error);
			return null;
		});
        if (newMessage.author.bot) return;
		if (!sendChannel?.isTextBased()) return;

		const attachments = [newMessage.attachments.values()].map((attachment) => attachment.url);
		const author = newMessage.author;
		const editTime = `<t:${Math.floor(Date.now() / 1000)}:R>`;

		const edited = new EmbedBuilder()
			.setColor('Blue')
			.setTitle('Message Edited')
			.setDescription(`This message was edited ${editTime}.`)
			.addFields(
				{ name: 'Before:', value: `> ${oldMessage.content || 'No message content'}` },
                { name: 'After:', value: `> ${newMessage.content || 'No message content'}` },
				{ name: 'Message Author', value: author ? `> \`${author.username} (${author.id})\`` : '> Unknown author' },
				{ name: 'Message Channel', value: `> ${oldMessage.channel} (${oldMessage.channel.id})` },
			);        

		await sendChannel.send({ embeds: [edited] });
	},
};
