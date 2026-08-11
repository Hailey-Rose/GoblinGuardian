const {
	SlashCommandBuilder,
	PermissionFlagsBits,
	MessageFlags,
} = require('discord.js');
const { getGuildChannel, updateGuildSetup } = require('../utils/guildsetup');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('setmodlog')
		.setDescription('Set a mod log channel for Goblin Guardian.')
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
		.addStringOption((option) =>
			option
				.setName('modlog')
				.setDescription('Channel ID of where to send mod logs.')
				.setRequired(true),
		),
	async execute(interaction) {
		if (!interaction.guildId || !interaction.guild) {
			return interaction.reply({
				content: 'This command can only be used in a server.',
				flags: MessageFlags.Ephemeral,
			});
		}

		const modLogs = interaction.options.getString('modlog');
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		if (!await getGuildChannel(interaction.guild, modLogs)) {
			return interaction.editReply({
				content: 'That must be a text channel in this server.',
			});
		}

		try {
			await updateGuildSetup(interaction.guildId, (currentSetup) => ({
				...currentSetup,
				modLogs,
				guildName: interaction.guild.name,
			}));
		} catch (error) {
			console.error('Failed to save mod log setup:', error);
			return interaction.editReply({
				content: 'There was an error saving the mod log setup.',
			});
		}

		return interaction.editReply({
			content: `Moderator log channel saved for **${interaction.guild.name}**.`,
		});
	},
};