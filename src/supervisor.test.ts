import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import type { ConnectorConfig } from "./config.ts";
import {
  ensureWorker,
  restartWorker,
  runSupervisorLoop,
  tokenFingerprint,
  workerStatus,
  type SupervisorDeps,
} from "./supervisor.ts";

const config: ConnectorConfig = {
  discordToken: "test-token-ensure",
  discordGuildId: "111111111111111111",
  discordChannelIds: ["222222222222222222"],
  discordAllowedRoleIds: [],
  rateWindowMs: 1000,
  ratePerUser: 6,
  ratePerChannel: 15,
};

function makeDeps(runtimeDir: string): SupervisorDeps & { spawned: number[]; live: Set<number>; nextPid: number } {
  const live = new Set<number>();
  const spawned: number[] = [];
  const state = {
    spawned,
    live,
    nextPid: 4000,
    runtimeDir,
    now: () => 1_700_000_000_000,
    isAlive: (pid: number) => live.has(pid),
    stopProcess(pid: number) {
      live.delete(pid);
    },
    spawnSupervisor() {
      state.nextPid += 1;
      const pid = state.nextPid;
      live.add(pid);
      spawned.push(pid);
      return { pid };
    },
  };

  return state;
}

describe("ensureWorker", () => {
  it("starts a supervisor when down and no-ops when already up", () => {
    const runtimeDir = mkdtempSync(join(tmpdir(), "grok-discord-ensure-"));
    try {
      const deps = makeDeps(runtimeDir);

      const first = ensureWorker(config, deps);
      assert.equal(first.action, "started");
      assert.equal(first.running, true);
      assert.equal(deps.spawned.length, 1);
      assert.equal(workerStatus(config, deps).running, true);
      assert.equal(workerStatus(config, deps).supervisorPid, first.supervisorPid);

      const second = ensureWorker(config, deps);
      assert.equal(second.action, "already-running");
      assert.equal(second.supervisorPid, first.supervisorPid);
      assert.equal(deps.spawned.length, 1);
    } finally {
      rmSync(runtimeDir, { recursive: true, force: true });
    }
  });

  it("starts a new supervisor when the previous one is dead", () => {
    const runtimeDir = mkdtempSync(join(tmpdir(), "grok-discord-ensure-dead-"));
    try {
      const deps = makeDeps(runtimeDir);
      const first = ensureWorker(config, deps);
      deps.live.delete(first.supervisorPid);

      assert.equal(workerStatus(config, deps).running, false);

      const again = ensureWorker(config, deps);
      assert.equal(again.action, "started");
      assert.notEqual(again.supervisorPid, first.supervisorPid);
      assert.equal(deps.spawned.length, 2);
    } finally {
      rmSync(runtimeDir, { recursive: true, force: true });
    }
  });

  it("isolates workers by token so two bots do not share a socket file", () => {
    const runtimeDir = mkdtempSync(join(tmpdir(), "grok-discord-ensure-fp-"));
    try {
      const deps = makeDeps(runtimeDir);
      const other: ConnectorConfig = { ...config, discordToken: "test-token-other" };
      ensureWorker(config, deps);
      ensureWorker(other, deps);
      assert.equal(deps.spawned.length, 2);
      assert.notEqual(tokenFingerprint(config.discordToken), tokenFingerprint(other.discordToken));
    } finally {
      rmSync(runtimeDir, { recursive: true, force: true });
    }
  });
});

describe("restartWorker", () => {
  it("kills the live supervisor then ensures exactly one replica", () => {
    const runtimeDir = mkdtempSync(join(tmpdir(), "grok-discord-restart-"));
    try {
      const deps = makeDeps(runtimeDir);
      const first = ensureWorker(config, deps);
      assert.equal(deps.spawned.length, 1);
      assert.equal(deps.live.size, 1);

      const again = ensureWorker(config, deps);
      assert.equal(again.action, "already-running");
      assert.equal(again.supervisorPid, first.supervisorPid);

      const restarted = restartWorker(config, deps);
      assert.equal(restarted.action, "restarted");
      assert.equal(restarted.previousSupervisorPid, first.supervisorPid);
      assert.notEqual(restarted.supervisorPid, first.supervisorPid);
      assert.equal(deps.spawned.length, 2);
      assert.equal(deps.live.size, 1);
      assert.equal(deps.live.has(first.supervisorPid), false);
      assert.equal(workerStatus(config, deps).running, true);
      assert.equal(workerStatus(config, deps).supervisorPid, restarted.supervisorPid);
    } finally {
      rmSync(runtimeDir, { recursive: true, force: true });
    }
  });
});

describe("runSupervisorLoop", () => {
  it("respawns the gateway child after it exits", async () => {
    const starts: number[] = [];
    let round = 0;
    let stopped = false;

    await runSupervisorLoop({
      restartDelayMs: 1,
      isStopped: () => stopped,
      delay: async () => undefined,
      spawnGateway() {
        round += 1;
        const pid = 8000 + round;
        starts.push(pid);
        return {
          pid,
          async wait() {
            if (round >= 2) {
              stopped = true;
            }
            return 1;
          },
          kill() {},
        };
      },
    });

    assert.deepEqual(starts, [8001, 8002]);
  });
});
