const {
	SlashCommandBuilder,
	PermissionFlagsBits,
	PermissionsBitField,
	EmbedBuilder,
	MessageFlags,
} = require('discord.js');
const ms = require('ms');
const { modLogs, mutedRole: mutedRoleId } = require('../config.json');
const { addMute } = require('../utils/mutes');

const MAX_MUTE_MS = 24 * 24 * 60 * 60 * 1000;

module.exports = {
	data: new SlashCommandBuilder()
		.setName('mute')
		.setDescription('Mutes a user in the server for a specified time.')
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
		.addUserOption((option) =>
			option
				.setName('user')
				.setDescription('The user to mute.')
				.setRequired(true),
		)
		.addStringOption((option) =>
			option
				.setName('reason')
				.setDescription('Reason for muting the user.')
				.setRequired(true),
		)
		.addStringOption((option) =>
			option
				.setName('duration')
				.setDescription('Examples: 30s, 5m, 2h, 1d - Max Duration: 24d')
				.setRequired(true),
		),

	async execute(interaction) {
		if (!interaction.isChatInputCommand()) return;

		const member = interaction.options.getMember('user');
		const reason = interaction.options.getString('reason');
		const duration = interaction.options.getString('duration');
		const milliseconds = ms(duration);
		const guildName = await interaction.guild.name
		if (!Number.isFinite(milliseconds) || milliseconds < 1000 || milliseconds > MAX_MUTE_MS) {
			return interaction.reply({
				content: 'Please provide a valid duration from 1s to 24d (e.g. 30s, 5m, 2h).',
				flags: MessageFlags.Ephemeral,
			});
		}

		if (!member) {
			return interaction.reply({
				content: 'That user is not in this server.',
				flags: MessageFlags.Ephemeral,
			});
		}

		if (!interaction.memberPermissions.has(PermissionsBitField.Flags.ManageRoles)) {
			return interaction.reply({
				content: 'You need the **Manage Roles** permission to use this command.',
				flags: MessageFlags.Ephemeral,
			});
		}

		if (!interaction.appPermissions?.has(PermissionsBitField.Flags.ManageRoles)) {
			return interaction.reply({
				content: 'I need the **Manage Roles** permission to do that.',
				flags: MessageFlags.Ephemeral,
			});
		}

		if (interaction.user.id === member.id) {
			return interaction.reply({
				content: "You can't mute yourself!",
				flags: MessageFlags.Ephemeral,
			});
		}

		const mutedRole = await interaction.guild.roles.fetch(mutedRoleId).catch(() => null);
		const botMember = interaction.guild.members.me;

		if (!mutedRole) {
			return interaction.reply({
				content: 'Muted role was not found.',
				flags: MessageFlags.Ephemeral,
			});
		}

		if (!botMember || mutedRole.position >= botMember.roles.highest.position) {
			return interaction.reply({
				content: 'My highest role must be above the muted role.',
				flags: MessageFlags.Ephemeral,
			});
		}

		if (!member.manageable) {
			return interaction.reply({
				content: "I can't mute that user. They may have a higher role than me.",
				flags: MessageFlags.Ephemeral,
			});
		}

		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		const expiresAtMs = Date.now() + milliseconds;
		const expiresAt = `<t:${Math.floor(expiresAtMs / 1000)}:F>`;
		const muteDm = new EmbedBuilder()
			.setColor('#ff0000')
			.setTitle('Mute')
			.setDescription(`You have been muted in **${guildName}** | **Reason:** ${reason} | **Duration:** ${duration} | **Expires:** ${expiresAt}`);

		const dmSent = await member.user.send({ embeds: [muteDm] }).then(() => true).catch(() => false);
		await member.roles.add(mutedRole, reason);
		await addMute(interaction.client, {
			guildId: interaction.guild.id,
			userId: member.id,
			roleId: mutedRole.id,
			expiresAt: expiresAtMs,
			reason,
		});

		await interaction.followUp({
			content: `✅ Muted **${member.user.tag}**.\nReason: **${reason}**.\nDuration: **${duration}**.\nExpires: **${expiresAt}**.${dmSent ? '' : '\n⚠️ I could not DM this user.'}`,
		});

		const logChannel = await interaction.client.channels.fetch(modLogs).catch(() => null);
		if (logChannel?.isTextBased()) {
			await logChannel.send(
				`**Moderator:** ${interaction.user.tag}\n` +
				`**Muted User:** ${member.user.tag} (${member.id})\n` +
				`**Reason:** ${reason}\n` +
				`**Duration:** ${duration}\n` +
				`**Expires:** ${expiresAt}`,
			);
		}
	},
};
