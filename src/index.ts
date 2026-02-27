// @ts-nocheck
import { spawn } from "node:child_process";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function resolveConfig(cfg: any) {
  const hive = cfg?.channels?.hive ?? {};
  return {
    baseUrl: hive.baseUrl ?? process.env.HIVE_BASE_URL ?? "https://messages.biginformatics.net",
    token: hive.token ?? process.env.HIVE_TOKEN ?? "",
    sseEnabled: hive.sseEnabled ?? true,
    insecure: hive.insecure ?? false,
  };
}

function buildHiveUrl(cfg: any, path: string): string {
  const baseUrl = String(cfg.baseUrl ?? "").replace(/\/+$/, "");
  let normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (baseUrl.endsWith("/api") && normalizedPath.startsWith("/api/")) {
    normalizedPath = normalizedPath.slice(4);
  }
  return `${baseUrl}${normalizedPath}`;
}

async function hiveRequest(cfg: any, method: string, path: string, body?: any): Promise<any> {
  const token = cfg?.token ?? process.env.HIVE_TOKEN;
  if (!token) {
    throw new Error("Missing Hive token (cfg.token or HIVE_TOKEN)");
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };

  const init: any = {
    method,
    headers,
  };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  const url = buildHiveUrl(cfg, path);
  const res = await fetch(url, init);
  const text = await res.text();
  let json: any = null;
  if (text.trim()) {
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
  }

  if (!res.ok) {
    const message =
      typeof json === "object" && json && typeof json.error === "string"
        ? json.error
        : typeof json === "string" && json
          ? json
          : `Hive request failed: ${res.status} ${res.statusText}`;
    throw new Error(message);
  }

  return json;
}

function formatItemsAsText(title: string, items: any[]): string {
  if (!Array.isArray(items) || items.length === 0) {
    return `${title}\n(no items)`;
  }
  const lines = items.map((item, index) => {
    const id = item?.id ? `id=${item.id}` : "";
    const sender = item?.sender ? `sender=${item.sender}` : "";
    const channelId = item?.channelId ? `channel=${item.channelId}` : "";
    const label = item?.title ? `title="${item.title}"` : item?.body ? `body="${item.body}"` : "";
    const parts = [id, sender, channelId, label].filter(Boolean).join(" ");
    return `${index + 1}. ${parts || JSON.stringify(item)}`;
  });
  return `${title}\n${lines.join("\n")}`;
}

function toolTextResult(text: string, details?: any) {
  return {
    content: [{ type: "text" as const, text }],
    details,
  };
}

function runGatewayWake(api: any) {
  try {
    const child = spawn(
      "openclaw",
      ["gateway", "wake", "--mode", "now", "--text", "Hive: new message"],
      { stdio: "ignore" },
    );
    child.once("error", (err) => {
      api.logger?.warn?.(`[openclaw-hive] wake command failed: ${String(err)}`);
    });
  } catch (err) {
    api.logger?.warn?.(`[openclaw-hive] wake command threw: ${String(err)}`);
  }
}

