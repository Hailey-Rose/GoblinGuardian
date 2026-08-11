const {
	SlashCommandBuilder,
	PermissionFlagsBits,
	PermissionsBitField,
	EmbedBuilder,
	MessageFlags,
} = require('discord.js');
const ms = require('ms');
const { randomUUID } = require('node:crypto');
const { getGuildChannel, getGuildRole, getGuildSetup } = require('../utils/guildsetup');
const { applyMute } = require('../utils/mutes');

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
				.setMinLength(1)
				.setMaxLength(500)
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


		if (!interaction.guildId || !interaction.guild) {
			return interaction.reply({
				content: 'This command can only be used in a server.',
				flags: MessageFlags.Ephemeral,
			});
		}
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

		const mutedRole = await getGuildRole(interaction.guild, setup?.mutedRole);
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

		const muteRecord = {
			recordId: randomUUID(),
			guildId: interaction.guild.id,
			userId: member.id,
			roleId: mutedRole.id,
			expiresAt: expiresAtMs,
			reason,
		};

		let muteResult;
		try {
			muteResult = await applyMute(interaction.client, member, muteRecord);
		} catch (error) {
			console.error('Failed to apply mute transaction:', error);
			return interaction.editReply({
				content: 'There was an error applying the mute.',
			});
		}

		if (muteResult.status !== 'ok') {
			if (muteResult.error) console.error('Mute transaction failed:', muteResult.error);
			if (muteResult.rollbackError) console.error('Failed to restore mute data:', muteResult.rollbackError);
			if (muteResult.recoveryError) console.error('Failed to schedule mute recovery:', muteResult.recoveryError);
			if (muteResult.verificationError) console.error('Failed to verify mute role state:', muteResult.verificationError);
			if (muteResult.cleanupWarning) console.error('Failed to clear previous mute roles:', muteResult.cleanupWarning);

			const content = {
				'read-error': 'There was an error reading the existing mute.',
				'save-error': 'There was an error saving the mute.',
				'role-error': 'I could not apply the mute role.',
				'rollback-error': 'The mute could not be applied and its saved state could not be restored.',
				'uncertain-error': 'I could not confirm whether the mute role was applied; the saved mute will be recovered automatically.',
				'role-cleanup-error': 'The mute was applied, but an older mute role could not be cleared; it remains tracked for expiration.',
				'role-limit-error': 'This mute has too many retained roles to change safely. Remove an older mute role and try again.',
			}[muteResult.status] ?? 'There was an error applying the mute.';
			return interaction.editReply({ content });
		}
		if (muteResult.warning) console.error('Mute role request returned an error after the role was verified:', muteResult.warning);
		if (muteResult.cleanupWarning) console.error('Mute state recovery warning:', muteResult.cleanupWarning);
		const dmSent = await member.user.send({ embeds: [muteDm] }).then(() => true).catch(() => false);

		await interaction.followUp({
			content: `✅ Muted **${member.user.tag}**.\nReason: **${reason}**.\nDuration: **${duration}**.\nExpires: **${expiresAt}**.${dmSent ? '' : '\n⚠️ I could not DM this user.'}`,
		});

		const logChannel = await getGuildChannel(interaction.guild, setup?.modLogs);
		if (logChannel) {
			try {
				await logChannel.send(
					`**Moderator:** ${interaction.user.tag}\n` +
					`**Muted User:** ${member.user.tag} (${member.id})\n` +
					`**Reason:** ${reason}\n` +
					`**Duration:** ${duration}\n` +
					`**Expires:** ${expiresAt}`,
				);
			} catch (error) {
				console.error('Failed to send mute log:', error);
			}
		}
	},
};
