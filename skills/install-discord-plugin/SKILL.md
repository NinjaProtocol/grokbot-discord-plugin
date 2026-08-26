---
name: install-discord-plugin
description: Install Discord for Grok Bot from this GitHub repo or the marketplace and connect it without improvising. Use when the user pastes the install line, says install Discord, enable the Discord plugin, help me set up Discord, or SearchPlugins for grok-discord is empty.
---

# Install Discord for Grok Bot

You are the installer. The human README is short on purpose. **Follow `docs/GROK-BOT-INSTALL.md` in this repository exactly** (install sequence, inbound prompt, verification, troubleshooting). Do not improvise a shorter path.

Then run `setup-discord-app` and `connect-grok-bot`. Chat rules are in `discord-chat`.

## Do not

- Do not ask the operator to clone the repo.
- Do not ask them to paste the bot token in chat or Discord. Use a secret-request.
- Do not use Railway.
- Do not grant Administrator.
- Do not open a Discord Gateway inside MCP.
- Do not start two Gateways on one token.
- Do not start threads.
- Do not echo tokens, webhook keys, or env files.
- Do not create extra inbound routines so someone can copy a URL or key from a panel.
- Do not save a 5-minute watchdog. One weekday daily alive-check only.
- Do not skip verification to `@Bot hello`. REST send first. 50013 is channel-level bot-role overwrites, not a webhook bug.
- Do not treat `discord_status.webhookConfigured` as the gateway truth.

## Do

1. Marketplace install if listed; otherwise copy this repo onto the Grok Bot computer from an account that can read it.
2. `npm install && npm run build` in the plugin root. Node 20.19+ is enough. Register MCP with `bash ./bin/launch-mcp.sh`.
3. Walk the human through Discord keys. Mandatory channel-level overwrites on the **bot’s own role**.
4. Persist token via secret-request (or Plugins → Configure if that card exists). Guild and channel IDs in launch-wrapper env, not the repo.
5. One inbound webhook routine. Build the host automations URL on this computer. Start one worker with `discord_ensure_worker`. After env changes, `discord_restart_worker`.
6. Verify in the order in `docs/GROK-BOT-INSTALL.md`.
