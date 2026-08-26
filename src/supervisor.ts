import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";

import type { ConnectorConfig } from "./config.ts";
import { supervisorRestartDelayMs } from "./constants.ts";

export type WorkerPidfile = {
  supervisorPid: number;
  startedAt: number;
};

export type WorkerStatus = {
  running: boolean;
  supervisorPid?: number;
};

export type EnsureResult = {
  running: true;
  action: "started" | "already-running";
  supervisorPid: number;
};

export type RestartResult = {
  running: true;
  action: "restarted" | "started";
  supervisorPid: number;
  previousSupervisorPid?: number;
};

export type SpawnedProcess = {
  pid: number;
};

export type SupervisorDeps = {
  runtimeDir: string;
  isAlive: (pid: number) => boolean;
  spawnSupervisor: () => SpawnedProcess;
  stopProcess: (pid: number) => void;
  now: () => number;
};

export function tokenFingerprint(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 16);
}

export function defaultPluginRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..");
}

export function defaultRuntimeDir(): string {
  return process.env.GROK_DISCORD_RUNTIME_DIR?.trim() || join(homedir(), ".grok-discord");
}

export function workerEnv(config: ConnectorConfig): NodeJS.ProcessEnv {
  return {
    ...process.env,
    DISCORD_TOKEN: config.discordToken,
    DISCORD_GUILD_ID: config.discordGuildId,
    DISCORD_CHANNEL_IDS: config.discordChannelIds.join(","),
    DISCORD_ALLOWED_ROLE_IDS: config.discordAllowedRoleIds.join(","),
    GROK_WEBHOOK_URL: config.grokWebhookUrl ?? "",
    GROK_WEBHOOK_SECRET: config.grokWebhookSecret ?? "",
    BOT_NAME_PREFIX: config.botNamePrefix ?? "",
  };
}

export function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code === "EPERM";
  }
}

function pidfilePath(runtimeDir: string, fingerprint: string): string {
  return join(runtimeDir, `worker-${fingerprint}.pid`);
}

function lockfilePath(runtimeDir: string, fingerprint: string): string {
  return join(runtimeDir, `worker-${fingerprint}.lock`);
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function acquireLock(lockPath: string, isAlive: (pid: number) => boolean): number {
  mkdirSync(dirname(lockPath), { recursive: true });

  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const fd = openSync(lockPath, "wx");
      writeFileSync(fd, String(process.pid));
      return fd;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code !== "EEXIST") {
        throw error;
      }

      let holder = 0;
      try {
        holder = Number(readFileSync(lockPath, "utf8").trim());
      } catch {
        holder = 0;
      }

      if (!isAlive(holder)) {
        try {
          unlinkSync(lockPath);
        } catch {
          // another ensure won the unlink race
        }
        continue;
      }

      sleepSync(50);
    }
  }

  throw new Error("Could not acquire Discord worker lock");
}

function releaseLock(lockPath: string, fd: number): void {
  try {
    closeSync(fd);
  } catch {
    // already closed
  }

  try {
    unlinkSync(lockPath);
  } catch {
    // already released
  }
}

export function readPidfile(runtimeDir: string, fingerprint: string): WorkerPidfile | undefined {
  const path = pidfilePath(runtimeDir, fingerprint);
  if (!existsSync(path)) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<WorkerPidfile>;
    if (!Number.isInteger(parsed.supervisorPid) || !parsed.supervisorPid) {
      return undefined;
    }

    return {
      supervisorPid: parsed.supervisorPid,
      startedAt: Number(parsed.startedAt) || 0,
    };
  } catch {
    return undefined;
  }
}

export function writePidfile(runtimeDir: string, fingerprint: string, state: WorkerPidfile): void {
  mkdirSync(runtimeDir, { recursive: true });
  writeFileSync(pidfilePath(runtimeDir, fingerprint), `${JSON.stringify(state)}\n`);
}

export function clearPidfile(runtimeDir: string, fingerprint: string): void {
  try {
    unlinkSync(pidfilePath(runtimeDir, fingerprint));
  } catch {
    // missing is fine
  }
}

function stopLiveProcess(pid: number, isAlive: (pid: number) => boolean): void {
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return;
  }

  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline && isAlive(pid)) {
    sleepSync(50);
  }

  if (!isAlive(pid)) {
    return;
  }

  try {
    process.kill(pid, "SIGKILL");
  } catch {
    return;
  }

  const killDeadline = Date.now() + 2_000;
  while (Date.now() < killDeadline && isAlive(pid)) {
    sleepSync(50);
  }
}

export function workerStatus(config: ConnectorConfig, deps: SupervisorDeps): WorkerStatus {
  const fingerprint = tokenFingerprint(config.discordToken);
  const state = readPidfile(deps.runtimeDir, fingerprint);
  if (!state || !deps.isAlive(state.supervisorPid)) {
    return { running: false };
  }

  return { running: true, supervisorPid: state.supervisorPid };
}

function startUnderLock(_config: ConnectorConfig, deps: SupervisorDeps, fingerprint: string): EnsureResult {
  clearPidfile(deps.runtimeDir, fingerprint);
  const spawned = deps.spawnSupervisor();
  if (!Number.isInteger(spawned.pid) || spawned.pid <= 0) {
    throw new Error("failed to start Discord worker");
  }

  writePidfile(deps.runtimeDir, fingerprint, {
    supervisorPid: spawned.pid,
    startedAt: deps.now(),
  });

  return {
    running: true,
    action: "started",
    supervisorPid: spawned.pid,
  };
}

