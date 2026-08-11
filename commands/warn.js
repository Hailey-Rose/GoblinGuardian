const {
	SlashCommandBuilder,
	PermissionFlagsBits,
	MessageFlags,
	EmbedBuilder,
} = require('discord.js');
const { updateData } = require('../utils/json');
const path = require('node:path');
const { getGuildChannel, getGuildSetup } = require('../utils/guildsetup');

const WARNINGS_FILE = path.join(__dirname, '..', 'warns.json');


module.exports = {
	data: new SlashCommandBuilder()
		.setName('warn')
		.setDescription('Warn a user in the discord.')
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
		.addUserOption((option) =>
			option
				.setName('user')
				.setDescription('The user to warn.')
				.setRequired(true),
		)
		.addStringOption((option) =>
			option
				.setName('reason')
				.setDescription('Reason for warning the user.')
				.setMinLength(1)
				.setMaxLength(500)
				.setRequired(true),
		),
	async execute(interaction) {
		if (!interaction.guildId || !interaction.guild) {
			return interaction.reply({
				content: 'This command can only be used in a server.',
				flags: MessageFlags.Ephemeral,
			});
		}

		const user = interaction.options.getUser('user');
		const reason = interaction.options.getString('reason')?.trim();
		if (!reason) {
			return interaction.reply({
				content: 'Please provide a warning reason.',
				flags: MessageFlags.Ephemeral,
			});
		}

		const displayReason = reason.length > 500 ? `${reason.slice(0, 497)}...` : reason;
		const guildId = interaction.guildId;
		const filePath = WARNINGS_FILE;
		let warning;

		await interaction.deferReply();
		try {
			await updateData(filePath, (storedWarnings) => {
				const warnings =
					storedWarnings && typeof storedWarnings === 'object' && !Array.isArray(storedWarnings)
						? storedWarnings
						: {};
				let guildWarnings = warnings[guildId];

				if (!guildWarnings || typeof guildWarnings !== 'object' || Array.isArray(guildWarnings)) {
					guildWarnings = warnings[guildId] = {};
				} else if ('reasons' in guildWarnings && 'totalWarns' in guildWarnings) {
					const legacyUserId = guildWarnings.userId ?? guildWarnings.id;
					guildWarnings = warnings[guildId] = legacyUserId
						? { [legacyUserId]: guildWarnings }
						: { _legacy: { ...guildWarnings } };
				}

				const now = Date.now();
				warning = guildWarnings[user.id];

				if (!warning || typeof warning !== 'object' || Array.isArray(warning)) {
					warning = guildWarnings[user.id] = {
						name: user.username,
						id: user.id,
						userId: user.id,
						reasons: [reason],
						totalWarns: 1,
						createdAt: now,
						updatedAt: now,
						latestReason: reason,
						guildId,
					};
				} else {
					const reasons = Array.isArray(warning.reasons)
						? warning.reasons
						: warning.reasons
							? [warning.reasons]
							: [];
					reasons.push(reason);
					warning.reasons = reasons;
					const previousTotal = Number(warning.totalWarns);
					warning.totalWarns = Number.isSafeInteger(previousTotal) && previousTotal >= 0
						? Math.max(previousTotal + 1, reasons.length)
						: reasons.length;
					warning.latestReason = reason;
					warning.updatedAt = now;
					warning.name = user.username;
					warning.id = user.id;
					warning.userId = user.id;
					warning.guildId = guildId;
				}

				return warnings;
			});
		} catch (error) {
			console.error('Failed to save warning data:', error);
			return interaction.editReply({
				content: 'There was an error saving the warning.',
			});
		}

		await interaction.editReply(
			`${user} has been warned. Reason: ${displayReason} || They have been warned: ${warning.totalWarns.toLocaleString()} times.`,
		);

		const warnDm = new EmbedBuilder()
			.setColor('#ff0000')
			.setTitle('Warned')
			.setDescription(`You have been warned in **${interaction.guild.name}** | **Reason:** ${displayReason}`);

		await user.send({ embeds: [warnDm] }).catch(() => null);

		let setup;
		try {
			setup = await getGuildSetup(guildId);
		} catch (error) {
			console.error('Failed to read setup data:', error);
			setup = null;
		}

		const modLogs = setup?.modLogs;
		const logChannel = await getGuildChannel(interaction.guild, modLogs);
		if (logChannel) {
			try {
				await logChannel.send(
					`**Moderator:** ${interaction.user.tag}\n` +
					`**Warned User:** ${user.tag} (${user.id})\n` +
					`**Reason:** ${displayReason}\n` +
					`**Total warns:** ${warning.totalWarns.toLocaleString()}`,
				);
			} catch (error) {
				console.error('Failed to send warning log:', error);
			}
		}
	},
};
