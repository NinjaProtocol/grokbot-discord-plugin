#!/usr/bin/env node

import http from "node:http";
import https from "node:https";

const listenHost = "127.0.0.1";
const listenPort = Number(process.env.GROK_WEBHOOK_FORWARD_PORT || 8787);
const upstream = process.env.GROK_WEBHOOK_UPSTREAM?.trim();

if (!Number.isInteger(listenPort) || listenPort < 1 || listenPort > 65535) {
  process.stderr.write("GROK_WEBHOOK_FORWARD_PORT must be a TCP port\n");
  process.exit(1);
}

if (!upstream) {
  process.stderr.write("GROK_WEBHOOK_UPSTREAM is required\n");
  process.exit(1);
}

let upstreamUrl;
try {
  upstreamUrl = new URL(upstream);
} catch {
  process.stderr.write("GROK_WEBHOOK_UPSTREAM must be an http(s) URL\n");
  process.exit(1);
}

if (upstreamUrl.protocol !== "https:" && upstreamUrl.protocol !== "http:") {
  process.stderr.write("GROK_WEBHOOK_UPSTREAM must be an http(s) URL\n");
  process.exit(1);
}

const server = http.createServer((req, res) => {
  if (req.method !== "POST") {
    res.writeHead(405);
    res.end();
    return;
  }

  const chunks = [];
  req.on("data", (chunk) => {
    chunks.push(chunk);
  });
  req.on("end", () => {
    const body = Buffer.concat(chunks);
    const headers = {
      "content-type": req.headers["content-type"] || "application/json",
      "content-length": String(body.length),
    };
    if (req.headers.authorization) {
      headers.authorization = req.headers.authorization;
    }
    if (req.headers["x-grok-signature"]) {
      headers["x-grok-signature"] = req.headers["x-grok-signature"];
    }

    const client = upstreamUrl.protocol === "https:" ? https : http;
    const request = client.request(
      {
        protocol: upstreamUrl.protocol,
        hostname: upstreamUrl.hostname,
        port: upstreamUrl.port || (upstreamUrl.protocol === "https:" ? 443 : 80),
        path: `${upstreamUrl.pathname}${upstreamUrl.search}`,
        method: "POST",
        headers,
      },
      (upstreamRes) => {
        res.writeHead(upstreamRes.statusCode ?? 502);
        upstreamRes.pipe(res);
      },
    );

    request.on("error", () => {
      if (!res.headersSent) {
        res.writeHead(502);
      }
      res.end();
    });
    request.write(body);
    request.end();
  });
});

server.listen(listenPort, listenHost, () => {
  process.stdout.write(`grok-discord webhook forwarder listening on ${listenHost}:${listenPort}\n`);
});
