export type AllowlistConfig = {
  discordGuildId: string;
  discordChannelIds: string[];
};

export function channelIsAllowed(
  config: AllowlistConfig,
  guildId: string | null | undefined,
  parentChannelId: string | null | undefined,
): boolean {
  if (!guildId || !parentChannelId) {
    return false;
  }

  return guildId === config.discordGuildId && config.discordChannelIds.includes(parentChannelId);
}

export function assertChannelAllowed(
  config: AllowlistConfig,
  guildId: string | null | undefined,
  parentChannelId: string | null | undefined,
): void {
  if (!channelIsAllowed(config, guildId, parentChannelId)) {
    throw new Error("Channel is outside the configured Discord allowlist.");
  }
}
