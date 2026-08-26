import { isIP } from "node:net";
import { lookup as dnsLookup } from "node:dns/promises";

const blockedHostSuffixes = [".internal", ".localhost", ".local", ".arpa", ".invalid"];

export type AddressLookup = (hostname: string) => Promise<{ address: string; family: number }[]>;

function ipv4FromDotted(hostname: string): number[] | null {
  const parts = hostname.split(".");
  if (parts.length !== 4) {
    return null;
  }

  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) {
      return null;
    }

    const value = Number(part);
    if (value > 255) {
      return null;
    }

    octets.push(value);
  }

  return octets;
}

function ipv4IsPrivate(octets: number[]): boolean {
  const [a, b] = octets;
  if (a === undefined || b === undefined) {
    return true;
  }

  if (a === 0 || a === 10 || a === 127) {
    return true;
  }

  if (a === 169 && b === 254) {
    return true;
  }

  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }

  if (a === 192 && b === 168) {
    return true;
  }

  if (a === 100 && b >= 64 && b <= 127) {
    return true;
  }

  return false;
}

function ipv6IsPrivate(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized === "::1" || normalized === "0:0:0:0:0:0:0:1") {
    return true;
  }

  if (normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:")) {
    return true;
  }

  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mapped?.[1]) {
    const octets = ipv4FromDotted(mapped[1]);
    return !octets || ipv4IsPrivate(octets);
  }

  return false;
}

export function isPrivateIp(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const octets = ipv4FromDotted(address);
    return !octets || ipv4IsPrivate(octets);
  }

  if (family === 6) {
    return ipv6IsPrivate(address);
  }

  return true;
}

export function isLoopbackHostname(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host === "::1") {
    return true;
  }

  const octets = ipv4FromDotted(host);
  return Boolean(octets && octets[0] === 127);
}

function hostnameLooksSafe(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (isIP(host) || host === "localhost") {
    return true;
  }

  if (blockedHostSuffixes.some((suffix) => host.endsWith(suffix))) {
    return false;
  }

  return /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(host);
}

export function parsePublicWebhookUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("GROK_WEBHOOK_URL must be an http(s) URL");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("GROK_WEBHOOK_URL must be an http(s) URL");
  }

  if (parsed.username || parsed.password) {
    throw new Error("GROK_WEBHOOK_URL must not include credentials");
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
  if (!hostname || !hostnameLooksSafe(hostname)) {
    throw new Error("GROK_WEBHOOK_URL host is not allowed");
  }

  const loopback = isLoopbackHostname(hostname);
  if (parsed.protocol === "http:" && !loopback) {
    throw new Error("GROK_WEBHOOK_URL must use HTTPS");
  }

  if (isIP(hostname) && !loopback && isPrivateIp(hostname)) {
    throw new Error("GROK_WEBHOOK_URL host is not allowed");
  }

  return parsed.toString();
}

export type PinnedAddress = {
  hostname: string;
  address: string;
  family: number;
};

export async function pinWebhookAddress(
  url: string,
  lookup: AddressLookup = async (hostname) => {
    const records = await dnsLookup(hostname, { all: true, verbatim: true });
    return records.map((record) => ({ address: record.address, family: record.family }));
  },
): Promise<PinnedAddress> {
  const parsed = new URL(parsePublicWebhookUrl(url));
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");

  if (isLoopbackHostname(hostname)) {
    if (isIP(hostname) === 6 || hostname === "::1") {
      return { hostname, address: hostname === "::1" ? "::1" : hostname, family: 6 };
    }

    return { hostname, address: isIP(hostname) === 4 ? hostname : "127.0.0.1", family: 4 };
  }

  if (isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      throw new Error("GROK_WEBHOOK_URL host is not allowed");
    }

    return { hostname, address: hostname, family: isIP(hostname) };
  }

  const records = await lookup(hostname);
  if (records.length === 0) {
    throw new Error("GROK_WEBHOOK_URL host is not allowed");
  }

  for (const record of records) {
    if (isPrivateIp(record.address) || record.family === 0) {
      throw new Error("GROK_WEBHOOK_URL host is not allowed");
    }
  }

  const pinned = records[0];
  if (!pinned) {
    throw new Error("GROK_WEBHOOK_URL host is not allowed");
  }

  return { hostname, address: pinned.address, family: pinned.family };
}
