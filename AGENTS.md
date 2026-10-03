# AGENTS.md

Notes for coding agents (and people) working on this repo. For *using* the server, see the README.

## Layout

- `src/index.ts`: the Worker entry. Routes `/health`, `/interactions` (the `/vibe` slash command, signature-checked), and `/mcp/<MCP_SECRET_PATH>` (MCP JSON-RPC plus the `/upload` endpoint). Server instructions sent on `initialize` live here.
- `src/tools.ts`: every tool. `DISCORD_TOOLS` holds the definitions (name, description, JSON Schema), and `handleDiscordTool` holds one `case` per tool. `toolAnnotations` derives the read-only and destructive hints.
- `src/agents.ts`: the agents config. `parseAgents` reads the `AGENTS` JSON secret, plus the single-bot env vars as the `default` agent. `matchMcpPath` maps a secret URL to its agent with a timing-safe compare. Every Discord call must use the matched agent's token, never `env.DISCORD_BOT_TOKEN` directly.
- `src/discord.ts`: Discord REST helpers. All Discord calls go through `discordFetch` / `discordFetchMultipart`, which handle 429 retries and non-JSON error bodies.
- `src/voice.ts`: reads duration and waveform from Ogg/Opus audio for native voice messages, without decoding.
- `src/register-commands.ts`: a one-off Node script that registers `/vibe`. It's not part of the Worker and is excluded from the Worker typecheck.

## Adding or changing a tool

1. Add the definition to `DISCORD_TOOLS`. Write the description for an agent reading it cold: what it does, the limits and permissions involved, and whether it can be undone.
2. Add the `case` in `handleDiscordTool`. Throw on `!res.ok` with the Discord error body. Return a short string, or an array of MCP content blocks (`ToolContent[]`) for images.
3. If it deletes, bans, kicks or otherwise can't simply be redone, add it to `DESTRUCTIVE_TOOLS`. Tools named `discord_read_*`, `discord_get_*`, `discord_list_*` and `discord_fetch_*` are marked read-only automatically, so don't use those prefixes for tools that change things.
4. Update the counts and tables in the README.

## Checks

```bash
npm run typecheck
npm run dev   # then curl http://localhost:8787/health
```

There are no automated tests. Without a bot token you can still exercise `initialize`, `tools/list` and `ping` locally:

```bash
npx wrangler dev --var MCP_SECRET_PATH:test
curl localhost:8787/mcp/test -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## Don't

- Don't commit `.dev.vars` or a real `MCP_SECRET_PATH`.
- Don't commit `agents.json`.
- Don't weaken the secret-path check. It's the only authentication.
- Don't let one agent's request reach another agent's token or keys.
