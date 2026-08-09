const {
	SlashCommandBuilder,
	PermissionFlagsBits,
	PermissionsBitField,
	EmbedBuilder,
	MessageFlags,
	Message,
} = require('discord.js');
const { modLogs, guildName } = require('../config.json');
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
        const filePath = 'warns.json';
        const users = await getdata(filePath);

        if (!users[member]) {
            users[member] = {
                name: interaction.setName,
                id: interaction.user.id,
                reasons: reason,
                totalWarns: 0,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };
        }
        else {
            users[user].reasons = users[user].reasons + ', ' + reason;
        }
        users[user].totalWarns += (1);
        users[user].updatedAt = Date.now();

        await savedata(filePath, users);
		await interaction.reply(`${user} has been warned. Reason: ${reason} || They have been warned: ${users[member].totalWarns.toLocaleString()} times.`);

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
                `**Total warns:** ${users[member].totalWarns.toLocaleString()}`,
			);
		}    
    }
}
