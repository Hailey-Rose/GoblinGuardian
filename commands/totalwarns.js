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
		.setName('warnings')
		.setDescription('View / check a members warnings.')
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
		.addUserOption((option) =>
			option
				.setName('user')
				.setDescription('The user to mute.')
				.setRequired(true),
		),
    async execute(interaction) {
        const user =  interaction.options.getUser('user');
        const member = await interaction.guild.members.fetch(user.id).catch(() => null);
        const filePath = 'warns.json';
        const users = await getdata(filePath);
        if (!users[member]) {
            	return interaction.reply({
				content: 'This user has **Zero** warnings.',
        })
        }
        await savedata(filePath, users);
		await interaction.reply(`${user} has been warned: ${users[member].totalWarns.toLocaleString()} times. || Reason(s): ${users[member].reasons.toLocaleString()} `); 
    }
}