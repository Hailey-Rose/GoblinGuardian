const {
	SlashCommandBuilder,
	PermissionFlagsBits,
	MessageFlags,
} = require('discord.js');
const { getGuildChannel, getGuildRole, updateGuildSetup } = require('../utils/guildsetup');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('setup')
		.setDescription('Set up Goblin Guardian for your server.')
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
		.addStringOption((option) =>
			option
				.setName('modlog')
				.setDescription('Channel ID of where to send mod logs.')
				.setRequired(false),
		)
		.addStringOption((option) =>
			option
				.setName('msglog')
				.setDescription('Channel ID of where to send message logs.')
				.setRequired(false),
		)
		.addStringOption((option) =>
			option
				.setName('genlog')
				.setDescription('Channel ID of where to send member logs.')
				.setRequired(false),
		)
		.addStringOption((option) =>
			option
				.setName('mutedrole')
				.setDescription('Role ID for the server muted role.')
				.setRequired(false),
		),
	async execute(interaction) {
		if (!interaction.guildId || !interaction.guild) {
			return interaction.reply({
				content: 'This command can only be used in a server.',
				flags: MessageFlags.Ephemeral,
			});
		}

		const guildId = interaction.guildId;
		const modLogs = interaction.options.getString('modlog');
		const msgLogs = interaction.options.getString('msglog');
		const genLogs = interaction.options.getString('genlog');
		const mutedRole = interaction.options.getString('mutedrole');

		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		const [modLogChannel, msgLogChannel, genLogChannel, mutedRoleObject] = await Promise.all([
			getGuildChannel(interaction.guild, modLogs),
			getGuildChannel(interaction.guild, msgLogs),
			getGuildChannel(interaction.guild, genLogs),
			getGuildRole(interaction.guild, mutedRole),
		]);
		const invalidSettings = [];
		if (modLogs && !modLogChannel) invalidSettings.push('modlog');
		if (msgLogs && !msgLogChannel) invalidSettings.push('msglog');
		if (genLogs && !genLogChannel) invalidSettings.push('genlog');
		if (mutedRole && !mutedRoleObject) invalidSettings.push('mutedrole');

		if (invalidSettings.length > 0) {
			return interaction.editReply({
				content: `These settings are invalid for this server: ${invalidSettings.map((name) => `\`${name}\``).join(', ')}.`,
			});
		}
		try {
			await updateGuildSetup(guildId, (currentSetup) => ({
				...currentSetup,
				modLogs: modLogs ?? currentSetup.modLogs ?? null,
				msgLogs: msgLogs ?? currentSetup.msgLogs ?? null,
				genLogs: genLogs ?? currentSetup.genLogs ?? null,
				mutedRole: mutedRole ?? currentSetup.mutedRole ?? null,
				guildName: interaction.guild.name,
			}));
		} catch (error) {
			console.error('Failed to save setup data:', error);
			return interaction.editReply({
				content: 'There was an error saving the setup.',
			});
		}

		await interaction.editReply({
			content: `Goblin Guardian setup saved for **${interaction.guild.name}**.`,
		});
	},
};