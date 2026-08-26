---
name: setup-discord-app
description: Walk the user through creating Discord Developer Portal keys for this plugin — application, bot token, Message Content Intent, bot-scope invite, mandatory channel-level bot-role overwrites, and guild/channel snowflakes. Use when installing Discord for Grok Bot, when the user needs Discord keys, or before connect Discord.
---

# Create Discord keys for this connector

Give the user these steps. Fail closed. One guild. Only the channels they list. **Never Administrator.**

Do not ask them to clone a GitHub repo. Do not send them to Railway. Never ask them to paste the token in chat.

## 1. Create the application and bot

1. Open [https://discord.com/developers/applications](https://discord.com/developers/applications)
2. **New Application**. Name it what people will @mention.
3. Open **Bot**.
4. **Reset Token**. That value is `DISCORD_TOKEN`. Store it through a **secret-request**, never in chat, never in Discord. If it leaks, reset it.
5. Privileged Gateway Intents:
   - **Message Content Intent**: ON (required or the gateway cannot read message text)
   - Presence Intent: off
   - Server Members Intent: off unless they later set `DISCORD_ALLOWED_ROLE_IDS`
6. Save changes.

## 2. Invite with `bot` scope only

1. **OAuth2** → **URL Generator**
2. Scopes: check **bot** only. Do not check `applications.commands`.
3. Bot permissions — check these and nothing extra:
   - View Channels
   - Send Messages
   - Read Message History
   - Embed Links
   - Add Reactions
   - Attach Files (only if uploads are wanted; MCP `discord_send` / `discord_reply` cannot attach files)
4. Do **not** grant Administrator, Manage Server, Manage Channels, Manage Messages, or Create Public/Private Threads. This connector never starts threads.
5. Copy the generated URL. Open it while logged into an account that can add bots. Pick the target server. Authorize.

## 3. Channel-level bot-role Allows (mandatory)

A server team role with Send Messages is **not** enough. Until each allowlisted channel has **custom overwrites on the bot’s own role**, REST send returns Discord API **50013 Missing Permissions**. Then `discord_send`, `@Bot /status`, `@Bot /new`, and inbound replies are all silent. That is not a webhook bug. Never grant Administrator to paper over it.

1. In the server, open each channel the bot may use.
2. Channel **Permissions**: add the **bot’s own role** (not only a team role).
3. Allow only: View Channel, Send Messages, Read Message History, Embed Links, Add Reactions, and Attach Files if needed.
4. Confirm the bot **cannot** see other channels they care about. Deny View Channel on those, or leave it out of their overwrites.

## 4. Copy IDs (Developer Mode)

1. Discord → User Settings → **Advanced** → **Developer Mode** ON
2. Right-click the **server name** → **Copy Server ID** → `DISCORD_GUILD_ID`
3. Right-click each allowlisted **parent** text channel → **Copy Channel ID** → join them with commas as `DISCORD_CHANNEL_IDS`
4. Optional: copy role IDs for `DISCORD_ALLOWED_ROLE_IDS`. Empty means anyone in those channels.

DMs are ignored. The gateway does not enable Direct Message intents.

If they use a spoken name that differs from the Discord username, they will set `BOT_NAME_PREFIX` when connecting. Matching is a whole-word name anywhere after mentions are stripped, plus @mention.

When the user has token, guild ID, and channel IDs, continue with the `connect-grok-bot` skill. If the plugin is not installed on this computer yet, start with `install-discord-plugin`.
