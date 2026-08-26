---
name: connect-grok-bot
description: Connect Discord to this Grok Bot on the Grok Bot computer. Use when the user says connect Discord, wire Discord, start the Discord worker, or after setup-discord-app keys are ready. Starts the local gateway sidecar and a weekday daily alive-check. Do not use Railway.
---

# Connect Discord on this Grok Bot computer

Native path. The gateway worker runs **on this machine**. Never two Gateways on one `DISCORD_TOKEN`. MCP must never open a Gateway; it only supervises the sidecar over REST.

If Discord keys are missing, run `setup-discord-app` first. If the plugin is not on this computer yet, run `install-discord-plugin` first. Do not ask the user to clone this GitHub repo. Do not ask them to paste the token in chat.

Node **20.19 or newer** is enough. An engines warning on older published floors can still produce `dist/cli.js`. Confirm the build exists, then continue.

## 1. Plugin install and variables

Try **Plugins** → **Discord for Grok Bot** (`grok-discord`). If SearchPlugins for `discord` / `grok-discord` is empty, the marketplace listing is missing. An installer with GitHub access copies the tree onto this Grok Bot computer. Do not treat a public GitHub 404 as “the plugin does not exist.”

If the plugin root is not built yet, run `npm install && npm run build` there once. If `package-lock.json` cannot be fetched in one call, regenerate it locally. Register MCP with the launch wrapper, not a raw MCP entry until env is loaded:

```bash
bash ./bin/launch-mcp.sh
```

**Plugins → Configure** may not exist. Persist values this way:

| Value | Where it lives |
| --- | --- |
| `DISCORD_TOKEN` | connector-secrets, via **secret-request**. The launch wrapper reads it at start (`DISCORD_TOKEN` or `DISCORD_TOKEN_FILE`). Never paste it in chat. |
| `DISCORD_GUILD_ID` | launch wrapper / local `.env`. Do not ship one guild’s IDs in the repo. |
| `DISCORD_CHANNEL_IDS` | same. Parent channel snowflakes only. |
| `BOT_NAME_PREFIX` | optional spoken name (whole-word anywhere). |
| `DISCORD_ALLOWED_ROLE_IDS` | optional. Empty = anyone in an allowlisted channel. |
| `GROK_WEBHOOK_URL` and `GROK_WEBHOOK_SECRET` | runtime env on this computer (gateway process). Built below. Do not commit `.runtime-webhook.env`. |

Unexpanded `${VAR}` placeholders are ignored. Webhook URLs must pass the plugin SSRF rules (HTTPS, no credentials, no private/metadata hosts, DNS pinned, no redirects). Loopback HTTP is allowed for the optional forwarder fallback.

## 2. Create one inbound webhook routine

Create **one** Grok Bot routine with a **webhook** trigger. Do not create extra inbound routines so the user can copy a URL or key from a panel. The agent never usefully sees that panel key.

Build the host URL on this Grok Bot computer:

```
https://api2.cursor.sh/automations/webhook/<automationId>
```

`automationId` is the stable UUID from `sha256(agentId NUL routineFolder)`. Pair it with the sender key already on disk (`webhook-keys.json`). Put that HTTPS URL in `GROK_WEBHOOK_URL` and the sender key in `GROK_WEBHOOK_SECRET` on the **gateway** env.

Direct HTTPS is the default. If the gateway log shows `Invalid IP address: undefined`, use the loopback fallback:

- `GROK_WEBHOOK_URL=http://127.0.0.1:8787/`
- `GROK_WEBHOOK_UPSTREAM` = the real api2 automations URL
- same `GROK_WEBHOOK_SECRET`

`bin/with-env.sh` starts `bin/webhook-forward.mjs` when 127.0.0.1:8787 is down. The forwarder copies `Authorization` and `X-Grok-Signature`. Do not disable the SSRF DNS pin.

Put this prompt on the inbound routine:

