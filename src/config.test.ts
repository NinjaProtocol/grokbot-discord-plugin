import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { loadConfig, usableEnvValue } from "./config.ts";

const snowflakeGuild = "111111111111111111";
const snowflakeChannel = "222222222222222222";

function baseEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    DISCORD_TOKEN: "test-token",
    DISCORD_GUILD_ID: snowflakeGuild,
    DISCORD_CHANNEL_IDS: snowflakeChannel,
    ...overrides,
  };
}

describe("usableEnvValue", () => {
  it("treats Cursor and empty placeholders as unset", () => {
    assert.equal(usableEnvValue("${DISCORD_TOKEN}"), undefined);
    assert.equal(usableEnvValue("${{secrets.DISCORD_TOKEN}}"), undefined);
    assert.equal(usableEnvValue("{{DISCORD_TOKEN}}"), undefined);
    assert.equal(usableEnvValue(""), undefined);
    assert.equal(usableEnvValue(" real "), "real");
  });
});

describe("loadConfig", () => {
  it("loads snowflake allowlists and ignores placeholder optional vars", () => {
    const config = loadConfig(
      baseEnv({
        DISCORD_ALLOWED_ROLE_IDS: "${DISCORD_ALLOWED_ROLE_IDS}",
        BOT_NAME_PREFIX: "${BOT_NAME_PREFIX}",
        GROK_WEBHOOK_URL: "${GROK_WEBHOOK_URL}",
      }),
    );

    assert.equal(config.discordGuildId, snowflakeGuild);
    assert.deepEqual(config.discordChannelIds, [snowflakeChannel]);
    assert.deepEqual(config.discordAllowedRoleIds, []);
    assert.equal(config.botNamePrefix, undefined);
    assert.equal(config.grokWebhookUrl, undefined);
  });

  it("requires a webhook secret when a webhook URL is set", () => {
    assert.throws(
      () => loadConfig(baseEnv({ GROK_WEBHOOK_URL: "https://hooks.example.com/grok" })),
      /GROK_WEBHOOK_SECRET/,
    );

    const config = loadConfig(
      baseEnv({
        GROK_WEBHOOK_URL: "https://hooks.example.com/grok",
        GROK_WEBHOOK_SECRET: "sender-key",
      }),
    );
    assert.equal(config.grokWebhookUrl, "https://hooks.example.com/grok");
  });

  it("rejects non-snowflake channel ids", () => {
    assert.throws(
      () => loadConfig(baseEnv({ DISCORD_CHANNEL_IDS: "../../users/@me" })),
      /snowflake/,
    );
  });
});
