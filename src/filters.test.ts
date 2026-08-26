import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isDirectedAtBot, memberHasAllowedRole, namesBot, shouldHandle } from "./filters.ts";

const allow = {
  configuredGuildId: "guild-1",
  configuredChannelIds: ["chan-1", "chan-2"],
};

describe("shouldHandle", () => {
  it("drops bots, webhooks, DMs, other guilds, and other channels", () => {
    const ok = {
      authorIsBot: false,
      webhookId: null,
      guildId: "guild-1",
      parentChannelId: "chan-1",
      ...allow,
    };

    assert.equal(shouldHandle(ok), true);
    assert.equal(shouldHandle({ ...ok, authorIsBot: true }), false);
    assert.equal(shouldHandle({ ...ok, webhookId: "hook" }), false);
    assert.equal(shouldHandle({ ...ok, guildId: null }), false);
    assert.equal(shouldHandle({ ...ok, guildId: "guild-2" }), false);
    assert.equal(shouldHandle({ ...ok, parentChannelId: "chan-9" }), false);
    assert.equal(shouldHandle({ ...ok, parentChannelId: null }), false);
  });

  it("allows a thread whose parent is allowlisted", () => {
    assert.equal(
      shouldHandle({
        authorIsBot: false,
        guildId: "guild-1",
        parentChannelId: "chan-2",
        ...allow,
      }),
      true,
    );
  });
});

describe("isDirectedAtBot", () => {
  const names = ["Grok", "ninja-bot"];

  it("accepts mentions, replies to the bot, name prefixes, and follow-ups", () => {
    assert.equal(
      isDirectedAtBot({ mentionedBot: true, isReplyToBot: false, content: "hi", botNames: names, followUp: false }),
      true,
    );
    assert.equal(
      isDirectedAtBot({ mentionedBot: false, isReplyToBot: true, content: "hi", botNames: names, followUp: false }),
      true,
    );
    assert.equal(
      isDirectedAtBot({
        mentionedBot: false,
        isReplyToBot: false,
        content: "hey grok, status",
        botNames: names,
        followUp: false,
      }),
      true,
    );
    assert.equal(
      isDirectedAtBot({
        mentionedBot: false,
        isReplyToBot: false,
        content: "yo ninja-bot",
        botNames: names,
        followUp: false,
      }),
      true,
    );
    assert.equal(
      isDirectedAtBot({
        mentionedBot: false,
        isReplyToBot: false,
        content: "<@123> hello",
        botNames: names,
        followUp: true,
      }),
      true,
    );
  });

  it("drops ambient chat", () => {
    assert.equal(
      isDirectedAtBot({
        mentionedBot: false,
        isReplyToBot: false,
        content: "good morning everyone",
        botNames: names,
        followUp: false,
      }),
      false,
    );
    assert.equal(namesBot("agreement among groks", ["Grok"]), false);
  });

  it("matches a name prefix after stripping mentions", () => {
    assert.equal(namesBot("<@99> hey Grok ping", ["Grok"]), true);
    assert.equal(namesBot("Grok ping", ["Grok"]), true);
  });

  it("matches a whole-word name anywhere, not a prefix of a longer word", () => {
    assert.equal(namesBot("ask Chief later", ["Chief"]), true);
    assert.equal(namesBot("ghost say hello to chief", ["chief"]), true);
    assert.equal(namesBot("chiefest", ["chief"]), false);
  });
});

describe("memberHasAllowedRole", () => {
  it("allows anyone when the role list is empty", () => {
    assert.equal(memberHasAllowedRole([], null), true);
    assert.equal(memberHasAllowedRole([], ["crew"]), true);
  });

  it("fails closed when roles are configured and the member is missing or unlisted", () => {
    assert.equal(memberHasAllowedRole(["crew"], null), false);
    assert.equal(memberHasAllowedRole(["crew"], ["rando"]), false);
    assert.equal(memberHasAllowedRole(["crew"], ["crew"]), true);
  });
});
