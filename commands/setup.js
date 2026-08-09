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
		.addIntegerOption((option) =>
			option
				.setName('modlog')
				.setDescription('Channel ID of where to send mod logs.')
				.setRequired(true),
		)
		.addIntegerOption((option) =>
			option
				.setName('msglog')
				.setDescription('Channel ID of where to send message logs.')
				.setRequired(true),
		)
        .addIntegerOption((option) =>
            option
                .setName('mutedrole')
                .setDescription('Role Id for server muted role.')
                .setRequired(true),

        ),
    async execute(interaction) {
        const modLogs = interaction.options.getInteger('modlog');
        const msgLogs = interaction.options.getInteger('msglog')
        const mutedRole = interaction.options.getInteger('mutedrole')
		const guild = await interaction.guildId;
		const guildName = await interaction.guild.name
        const filePath = 'setupids.json';
        const users = await getdata(filePath);


        if (!users[guild]) {
            users[guild] = {
                modLogs: modLogs,
                msgLogs: msgLogs,
                mutedRole: mutedRole,
                createdAt: Date.now(),
                updatedAt: Date.now(),
				guildName: guildName,
				guildId: await interaction.guildId,

			};
        }
		let server = users[guild].guildId.slice()
		console.log(server)

		if ([server] !== users[guild].guildId) {
            users[guild] = {
                modLogs: modLogs,
                msgLogs: msgLogs,
                mutedRole: mutedRole,
                createdAt: Date.now(),
                updatedAt: Date.now(),
				guildName: guildName,
				guildId: await interaction.guildId,

			};
		}
		else {
			await interaction.reply({
				content: 'There was an error setting up the bot!',
				flags: MessageFlags.Ephemeral,
			});
		
		}
    }
    }
    