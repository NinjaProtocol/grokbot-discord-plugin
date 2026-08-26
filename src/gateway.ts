import {
  ChannelType,
  Client,
  GatewayIntentBits,
  Message,
  type GuildTextBasedChannel,
} from "discord.js";

import type { ConnectorConfig } from "./config.ts";
import { followUpWindowMs, publicError } from "./constants.ts";
import { conversationKey, isDirectedAtBot, memberHasAllowedRole, shouldHandle } from "./filters.ts";
import { createFileFollowUpStore } from "./follow-up.ts";
import { createChannelMutex } from "./mutex.ts";
import { deliverOutbound } from "./outbound.ts";
import { createRateLimiter } from "./rate-limit.ts";
import { parseRoomCommand } from "./room-commands.ts";
import { defaultRuntimeDir, tokenFingerprint } from "./supervisor.ts";
import { postGrokWebhook } from "./webhook.ts";

function parentChannelIdFromMessage(message: Message): string | null {
  const { channel } = message;
  if (channel.isThread()) {
    return channel.parentId;
  }
  return channel.id;
}

function isSendableParent(channel: unknown): channel is GuildTextBasedChannel {
  if (!channel || typeof channel !== "object" || !("type" in channel)) {
    return false;
  }

  const type = (channel as { type: ChannelType }).type;
  return type === ChannelType.GuildText || type === ChannelType.GuildAnnouncement;
}

async function homeChannel(message: Message): Promise<GuildTextBasedChannel> {
  if (message.channel.isThread()) {
    let parent: GuildTextBasedChannel | null = isSendableParent(message.channel.parent)
      ? message.channel.parent
      : null;

    if (!parent && message.channel.parentId) {
      const fetched = await message.client.channels.fetch(message.channel.parentId);
      if (isSendableParent(fetched)) {
        parent = fetched;
      }
    }

    if (!parent) {
      throw new Error("Cannot find the parent channel for this thread");
    }

    return parent;
  }

  if (!isSendableParent(message.channel)) {
    throw new Error("Only server text channels are allowed");
  }

  return message.channel;
}

function botNamesFor(config: ConnectorConfig, client: Client): string[] {
  const names = [config.botNamePrefix, client.user?.username, client.user?.globalName];
  return [...new Set(names.filter((name): name is string => Boolean(name && name.trim())))];
}

async function isReplyToBot(client: Client, message: Message): Promise<boolean> {
  if (!client.user) {
    return false;
  }

  if (message.mentions.repliedUser?.id === client.user.id) {
    return true;
  }

  const refId = message.reference?.messageId;
  if (!refId || !("messages" in message.channel)) {
    return false;
  }

  const referenced =
    message.channel.messages.cache.get(refId) ??
    (await message.channel.messages.fetch(refId).catch(() => null));

  return referenced?.author.id === client.user.id;
}

async function speak(
  config: ConnectorConfig,
  message: Message,
  text: string,
  replyTo = true,
): Promise<void> {
  const parentId = parentChannelIdFromMessage(message);
  const home = await homeChannel(message);
  const inThread = message.channel.isThread();

  await deliverOutbound({
    config,
    guildId: message.guildId,
    parentChannelId: parentId,
    inThread,
    replyToMessageId: replyTo ? message.id : undefined,
    text,
    async post(chunk, mode) {
      if (mode === "reply") {
        await message.reply({
          content: chunk,
          allowedMentions: { parse: [], repliedUser: false },
        });
        return;
      }

      await home.send({ content: chunk, allowedMentions: { parse: [] } });
    },
  });
}

export async function startDiscordGateway(config: ConnectorConfig): Promise<Client> {
  const followUps = createFileFollowUpStore(
    defaultRuntimeDir(),
    tokenFingerprint(config.discordToken),
    followUpWindowMs,
  );
  const mutex = createChannelMutex();
  const userRate = createRateLimiter(config.rateWindowMs, config.ratePerUser);
  const channelRate = createRateLimiter(config.rateWindowMs, config.ratePerChannel);

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  let booted = false;
  const onReady = () => {
    if (booted) {
      return;
    }
    booted = true;
    const tag = client.user?.tag ?? "unknown";
    process.stdout.write(`grok-discord ready as ${tag}; one replica per bot token\n`);
    if (!config.grokWebhookUrl) {
      process.stdout.write("grok-discord GROK_WEBHOOK_URL is not set; inbound will not wake a Grok Bot\n");
    }
  };

  client.once("clientReady", onReady);
  client.once("ready", onReady);

  client.on("messageCreate", async (message) => {
    const parentId = parentChannelIdFromMessage(message);
    if (
      !shouldHandle({
        authorIsBot: message.author.bot,
        webhookId: message.webhookId,
        guildId: message.guildId,
        parentChannelId: parentId,
        configuredGuildId: config.discordGuildId,
        configuredChannelIds: config.discordChannelIds,
      })
    ) {
      return;
    }

    const guildId = message.guildId;
    if (!parentId || !guildId) {
      return;
    }

    const names = botNamesFor(config, client);
    const sessionKey = conversationKey(parentId, message.author.id);
    const directed = isDirectedAtBot({
      mentionedBot: Boolean(client.user && message.mentions.has(client.user)),
      isReplyToBot: await isReplyToBot(client, message),
      content: message.cleanContent,
      botNames: names,
      followUp: followUps.isFollowUp(sessionKey),
    });

    if (!directed) {
      return;
    }

    const member = message.member;
    const roleIds = member ? [...member.roles.cache.keys()] : null;
    if (!memberHasAllowedRole(config.discordAllowedRoleIds, roleIds)) {
      return;
    }

    await mutex.run(parentId, async () => {
      try {
        if (!userRate.allow(message.author.id) || !channelRate.allow(parentId)) {
          process.stderr.write("grok-discord inbound dropped: rate limited\n");
          return;
        }

        const roomCommand = parseRoomCommand(message.cleanContent, names);
        if (roomCommand?.kind === "new") {
          followUps.clear(sessionKey);
          await speak(config, message, "Fresh thread. I'm listening.");
          return;
        }

        if (roomCommand?.kind === "status") {
          await speak(config, message, "Yeah, I'm here. Gateway up.");
          return;
        }

        if (!config.grokWebhookUrl) {
          process.stdout.write("grok-discord inbound dropped: GROK_WEBHOOK_URL is not set\n");
          return;
        }

        await postGrokWebhook(
          config.grokWebhookUrl,
          {
            message_id: message.id,
            channel_id: message.channel.id,
            guild_id: guildId,
            parent_channel_id: parentId,
            author_id: message.author.id,
            author_username: message.author.username,
            content: message.cleanContent,
            is_reply: Boolean(message.reference?.messageId),
            referenced_message_id: message.reference?.messageId ?? null,
          },
          config.grokWebhookSecret,
        );
      } catch (error) {
        const detail = error instanceof Error ? error.message : "unknown error";
        process.stderr.write(`grok-discord turn error: ${detail}\n`);
        try {
          await speak(config, message, publicError);
        } catch (speakError) {
          const speakDetail = speakError instanceof Error ? speakError.message : "speak failed";
          process.stderr.write(`grok-discord public error failed: ${speakDetail}\n`);
        }
      }
    });
  });

  await client.login(config.discordToken);
  return client;
}
