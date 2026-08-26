import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { postGrokWebhook, invokePinnedLookup, sanitizeWebhookPayload, signWebhookBody, webhookHeaders } from "./webhook.ts";

describe("webhook HMAC", () => {
  it("signs the body when a secret is set", () => {
    const body = JSON.stringify({ message_id: "1" });
    const headers = webhookHeaders(body, "s3cret");
    assert.equal(headers["content-type"], "application/json");
    assert.equal(headers["x-grok-signature"], `sha256=${signWebhookBody(body, "s3cret")}`);
    assert.equal(headers.authorization, "Bearer s3cret");
    assert.equal(signWebhookBody(body, "s3cret"), signWebhookBody(body, "s3cret"));
    assert.notEqual(signWebhookBody(body, "s3cret"), signWebhookBody(body, "other"));
  });

  it("omits signature headers when no secret is set", () => {
    const headers = webhookHeaders("{}", undefined);
    assert.equal(headers["x-grok-signature"], undefined);
    assert.equal(headers.authorization, undefined);
  });
});

describe("postGrokWebhook", () => {
  const payload = {
    message_id: "1",
    channel_id: "2",
    guild_id: "3",
    parent_channel_id: "2",
    author_id: "4",
    author_username: "ada",
    content: "hello ghp_abcdefghijklmnopqrstuvwxyz1234567890",
    is_reply: false,
    referenced_message_id: null,
  };

  it("redacts secrets in the posted body", () => {
    const sanitized = sanitizeWebhookPayload(payload);
    assert.equal(sanitized.content.includes("ghp_"), false);
    assert.match(sanitized.content, /\[redacted\]/);
  });

  it("refuses to POST without a secret", async () => {
    await assert.rejects(postGrokWebhook("https://hooks.example.com/grok", payload), /GROK_WEBHOOK_SECRET/);
  });

  it("does not follow redirects and posts the signed body", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    await postGrokWebhook("https://hooks.example.com/grok", payload, "sender-key", {
      async lookup() {
        return [{ address: "8.8.8.8", family: 4 }];
      },
      async fetchImpl(url, init) {
        calls.push({ url: String(url), init: init ?? {} });
        return new Response(null, { status: 204 });
      },
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.init.redirect, "error");
    assert.equal(calls[0]?.init.method, "POST");
    const body = String(calls[0]?.init.body);
    assert.equal(body.includes("ghp_"), false);
    assert.match(String((calls[0]?.init.headers as Record<string, string>)["x-grok-signature"]), /^sha256=/);
  });
});

describe("invokePinnedLookup", () => {
  const pinned = { hostname: "hooks.example.com", address: "8.8.8.8", family: 4 };

  it("returns an address array when options.all is true", () => {
    let args: unknown[] = [];
    invokePinnedLookup(pinned, { all: true }, (...received) => {
      args = received;
    });

    assert.equal(args[0], null);
    assert.deepEqual(args[1], [{ address: "8.8.8.8", family: 4 }]);
    assert.equal(args.length, 2);
  });

  it("uses the legacy (address, family) callback when all is not set", () => {
    let address: unknown;
    let family: unknown;
    invokePinnedLookup(pinned, {}, (err, addr, fam) => {
      assert.equal(err, null);
      address = addr;
      family = fam;
    });

    assert.equal(address, "8.8.8.8");
    assert.equal(family, 4);
  });
});
