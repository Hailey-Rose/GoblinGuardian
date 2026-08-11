# GoblinGuardian
Locally hosted Discord moderation bot.

## setup

1. create a bot application at https://discord.com/developers/home.
2. copy `exampleconfig.json` to `config.json` and add the bot token and application id.
3. invite the bot to every server where it should run, with the required scopes and permissions.
4. run `npm install`, then `npm start`.
5. in each server, run `/setup` with that server's channel and muted-role ids:
   - `modlog`: moderation action and role-change logs.
   - `msglog`: message edit and deletion logs.
   - `genlog`: member join and leave logs.
   - `mutedrole`: role used by `/mute`.

all server settings are stored separately by guild id. `setupids.json`, `warns.json`, and `data/mutes.json` are created or updated automatically.

global slash-command updates can take time to appear in discord. use `/setup` once per server after the commands become available.