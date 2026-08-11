const {
	SlashCommandBuilder,
	PermissionFlagsBits,
	MessageFlags,
} = require('discord.js');
const path = require('node:path');
const { getdata } = require('../utils/json.js');

const MAX_MESSAGE_LENGTH = 2000;
const MAX_DISPLAY_REASON_LENGTH = 500;

function limitText(value, maxLength) {
	const text = String(value);
	return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName('warnings')
		.setDescription('View / check a member\'s warnings.')
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
		.addUserOption((option) =>
			option
				.setName('user')
				.setDescription('The user to check.')
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
		const guildId = interaction.guildId;
		const filePath = path.join(__dirname, '..', 'warns.json');

		await interaction.deferReply();
		let storedWarnings;
		try {
			storedWarnings = await getdata(filePath);
		} catch (error) {
			console.error('Failed to read warning data:', error);
			return interaction.editReply({
				content: 'There was an error reading the warnings.',
			});
		}

		const warnings =
			storedWarnings && typeof storedWarnings === 'object' && !Array.isArray(storedWarnings)
				? storedWarnings
				: {};
		const guildWarnings = warnings[guildId];
		const isLegacyWarning =
			guildWarnings &&
			typeof guildWarnings === 'object' &&
			!Array.isArray(guildWarnings) &&
			'reasons' in guildWarnings &&
			'totalWarns' in guildWarnings;
		const legacyUserId = isLegacyWarning ? guildWarnings.userId ?? guildWarnings.id : null;
		const warning = guildWarnings?.[user.id] ??
			(isLegacyWarning && legacyUserId === user.id ? guildWarnings : null);

		if (!warning || typeof warning !== 'object' || Array.isArray(warning)) {
			return interaction.editReply({
				content: 'This user has **Zero** warnings.',
			});
		}

		const reasons = Array.isArray(warning.reasons)
			? warning.reasons
			: warning.reasons
				? [warning.reasons]
				: [];
		const storedTotal = Number(warning.totalWarns);
		const totalWarns = Number.isSafeInteger(storedTotal) && storedTotal >= reasons.length
			? storedTotal
			: reasons.length;
		const latestReason = limitText(
			warning.latestReason ?? reasons[reasons.length - 1] ?? 'No reason recorded.',
			MAX_DISPLAY_REASON_LENGTH,
		);
		const responsePrefix =
			`${user} has been warned: ${totalWarns.toLocaleString()} times.\n` +
			`Latest warning: ${latestReason}\n` +
			'Reasons:\n';
		const reasonLines = [];
		let omittedReasons = Number(warning.omittedReasons);
		if (!Number.isSafeInteger(omittedReasons) || omittedReasons < 0) omittedReasons = 0;

		for (const [index, reason] of reasons.entries()) {
			const line = `${index + 1}. ${limitText(reason, MAX_DISPLAY_REASON_LENGTH)}`;
			const nextReasons = reasonLines.length ? `${reasonLines.join('\n')}\n${line}` : line;
			if ((responsePrefix + nextReasons).length <= MAX_MESSAGE_LENGTH) {
				reasonLines.push(line);
			} else {
				omittedReasons += 1;
			}
		}

		let content = responsePrefix + (reasonLines.join('\n') || 'No reasons recorded.');
		if (omittedReasons) {
			const suffix = `\n... and ${omittedReasons} more reason${omittedReasons === 1 ? '' : 's'} not shown.`;
			if ((content + suffix).length <= MAX_MESSAGE_LENGTH) {
				content += suffix;
			} else {
				content = `${content.slice(0, MAX_MESSAGE_LENGTH - suffix.length).trimEnd()}${suffix}`;
			}
		}

		return interaction.editReply(content);
	},
};