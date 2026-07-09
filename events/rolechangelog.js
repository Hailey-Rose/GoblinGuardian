const { AuditLogEvent, Events, EmbedBuilder } = require('discord.js');
const { modLogs } = require('../config.json');
// const { addedRoles } = require('../index.js');
// const { removedRoles } = require('../index.js');
// const { oldMember } = require('../index.js');
// const { newMember} = require('../index.js');
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
                { name: 'User', value: `${oldMember.displayName}`},
                { name: 'Added Roles', value: `${addedRoles.map(r => r.name)}` },
                { name: 'Removed Roles', value: `${removedRoles.map(r => r.name)}` },
            );

    

        
        // console.log("Added:", addedRoles.map(r => r.name));
        // sendChannel.send({ embeds: [updated]})
        


        // console.log("Removed:", removedRoles.map(r => r.name));
        // sendChannel.send({ embeds: [updated]})
            
        // if (!message.guild || message.author?.bot) return;



        if (!sendChannel?.isTextBased()) return;

        await sendChannel.send({ embeds: [updated] });

    }


}
