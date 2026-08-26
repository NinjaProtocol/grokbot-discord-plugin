export type RoomCommand = { kind: "new" } | { kind: "status" };

export function cleanCommandText(text: string, botNames: string[] = []): string {
  let cleaned = text.replace(/<@!?\d+>/g, "");

  for (const name of botNames) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    cleaned = cleaned.replace(new RegExp(`@${escaped}`, "gi"), "");
    cleaned = cleaned.replace(new RegExp(`^(?:hey\\s+|yo\\s+)?${escaped}\\b[:,]?\\s*`, "i"), "");
  }

  return cleaned.replace(/\s+/g, " ").trim();
}

function isStatusAsk(cleaned: string): boolean {
  return /^(?:\/status|what(?:'s| is) your status|status\??|are you (?:operational|up|online|there|here|alive|running)\??|you (?:up|there|here)\??)\s*$/i.test(
    cleaned,
  );
}

export function parseRoomCommand(text: string, botNames: string[] = []): RoomCommand | null {
  const cleaned = cleanCommandText(text, botNames);
  if (!cleaned) {
    return null;
  }

  if (/^(?:\/new|\/reset)\s*$/i.test(cleaned)) {
    return { kind: "new" };
  }

  if (isStatusAsk(cleaned)) {
    return { kind: "status" };
  }

  return null;
}
