const { AuditLogEvent, Events, EmbedBuilder, GuildMember } = require('discord.js');
const { genLogs } = require('../config.json');
const ms = require('ms');

module.exports = {
    name: Events.GuildMemberAdd,
    async execute(GuildMemberAdd, Member) {

        const sendChannel = await GuildMemberAdd.guild.channels.fetch(genLogs).catch((error) => {
            console.error(`Failed to fetch General log channel ${genLogs}:`, error);
            return null;
        });

        const updateTime = `<t:${Math.floor(Date.now() / 1000)}:R>`;
        
        const memberJoined = GuildMemberAdd;

        const userId = `${GuildMemberAdd.id}`;

        const CreatedAt = GuildMemberAdd.user.createdAt;       

        const joined = new EmbedBuilder()
            .setColor('Blue')
            .setTitle('Member Joined')
            .setDescription(`Member Joined ${updateTime} || Account Created: ${CreatedAt}`)
            .addFields(
                { name: 'User', value: `${GuildMemberAdd.user} || ${GuildMemberAdd.user.tag}`},
                { name: 'User Id:', value: `${GuildMemberAdd.id}`}, );

        if (!sendChannel?.isTextBased()) return;

        await sendChannel.send({ embeds: [joined] });

    }


}
