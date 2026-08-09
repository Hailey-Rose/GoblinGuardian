const {
	SlashCommandBuilder,
	PermissionFlagsBits,
	PermissionsBitField,
	EmbedBuilder,
	MessageFlags,
	Message,
} = require('discord.js');
// const { modLogs } = require('../config.json');
const { getdata, savedata } = require('../utils/json.js');

module.exports = {
    data: new SlashCommandBuilder()
		.setName('warn')
		.setDescription('Warn a user in the discord.')
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
		),

    async execute(interaction) {
        const user =  interaction.options.getUser('user');
		const member = await interaction.guild.members.fetch(user.id).catch(() => null);
        const reason = interaction.options.getString('reason');
		const guild = await interaction.guildId;
        const filePath = 'warns.json';
        const users = await getdata(filePath);


        if (!users[guild]) {
            users[guild] = {
                name: interaction.setName,
                id: interaction.user.id,
                reasons: reason,
                totalWarns: 0,
                createdAt: Date.now(),
                updatedAt: Date.now(),
				guildId: interaction.guildId,

			};
        }
		let server = users[guild].guildId.slice()
		console.log(server)

		if ([server] !== users[guild].guildId) {
//		if (users[guild].guildId !== interaction.guildId) {
			users[guild] = {
				name: interaction.setName,
				id: interaction.user.id,
				reasons: reason,
				totalWarns: 0,
				createdAt: Date.now(),
				updatedAt: Date.now(),
				guildId: interaction.guildId,
			};
		}
        else {
            users[user].reasons = users[user].reasons + ', ' + reason;
        }
        users[guild].totalWarns += (1);
        users[guild].updatedAt = Date.now();

        await savedata(filePath, users);
		await interaction.reply(`${user} has been warned. Reason: ${reason} || They have been warned: ${users[guild].totalWarns.toLocaleString()} times.`);

		const warnDm = new EmbedBuilder()
			.setColor('#ff0000')
			.setTitle('Warned')
			.setDescription(`You have been warned in **${guildName}** | **Reason:** ${reason}`);

		const dmSent = await user.send({ embeds: [warnDm] }).then(() => true).catch(() => false);

        const logChannel = await interaction.client.channels.fetch(modLogs).catch(() => null);
		if (logChannel?.isTextBased()) {
			await logChannel.send(
				`**Moderator:** ${interaction.user.tag}\n` +
				`**Warned User:** ${user.tag} (${user.id})\n` +
				`**Reason:** ${reason}\n` +
                `**Total warns:** ${users[guild].totalWarns.toLocaleString()}`,
			);
		}    
    }
}