function createSseService(cfg: any, api: any) {
  let stopped = false;
  let currentAbort: AbortController | null = null;
  let reconnectDelayMs = 1_000;

  const parseEventBlock = (block: string): { event: string; data: string } | null => {
    const lines = block.split(/\r?\n/);
    let event = "message";
    const dataLines: string[] = [];
    for (const line of lines) {
      if (!line || line.startsWith(":")) {
        continue;
      }
      if (line.startsWith("event:")) {
        event = line.slice(6).trim() || "message";
        continue;
      }
      if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trimStart());
      }
    }
    if (dataLines.length === 0) {
      return null;
    }
    return { event, data: dataLines.join("\n") };
  };

  const runStream = async () => {
    console.error("[openclaw-hive] runStream started");
    while (!stopped) {
      const token = cfg?.token ?? process.env.HIVE_TOKEN;
      if (!token) {
        console.error("[openclaw-hive] HIVE_TOKEN missing");
        api.logger?.warn?.("[openclaw-hive] HIVE_TOKEN missing, skipping SSE listener");
        return;
      }

      const abort = new AbortController();
      currentAbort = abort;
      try {
        // SSE auth uses ?token= query param — Bearer header not reliable on SSE endpoint
        const sseUrl = `${buildHiveUrl(cfg, "/api/stream")}?token=${encodeURIComponent(token)}`;
        const res = await fetch(sseUrl, {
          method: "GET",
          headers: { Accept: "text/event-stream" },
          signal: abort.signal,
        });

        if (!res.ok || !res.body) {
          throw new Error(`SSE connect failed: ${res.status} ${res.statusText}`);
        }

        reconnectDelayMs = 1_000;
        api.logger?.info?.("[openclaw-hive] SSE connected");

        const decoder = new TextDecoder();
        const reader = res.body.getReader();
        let buffer = "";

        while (!stopped) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          buffer += decoder.decode(value, { stream: true });
          let boundaryIndex = buffer.search(/\r?\n\r?\n/);
          while (boundaryIndex >= 0) {
            const block = buffer.slice(0, boundaryIndex);
            buffer = buffer.slice(boundaryIndex).replace(/^\r?\n\r?\n/, "");
            const evt = parseEventBlock(block);
            if (evt?.event === "message") {
              runGatewayWake(api);
            }
            boundaryIndex = buffer.search(/\r?\n\r?\n/);
          }
        }
      } catch (err) {
        if (!stopped) {
          console.error(`[openclaw-hive] SSE disconnected: ${String(err)}`);
          api.logger?.warn?.(`[openclaw-hive] SSE disconnected: ${String(err)}`);
        }
      } finally {
        currentAbort = null;
      }

      if (!stopped) {
        await sleep(reconnectDelayMs);
        reconnectDelayMs = Math.min(reconnectDelayMs * 2, 30_000);
      }
    }
  };

  return {
    id: "hive-sse",
    start: async () => {
      console.error("[openclaw-hive] service start() called");
      if (!cfg.sseEnabled) {
        api.logger?.info?.("[openclaw-hive] SSE disabled by config");
        return;
      }
      void runStream();
    },
    stop: async () => {
      stopped = true;
      currentAbort?.abort();
      currentAbort = null;
    },
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
    sendText: async (params: any) => {
      try {
        const cfg = resolveConfig(params?.cfg);
        const text = String(params?.text ?? "");
        const messageType = params?.meta?.messageType;

        if (messageType === "chat") {
          const channelId = String(params?.meta?.channelId ?? "").trim();
          if (!channelId) {
            throw new Error("meta.channelId is required for chat messages");
          }
          await hiveRequest(cfg, "POST", `/api/chat/channels/${encodeURIComponent(channelId)}/messages`, {
            body: text,
          });
          await hiveRequest(cfg, "POST", `/api/chat/channels/${encodeURIComponent(channelId)}/read`);
          return { ok: true };
        }

        if (messageType === "mailbox") {
          const messageId = String(params?.meta?.messageId ?? "").trim();
          if (!messageId) {
            throw new Error("meta.messageId is required for mailbox replies");
          }
          await hiveRequest(
            cfg,
            "POST",
            `/api/mailboxes/me/messages/${encodeURIComponent(messageId)}/reply`,
            {
              body: text,
            },
          );
          await hiveRequest(cfg, "POST", `/api/mailboxes/me/messages/${encodeURIComponent(messageId)}/ack`);
          return { ok: true };
        }

        const recipient = String(params?.to ?? "").trim();
        if (!recipient) {
          throw new Error("to is required for new mailbox messages");
        }
        await hiveRequest(cfg, "POST", `/api/mailboxes/${encodeURIComponent(recipient)}/messages`, {
          title: "Message",
          body: text,
        });
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  },
};

export default function register(api: any) {
  const cfg = resolveConfig(api.config);

  api.registerChannel({ plugin: hiveChannel });

  api.registerTool({
    name: "hive_wake",
    label: "Hive Wake",
    description: "Get Hive wake items.",
    parameters: { type: "object", additionalProperties: false, properties: {} },
    async execute() {
      const items = await hiveRequest(cfg, "GET", "/api/wake");
      const list = Array.isArray(items) ? items : Array.isArray(items?.items) ? items.items : [];
      return toolTextResult(formatItemsAsText("Hive wake items:", list), { items: list });
    },
  });

  api.registerTool({
    name: "hive_inbox_list",
    label: "Hive Inbox List",
    description: "List unread Hive inbox messages.",
    parameters: { type: "object", additionalProperties: false, properties: {} },
    async execute() {
      const messages = await hiveRequest(
        cfg,
        "GET",
        "/api/mailboxes/me/messages?status=unread&limit=20",
      );
      const list = Array.isArray(messages)
        ? messages
        : Array.isArray(messages?.items)
          ? messages.items
          : [];
      return toolTextResult(formatItemsAsText("Unread inbox messages:", list), { messages: list });
    },
  });

  api.registerTool({
    name: "hive_inbox_reply",
    label: "Hive Inbox Reply",
    description: "Reply to a Hive inbox message and ack it.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["id", "body"],
      properties: {
        id: { type: "string" },
        body: { type: "string" },
      },
    },
    async execute(_toolCallId: string, params: any) {
      const id = String(params?.id ?? "").trim();
      const body = String(params?.body ?? "");
      if (!id) {
        throw new Error("id is required");
      }
      await hiveRequest(cfg, "POST", `/api/mailboxes/me/messages/${encodeURIComponent(id)}/reply`, {
        body,
      });
      await hiveRequest(cfg, "POST", `/api/mailboxes/me/messages/${encodeURIComponent(id)}/ack`);
      return toolTextResult(`Replied and acknowledged message ${id}.`, { id, ok: true });
    },
  });

  api.registerTool({
    name: "hive_chat_send",
    label: "Hive Chat Send",
    description: "Send a Hive chat message and mark channel read.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["channelId", "body"],
      properties: {
        channelId: { type: "string" },
        body: { type: "string" },
      },
    },
    async execute(_toolCallId: string, params: any) {
      const channelId = String(params?.channelId ?? "").trim();
      const body = String(params?.body ?? "");
      if (!channelId) {
        throw new Error("channelId is required");
      }
      await hiveRequest(cfg, "POST", `/api/chat/channels/${encodeURIComponent(channelId)}/messages`, {
        body,
      });
      await hiveRequest(cfg, "POST", `/api/chat/channels/${encodeURIComponent(channelId)}/read`);
      return toolTextResult(`Sent chat message to channel ${channelId} and marked read.`, {
        channelId,
        ok: true,
      });
    },
  });

  api.registerService(createSseService(cfg, api));

  if (api.logger?.info) {
    api.logger.info(
      `[openclaw-hive] registered (token=${cfg.token ? "set" : "missing"}, sse=${cfg.sseEnabled})`
    );
  }
}
