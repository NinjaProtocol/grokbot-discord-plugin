import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { assertChannelAllowed, channelIsAllowed } from "./allowlist.ts";
import { deliverOutbound } from "./outbound.ts";

const config = {
  discordGuildId: "guild-1",
  discordChannelIds: ["chan-1"],
};

describe("allowlist enforcement on send", () => {
  it("allows only the configured guild and parent channels", () => {
    assert.equal(channelIsAllowed(config, "guild-1", "chan-1"), true);
    assert.equal(channelIsAllowed(config, "guild-2", "chan-1"), false);
    assert.equal(channelIsAllowed(config, "guild-1", "chan-9"), false);
    assert.equal(channelIsAllowed(config, null, "chan-1"), false);
    assert.throws(() => assertChannelAllowed(config, "guild-1", "chan-9"), /allowlist/);
  });

  it("refuses deliverOutbound outside the allowlist before posting", async () => {
    const posted: string[] = [];
    await assert.rejects(
      deliverOutbound({
        config,
        guildId: "guild-1",
        parentChannelId: "chan-9",
        inThread: false,
        replyToMessageId: "msg-1",
        text: "hello",
        async post(chunk) {
          posted.push(chunk);
        },
      }),
      /allowlist/,
    );
    assert.deepEqual(posted, []);
  });

  it("posts nothing for SILENCE even on an allowlisted channel", async () => {
    const posted: string[] = [];
    const result = await deliverOutbound({
      config,
      guildId: "guild-1",
      parentChannelId: "chan-1",
      inThread: false,
      replyToMessageId: "msg-1",
      text: "SILENCE",
      async post(chunk) {
        posted.push(chunk);
      },
    });
    assert.equal(result.posted, false);
    assert.deepEqual(posted, []);
  });

  it("replies on the first parent-channel chunk, then sends", async () => {
    const modes: string[] = [];
    const text = `${"a".repeat(1900)}-${"b".repeat(20)}`;
    const result = await deliverOutbound({
      config,
      guildId: "guild-1",
      parentChannelId: "chan-1",
      inThread: false,
      replyToMessageId: "msg-1",
      text,
      async post(_chunk, mode) {
        modes.push(mode);
      },
    });
    assert.equal(result.posted, true);
    assert.deepEqual(modes, ["reply", "send"]);
  });

  it("never replies when the ping came from a thread", async () => {
    const modes: string[] = [];
    await deliverOutbound({
      config,
      guildId: "guild-1",
      parentChannelId: "chan-1",
      inThread: true,
      replyToMessageId: "msg-1",
      text: "hello from a thread",
      async post(_chunk, mode) {
        modes.push(mode);
      },
    });
    assert.deepEqual(modes, ["send"]);
  });
});
