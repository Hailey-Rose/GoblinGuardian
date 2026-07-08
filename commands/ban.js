const {
	SlashCommandBuilder,
	PermissionFlagsBits,
	PermissionsBitField,
	EmbedBuilder,
	MessageFlags,
} = require('discord.js');
const { guildName, modLogs } = require('../config.json');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('ban')
		.setDescription('Bans a user from the server.')
		.setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
		.addUserOption((option) =>
			option
				.setName('user')
				.setDescription('The user to ban.')
				.setRequired(true),
		)
		.addStringOption((option) =>
			option
				.setName('reason')
				.setDescription('Reason for the ban.')
				.setRequired(true),
		),

	async execute(interaction) {
		if (!interaction.isChatInputCommand()) return;

		const user = interaction.options.getUser('user');
		const reason = interaction.options.getString('reason');

		if (!interaction.memberPermissions.has(PermissionsBitField.Flags.BanMembers)) {
			return interaction.reply({
				content: 'You need the **Ban Members** permission to use this command.',
				flags: MessageFlags.Ephemeral,
			});
		}

		if (!interaction.appPermissions?.has(PermissionsBitField.Flags.BanMembers)) {
			return interaction.reply({
				content: 'I need the **Ban Members** permission to do that.',
				flags: MessageFlags.Ephemeral,
			});
		}

		if (interaction.user.id === user.id) {
			return interaction.reply({
				content: "You can't ban yourself!",
				flags: MessageFlags.Ephemeral,
			});
		}

		const member = await interaction.guild.members.fetch(user.id).catch(() => null);

		if (member && !member.bannable) {
			return interaction.reply({
				content: "I can't ban that user. They may have a higher role than me or I lack permission.",
				flags: MessageFlags.Ephemeral,
			});
		}

		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		const banDm = new EmbedBuilder()
			.setColor('#ff0000')
			.setTitle('Ban')
			.setDescription(`You have been banned from **${guildName}** | **Reason:** ${reason}`);

		const dmSent = await user.send({ embeds: [banDm] }).then(() => true).catch(() => false);
		await interaction.guild.members.ban(user, { reason });

		await interaction.followUp({
			content: `✅ Banned **${user.tag}**.\nReason: **${reason}**${dmSent ? '' : '\n⚠️ I could not DM this user.'}`,
		});

		const logChannel = await interaction.client.channels.fetch(modLogs).catch(() => null);
		if (logChannel?.isTextBased()) {
			await logChannel.send(
				`**Moderator:** ${interaction.user.tag}\n` +
				`**Banned User:** ${user.tag} (${user.id})\n` +
				`**Reason:** ${reason}`,
			);
		}
	},
};
