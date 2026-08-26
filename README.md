# Discord for Grok Bot

Talk to your Grok Bot from Discord. It only replies in the server channels you choose. Direct messages and other channels stay quiet.

## 1. Install the plugin

Paste this into a chat with your Grok Bot:

```
Install Discord for Grok Bot from https://github.com/NinjaProtocol/grokbot-discord-plugin and connect it. Follow docs/GROK-BOT-INSTALL.md in that repo exactly.
```

Or: **Plugins** → **Discord for Grok Bot** → **Install**, then type **connect Discord**.

## 2. Create a Discord bot

This is a one-time setup on Discord’s website. Keep a notes app open to paste four values.

### Make the app

1. Open [discord.com/developers/applications](https://discord.com/developers/applications) and sign in.
2. Click **New Application**. Name it what people will type when they @mention it.
3. Open **Bot**.
4. Click **Reset Token** and copy the token. That is `DISCORD_TOKEN`. Treat it like a password. Never post it in Discord.
5. Turn **Message Content Intent** **on**. Leave Presence and Server Members **off**.
6. Click **Save Changes**.

### Invite it to your server

1. Open **OAuth2** → **URL Generator**.
2. Under Scopes, check **bot** only.
3. Under Bot Permissions, check only:
  - View Channels
  - Send Messages
  - Read Message History
  - Embed Links
  - Add Reactions
4. Do **not** check Administrator.
5. Copy the URL at the bottom, open it, pick your server, and authorize.

In each Discord channel the bot should use, give it those same channel permissions. Do not give it access to channels you want to keep private.

### Copy your server and channel IDs

1. In Discord: **User Settings** → **Advanced** → turn **Developer Mode** on.
2. Right-click the **server name** → **Copy Server ID**. That is `DISCORD_GUILD_ID`.
3. Right-click each text channel the bot may use → **Copy Channel ID**. If there is more than one, put them in a list separated by commas. That is `DISCORD_CHANNEL_IDS`.

## 3. Save those values in Grok Bot

When Grok Bot asks, give it the token, server ID, and channel IDs. Never paste the token in Discord or in a public chat.

## 4. Connect Discord

If you used the paste in step 1, Grok Bot is already doing this. Otherwise type:

**connect Discord**

Follow what it asks. It will finish the connection and start listening on this Grok Bot computer.

## 5. Try it

In one of the Discord channels you listed, type:

**@YourBot hello**

You should get a reply in that same channel.

- Other channels: no reply
- Direct messages: no reply
- **@YourBot /status** — checks that it is online
- **@YourBot /new** — starts a fresh conversation

If something is missing, tell your Grok Bot **help me set up Discord**.

## Tips

- Use one Discord server.
- Only list channels you are happy for the bot to read and write in.
- If the token ever leaks, reset it in the Discord Developer Portal and tell your Grok Bot.
- After you change settings, say **connect Discord** again.

MIT licensed. Made by NinjaProtocol.
