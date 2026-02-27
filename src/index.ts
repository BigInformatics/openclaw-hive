/**
 * @biginformatics/openclaw-hive
 *
 * OpenClaw plugin: Hive as a first-class channel.
 *
 * Registers:
 * - Channel adapter (inbound SSE + outbound routing: mailbox vs chat)
 * - Agent tools: hive_inbox_list, hive_inbox_reply, hive_chat_send, hive_task_list
 * - Background service: Hive SSE listener (replaces worker daemon)
 * - Skill: hive (bundled, see skills/hive/SKILL.md)
 *
 * TODO: implement all stubs below
 */

// Type stubs — replace with actual OpenClaw plugin API types when available
type PluginApi = any;

// ─── Config ────────────────────────────────────────────────────────────────

interface HiveConfig {
  baseUrl: string;
  token: string;
  sseEnabled: boolean;
  insecure: boolean;
}

function resolveConfig(cfg: any): HiveConfig {
  const hive = cfg?.channels?.hive ?? {};
  return {
    baseUrl: hive.baseUrl ?? process.env.HIVE_BASE_URL ?? 'https://messages.biginformatics.net/api',
    token: hive.token ?? process.env.HIVE_TOKEN ?? '',
    sseEnabled: hive.sseEnabled ?? true,
    insecure: hive.insecure ?? false,
  };
}

// ─── Channel adapter ────────────────────────────────────────────────────────

const hiveChannel = {
  id: 'hive',
  meta: {
    id: 'hive',
    label: 'Hive',
    selectionLabel: 'Hive (BigInformatics)',
    docsPath: '/channels/hive',
    blurb: 'BigInformatics team mailbox, real-time chat, and swarm tasks.',
    aliases: ['hive'],
  },
  capabilities: {
    chatTypes: ['direct', 'group'],
  },
  config: {
    listAccountIds: (cfg: any) =>
      cfg?.channels?.hive?.token ? ['default'] : [],
    resolveAccount: (cfg: any, accountId: string) => ({
      accountId: accountId ?? 'default',
      token: cfg?.channels?.hive?.token ?? process.env.HIVE_TOKEN,
    }),
  },
  outbound: {
    deliveryMode: 'direct' as const,
    sendText: async ({ text, to, meta }: { text: string; to?: string; meta?: any }) => {
      // TODO: route to mailbox reply or chat send based on message context
      // - If meta.messageType === 'chat': POST /api/chat/channels/{channelId}/messages
      // - If meta.messageType === 'mailbox': POST /api/mailboxes/me/messages/{id}/reply
      // - Default: POST /api/mailboxes/{to}/messages (new message)
      console.warn('[openclaw-hive] sendText not yet implemented', { to, meta });
      return { ok: false, error: 'not implemented' };
    },
  },
};

// ─── Agent tools ────────────────────────────────────────────────────────────

function registerTools(api: PluginApi) {
  // TODO: register tools via api.registerTool(...)
  // Tools to implement:
  //
  // hive_inbox_list   — GET /api/mailboxes/me/messages?status=unread
  // hive_inbox_reply  — POST /api/mailboxes/me/messages/{id}/reply + ack
  // hive_chat_send    — POST /api/chat/channels/{channelId}/messages
  // hive_chat_read    — POST /api/chat/channels/{channelId}/read
  // hive_task_list    — GET /api/swarm/tasks?assignee=me
  // hive_wake         — GET /api/wake
  console.warn('[openclaw-hive] tools not yet implemented');
}

// ─── Background service (SSE listener) ──────────────────────────────────────

function createSseService(cfg: HiveConfig) {
  return {
    id: 'hive-sse',
    start: async () => {
      if (!cfg.sseEnabled) return;
      // TODO: connect to GET /api/mailboxes/me/stream
      // On 'message' event: trigger OpenClaw wake (api.gateway.wake or openclaw cron equivalent)
      // Persist cursor in wagl kv store (key: 'hive:sse:last_event_id')
      // Handle reconnect with exponential backoff
      console.warn('[openclaw-hive] SSE listener not yet implemented');
    },
    stop: async () => {
      // TODO: close SSE connection cleanly
    },
  };
}

// ─── Plugin entry ────────────────────────────────────────────────────────────

export default function register(api: PluginApi) {
  const cfg = resolveConfig(api.config);

  api.registerChannel({ plugin: hiveChannel });

  registerTools(api);

  if (cfg.sseEnabled) {
    api.registerService(createSseService(cfg));
  }
}
