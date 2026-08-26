import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isPrivateIp, parsePublicWebhookUrl, pinWebhookAddress } from "./webhook-url.ts";

describe("parsePublicWebhookUrl", () => {
  it("requires HTTPS except loopback HTTP", () => {
    assert.equal(parsePublicWebhookUrl("https://hooks.example.com/grok"), "https://hooks.example.com/grok");
    assert.equal(parsePublicWebhookUrl("http://127.0.0.1:8787/hook"), "http://127.0.0.1:8787/hook");
    assert.throws(() => parsePublicWebhookUrl("http://hooks.example.com/grok"), /HTTPS/);
    assert.throws(() => parsePublicWebhookUrl("file:///etc/passwd"), /http/);
  });

  it("rejects credentials, private IPs, and metadata-style hosts", () => {
    assert.throws(() => parsePublicWebhookUrl("https://user:pass@hooks.example.com/grok"), /credentials/);
    assert.throws(() => parsePublicWebhookUrl("https://169.254.169.254/latest/meta-data"), /not allowed/);
    assert.throws(() => parsePublicWebhookUrl("https://10.0.0.8/hook"), /not allowed/);
    assert.throws(() => parsePublicWebhookUrl("https://metadata.google.internal/"), /not allowed/);
    assert.throws(() => parsePublicWebhookUrl("https://2852039166/"), /not allowed/);
  });
});

describe("pinWebhookAddress", () => {
  it("rejects DNS results that resolve to private addresses", async () => {
    await assert.rejects(
      pinWebhookAddress("https://hooks.example.com/grok", async () => [{ address: "127.0.0.1", family: 4 }]),
      /not allowed/,
    );
  });

  it("pins the resolved public address so later DNS changes cannot rebind", async () => {
    const pinned = await pinWebhookAddress("https://hooks.example.com/grok", async () => [
      { address: "8.8.8.8", family: 4 },
    ]);
    assert.equal(pinned.address, "8.8.8.8");
    assert.equal(pinned.family, 4);
    assert.equal(pinned.hostname, "hooks.example.com");
  });

  it("treats RFC1918 and link-local addresses as private", () => {
    assert.equal(isPrivateIp("192.168.1.9"), true);
    assert.equal(isPrivateIp("8.8.8.8"), false);
    assert.equal(isPrivateIp("::1"), true);
  });
});
