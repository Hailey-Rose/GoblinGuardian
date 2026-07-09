const { AuditLogEvent, Events, EmbedBuilder } = require('discord.js');
const { modLogs } = require('../config.json');

module.exports = {
    name: Events.GuildMemberUpdate,
    async execute(oldMember, newMember) {

        const sendChannel = await newMember.guild.channels.fetch(modLogs).catch((error) => {
            console.error(`Failed to fetch mod log channel ${modLogs}:`, error);
            return null;
        });

        const updateTime = `<t:${Math.floor(Date.now() / 1000)}:R>`;
        
        const addedRoles = newMember.roles.cache.filter(
            role => !oldMember.roles.cache.has(role.id)
        );

        const removedRoles = oldMember.roles.cache.filter(
            role => !newMember.roles.cache.has(role.id)
        );


        const updated = new EmbedBuilder()
            .setColor('Blue')
            .setTitle('Role(s) added/Removed')
            .setDescription(`Role(s) updated ${updateTime}`)
            .addFields(
                { name: 'User', value: `${oldMember.user} || ${oldMember.displayName}`},
                { name: 'Added Roles', value: `${addedRoles.map(r => r.name)}` },
                { name: 'Removed Roles', value: `${removedRoles.map(r => r.name)}` },
            );

        if (!sendChannel?.isTextBased()) return;

        await sendChannel.send({ embeds: [updated] });

    }


}
