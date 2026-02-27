/**
 * @biginformatics/openclaw-hive v0.0.1
 *
 * OpenClaw plugin: Hive as a first-class channel.
 * This is the initial stub release — channel, tools, and SSE service are declared
 * but not yet implemented. Subsequent releases will fill in each piece.
 *
 * Registers:
 * - Channel adapter (inbound SSE + outbound routing: mailbox vs chat)
 * - Agent tools: hive_wake, hive_inbox_list, hive_inbox_reply, hive_chat_send
 * - Background service: SSE listener (replaces worker daemon)
 * - Skill: hive (bundled, see skills/hive/SKILL.md)
 */

function resolveConfig(cfg: any) {
  const hive = cfg?.channels?.hive ?? {};
  return {
    baseUrl: hive.baseUrl ?? process.env.HIVE_BASE_URL ?? "https://messages.biginformatics.net/api",
    token: hive.token ?? process.env.HIVE_TOKEN ?? "",
    sseEnabled: hive.sseEnabled ?? true,
    insecure: hive.insecure ?? false,
  };
}

const hiveChannel = {
  id: "hive",
  meta: {
    id: "hive",
    label: "Hive",
    selectionLabel: "Hive (BigInformatics)",
    docsPath: "/channels/hive",
    blurb: "BigInformatics team mailbox, real-time chat, and swarm tasks.",
    aliases: ["hive"],
  },
  capabilities: {
    chatTypes: ["direct", "group"],
  },
  config: {
    listAccountIds: (cfg: any) =>
      cfg?.channels?.hive?.token || process.env.HIVE_TOKEN ? ["default"] : [],
    resolveAccount: (cfg: any, accountId: string) => ({
      accountId: accountId ?? "default",
      token: cfg?.channels?.hive?.token ?? process.env.HIVE_TOKEN,
    }),
  },
  outbound: {
    deliveryMode: "direct" as const,
    sendText: async (_params: any) => {
      // TODO: route to mailbox reply or chat send based on message context
      // - meta.messageType === 'chat': POST /api/chat/channels/{channelId}/messages
      // - meta.messageType === 'mailbox': POST /api/mailboxes/me/messages/{id}/reply + ack
      // - default: POST /api/mailboxes/{to}/messages
      return { ok: false, error: "not implemented — see roadmap" };
    },
  },
};

export default function register(api: any) {
  const cfg = resolveConfig(api.config);

  api.registerChannel({ plugin: hiveChannel });

  // TODO: register tools — hive_wake, hive_inbox_list, hive_inbox_reply, hive_chat_send
  // TODO: register SSE background service when cfg.sseEnabled

  if (api.logger?.info) {
    api.logger.info(
      `[openclaw-hive] registered (token=${cfg.token ? "set" : "missing"}, sse=${cfg.sseEnabled})`
    );
  }
}
