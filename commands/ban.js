const {
    SlashCommandBuilder,
    PermissionsBitField,
    EmbedBuilder,
    MessageFlags
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


        if (!interaction.memberPermissions.has(PermissionsBitField.Flags.BanMembers)) {
            return interaction.reply({
                content: 'You need the **Ban Members** permission to use this command.',
                ephemeral: true,
            });
        }

        if (interaction.user.id === user.id) {
            return interaction.reply({
                content: "You can't ban yourself!",
                ephemeral: true,
            });
        }

        const member = await interaction.guild.members
            .fetch(user.id)
            .catch(() => null);

        if (member && !member.bannable) {
            return interaction.reply({
                content: "I can't ban that user. They may have a higher role than me or I lack permission.",
                ephemeral: true,
            });
        }

        try {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const ban_dm = new EmbedBuilder()
                .setColor("#ff0000")
                .setTitle("Ban")
                .setDescription(`You have been banned from **The Alpha Sector** for: ${reason}`)
            await user.send({ embeds: [ban_dm] })
        }


        finally {

            await interaction.guild.members.ban(user, { reason });

            await interaction.followUp({
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
        } try {

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