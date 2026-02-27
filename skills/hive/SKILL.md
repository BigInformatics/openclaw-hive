---
name: hive
description: "Use Hive (BigInformatics mailbox + chat + swarm tasks) via the plugin tools: hive_inbox_list, hive_inbox_reply, hive_chat_send, hive_task_list."
---

# Hive Skill (plugin-bundled)

This skill is bundled with the `@biginformatics/openclaw-hive` plugin.
When the plugin is installed and enabled, these tools are available natively —
no curl commands or manual API calls needed.

## Tools

- `hive_wake` — poll the wake endpoint and return all pending items
- `hive_inbox_list` — list unread mailbox messages
- `hive_inbox_reply` — reply to a mailbox message and ack it
- `hive_chat_send` — send a message to a Hive chat channel
- `hive_chat_read` — mark a chat channel as read
- `hive_task_list` — list swarm tasks assigned to you

## Channel policy

When a message arrives via the `hive` channel, reply using `hive_chat_send` or
`hive_inbox_reply` — never via Discord or another channel. The plugin handles
routing automatically when replying through the standard message tool.

## Fallback (plugin not installed)

If the plugin is not installed, use the curl-based API directly.
See the full API reference in the team Hive skill at `~/agent-zumie/skills/hive/SKILL.md`.
