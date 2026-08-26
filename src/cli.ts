#!/usr/bin/env node

import { loadConfig } from "./config.ts";
import { startDiscordGateway } from "./gateway.ts";
import { startMcpServer } from "./mcp.ts";
import { scrubSecretEnv } from "./process-env.ts";
import {
  ensureWorker,
  productionSupervisorDeps,
  restartWorker,
  runSupervisorProcess,
  workerStatus,
} from "./supervisor.ts";

const command = process.argv[2] ?? "mcp";

function printJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

async function main(): Promise<void> {
  if (command === "mcp") {
    await startMcpServer();
    return;
  }

  if (command === "gateway") {
    const config = loadConfig();
    scrubSecretEnv();
    await startDiscordGateway(config);
    return;
  }

  if (command === "supervise") {
    const config = loadConfig();
    scrubSecretEnv();
    await runSupervisorProcess(config);
    return;
  }

  if (command === "ensure") {
    const config = loadConfig();
    const result = ensureWorker(config, productionSupervisorDeps(config));
    scrubSecretEnv();
    printJson(result);
    return;
  }

  if (command === "restart") {
    const config = loadConfig();
    const result = restartWorker(config, productionSupervisorDeps(config));
    scrubSecretEnv();
    printJson(result);
    return;
  }

  if (command === "status") {
    const config = loadConfig();
    const result = workerStatus(config, productionSupervisorDeps(config));
    scrubSecretEnv();
    printJson(result);
    return;
  }

  process.stderr.write("Usage: grokbot-discord <mcp|gateway|ensure|restart|status|supervise>\n");
  process.exit(1);
}

main().catch((error: unknown) => {
  const detail = error instanceof Error ? error.message : "startup failed";
  process.stderr.write(`${detail}\n`);
  process.exit(1);
});
