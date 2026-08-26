import { maxHistoryLineChars } from "./constants.ts";
import { redactSecrets } from "./redact.ts";

export type HistoryEntry = {
  id: string;
  authorId: string;
  authorName: string;
  bot: boolean;
  webhook: boolean;
  roleIds: string[];
  content: string;
  attachmentNames: string[];
};

export function shouldIncludeHistoryMessage(
  allowedRoleIds: string[],
  currentAuthorId: string,
  botUserId: string | undefined,
  entry: Pick<HistoryEntry, "id" | "authorId" | "bot" | "webhook" | "roleIds">,
  currentMessageId?: string,
): boolean {
  if (currentMessageId && entry.id === currentMessageId) {
    return false;
  }

  if (botUserId && entry.authorId === botUserId) {
    return true;
  }

  if (entry.bot || entry.webhook) {
    return false;
  }

  if (entry.authorId === currentAuthorId) {
    return true;
  }

  if (allowedRoleIds.length === 0) {
    return false;
  }

  return allowedRoleIds.some((roleId) => entry.roleIds.includes(roleId));
}

export function formatHistoryLine(entry: HistoryEntry): string {
  const extras: string[] = [];
  const text = entry.content.replace(/\s+/g, " ").trim();
  if (entry.attachmentNames.length > 0) {
    extras.push(`[${entry.attachmentNames.join(", ")}]`);
  }
  if (!text && extras.length === 0) {
    extras.push("[empty]");
  }

  const body = [text, ...extras].filter(Boolean).join(" ");
  const clipped = body.length > maxHistoryLineChars ? `${body.slice(0, maxHistoryLineChars)}…` : body;
  return `${entry.authorName}: ${redactSecrets(clipped)}`;
}
