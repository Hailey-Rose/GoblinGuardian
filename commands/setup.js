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
                .setName('mutedrole')
                .setDescription('Role Id for server muted role.')
                .setRequired(false),

        ),
    async execute(interaction) {
        const modLogs = interaction.options.getString('modlog');
        const msgLogs = interaction.options.getString('msglog')
        const mutedRole = interaction.options.getString('mutedrole')
		const guild = await interaction.guildId;
		const guildName = await interaction.guild.name
        const filePath = 'setupids.json';
        const users = await getdata(filePath);

		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        if (!users[guild]) {
            users[guild] = {
                modLogs: modLogs,
                msgLogs: msgLogs,
                mutedRole: mutedRole,
				guildName: guildName,
				guildId: interaction.guildId,

			};
        }
		let server = users[guild].guildId.slice()
		console.log(server)

		if ([server] !== users[guild].guildId) {
            users[guild] = {
                modLogs: modLogs,
                msgLogs: msgLogs,
                mutedRole: mutedRole,
				guildName: guildName,
				guildId: interaction.guildId,

			};
		}
		else {
			await interaction.reply({
				content: 'There was an error setting up the bot!',
				flags: MessageFlags.Ephemeral,
			});
		
		}
		await savedata(filePath, users);
		
		await interaction.followUp({
			content: `✅ setup ID success.`,
		});
    }
    }
    