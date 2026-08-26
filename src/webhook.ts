import { createHmac } from "node:crypto";
import http from "node:http";
import https from "node:https";

import { webhookTimeoutMs } from "./constants.ts";
import { redactSecrets } from "./redact.ts";
import { pinWebhookAddress, type AddressLookup, type PinnedAddress } from "./webhook-url.ts";

export type PinnedLookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | Array<{ address: string; family: number }>,
  family?: number,
) => void;

export function invokePinnedLookup(
  pinned: PinnedAddress,
  options: unknown,
  callback?: PinnedLookupCallback,
): void {
  const cb: PinnedLookupCallback =
    typeof options === "function" ? (options as PinnedLookupCallback) : (callback ?? (() => undefined));
  const all = Boolean(
    options && typeof options === "object" && (options as { all?: unknown }).all === true,
  );

  if (all) {
    cb(null, [{ address: pinned.address, family: pinned.family }]);
    return;
  }

  cb(null, pinned.address, pinned.family);
}

export type WebhookPayload = {
  message_id: string;
  channel_id: string;
  guild_id: string;
  parent_channel_id: string;
  author_id: string;
  author_username: string;
  content: string;
  is_reply: boolean;
  referenced_message_id: string | null;
};

export type WebhookDeps = {
  fetchImpl?: typeof fetch;
  lookup?: AddressLookup;
};

export function signWebhookBody(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

export function webhookHeaders(body: string, secret?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };

  if (!secret) {
    return headers;
  }

  headers["x-grok-signature"] = `sha256=${signWebhookBody(body, secret)}`;
  headers.authorization = `Bearer ${secret}`;
  return headers;
}

export function sanitizeWebhookPayload(payload: WebhookPayload): WebhookPayload {
  return {
    ...payload,
    author_username: redactSecrets(payload.author_username),
    content: redactSecrets(payload.content),
  };
}

function postPinnedJson(
  url: string,
  pinned: PinnedAddress,
  headers: Record<string, string>,
  body: string,
): Promise<{ status: number }> {
  const parsed = new URL(url);
  const isHttps = parsed.protocol === "https:";
  const client = isHttps ? https : http;
  const port = parsed.port ? Number(parsed.port) : isHttps ? 443 : 80;

  return new Promise((resolve, reject) => {
    const req = client.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port,
        path: `${parsed.pathname}${parsed.search}`,
        method: "POST",
        headers: {
          ...headers,
          "content-length": String(Buffer.byteLength(body)),
        },
        lookup(_hostname, options, callback) {
          invokePinnedLookup(pinned, options, callback);
        },
      },
      (response) => {
        response.resume();
        response.on("end", () => {
          resolve({ status: response.statusCode ?? 0 });
        });
      },
    );

    req.setTimeout(webhookTimeoutMs, () => {
      req.destroy();
      reject(new Error("webhook timeout"));
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

export async function postGrokWebhook(
  url: string,
  payload: WebhookPayload,
  secret?: string,
  deps: WebhookDeps = {},
): Promise<void> {
  if (!secret) {
    throw new Error("GROK_WEBHOOK_SECRET is required when GROK_WEBHOOK_URL is set");
  }

  const pinned = await pinWebhookAddress(url, deps.lookup);
  const body = JSON.stringify(sanitizeWebhookPayload(payload));
  const headers = webhookHeaders(body, secret);

  if (deps.fetchImpl) {
    const response = await deps.fetchImpl(url, {
      method: "POST",
      headers,
      body,
      redirect: "error",
      signal: AbortSignal.timeout(webhookTimeoutMs),
    });

    if (!response.ok) {
      throw new Error(`webhook ${response.status}`);
    }

    return;
  }

  const response = await postPinnedJson(url, pinned, headers, body);
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`webhook ${response.status}`);
  }
}
