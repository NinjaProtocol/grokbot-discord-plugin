export const snowflakePattern = /^\d{17,20}$/;

export function isSnowflake(value: string): boolean {
  return snowflakePattern.test(value);
}

export function assertSnowflake(value: string, label: string): string {
  if (!isSnowflake(value)) {
    throw new Error(`${label} must be a Discord snowflake`);
  }

  return value;
}

export function parseSnowflakeList(raw: string | undefined, label: string): string[] {
  if (!raw) {
    return [];
  }

  const ids = new Set<string>();
  for (const part of raw.split(",")) {
    const id = part.trim();
    if (!id) {
      continue;
    }

    ids.add(assertSnowflake(id, label));
  }

  return [...ids];
}

const customEmojiPattern = /^[a-zA-Z0-9_]{1,32}:\d{17,20}$/;

export function assertSafeEmoji(raw: string): string {
  const emoji = raw.trim();
  if (!emoji || emoji.includes("%")) {
    throw new Error("emoji must be a unicode emoji or name:id");
  }

  if (customEmojiPattern.test(emoji)) {
    return emoji;
  }

  if (emoji.length > 64 || /[./\\?#:\s]/.test(emoji)) {
    throw new Error("emoji must be a unicode emoji or name:id");
  }

  return emoji;
}
