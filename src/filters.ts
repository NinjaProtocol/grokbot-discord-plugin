export type HandleInput = {
  authorIsBot: boolean;
  webhookId?: string | null;
  guildId?: string | null;
  parentChannelId?: string | null;
  configuredGuildId: string;
  configuredChannelIds: string[];
};

export function parentChannelId(channelId: string, threadParentId?: string | null): string | null {
  if (threadParentId === undefined) {
    return channelId;
  }

  if (threadParentId === null) {
    return null;
  }

  return threadParentId;
}

export function shouldHandle(input: HandleInput): boolean {
  if (input.authorIsBot || input.webhookId) {
    return false;
  }

  if (!input.guildId) {
    return false;
  }

  if (input.guildId !== input.configuredGuildId) {
    return false;
  }

  return Boolean(input.parentChannelId && input.configuredChannelIds.includes(input.parentChannelId));
}

export type DirectedInput = {
  mentionedBot: boolean;
  isReplyToBot: boolean;
  content: string;
  botNames: string[];
  followUp: boolean;
};

export function stripMentions(text: string): string {
  return text.replace(/<@!?\d+>/g, "").replace(/\s+/g, " ").trim();
}

export function namesBot(text: string, botNames: string[]): boolean {
  const unique = [...new Set(botNames.map((name) => name.trim()).filter(Boolean))];
  if (unique.length === 0) {
    return false;
  }

  let cleaned = stripMentions(text);

  for (const name of unique) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    cleaned = cleaned.replace(new RegExp(`@${escaped}`, "gi"), "").trim();
  }

  for (const name of unique) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b${escaped}\\b`, "i").test(cleaned)) {
      return true;
    }
  }

  return false;
}

export function isDirectedAtBot(input: DirectedInput): boolean {
  if (input.mentionedBot || input.isReplyToBot) {
    return true;
  }

  if (namesBot(input.content, input.botNames)) {
    return true;
  }

  return input.followUp;
}

export function conversationKey(parentChannelId: string, authorId: string): string {
  return `channel:${parentChannelId}:user:${authorId}`;
}

export function memberHasAllowedRole(
  allowedRoleIds: string[],
  memberRoleIds: string[] | null | undefined,
): boolean {
  if (allowedRoleIds.length === 0) {
    return true;
  }

  if (!memberRoleIds) {
    return false;
  }

  return allowedRoleIds.some((roleId) => memberRoleIds.includes(roleId));
}
