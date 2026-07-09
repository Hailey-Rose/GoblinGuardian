const { AuditLogEvent, Events, EmbedBuilder, GuildMember } = require('discord.js');
const { genLogs } = require('../config.json');
const ms = require('ms');

module.exports = {
    name: Events.GuildMemberRemove,
    async execute(GuildMemberRemove, Member) {

        const sendChannel = await GuildMemberRemove.guild.channels.fetch(genLogs).catch((error) => {
            console.error(`Failed to fetch General log channel ${genLogs}:`, error);
            return null;
        });

        const updateTime = `<t:${Math.floor(Date.now() / 1000)}:R>`;
        
        const memberLeft = GuildMemberRemove;

        const userId = `${GuildMemberRemove.id}`;

        const Left = new EmbedBuilder()
            .setColor('Blurple')
            .setTitle('Member Left')
            .setDescription(`Member Left ${updateTime}`)
            .addFields(
                { name: 'User', value: `${GuildMemberRemove.user} || ${GuildMemberRemove.user.tag}`},
                { name: 'User Id:', value: `${GuildMemberRemove.id}`}, );

        if (!sendChannel?.isTextBased()) return;

        await sendChannel.send({ embeds: [Left] });

    }


}