function stopUnderLock(config: ConnectorConfig, deps: SupervisorDeps, fingerprint: string): number | undefined {
  const current = workerStatus(config, deps);
  if (!current.running || !current.supervisorPid) {
    clearPidfile(deps.runtimeDir, fingerprint);
    return undefined;
  }

  const previousPid = current.supervisorPid;
  deps.stopProcess(previousPid);

  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline && deps.isAlive(previousPid)) {
    sleepSync(50);
  }

  if (deps.isAlive(previousPid)) {
    throw new Error("could not stop Discord worker");
  }

  clearPidfile(deps.runtimeDir, fingerprint);
  return previousPid;
}

export function ensureWorker(config: ConnectorConfig, deps: SupervisorDeps): EnsureResult {
  const fingerprint = tokenFingerprint(config.discordToken);
  const lockPath = lockfilePath(deps.runtimeDir, fingerprint);
  const fd = acquireLock(lockPath, deps.isAlive);

  try {
    const current = workerStatus(config, deps);
    if (current.running && current.supervisorPid) {
      return {
        running: true,
        action: "already-running",
        supervisorPid: current.supervisorPid,
      };
    }

    return startUnderLock(config, deps, fingerprint);
  } finally {
    releaseLock(lockPath, fd);
  }
}

export function restartWorker(config: ConnectorConfig, deps: SupervisorDeps): RestartResult {
  const fingerprint = tokenFingerprint(config.discordToken);
  const lockPath = lockfilePath(deps.runtimeDir, fingerprint);
  const fd = acquireLock(lockPath, deps.isAlive);

  try {
    const previousSupervisorPid = stopUnderLock(config, deps, fingerprint);
    const started = startUnderLock(config, deps, fingerprint);
    return {
      running: true,
      action: previousSupervisorPid ? "restarted" : "started",
      supervisorPid: started.supervisorPid,
      previousSupervisorPid,
    };
  } finally {
    releaseLock(lockPath, fd);
  }
}

export function productionSupervisorDeps(config: ConnectorConfig): SupervisorDeps {
  const runtimeDir = defaultRuntimeDir();
  const pluginRoot = defaultPluginRoot();

  return {
    runtimeDir,
    isAlive: isProcessAlive,
    now: () => Date.now(),
    stopProcess(pid) {
      stopLiveProcess(pid, isProcessAlive);
    },
    spawnSupervisor() {
      const cli = join(pluginRoot, "dist", "cli.js");
      if (!existsSync(cli) || !existsSync(join(pluginRoot, "node_modules", "discord.js"))) {
        throw new Error("grok-discord is not built. In the plugin root run: npm install && npm run build");
      }

      const logPath = join(runtimeDir, `worker-${tokenFingerprint(config.discordToken)}.log`);
      mkdirSync(runtimeDir, { recursive: true });
      const logFd = openSync(logPath, "a");
      const child = spawn(process.execPath, [cli, "supervise"], {
        cwd: pluginRoot,
        env: workerEnv(config),
        detached: true,
        stdio: ["ignore", logFd, logFd],
      });

      if (!child.pid) {
        throw new Error("failed to start Discord worker");
      }

      child.unref();
      try {
        closeSync(logFd);
      } catch {
        // child still holds the log fd
      }

      return { pid: child.pid };
    },
  };
}

export type GatewayChild = {
  pid: number;
  wait: () => Promise<number | null>;
  kill: (signal?: NodeJS.Signals) => void;
};

export type SupervisorLoopDeps = {
  spawnGateway: () => GatewayChild;
  delay: (ms: number) => Promise<void>;
  isStopped: () => boolean;
  restartDelayMs: number;
};

export async function runSupervisorLoop(deps: SupervisorLoopDeps): Promise<void> {
  let delayMs = deps.restartDelayMs;

  while (!deps.isStopped()) {
    const child = deps.spawnGateway();
    const code = await child.wait();
    if (deps.isStopped()) {
      child.kill("SIGTERM");
      return;
    }

    if (code === 0) {
      delayMs = deps.restartDelayMs;
    } else {
      delayMs = Math.min(delayMs * 2, 30_000);
    }

    await deps.delay(delayMs);
  }
}

function spawnGatewayChild(pluginRoot: string, env: NodeJS.ProcessEnv): GatewayChild {
  const cli = join(pluginRoot, "dist", "cli.js");
  const child: ChildProcess = spawn(process.execPath, [cli, "gateway"], {
    cwd: pluginRoot,
    env,
    stdio: "inherit",
  });

  if (!child.pid) {
    throw new Error("failed to start Discord gateway");
  }

  return {
    pid: child.pid,
    wait() {
      return new Promise((resolve) => {
        child.once("exit", (code) => {
          resolve(code);
        });
      });
    },
    kill(signal = "SIGTERM") {
      if (child.pid) {
        try {
          process.kill(child.pid, signal);
        } catch {
          // already gone
        }
      }
    },
  };
}

export async function runSupervisorProcess(config: ConnectorConfig): Promise<void> {
  const pluginRoot = defaultPluginRoot();
  const runtimeDir = defaultRuntimeDir();
  const fingerprint = tokenFingerprint(config.discordToken);
  const env = workerEnv(config);
  let stopped = false;
  let current: GatewayChild | undefined;

  writePidfile(runtimeDir, fingerprint, {
    supervisorPid: process.pid,
    startedAt: Date.now(),
  });

  const stop = () => {
    stopped = true;
    current?.kill("SIGTERM");
  };

  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);

  try {
    await runSupervisorLoop({
      restartDelayMs: supervisorRestartDelayMs,
      isStopped: () => stopped,
      delay: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      spawnGateway() {
        current = spawnGatewayChild(pluginRoot, env);
        return current;
      },
    });
  } finally {
    clearPidfile(runtimeDir, fingerprint);
  }
}
