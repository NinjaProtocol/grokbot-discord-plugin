import { createHmac, timingSafeEqual } from "node:crypto";

import { postDiscordWebhook } from "./discord.js";
import { parseWebhookUrl } from "./webhook-url.js";

export type WebhookPostInput = {
  webhookUrl: string;
  username?: string;
  avatarUrl?: string;
  content?: string;
  embeds?: unknown[];
  allowedMentions?: unknown;
  wait?: boolean;
};

export type WebhookPostResult =
  | { ok: true; status: number; data?: unknown }
  | { ok: false; error: string; status?: number };

export async function postWebhook(input: WebhookPostInput): Promise<WebhookPostResult> {
  const parsed = parseWebhookUrl(input.webhookUrl);
  if (!parsed) {
    return { ok: false, error: "Webhook URL is not a valid Discord webhook." };
  }
  const payload: Record<string, unknown> = {};
  if (input.username) payload.username = input.username;
  if (input.avatarUrl) payload.avatar_url = input.avatarUrl;
  if (input.content) payload.content = input.content;
  if (input.embeds) payload.embeds = input.embeds;
  if (input.allowedMentions) payload.allowed_mentions = input.allowedMentions;
  const result = await postDiscordWebhook({
    webhookId: parsed.id,
    token: parsed.token,
    wait: input.wait ?? true,
    payload,
  });
  if (!result.ok) {
    return { ok: false, error: result.error, status: result.status };
  }
  return { ok: true, status: result.status, data: result.data };
}

export function verifyHmacSha256(payload: string, signatureHex: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(payload, "utf8").digest("hex");
  try {
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(signatureHex, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
