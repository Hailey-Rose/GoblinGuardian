const {
	SlashCommandBuilder,
	PermissionFlagsBits,
	PermissionsBitField,
	EmbedBuilder,
	MessageFlags,
	Message,
} = require('discord.js');
const { getdata, savedata } = require('../utils/json.js');

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
        const modLogs = interaction.options.getString('modlog');
		const guild = await interaction.guildId;
		const guildName = await interaction.guild.name
        const filePath = 'setupids.json';
        const users = await getdata(filePath);


        if (!users[guild]) {
            users[guild] = {
                modLogs: modLogs,
				guildName: guildName,
				guildId: interaction.guildId,

			};
        }
		let server = users[guild].guildId.slice()
		console.log(server)

		if ([server] !== users[guild].guildId) {
            users[guild] = {
                modLogs: modLogs,
				guildName: guildName,
				guildId: interaction.guildId,

			};
		}
		else {
			await interaction.reply({
				content: 'There was an error setting up the mod log!',
				flags: MessageFlags.Ephemeral,
			});
		
		}
    }
    }
    