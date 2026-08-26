import { assertChannelAllowed, type AllowlistConfig } from "./allowlist.ts";
import { prepareOutbound } from "./chunk.ts";

export type OutboundMode = "reply" | "send";

export type OutboundPost = (chunk: string, mode: OutboundMode) => Promise<void>;

export type DeliverOutboundInput = {
  config: AllowlistConfig;
  guildId: string | null | undefined;
  parentChannelId: string | null | undefined;
  inThread: boolean;
  replyToMessageId?: string;
  text: string;
  post: OutboundPost;
};

export type DeliverOutboundResult = {
  posted: boolean;
  chunks: number;
};

export async function deliverOutbound(input: DeliverOutboundInput): Promise<DeliverOutboundResult> {
  assertChannelAllowed(input.config, input.guildId, input.parentChannelId);

  const prepared = prepareOutbound(input.text);
  if (prepared.silent) {
    return { posted: false, chunks: 0 };
  }

  for (const [index, chunk] of prepared.chunks.entries()) {
    const canReply = index === 0 && !input.inThread && Boolean(input.replyToMessageId);
    await input.post(chunk, canReply ? "reply" : "send");
  }

  return { posted: true, chunks: prepared.chunks.length };
}
