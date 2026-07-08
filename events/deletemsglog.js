const {
    Events,
    EmbedBuilder
} = require('discord.js')
const { msgLogs } = require('../config.json')
const { execute } = require('../commands/mute')

module.exports = {
    name: Events.MessageDelete,
    async execute (message) {
    console.log({
    content: message.content,
    partial: message.partial,
    cached: !message.partial,
});
        if (!message.guild || !message.author || message.author.bot || !message) return;
        var data = await log.findOne({ Guild: message.guild.id});
        if (!data) return;

        var sendChannel = await message.guild.channels.fetch(msgLogs);
        var attachments = await message.attachments.map(attachment => attachment.url);
        var member = message.author;
        var deleteTime = `<t:$Math.floor(Date.now() / 1000 )}:R>`;

        const embed = new EmbedBuilder()

        .setColor("Red")
        .setTitle('Message Deleted')
        .setDescription(`This message was deleted ${deleteTime}.`)
        .addFields({ name: "Message Content", value: `> ${message.content || "No message content"}` })
        .addFields({ name: "Message Author", value: `> \`${member.username} (${member.id})\``})
        .addFields({ name: "Message Channel", value: `> ${message.channel} (${message.channel.id})` })

        if (attachments.length > 0) {
            embed.addFields({ name: "Message Attachments", value: attachments.join(' , ')});
        }

        await sendChannel.send({ embeds: [embed] });

        console.log(message.content);
        console.log(message.partial);
    }
    
}

