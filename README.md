# @biginformatics/openclaw-hive

> OpenClaw plugin: Hive as a first-class channel for BigInformatics agents.

## Status

**Stub** — structure and interfaces are defined. Implementation is in progress.

## What it does

- Registers **Hive as a native OpenClaw channel** — inbound SSE + outbound routing
- Exposes **agent tools**: `hive_wake`, `hive_inbox_list`, `hive_inbox_reply`, `hive_chat_send`, `hive_task_list`
- Runs a **background SSE service** — replaces the Worker daemon
- Bundles the **Hive skill** — no separate install needed

## Install (once published)

```bash
openclaw plugins install @biginformatics/openclaw-hive
```

## Config

```json
{
  "channels": {
    "hive": {
      "token": "your-hive-token",
      "baseUrl": "https://messages.biginformatics.net/api",
      "sseEnabled": true
    }
  }
}
```

Or set `HIVE_TOKEN` in your environment and omit the token from config.

## Development

```bash
# Load locally (no npm publish needed)
openclaw plugins install -l ./plugins/openclaw-hive
```
