import {
  ChannelType,
  REST,
  Routes,
  type RESTGetAPIChannelResult,
  type RESTGetAPIChannelMessagesResult,
  type RESTGetAPICurrentUserResult,
  type RESTGetAPIGuildResult,
  type RESTPostAPIChannelMessageResult,
} from "discord.js";

import { assertChannelAllowed } from "./allowlist.ts";
import { formatHistoryLine, shouldIncludeHistoryMessage, type HistoryEntry } from "./channel-history.ts";
import type { ConnectorConfig } from "./config.ts";
import { recentHistoryLimit } from "./constants.ts";
import { assertSafeEmoji, assertSnowflake } from "./ids.ts";
import { deliverOutbound } from "./outbound.ts";

export type ResolvedChannel = {
  id: string;
  guildId: string;
  parentChannelId: string;
  inThread: boolean;
  name: string;
  type: number;
};

function isThreadType(type: number): boolean {
  return (
    type === ChannelType.PublicThread ||
    type === ChannelType.PrivateThread ||
    type === ChannelType.AnnouncementThread
  );
}

function isParentType(type: number): boolean {
  return type === ChannelType.GuildText || type === ChannelType.GuildAnnouncement;
}

export function createDiscordRest(config: ConnectorConfig, rest = new REST({ version: "10" }).setToken(config.discordToken)) {
  async function fetchChannel(channelId: string): Promise<RESTGetAPIChannelResult> {
    return (await rest.get(Routes.channel(channelId))) as RESTGetAPIChannelResult;
  }

  async function resolveChannel(channelId: string): Promise<ResolvedChannel> {
    const channel = await fetchChannel(assertSnowflake(channelId, "channel_id"));
    const guildId = "guild_id" in channel ? channel.guild_id : undefined;
    if (!guildId) {
      throw new Error("Channel is outside the configured Discord allowlist.");
    }

    if (isThreadType(channel.type)) {
      const parentId = "parent_id" in channel ? channel.parent_id : null;
      if (!parentId) {
        throw new Error("Channel is outside the configured Discord allowlist.");
      }

      return {
        id: channel.id,
        guildId,
        parentChannelId: parentId,
        inThread: true,
        name: channel.name ?? channel.id,
        type: channel.type,
      };
    }

    if (!isParentType(channel.type)) {
      throw new Error("Channel is outside the configured Discord allowlist.");
    }

    return {
      id: channel.id,
      guildId,
      parentChannelId: channel.id,
      inThread: false,
      name: "name" in channel && channel.name ? channel.name : channel.id,
      type: channel.type,
    };
  }

  async function assertResolved(channelId: string): Promise<ResolvedChannel> {
    const resolved = await resolveChannel(channelId);
    assertChannelAllowed(config, resolved.guildId, resolved.parentChannelId);
    return resolved;
  }

  async function postMessage(
    parentChannelId: string,
    chunk: string,
    mode: "reply" | "send",
    replyToMessageId?: string,
  ): Promise<RESTPostAPIChannelMessageResult> {
    const allowedMentions =
      mode === "reply"
        ? { replied_user: false, parse: [] as string[] }
        : { parse: [] as string[] };

    const body: Record<string, unknown> = {
      content: chunk,
      allowed_mentions: allowedMentions,
    };

    if (mode === "reply" && replyToMessageId) {
      body.message_reference = {
        message_id: replyToMessageId,
        fail_if_not_exists: false,
      };
    }

    return (await rest.post(Routes.channelMessages(parentChannelId), { body })) as RESTPostAPIChannelMessageResult;
  }

  return {
    rest,
    resolveChannel,
    assertResolved,

    async status() {
      const me = (await rest.get(Routes.user("@me"))) as RESTGetAPICurrentUserResult;
      const guild = (await rest.get(Routes.guild(config.discordGuildId))) as RESTGetAPIGuildResult;
      const channels = [];

      for (const channelId of config.discordChannelIds) {
        try {
          const resolved = await resolveChannel(channelId);
          if (resolved.guildId !== config.discordGuildId || resolved.inThread) {
            continue;
          }
          channels.push({ id: resolved.id, name: resolved.name });
        } catch {
          channels.push({ id: channelId, name: "(unavailable)" });
        }
      }

      return {
        bot: { id: me.id, username: me.username },
        guild: { id: guild.id, name: guild.name },
        channels,
        allowedRoleIds: config.discordAllowedRoleIds,
        webhookConfigured: Boolean(config.grokWebhookUrl),
      };
    },

    async listChannels() {
      const channels = [];
      for (const channelId of config.discordChannelIds) {
        const resolved = await assertResolved(channelId);
        channels.push({
          id: resolved.parentChannelId,
          name: resolved.name,
          guild_id: resolved.guildId,
        });
      }
      return channels;
    },

    async send(channelId: string, text: string) {
      const resolved = await assertResolved(channelId);
      const posted: string[] = [];

      const result = await deliverOutbound({
        config,
        guildId: resolved.guildId,
        parentChannelId: resolved.parentChannelId,
        inThread: false,
        text,
        async post(chunk) {
          const message = await postMessage(resolved.parentChannelId, chunk, "send");
          posted.push(message.id);
        },
      });

      return { ...result, messageIds: posted, channelId: resolved.parentChannelId };
    },

    async reply(channelId: string, messageId: string, text: string) {
      const resolved = await assertResolved(channelId);
      const posted: string[] = [];
      const replyTo = assertSnowflake(messageId, "message_id");

      const result = await deliverOutbound({
        config,
        guildId: resolved.guildId,
        parentChannelId: resolved.parentChannelId,
        inThread: resolved.inThread,
        replyToMessageId: replyTo,
        text,
        async post(chunk, mode) {
          const message = await postMessage(
            resolved.parentChannelId,
            chunk,
            mode,
            mode === "reply" ? replyTo : undefined,
          );
          posted.push(message.id);
        },
      });

      return { ...result, messageIds: posted, channelId: resolved.parentChannelId };
    },

    async history(channelId: string, currentAuthorId?: string, limit = recentHistoryLimit) {
      const resolved = await assertResolved(channelId);
      if (currentAuthorId) {
        assertSnowflake(currentAuthorId, "author_id");
      }

      const me = (await rest.get(Routes.user("@me"))) as RESTGetAPICurrentUserResult;
      const fetched = (await rest.get(Routes.channelMessages(resolved.id), {
        query: new URLSearchParams({ limit: String(Math.min(Math.max(limit, 1), 50)) }),
      })) as RESTGetAPIChannelMessagesResult;

      const entries: HistoryEntry[] = fetched.map((message) => {
        const withMember = message as typeof message & { member?: { roles?: string[] } };
        return {
          id: message.id,
          authorId: message.author.id,
          authorName: message.author.global_name ?? message.author.username,
          bot: Boolean(message.author.bot),
          webhook: Boolean(message.webhook_id),
          roleIds: withMember.member?.roles ?? [],
          content: message.content,
          attachmentNames: message.attachments.map((file) => file.filename),
        };
      });

      const authorId = currentAuthorId ?? entries[0]?.authorId ?? me.id;
      const lines = entries
        .filter((entry) =>
          shouldIncludeHistoryMessage(config.discordAllowedRoleIds, authorId, me.id, entry),
        )
        .reverse()
        .map(formatHistoryLine);

      return {
        channelId: resolved.id,
        parentChannelId: resolved.parentChannelId,
        lines,
      };
    },

    async react(channelId: string, messageId: string, emoji: string) {
      const resolved = await assertResolved(channelId);
      const safeMessageId = assertSnowflake(messageId, "message_id");
      const safeEmoji = assertSafeEmoji(emoji);
      await rest.put(Routes.channelMessageOwnReaction(resolved.id, safeMessageId, safeEmoji));
      return { ok: true, channelId: resolved.id, messageId: safeMessageId, emoji: safeEmoji };
    },
  };
}

export type DiscordRest = ReturnType<typeof createDiscordRest>;
