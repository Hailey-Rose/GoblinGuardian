// Require the necessary discord.js classes
const fs = require('node:fs');
const path = require('node:path');
const {
	Client,
	Collection,
	Events,
	AuditLogEvent,
	GatewayIntentBits,
	MessageFlags,
	Partials,
} = require('discord.js');
const { token } = require('./config.json');
const { restoreMutes } = require('./utils/mutes');

// Create a new client instance
const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMembers,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.MessageContent,
	],
	partials: [Partials.Message, Partials.Channel, Partials.User],
});

client.commands = new Collection();

client.once(Events.ClientReady, (readyClient) => {
	console.log(`Ready! Logged in as ${readyClient.user.tag}`);
	void restoreMutes(client).catch((error) => console.error('Failed to restore mutes:', error));
});

function getJavaScriptFiles(directory) {
	return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const entryPath = path.join(directory, entry.name);

		if (entry.isDirectory()) return getJavaScriptFiles(entryPath);

		return entry.isFile() && entry.name.endsWith('.js') ? [entryPath] : [];
	});
}

const commandFiles = getJavaScriptFiles(path.join(__dirname, 'commands'));

for (const filePath of commandFiles) {
	const command = require(filePath);
	if ('data' in command && 'execute' in command) {
		client.commands.set(command.data.name, command);
	} else {
		console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
	}
}

console.log(`Loaded ${client.commands.size} command(s): ${client.commands.map((command) => `/${command.data.name}`).join(', ') || 'none'}`);

const eventFiles = getJavaScriptFiles(path.join(__dirname, 'events'));

for (const filePath of eventFiles) {
	const event = require(filePath);
	if ('name' in event && 'execute' in event) {
		const listener = (...args) => event.execute(...args, client);
		if (event.once) client.once(event.name, listener);
		else client.on(event.name, listener);
	} else {
		console.log(`[WARNING] The event at ${filePath} is missing a required "name" or "execute" property.`);
	}
}

console.log(`Loaded ${eventFiles.length} event(s).`);

client.on(Events.InteractionCreate, async (interaction) => {
	if (!interaction.isChatInputCommand()) return;
	console.log(`Received command /${interaction.commandName} from ${interaction.user.tag}`);
	const command = interaction.client.commands.get(interaction.commandName);

	if (!command) {
		console.error(`No command matching ${interaction.commandName} was found.`);
		return;
	}

	try {
		await command.execute(interaction);
	} catch (error) {
		console.error(error);
		if (interaction.replied || interaction.deferred) {
			await interaction.followUp({
				content: 'There was an error while executing this command!',
				flags: MessageFlags.Ephemeral,
			});
		} else {
			await interaction.reply({
				content: 'There was an error while executing this command!',
				flags: MessageFlags.Ephemeral,
			});
		}
	}
});

client.login(token);
