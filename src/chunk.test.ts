import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { discordChunkLimit } from "./constants.ts";
import { isSilence, prepareOutbound, splitDiscordText } from "./chunk.ts";

describe("chunking", () => {
  it("treats empty text and SILENCE as silence", () => {
    assert.equal(isSilence(""), true);
    assert.equal(isSilence("   "), true);
    assert.equal(isSilence("SILENCE"), true);
    assert.equal(isSilence("hello"), false);
    assert.equal(prepareOutbound("SILENCE").silent, true);
    assert.equal(prepareOutbound("   ").silent, true);
  });

  it("leaves short text as a single chunk", () => {
    assert.deepEqual(splitDiscordText("hello"), ["hello"]);
  });

  it("splits at 1900 characters, preferring newlines", () => {
    const first = `${"a".repeat(100)}\n${"b".repeat(1798)}`;
    const rest = "c".repeat(50);
    const chunks = splitDiscordText(`${first}\n${rest}`);
    assert.ok(chunks.every((chunk) => chunk.length <= discordChunkLimit));
    assert.ok(chunks.length >= 2);
    assert.equal(chunks.join("\n"), `${first}\n${rest}`);
  });

  it("hard-splits when there is no newline", () => {
    const text = "x".repeat(discordChunkLimit + 10);
    const chunks = splitDiscordText(text);
    assert.equal(chunks.length, 2);
    assert.equal(chunks[0]?.length, discordChunkLimit);
    assert.equal(chunks.join(""), text);
  });

  it("redacts secrets before chunking", () => {
    const jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.signaturepartxx";
    const prepared = prepareOutbound(`see ${jwt}`);
    assert.equal(prepared.silent, false);
    assert.equal(prepared.chunks.join("").includes(jwt), false);
  });
});
