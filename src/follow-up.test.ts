import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { conversationKey } from "./filters.ts";
import {
  createFileFollowUpStore,
  createFollowUpStore,
  touchFollowUpAfterPost,
} from "./follow-up.ts";

describe("createFollowUpStore", () => {
  it("expires keys after the window and forgets them on prune", () => {
    const store = createFollowUpStore(100);
    store.touch("a", 1_000);
    assert.equal(store.isFollowUp("a", 1_050), true);
    assert.equal(store.isFollowUp("a", 1_200), false);
    assert.equal(store.isFollowUp("a", 1_200), false);
  });
});

describe("touchFollowUpAfterPost", () => {
  it("does not open a follow-up window when the outbound path is SILENCE", () => {
    const store = createFollowUpStore(60_000);
    const parent = "222222222222222222";
    const author = "444444444444444444";

    touchFollowUpAfterPost(store, false, parent, author);
    assert.equal(store.isFollowUp(conversationKey(parent, author)), false);
  });

  it("touches the shared key after a real post", () => {
    const store = createFollowUpStore(60_000);
    const parent = "222222222222222222";
    const author = "444444444444444444";

    touchFollowUpAfterPost(store, true, parent, author);
    assert.equal(store.isFollowUp(conversationKey(parent, author)), true);
  });
});

describe("createFileFollowUpStore", () => {
  it("shares follow-up state across gateway and MCP instances", () => {
    const runtimeDir = mkdtempSync(join(tmpdir(), "grok-discord-follow-up-"));
    try {
      const fingerprint = "abc123def4567890";
      const writer = createFileFollowUpStore(runtimeDir, fingerprint, 60_000);
      const reader = createFileFollowUpStore(runtimeDir, fingerprint, 60_000);
      const key = conversationKey("222222222222222222", "444444444444444444");

      writer.touch(key);
      assert.equal(reader.isFollowUp(key), true);

      writer.clear(key);
      assert.equal(reader.isFollowUp(key), false);
    } finally {
      rmSync(runtimeDir, { recursive: true, force: true });
    }
  });
});
