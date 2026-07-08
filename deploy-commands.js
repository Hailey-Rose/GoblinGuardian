const { REST, Routes } = require('discord.js');
const { clientId, guildId, token, guildName } = require('./config.json');
const fs = require('node:fs');
const path = require('node:path');

const commands = [];
// Grab all the command folders from the commands directory you created earlier
const foldersPath = path.join(__dirname, 'commands');
const commandFiles = getCommandFiles(foldersPath);

function getCommandFiles(directory) {
	return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const entryPath = path.join(directory, entry.name);

		if (entry.isDirectory()) return getCommandFiles(entryPath);

		return entry.isFile() && entry.name.endsWith('.js') ? [entryPath] : [];
	});
}

// Grab the SlashCommandBuilder#toJSON() output of each command's data for deployment
for (const filePath of commandFiles) {
	const command = require(filePath);
	if ('data' in command && 'execute' in command) {
		commands.push(command.data.toJSON());
	} else {
		console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
	}
}

// Construct and prepare an instance of the REST module
const rest = new REST().setToken(token);

async function deployCommands() {
	try {
		// The put method is used to fully refresh all commands in the guild with the current set
		const data = await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });

		console.log(`Deployed ${data.length} command(s): ${data.map((command) => `/${command.name}`).join(', ') || 'none'}`);
	} catch (error) {
		// And of course, make sure you catch and log any errors!
		console.error(error);
		throw error;
	}
}

if (require.main === module) {
	deployCommands();
}

module.exports = deployCommands;
