const deployCommands = require('./deploy-commands');

(async () => {
	await deployCommands();
	require('./index');
})();