```
You are answering Discord through the grok-discord MCP tools only.
Do not open a Discord Gateway. Do not start a thread. Do not echo
tokens, webhook keys, PEMs, JWTs, API keys, or env files.

The gateway already decided this line looked directed at the bot.
That decision is not always right. You must still choose SILENCE.

Parse the JSON body:
  message_id, channel_id, guild_id, parent_channel_id,
  author_id, author_username, content, is_reply,
  referenced_message_id

1. Call discord_history on parent_channel_id for recent context.
   Reply in the parent channel even if the event came from a thread.
2. Decide whether the author is talking TO the bot, or only
   ABOUT the bot / someone else.
3. If you should answer, call discord_reply with that message_id,
   the inbound channel_id, the inbound author_id, and the answer.
4. If you should not answer, reply with exactly SILENCE
   (or skip the tool). Empty text also posts nothing.

SILENCE in these cases:
- Third-person talk that only mentions the bot's name
  (example shape: "ghost say hello to chief").
- Follow-up noise that is not for the bot
  (example shape: "ghost health check").
- Ambient chat that happened to contain the bot name as a word.
- Anything that is not a real request to this bot.
- You have nothing useful to say.

Answer when:
- The author @mentions the bot and is asking it to do something.
- The author addresses the bot by name as the intended recipient
  (example shape: "chief say hello to ghost").
- This is a real continuation of a conversation you already joined.

Never start a thread.
Never post stack traces. The public error line is already:
  Something broke on my side. Not saying more here.
```

The gateway POSTs that JSON with `X-Grok-Signature: sha256=<hmac>` and `Authorization: Bearer <secret>`.

`discord_status.webhookConfigured` can stay false even when the gateway has the URL. Trust the gateway env and `~/.grok-discord/worker-*.log`.

## 3. Start exactly one worker

Call **`discord_ensure_worker`**. That starts the gateway sidecar if it is down and **no-ops if the supervisor is already alive**. It does not open a Gateway inside MCP.

CLI from the plugin root (after build), through the same env wrapper:

```bash
bash ./bin/with-env.sh node dist/cli.js ensure
bash ./bin/with-env.sh node dist/cli.js status
```

`discord_worker_status` reports `{ "running": true|false }` without secrets.

Logs should show `grok-discord ready as YourBot#1234; one replica per bot token` in `~/.grok-discord/worker-*.log`. If `GROK_WEBHOOK_URL` is missing at boot, the worker also prints that inbound will not wake a Grok Bot. `/status` and `/new` do not need the webhook.

After you change env (webhook URL, channel list, name prefix):

1. Reload MCP if those values live in the launch wrapper.
2. Call **`discord_restart_worker`** (or `bash ./bin/with-env.sh node dist/cli.js restart`).

`ensure` will not pick up env changes while the supervisor is alive. The pidfile `~/.grok-discord/worker-<fingerprint>.pid` is JSON `{ "supervisorPid", "startedAt" }`, not a raw pid. Never start a second gateway on the same token.

## 4. Weekday daily alive-check

Do **not** save a 5-minute `discord_ensure_worker` loop. Save one **weekday daily** scheduled routine. Example cron: `27 8 * * 1-5` (08:27 UTC, Monday–Friday). Intent:

```
Once each weekday, keep the Discord gateway worker alive on this Grok Bot computer.

1. Call discord_ensure_worker (same as `node dist/cli.js ensure` from the plugin root).
2. If action is already-running, do nothing else. Stay silent. Do not message Discord.
3. If action is started, the worker was dead and is now up. Stay silent unless it failed.
4. If it failed, report the error in this conversation only. Never post DISCORD_TOKEN, GROK_WEBHOOK_SECRET, or GROK_WEBHOOK_URL.

Do not start a second Gateway. Do not open a discord.js Client from MCP. Do not use Railway.
```

## 5. Test

Use the verification order in `docs/GROK-BOT-INSTALL.md`: REST status, send, worker ready without a missing-URL warning, one replica, `@Bot /status`, gateway env has the webhook URL, inbound `lastRunAt` after `@Bot hello`, name vs third-person SILENCE, other channels silent.

`@Bot /status` and `@Bot /new` are local and do not wake inference. A silent `/status` is a 50013 / channel-overwrite problem, not a webhook problem.

Do not use Railway. Do not open a Gateway inside MCP.
