const {
    SlashCommandBuilder,
    PermissionsBitField,
    EmbedBuilder,
    MessageFlags
} = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('kick')
        .setDescription('kicks a user from the server.')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('The user to kick.')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('reason')
                .setDescription('Reason for kicking the user.')
                .setRequired(true)
        ),

    async execute(interaction) {
        if (!interaction.isChatInputCommand()) return;

        const user = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason');


        if (!interaction.memberPermissions.has(PermissionsBitField.Flags.KickMembers)) {
            return interaction.reply({
                content: 'You need the **Kick, Approve and Reject Members** permission to use this command.',
                ephemeral: true,
            });
        }

        if (interaction.user.id === user.id) {
            return interaction.reply({
                content: "You can't kick yourself!",
                ephemeral: true,
            });
        }

        const member = await interaction.guild.members
            .fetch(user.id)
            .catch(() => null);

        if (member && !member.kickable) {
            return interaction.reply({
                content: "I can't kick that user. They may have a higher role than me or I lack permission.",
                ephemeral: true,
            });
        }

        try {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const kick_dm = new EmbedBuilder()
                .setColor("#ff0000")
                .setTitle("kick")
                .setDescription(`You have been kicked from **The Alpha Sector** for: ${reason}`)
            await user.send({ embeds: [kick_dm] })
        }


        finally {

            await interaction.guild.members.kick(user, { reason });

            await interaction.followUp({
                content: `✅ Kicked **${user.tag}**.\nReason: **${reason}**`,
            });

            const logChannel = await interaction.client.channels
                .fetch('1417724798217228308')
                .catch(() => null);

            if (logChannel) {
                await logChannel.send(
                    `**Moderator:** ${interaction.user.tag}\n` +
                    `**Kicked User:** ${user.tag} (${user.id})\n` +
                    `**Reason:** ${reason}`
                );
            }
        } try {

        } catch (err) {
            console.error(err);

            if (!interaction.replied) {
                return interaction.reply({
                    content: 'I could not kick that user.',
                    ephemeral: true,
                });
            }
        }
    },
};