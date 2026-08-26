import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { conversationKey } from "./filters.ts";

export type FollowUpStore = {
  isFollowUp: (key: string, now?: number) => boolean;
  touch: (key: string, now?: number) => void;
  clear: (key: string) => void;
};

const maxTrackedKeys = 5000;

function pruneMap(last: Map<string, number>, windowMs: number, now: number): void {
  for (const [key, stamp] of last) {
    if (now - stamp >= windowMs) {
      last.delete(key);
    }
  }
}

export function createFollowUpStore(windowMs: number): FollowUpStore {
  const last = new Map<string, number>();

  return {
    isFollowUp(key: string, now = Date.now()) {
      pruneMap(last, windowMs, now);
      const stamp = last.get(key);
      return Boolean(stamp && now - stamp < windowMs);
    },
    touch(key: string, now = Date.now()) {
      pruneMap(last, windowMs, now);
      if (last.size >= maxTrackedKeys && !last.has(key)) {
        last.clear();
      }
      last.set(key, now);
    },
    clear(key: string) {
      last.delete(key);
    },
  };
}

export function followUpFilePath(runtimeDir: string, fingerprint: string): string {
  return join(runtimeDir, `follow-up-${fingerprint}.json`);
}

function readPersisted(path: string): Map<string, number> {
  if (!existsSync(path)) {
    return new Map();
  }

  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    const last = new Map<string, number>();
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "number" && Number.isFinite(value)) {
        last.set(key, value);
      }
    }
    return last;
  } catch {
    return new Map();
  }
}

function writePersisted(path: string, last: Map<string, number>): void {
  mkdirSync(dirname(path), { recursive: true });
  const payload: Record<string, number> = {};
  for (const [key, stamp] of last) {
    payload[key] = stamp;
  }

  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(payload)}\n`);
  renameSync(tmp, path);
}

export function createFileFollowUpStore(
  runtimeDir: string,
  fingerprint: string,
  windowMs: number,
): FollowUpStore {
  const path = followUpFilePath(runtimeDir, fingerprint);

  function withStore<T>(now: number, mutate: (last: Map<string, number>) => T): T {
    const last = readPersisted(path);
    pruneMap(last, windowMs, now);
    const result = mutate(last);
    writePersisted(path, last);
    return result;
  }

  return {
    isFollowUp(key, now = Date.now()) {
      return withStore(now, (last) => {
        const stamp = last.get(key);
        return Boolean(stamp && now - stamp < windowMs);
      });
    },
    touch(key, now = Date.now()) {
      withStore(now, (last) => {
        if (last.size >= maxTrackedKeys && !last.has(key)) {
          last.clear();
        }
        last.set(key, now);
      });
    },
    clear(key) {
      withStore(Date.now(), (last) => {
        last.delete(key);
      });
    },
  };
}

export function touchFollowUpAfterPost(
  store: FollowUpStore,
  posted: boolean,
  parentChannelId: string,
  authorId?: string,
): void {
  if (!posted) {
    return;
  }

  const author = authorId?.trim();
  if (!author) {
    return;
  }

  store.touch(conversationKey(parentChannelId, author));
}
