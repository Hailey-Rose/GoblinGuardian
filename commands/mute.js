const {
    SlashCommandBuilder,
    PermissionsBitField,
    EmbedBuilder,
    MessageFlags
} = require('discord.js');
const ms = require('ms');
const { guildName } = require('..//config.json');
module.exports = {
    data: new SlashCommandBuilder()
        .setName('mute')
        .setDescription('Mutes a user in the server for a specified time.')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('The user to mute.')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('reason')
                .setDescription('Reason for muting the user.')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('duration')
                .setDescription('Examples: 30s, 5m, 2h, 1d - Max Duration: 24d')
                .setRequired(true)
        ),

    async execute(interaction) {
        if (!interaction.isChatInputCommand()) return;
        const mutedRole = interaction.guild.roles.cache.get('1418093549697765497');
        const user = interaction.options.getMember('user');
        const reason = interaction.options.getString('reason');
        const duration = interaction.options.getString('duration');
        const milliseconds = ms(duration);
        const expiresAt = `<t:${Math.floor((interaction.createdTimestamp + milliseconds) / 1000)}:F>`;
        if (milliseconds >= 2147483647) {
            return interaction.reply({
                content: "Max duration is 24d.",
                ephemeral: true,
            });
        }

        if (!interaction.memberPermissions.has(PermissionsBitField.Flags.ManageRoles)) {
            return interaction.reply({
                content: 'You need the **Manage Roles** permission to use this command.',
                ephemeral: true,
            });
        }

        if (interaction.user.id === user.id) {
            return interaction.reply({
                content: "You can't mute yourself!",
                ephemeral: true,
            });
        }

        const member = await interaction.guild.members
            .fetch(user.id)
            .catch(() => null);

        try {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const mute_dm = new EmbedBuilder()
                .setColor("#ff0000")
                .setTitle("mute")
                .setDescription(`You have been muted in **${guildName}** | **Reason:** ${reason} | **Duration:** ${duration} | **Expires:** ${expiresAt}`)
                
            await user.send({ embeds: [mute_dm] })
        }


        finally {

            await user.roles.add(mutedRole);

            if (!milliseconds || milliseconds < 1000) {
                return interaction.reply({
                    content: 'Please provide a valid duration (e.g. 30s, 5m, 2h).',
                    ephemeral: true
                });
            }

            setTimeout(() => { user.roles.remove(mutedRole); }, milliseconds)

            await interaction.followUp({
                content: `✅ Muted **${user}**.\nReason: **${reason}**. \nDuration: **${duration}**. \nExpires: **${expiresAt}**.`,
            });

            const logChannel = await interaction.client.channels
                .fetch('1417724798217228308')
                .catch(() => null);

            if (logChannel) {
                await logChannel.send(
                    `**Moderator:** ${interaction.user.tag}\n` +
                    `**Muted User:** ${user} (${user.id})\n` +
                    `**Reason:** ${reason}` +
                    `   **Duration:** ${duration}` +
                    `       **Expires:** ${expiresAt}`
                );
            }
        } try {

        } catch (err) {
            console.error(err);

            if (!interaction.replied) {
                return interaction.reply({
                    content: 'I could not mute that user.',
                    ephemeral: true,
                });
            }
        }
    }
}
