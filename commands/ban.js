const {
	SlashCommandBuilder,
	PermissionFlagsBits,
	PermissionsBitField,
	EmbedBuilder,
	MessageFlags,
} = require('discord.js');
const { getGuildChannel, getGuildSetup } = require('../utils/guildsetup');

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
				.setMinLength(1)
				.setMaxLength(500)
				.setRequired(true),
		),

	async execute(interaction) {
		if (!interaction.isChatInputCommand()) return;

		if (!interaction.guildId || !interaction.guild) {
			return interaction.reply({
				content: 'This command can only be used in a server.',
				flags: MessageFlags.Ephemeral,
			});
		}

		const guildName = interaction.guild.name;

		let setup;
		try {
			setup = await getGuildSetup(interaction.guildId);
		} catch (error) {
			console.error('Failed to read guild setup:', error);
			return interaction.reply({
				content: 'There was an error reading this server\'s setup.',
				flags: MessageFlags.Ephemeral,
			});
		}
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
		await interaction.guild.members.ban(user, { deleteMessageSeconds: 60 * 60 * 24 * 7, reason });
		
		await interaction.followUp({
			content: `✅ Banned **${user.tag}**.\nReason: **${reason}**${dmSent ? '' : '\n⚠️ I could not DM this user.'}`,
		});

		const logChannel = await getGuildChannel(interaction.guild, setup?.modLogs);
		if (logChannel) {
			try {
				await logChannel.send(
					`**Moderator:** ${interaction.user.tag}\n` +
					`**Banned User:** ${user.tag} (${user.id})\n` +
					`**Reason:** ${reason}`,
				);
			} catch (error) {
				console.error('Failed to send ban log:', error);
			}
		}
	},
};
