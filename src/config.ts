import {
  defaultRatePerChannel,
  defaultRatePerUser,
  defaultRateWindowMs,
} from "./constants.ts";
import { assertSnowflake, parseSnowflakeList } from "./ids.ts";
import { parsePublicWebhookUrl } from "./webhook-url.ts";

export type ConnectorConfig = {
  discordToken: string;
  discordGuildId: string;
  discordChannelIds: string[];
  discordAllowedRoleIds: string[];
  grokWebhookUrl?: string;
  grokWebhookSecret?: string;
  botNamePrefix?: string;
  rateWindowMs: number;
  ratePerUser: number;
  ratePerChannel: number;
};

type EnvMap = Record<string, string | undefined>;

function isUnresolvedPlaceholder(value: string): boolean {
  return (
    value.startsWith("${") ||
    value.startsWith("{{") ||
    value.startsWith("${{") ||
    /^<[A-Z0-9_]+>$/i.test(value)
  );
}

export function usableEnvValue(value: string | undefined): string | undefined {
  let trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    trimmed = trimmed.slice(1, -1).trim();
  }

  if (!trimmed || isUnresolvedPlaceholder(trimmed)) {
    return undefined;
  }

  return trimmed;
}

export function optionalEnv(name: string, env: EnvMap = process.env): string | undefined {
  const direct = usableEnvValue(env[name]);
  if (direct) {
    return direct;
  }

  for (const [key, value] of Object.entries(env)) {
    if (key.trim() === name) {
      const matched = usableEnvValue(value);
      if (matched) {
        return matched;
      }
    }
  }

  return undefined;
}

function requiredEnv(name: string, env: EnvMap): string {
  const value = optionalEnv(name, env);
  if (!value) {
    throw new Error(`Missing required env ${name}`);
  }
  return value;
}

function parseChannelIds(env: EnvMap): string[] {
  const ids = new Set<string>([
    ...parseSnowflakeList(optionalEnv("DISCORD_CHANNEL_IDS", env), "DISCORD_CHANNEL_IDS"),
    ...parseSnowflakeList(optionalEnv("DISCORD_CHANNEL_ID", env), "DISCORD_CHANNEL_ID"),
  ]);

  if (ids.size === 0) {
    throw new Error("Missing required env DISCORD_CHANNEL_IDS");
  }

  return [...ids];
}

function parsePositiveMs(name: string, fallback: number, env: EnvMap): number {
  const raw = optionalEnv(name, env);
  if (!raw) {
    return fallback;
  }

  const value = Number(raw);
  if (!Number.isFinite(value) || value < 1) {
    throw new Error(`${name} must be a positive number`);
  }

  return value;
}

function parsePositiveInt(name: string, fallback: number, env: EnvMap): number {
  const raw = optionalEnv(name, env);
  if (!raw) {
    return fallback;
  }

  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }

  return value;
}

function parseWebhookUrl(raw: string | undefined): string | undefined {
  if (!raw) {
    return undefined;
  }

  return parsePublicWebhookUrl(raw);
}

function parseBotNamePrefix(raw: string | undefined): string | undefined {
  if (!raw) {
    return undefined;
  }

  if (raw.length < 2 || raw.length > 32) {
    throw new Error("BOT_NAME_PREFIX must be 2-32 characters");
  }

  return raw;
}

export function loadConfig(env: EnvMap = process.env): ConnectorConfig {
  const grokWebhookUrl = parseWebhookUrl(optionalEnv("GROK_WEBHOOK_URL", env));
  const grokWebhookSecret = optionalEnv("GROK_WEBHOOK_SECRET", env);

  if (grokWebhookUrl && !grokWebhookSecret) {
    throw new Error("GROK_WEBHOOK_SECRET is required when GROK_WEBHOOK_URL is set");
  }

  return {
    discordToken: requiredEnv("DISCORD_TOKEN", env),
    discordGuildId: assertSnowflake(requiredEnv("DISCORD_GUILD_ID", env), "DISCORD_GUILD_ID"),
    discordChannelIds: parseChannelIds(env),
    discordAllowedRoleIds: parseSnowflakeList(
      optionalEnv("DISCORD_ALLOWED_ROLE_IDS", env),
      "DISCORD_ALLOWED_ROLE_IDS",
    ),
    grokWebhookUrl,
    grokWebhookSecret,
    botNamePrefix: parseBotNamePrefix(optionalEnv("BOT_NAME_PREFIX", env)),
    rateWindowMs: parsePositiveMs("RATE_WINDOW_MS", defaultRateWindowMs, env),
    ratePerUser: parsePositiveInt("RATE_PER_USER", defaultRatePerUser, env),
    ratePerChannel: parsePositiveInt("RATE_PER_CHANNEL", defaultRatePerChannel, env),
  };
}
