const {
    SlashCommandBuilder,
    PermissionsBitField,
} = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Bans a user from the server.')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('The user to ban.')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('reason')
                .setDescription('Reason for the ban.')
                .setRequired(true)
        ),

    async execute(interaction) {
        if (!interaction.isChatInputCommand()) return;

        const user = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason');

        // Moderator permission check
        if (!interaction.memberPermissions.has(PermissionsBitField.Flags.BanMembers)) {
            return interaction.reply({
                content: 'You need the **Ban Members** permission to use this command.',
                ephemeral: true,
            });
        }

        // Don't ban yourself moron.
        if (interaction.user.id === user.id) {
            return interaction.reply({
                content: "You can't ban yourself!",
                ephemeral: true,
            });
        }

        // Try to fetch the member (will be null if they've already left)
        const member = await interaction.guild.members
            .fetch(user.id)
            .catch(() => null);

        // is member bannable?
        if (member && !member.bannable) {
            return interaction.reply({
                content: "I can't ban that user. They may have a higher role than me or I lack permission.",
                ephemeral: true,
            });
        }

        try {
            await interaction.guild.members.ban(user, { reason });

            await interaction.reply({
                content: `✅ Banned **${user.tag}**.\nReason: **${reason}**`,
            });

            const logChannel = await interaction.client.channels
                .fetch('1417724798217228308')
                .catch(() => null);

            if (logChannel) {
                await logChannel.send(
                    `**Moderator:** ${interaction.user.tag}\n` +
                    `**Banned User:** ${user.tag} (${user.id})\n` +
                    `**Reason:** ${reason}`
                );
            }
        } catch (err) {
            console.error(err);

            if (!interaction.replied) {
                return interaction.reply({
                    content: 'I could not ban that user.',
                    ephemeral: true,
                });
            }
        }
    },
};