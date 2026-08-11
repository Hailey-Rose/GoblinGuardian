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
		.setName('kick')
		.setDescription('Kicks a user from the server.')
		.setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
		.addUserOption((option) =>
			option
				.setName('user')
				.setDescription('The user to kick.')
				.setRequired(true),
		)
		.addStringOption((option) =>
			option
				.setName('reason')
				.setDescription('Reason for kicking the user.')
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
		const user = interaction.options.getUser('user');
		const reason = interaction.options.getString('reason');
		if (!interaction.memberPermissions.has(PermissionsBitField.Flags.KickMembers)) {
			return interaction.reply({
				content: 'You need the **Kick Members** permission to use this command.',
				flags: MessageFlags.Ephemeral,
			});
		}

		if (!interaction.appPermissions?.has(PermissionsBitField.Flags.KickMembers)) {
			return interaction.reply({
				content: 'I need the **Kick Members** permission to do that.',
				flags: MessageFlags.Ephemeral,
			});
		}

		if (interaction.user.id === user.id) {
			return interaction.reply({
				content: "You can't kick yourself!",
				flags: MessageFlags.Ephemeral,
			});
		}

		const member = await interaction.guild.members.fetch(user.id).catch(() => null);

		if (!member) {
			return interaction.reply({
				content: 'That user is not in this server.',
				flags: MessageFlags.Ephemeral,
			});
		}

		if (!member.kickable) {
			return interaction.reply({
				content: "I can't kick that user. They may have a higher role than me or I lack permission.",
				flags: MessageFlags.Ephemeral,
			});
		}

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

		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		const kickDm = new EmbedBuilder()
			.setColor('#ff0000')
			.setTitle('Kick')
			.setDescription(`You have been kicked from **${guildName}** | **Reason:** ${reason}`);

		const dmSent = await user.send({ embeds: [kickDm] }).then(() => true).catch(() => false);
		await member.kick(reason);

		await interaction.followUp({
			content: `✅ Kicked **${user.tag}**.\nReason: **${reason}**${dmSent ? '' : '\n⚠️ I could not DM this user.'}`,
		});

		const logChannel = await getGuildChannel(interaction.guild, setup?.modLogs);
		if (logChannel) {
			try {
				await logChannel.send(
					`**Moderator:** ${interaction.user.tag}\n` +
					`**Kicked User:** ${user.tag} (${user.id})\n` +
					`**Reason:** ${reason}`,
				);
			} catch (error) {
				console.error('Failed to send kick log:', error);
			}
		}
	},
};
