import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { loadConfig, type ConnectorConfig } from "./config.ts";
import { followUpWindowMs, publicError } from "./constants.ts";
import { createDiscordRest, type DiscordRest } from "./discord-rest.ts";
import { snowflakePattern } from "./ids.ts";
import { createFileFollowUpStore, createFollowUpStore, touchFollowUpAfterPost, type FollowUpStore } from "./follow-up.ts";
import { scrubSecretEnv } from "./process-env.ts";
import {
  defaultRuntimeDir,
  ensureWorker,
  productionSupervisorDeps,
  restartWorker,
  tokenFingerprint,
  workerStatus,
  type EnsureResult,
  type RestartResult,
  type WorkerStatus,
} from "./supervisor.ts";

const snowflake = z.string().regex(snowflakePattern, "must be a Discord snowflake");

function toolText(payload: unknown): { content: { type: "text"; text: string }[] } {
  return {
    content: [{ type: "text", text: typeof payload === "string" ? payload : JSON.stringify(payload, null, 2) }],
  };
}

function toolError(error: unknown): { content: { type: "text"; text: string }[]; isError: true } {
  const detail = error instanceof Error ? error.message : "unknown error";
  process.stderr.write(`grok-discord mcp error: ${detail}\n`);
  const publicSafe = /allowlist|not built/i.test(detail) ? detail : publicError;
  return {
    content: [{ type: "text", text: publicSafe }],
    isError: true,
  };
}

export type WorkerControl = {
  status: (config: ConnectorConfig) => WorkerStatus;
  ensure: (config: ConnectorConfig) => EnsureResult;
  restart: (config: ConnectorConfig) => RestartResult;
};

const defaultWorkerControl: WorkerControl = {
  status: (config) => workerStatus(config, productionSupervisorDeps(config)),
  ensure: (config) => ensureWorker(config, productionSupervisorDeps(config)),
  restart: (config) => restartWorker(config, productionSupervisorDeps(config)),
};

export function createMcpServer(
  config: ConnectorConfig,
  rest: DiscordRest = createDiscordRest(config),
  worker: WorkerControl = defaultWorkerControl,
  followUps: FollowUpStore = createFollowUpStore(followUpWindowMs),
): McpServer {
  const server = new McpServer({ name: "grok-discord", version: "1.0.3" });

  server.tool(
    "discord_status",
    "Show the bot identity, guild, and allowlisted channels. Never echoes tokens. webhookConfigured reflects this MCP process only, not the gateway worker.",
    async () => {
      try {
        return toolText(await rest.status());
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.tool(
    "discord_send",
    "Send text to an allowlisted parent channel. SILENCE or empty posts nothing. Never starts a thread. Cannot attach files.",
    {
      channel_id: snowflake.describe("Parent channel snowflake. Threads resolve to their parent."),
      content: z.string().describe("Message text. Use SILENCE to post nothing."),
      author_id: snowflake.optional().describe("Speaker snowflake. After a real post, opens the 15-minute follow-up window."),
    },
    async ({ channel_id, content, author_id }) => {
      try {
        const result = await rest.send(channel_id, content);
        touchFollowUpAfterPost(followUps, result.posted, result.channelId, author_id);
        return toolText(result);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.tool(
    "discord_reply",
    "Reply in the parent channel of an inbound message. Thread pings still reply in the parent. SILENCE posts nothing. Cannot attach files.",
    {
      channel_id: snowflake.describe("Channel snowflake of the inbound message."),
      message_id: snowflake.describe("Inbound message snowflake to reply to when it is in the parent channel."),
      content: z.string().describe("Reply text. Use SILENCE to post nothing."),
      author_id: snowflake.optional().describe("Inbound author snowflake. After a real reply, opens the 15-minute follow-up window."),
    },
    async ({ channel_id, message_id, content, author_id }) => {
      try {
        const result = await rest.reply(channel_id, message_id, content);
        touchFollowUpAfterPost(followUps, result.posted, result.channelId, author_id);
        return toolText(result);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.tool(
    "discord_history",
    "Read recent messages from an allowlisted channel. Other users are omitted unless they hold an allowed role.",
    {
      channel_id: snowflake.describe("Channel snowflake."),
      author_id: snowflake.optional().describe("Current speaker id used to include their prior lines."),
      limit: z.number().int().min(1).max(50).optional().describe("How many messages to fetch (default 15)."),
    },
    async ({ channel_id, author_id, limit }) => {
      try {
        return toolText(await rest.history(channel_id, author_id, limit));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.tool("discord_list_channels", "List allowlisted parent channels this bot may use.", async () => {
    try {
      return toolText(await rest.listChannels());
    } catch (error) {
      return toolError(error);
    }
  });

  server.tool(
    "discord_react",
    "Add a reaction to a message in an allowlisted channel.",
    {
      channel_id: snowflake.describe("Channel snowflake of the message."),
      message_id: snowflake.describe("Message snowflake."),
      emoji: z.string().min(1).max(64).describe("Unicode emoji or custom emoji name:id."),
    },
    async ({ channel_id, message_id, emoji }) => {
      try {
        return toolText(await rest.react(channel_id, message_id, emoji));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.tool(
    "discord_worker_status",
    "Show whether the Discord gateway sidecar is running on this computer. Never echoes tokens. Never opens a Gateway.",
    async () => {
      try {
        return toolText(worker.status(config));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.tool(
    "discord_ensure_worker",
    "Start the Discord gateway sidecar on this computer if it is down. No-op if it is already running. Never opens a Gateway inside MCP. Never starts a second socket for this bot token.",
    async () => {
      try {
        return toolText(worker.ensure(config));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.tool(
    "discord_restart_worker",
    "Stop the live supervisor if it is up, then start one replica with the current env. Use after webhook URL or channel list changes. Never opens a Gateway inside MCP. Never two Gateways.",
    async () => {
      try {
        return toolText(worker.restart(config));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  return server;
}

export async function startMcpServer(): Promise<void> {
  const config = loadConfig();
  scrubSecretEnv();
  const followUps = createFileFollowUpStore(
    defaultRuntimeDir(),
    tokenFingerprint(config.discordToken),
    followUpWindowMs,
  );
  const server = createMcpServer(config, createDiscordRest(config), defaultWorkerControl, followUps);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
