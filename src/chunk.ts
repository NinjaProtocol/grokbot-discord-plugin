import { discordChunkLimit } from "./constants.ts";
import { redactSecrets } from "./redact.ts";

export function isSilence(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length === 0 || trimmed === "SILENCE";
}

export function splitDiscordText(text: string): string[] {
  if (text.length <= discordChunkLimit) {
    return [text];
  }

  const chunks: string[] = [];
  let rest = text;

  while (rest.length > discordChunkLimit) {
    let cut = rest.lastIndexOf("\n", discordChunkLimit);
    if (cut <= 0) {
      cut = discordChunkLimit;
    }
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n/, "");
  }

  if (rest.length > 0) {
    chunks.push(rest);
  }

  return chunks;
}

export type PreparedOutbound = {
  silent: boolean;
  chunks: string[];
};

export function prepareOutbound(text: string): PreparedOutbound {
  const visible = redactSecrets(text).trim();
  if (isSilence(visible)) {
    return { silent: true, chunks: [] };
  }

  return { silent: false, chunks: splitDiscordText(visible) };
}
