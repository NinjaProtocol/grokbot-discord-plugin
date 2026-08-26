---
name: discord-chat
description: How this Discord connector talks in-channel. SILENCE, no threads, redact, chunk, whole-word name matching, follow-up after a real reply, never echo tokens. Use when sending or replying through grok-discord MCP tools.
---

# Discord chat rules

This plugin is Discord I/O only. Use the MCP tools. Do not invent a second Gateway. MCP is REST only.

## Tools

- `discord_status` — bot, guild, allowlisted channels. `webhookConfigured` is this MCP process only; ignore it when judging whether the gateway has a URL.
- `discord_send` — post in a parent channel. Cannot attach files. Optional `author_id` opens the follow-up window after a real post.
- `discord_reply` — reply to an inbound message (parent channel only). Cannot attach files. Pass inbound `author_id` so a real reply opens the follow-up window.
- `discord_history` — recent allowlisted history. Other users are omitted unless they hold an allowed role. Empty `DISCORD_ALLOWED_ROLE_IDS` allows anyone to talk, not to appear as peers in history.
- `discord_list_channels` — configured parent channels
- `discord_react` — add a reaction
- `discord_worker_status` — sidecar up/down on this computer (no secrets)
- `discord_ensure_worker` — start the sidecar if down; no-op if up. Never opens a Gateway inside MCP.
- `discord_restart_worker` — stop the live supervisor if up, then start one replica with the current env. Use after webhook URL or channel list changes.

Every tool refuses guilds and channels outside `DISCORD_GUILD_ID` / `DISCORD_CHANNEL_IDS`. Channel, message, and user IDs must be Discord snowflakes. Reaction emoji must be unicode or `name:id`.

## What to post

- If you have nothing to say, call `discord_reply` / `discord_send` with exactly `SILENCE`, or skip the tool. Empty text also posts nothing.
- Never start a thread. Replies always go to the **parent** channel. If the ping came from a thread, still use `parent_channel_id` for the visible reply.
- First parent-channel chunk is a reply (`allowedMentions.repliedUser = false`). Later chunks are channel sends with `allowedMentions.parse = []`. The tools do this for you. Chunks are 1900 characters.
- Do not echo bot tokens, webhook secrets, PEMs, JWTs, or API keys. Outbound text is redacted, but do not put secrets in Discord in the first place.

## Who you answer

The gateway only wakes you for directed messages in allowlisted channels:

- @mention of the bot
- reply to the bot
- whole-word bot name **anywhere** after mentions are stripped (not only a leading `hey` / `yo` prefix)
- follow-up from the same user in the same parent channel within 15 minutes, **after a real non-SILENCE reply**

The gateway filter is not always right. You must still choose SILENCE.

SILENCE when:

- Third-person talk that only mentions the bot’s name (example shape: `ghost say hello to chief`)
- Follow-up noise that is not for the bot (example shape: `ghost health check`)
- Ambient chat that happened to contain the bot name as a word
- Anything that is not a real request to this bot

Answer when:

- The author @mentions the bot and is asking it to do something
- The author addresses the bot by name as the intended recipient (example shape: `chief say hello to ghost`)
- This is a real continuation of a conversation you already joined

`/new` (and `/reset`) clears that follow-up window locally. `/status` is answered by the gateway without inference.

Optional `DISCORD_ALLOWED_ROLE_IDS`: if set, other roles are dropped. If empty, anyone in the allowlisted channel can talk to the bot.

## Errors

If a tool fails, do not paste stack traces into Discord. The public line is:

`Something broke on my side. Not saying more here.`

Details stay in the gateway or MCP host logs.
