import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createRateLimiter } from "./rate-limit.ts";

describe("createRateLimiter", () => {
  it("allows up to maxHits per key inside the window, then denies", () => {
    const limiter = createRateLimiter(60_000, 2);
    assert.equal(limiter.allow("user-a"), true);
    assert.equal(limiter.allow("user-a"), true);
    assert.equal(limiter.allow("user-a"), false);
    assert.equal(limiter.allow("user-b"), true);
  });
});
