#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(pluginRoot, "dist", "cli.js");
const discordJs = join(pluginRoot, "node_modules", "discord.js");

if (!existsSync(discordJs) || !existsSync(cli)) {
  process.stderr.write(
    "grok-discord MCP is not built. In the plugin root run: npm install && npm run build\n",
  );
  process.exit(1);
}

const child = spawn(process.execPath, [cli, "mcp"], {
  cwd: pluginRoot,
  env: process.env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
