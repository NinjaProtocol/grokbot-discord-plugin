export function scrubSecretEnv(env: NodeJS.ProcessEnv = process.env): void {
  delete env.DISCORD_TOKEN;
  delete env.GROK_WEBHOOK_SECRET;
  delete env.GROK_WEBHOOK_URL;
}
