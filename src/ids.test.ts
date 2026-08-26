import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { assertSafeEmoji, assertSnowflake, isSnowflake, parseSnowflakeList } from "./ids.ts";

describe("snowflakes", () => {
  it("accepts 17-20 digit ids and rejects path-like values", () => {
    assert.equal(isSnowflake("12345678901234567"), true);
    assert.equal(isSnowflake("12345678901234567890"), true);
    assert.equal(isSnowflake("123"), false);
    assert.equal(isSnowflake("123456789012345678/../../users/@me"), false);
    assert.throws(() => assertSnowflake("../users/@me", "channel_id"), /snowflake/);
    assert.deepEqual(parseSnowflakeList(" 111111111111111111 , 222222222222222222 ", "ids"), [
      "111111111111111111",
      "222222222222222222",
    ]);
  });
});

describe("emoji", () => {
  it("allows unicode and name:id, and rejects path segments", () => {
    assert.equal(assertSafeEmoji("👍"), "👍");
    assert.equal(assertSafeEmoji("bun:111111111111111111"), "bun:111111111111111111");
    assert.throws(() => assertSafeEmoji("../../guilds/1"), /emoji/);
    assert.throws(() => assertSafeEmoji("name:not-an-id"), /emoji/);
    assert.throws(() => assertSafeEmoji("%2e%2e%2fguilds/1"), /emoji/);
    assert.throws(() => assertSafeEmoji("foo/bar"), /emoji/);
  });
});
