import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { redactSecrets } from "./redact.ts";

describe("redactSecrets", () => {
  it("redacts JWTs, Discord bot tokens, GitHub tokens, and private keys", () => {
    const jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.signaturepartxx";
    assert.equal(redactSecrets(`token ${jwt}`).includes(jwt), false);
    assert.match(redactSecrets(`token ${jwt}`), /\[redacted\]/);

    const discordToken = "Mabcdefghijklmnopqrstuvw.Gabcde.abcdefghijklmnopqrstuvwxyza";
    assert.equal(redactSecrets(discordToken).includes(discordToken), false);

    assert.equal(redactSecrets("ghp_abcdefghijklmnopqrstuvwxyz1234567890").includes("ghp_"), false);
    assert.match(redactSecrets('{"stamperKey": "abcsecret"}'), /\[redacted\]/);
    assert.match(
      redactSecrets("-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----"),
      /\[redacted\]/,
    );
  });
});
