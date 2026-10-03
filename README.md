# Cloud Discord

A Discord MCP (Model Context Protocol) server that runs on Cloudflare Workers. It gives an AI agent a Discord bot account to work through: 59 tools for messaging, moderation, forums, roles, files, voice notes and more.

You deploy it once to your own Cloudflare account and connect any MCP client to its URL (Claude Code, Claude Desktop, claude.ai, Cursor, and others). There's no database and no server to keep running.

**What you need:** a Cloudflare account (the free tier works), Node.js 18+, and a Discord server where you can add a bot. Setup takes about 15 minutes.

## Contents

- [Setup](#setup)
- [Configuration reference](#configuration-reference)
- [Troubleshooting](#troubleshooting)
- [Tips for agents](#tips-for-agents)
- [Optional features](#optional-features): `/vibe`, voice notes, direct file upload
- [Tool reference](#tool-reference)
- [Development](#development)

## Setup

### 1. Create the Discord bot

1. Open the [Discord Developer Portal](https://discord.com/developers/applications) and click **New Application**.
2. On the **Bot** tab:
   - Click **Reset Token** and copy the token. Discord shows it once; you'll need it in step 4.
   - Under **Privileged Gateway Intents**, turn on:
     - **Message Content Intent**. Without it, messages the bot reads come back with empty text.
     - **Server Members Intent**. Without it, `discord_get_guild_members` fails.
3. On the **General Information** tab, copy the **Public Key**. You need it in step 3, and it's only used by the optional `/vibe` command.
4. On **OAuth2 > URL Generator**:
   - Scopes: `bot` and `applications.commands`
   - Bot permissions: `Administrator` is the simplest choice. For a narrower bot, pick only what you'll use: View Channels, Send Messages, Read Message History, Attach Files, Add Reactions, Manage Messages, Manage Threads, Create Polls, and the moderation and role permissions you need.
   - Open the generated URL and invite the bot to your server.

### 2. Clone and install

```bash
git clone https://github.com/codependentai/cloud-discord.git
cd cloud-discord
npm install
```

### 3. Set your secret path and public key

Your MCP URL contains a secret path, and anyone who has the URL can use every tool. Generate a long random value:

```bash
openssl rand -hex 24
```

Then edit `wrangler.toml`:

```toml
[vars]
MCP_SECRET_PATH = "the-value-you-generated"
DISCORD_PUBLIC_KEY = "your-public-key"   # or leave CHANGE_ME if you won't use /vibe
```

> **Public fork?** Don't commit a real `MCP_SECRET_PATH`. Delete that line from `wrangler.toml` and store it as a secret instead: `npx wrangler secret put MCP_SECRET_PATH`.

Until `MCP_SECRET_PATH` is set to a real value, the server answers every MCP request with 404.

### 4. Add secrets

Secrets are stored encrypted in Cloudflare and never go in your code. Each command prompts you to paste the value.

```bash
npx wrangler secret put DISCORD_BOT_TOKEN      # required
npx wrangler secret put ANTHROPIC_API_KEY      # optional, for /vibe
npx wrangler secret put ELEVENLABS_API_KEY     # optional, for voice notes
npx wrangler secret put ELEVENLABS_VOICE_ID    # optional, default voice for voice notes
```

The first `wrangler` command asks you to log in to Cloudflare in your browser.

### 5. Deploy

```bash
npm run deploy
```

Wrangler prints your Worker's address, like `https://cloud-discord.<your-subdomain>.workers.dev`. Your MCP URL is that address plus `/mcp/<your-secret-path>`.

### 6. Check it works

```bash
# Should print {"status":"ok","tools":59}
curl https://cloud-discord.<your-subdomain>.workers.dev/health

# Should print a JSON result naming "cloud-discord"
curl https://cloud-discord.<your-subdomain>.workers.dev/mcp/<your-secret-path> \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
```

If `/health` works but the second command returns `Not found`, the secret path in the URL doesn't match `MCP_SECRET_PATH`.

### 7. Connect your MCP client

Use your full MCP URL: `https://cloud-discord.<your-subdomain>.workers.dev/mcp/<your-secret-path>`.

**Claude Code.** From your project folder:

```bash
claude mcp add --transport http discord https://cloud-discord.<your-subdomain>.workers.dev/mcp/<your-secret-path>
```

Add `--scope user` to make it available in all your projects. Or put it in `.mcp.json` yourself:

```json
{
  "mcpServers": {
    "discord": {
      "type": "http",
      "url": "https://cloud-discord.<your-subdomain>.workers.dev/mcp/<your-secret-path>"
    }
  }
}
```

If you commit `.mcp.json`, the secret URL goes with it. For a shared repo, add the server with `--scope user` instead.

**claude.ai and Claude Desktop.** Go to **Settings > Connectors > Add custom connector** and paste the URL. Leave the OAuth fields empty; the secret path is the authentication. Custom connectors depend on your plan.

**Claude Desktop through its config file.** `claude_desktop_config.json` only starts local (stdio) servers, so bridge to the URL with [`mcp-remote`](https://www.npmjs.com/package/mcp-remote):

```json
{
  "mcpServers": {
    "discord": {
      "command": "npx",
      "args": ["mcp-remote", "https://cloud-discord.<your-subdomain>.workers.dev/mcp/<your-secret-path>"]
    }
  }
}
```

**Other clients** (Cursor and so on): add a remote or "Streamable HTTP" MCP server with the same URL.

## Configuration reference

| Name | Kind | Required | What it's for |
|------|------|----------|---------------|
| `DISCORD_BOT_TOKEN` | secret | yes | The bot's token from the Developer Portal |
| `MCP_SECRET_PATH` | var or secret | yes | The secret part of your MCP URL. The server returns 404 while it's unset or `CHANGE_ME` |
| `DISCORD_PUBLIC_KEY` | var | for `/vibe` | Verifies that interaction requests really come from Discord |
| `ANTHROPIC_API_KEY` | secret | for `/vibe` | Writes the vibe summary |
| `ELEVENLABS_API_KEY` | secret | for voice notes | Text-to-speech |
| `ELEVENLABS_VOICE_ID` | secret | no | Default voice, so `voice_id` can be left out of each call |

For local development, put secrets in `.dev.vars` (copy `.dev.vars.example`). It's gitignored.

## Troubleshooting

| What you see | What it means | Fix |
|--------------|---------------|-----|
| `Not found` on the MCP URL | Wrong or missing secret path | Check the URL ends in `/mcp/<MCP_SECRET_PATH>` exactly, and that `MCP_SECRET_PATH` isn't `CHANGE_ME` |
| `Missing Access` (code 50001) | The bot can't see that channel | Give the bot's role **View Channel** on the channel or its category. Private channels need an explicit overwrite |
| `Missing Permissions` (code 50013) | The bot can see it but isn't allowed to do that | Grant the permission, or move the bot's role higher. A bot can't manage roles or members ranked at or above its own highest role |
| Messages come back as `[no text content]` | Message Content Intent is off | Turn it on (Setup, step 1) |
| `discord_get_guild_members` fails | Server Members Intent is off | Turn it on (Setup, step 1) |
| `Unknown Channel` / `Unknown Message` (10003 / 10008) | Wrong ID, or it was deleted | IDs are long numbers; re-list to get fresh ones |
| `Cannot send messages to this user` (50007) | The user has DMs closed or shares no server with the bot | Nothing the bot can do; message them in a channel instead |
| `Rate limited; retry after Ns` | Discord asked the bot to slow down for longer than the server waits | Wait that long and try again |
| Voice note: `ElevenLabs API key not configured` | `ELEVENLABS_API_KEY` isn't set | `npx wrangler secret put ELEVENLABS_API_KEY` |

To see live logs from your deployed Worker, run `npm run tail`.

## Tips for agents

The server sends these to MCP clients as instructions, and they're here for humans too:

- **Everything is addressed by ID.** Start with `discord_list_servers` (guild IDs), then `discord_list_channels` (channel IDs), then `discord_read_messages` (each message line includes its ID). Humans can copy IDs in Discord after turning on **Settings > Advanced > Developer Mode**.
- **Threads and forum posts are channels.** Pass a thread's ID as `channel_id` to read or send in it.
- **Custom emoji** can be passed as `<:name:id>` or `name:id`; Unicode emoji are passed as-is.
- **Tools are annotated.** Read-only tools are marked `readOnlyHint`, and tools that delete, ban, kick, or change permissions are marked `destructiveHint`, so clients can ask before running them.
- **Images come back as images.** `discord_fetch_image` returns the picture itself, not a link, so a vision-capable model can look at it.

## Optional features

### `/vibe` slash command

Anyone in your server can type `/vibe` to get a one-paragraph read on what the channel is talking about and its mood. It reads the last 20 messages and summarizes them with Claude.

1. Set `DISCORD_PUBLIC_KEY` (step 3) and `ANTHROPIC_API_KEY` (step 4), and deploy.
2. Register the command once. The Application ID is on the Developer Portal's **General Information** tab:
   ```bash
   DISCORD_APP_ID=your_app_id DISCORD_BOT_TOKEN=your_token npx tsx src/register-commands.ts
   ```
3. In the Developer Portal, set **Interactions Endpoint URL** to `https://cloud-discord.<your-subdomain>.workers.dev/interactions` and save. Discord checks the endpoint right away, so the Worker must already be deployed with the right public key.

### Voice notes

`discord_send_voice_note` turns text into speech with [ElevenLabs](https://elevenlabs.io/) and posts it as an audio file.

1. Get an ElevenLabs API key and set it: `npx wrangler secret put ELEVENLABS_API_KEY`
2. Find a voice ID in the [Voice Lab](https://elevenlabs.io/app/voice-lab). Either set it as the default (`npx wrangler secret put ELEVENLABS_VOICE_ID`) or pass `voice_id` on each call.

Without the API key, only this tool returns an error; everything else works normally.

### Direct file upload

For local files too big to pass through an MCP tool as base64 (audio especially), post them straight to the upload endpoint:

```bash
# To a channel
curl -F "channel_id=CHANNEL_ID" \
     -F "file=@/path/to/file.mp3" \
     -F "message=Optional message" \
     https://cloud-discord.<your-subdomain>.workers.dev/mcp/<your-secret-path>/upload

# As a DM
curl -F "user_id=USER_ID" \
     -F "file=@/path/to/image.png" \
     https://cloud-discord.<your-subdomain>.workers.dev/mcp/<your-secret-path>/upload
```

Discord's upload size limits apply (10 MB on servers without boosts).

## Tool reference

59 tools. Each MCP client also gets the full parameter list for every tool.

| Category | Count |
|----------|-------|
| [Messaging](#messaging) | 8 |
| [Reactions & pins](#reactions--pins) | 6 |
| [Channels](#channels) | 7 |
| [Threads](#threads) | 3 |
| [Forums](#forums) | 10 |
| [Roles](#roles) | 7 |
| [Members & moderation](#members--moderation) | 7 |
| [Server](#server) | 2 |
| [Invites & polls](#invites--polls) | 4 |
| [Files, images & voice](#files-images--voice) | 5 |

### Messaging
| Tool | Description |
|------|-------------|
| `discord_read_messages` | Read channel history (1-100 messages, with IDs; page with `before`/`after`) |
| `discord_read_dm_messages` | Read DM history with a user |
| `discord_send_message` | Send a message, optionally as a reply |
| `discord_send_dm` | Send a direct message to a user |
| `discord_edit_message` | Edit one of the bot's own messages |
| `discord_delete_message` | Delete a message |
| `discord_bulk_delete_messages` | Delete 2-100 messages at once (each under 14 days old) |
| `discord_send_embed` | Send a rich embed with title, fields, images, colors |

### Reactions & pins
| Tool | Description |
|------|-------------|
| `discord_add_reaction` | Add an emoji reaction |
| `discord_remove_reaction` | Remove the bot's reaction, or someone else's |
| `discord_get_message_reactions` | Get reaction counts on a message |
| `discord_pin_message` | Pin a message |
| `discord_unpin_message` | Unpin a message |
| `discord_get_pinned_messages` | List pinned messages |

### Channels
| Tool | Description |
|------|-------------|
| `discord_list_servers` | List the servers the bot is in |
| `discord_list_channels` | List a server's channels by category |
| `discord_create_channel` | Create a text, voice, category, or forum channel |
| `discord_edit_channel` | Edit name, topic, NSFW, position, category |
| `discord_delete_channel` | Delete a channel |
| `discord_set_slowmode` | Set slowmode (0-21600 seconds) |
| `discord_set_channel_permissions` | Set a permission overwrite for a role or member |

### Threads
| Tool | Description |
|------|-------------|
| `discord_create_thread` | Create a thread, optionally from a message |
| `discord_manage_thread` | Archive, unarchive, lock, unlock |
| `discord_delete_thread` | Delete a thread |

### Forums
| Tool | Description |
|------|-------------|
| `discord_create_forum_post` | Create a post with optional tags |
| `discord_edit_forum_post` | Rename, archive, lock, pin, change tags |
| `discord_list_forum_posts` | List active posts |
| `discord_list_archived_forum_posts` | List archived posts |
| `discord_get_forum_tags` | List available tags |
| `discord_create_forum_tag` | Add a tag (max 20 per forum) |
| `discord_edit_forum_tag` | Edit a tag's name, emoji, or moderated status |
| `discord_delete_forum_tag` | Delete a tag |
| `discord_set_forum_default_reaction` | Set the default reaction for new posts |
| `discord_set_forum_settings` | Layout, sort order, guidelines, required tags |

### Roles
| Tool | Description |
|------|-------------|
| `discord_list_roles` | List roles |
| `discord_create_role` | Create a role with name, color, hoist, mentionable |
| `discord_edit_role` | Edit a role's name or color |
| `discord_delete_role` | Delete a role |
| `discord_assign_role` | Give a member a role |
| `discord_remove_role` | Take a role from a member |
| `discord_get_member_roles` | List a member's roles |

### Members & moderation
| Tool | Description |
|------|-------------|
| `discord_get_guild_members` | List members (needs Server Members Intent) |
| `discord_get_user_info` | Username, display name, avatar |
| `discord_change_nickname` | Change the bot's own nickname |
| `discord_kick_member` | Kick a member, with an audit-log reason |
| `discord_ban_member` | Ban a user, optionally deleting recent messages |
| `discord_unban_member` | Unban a user |
| `discord_timeout_member` | Timeout a member for up to 28 days, or lift it |

### Server
| Tool | Description |
|------|-------------|
| `discord_get_guild_info` | Name, member counts, boosts, verification level |
| `discord_get_audit_log` | Audit log, filterable by action type or user |

### Invites & polls
| Tool | Description |
|------|-------------|
| `discord_create_invite` | Create an invite with expiry and use limits |
| `discord_list_invites` | List invites |
| `discord_delete_invite` | Revoke an invite |
| `discord_create_poll` | Create a native poll (2-10 answers) |

### Files, images & voice
| Tool | Description |
|------|-------------|
| `discord_send_file` | Send a file from a URL or base64 |
| `discord_send_dm_file` | Send a file as a DM |
| `discord_fetch_image` | Fetch an image attachment so the model can see it |
| `discord_fetch_dm_image` | Same, from a DM |
| `discord_send_voice_note` | Generate speech and send it (needs ElevenLabs) |

## How it works

One Cloudflare Worker, three routes:

- `/mcp/<secret-path>`: MCP over Streamable HTTP (JSON-RPC). Each tool call becomes one or a few Discord REST API requests. Rate limits are retried automatically for waits up to 10 seconds.
- `/interactions`: Discord slash-command webhooks (`/vibe`), verified by signature.
- `/health`: public, reports the tool count.

There's no database and no stored state. Authentication is the secret path, so treat the MCP URL like a password.

## Development

```bash
cp .dev.vars.example .dev.vars   # then fill in your token
npm run dev                      # local server at http://localhost:8787
npm run typecheck
npm run deploy
```

To add a tool, add its definition to `DISCORD_TOOLS` and a matching `case` in `handleDiscordTool`, both in `src/tools.ts`. See [AGENTS.md](AGENTS.md) for more on the layout.

## License

MIT, see [LICENSE](LICENSE).

## Support

Built by [Codependent AI](https://codependentai.io).

<a href="https://ko-fi.com/codependentai"><img src="https://img.shields.io/badge/Ko--fi-Support%20Us-ff5e5b?logo=ko-fi&logoColor=white" alt="Ko-fi" /></a>
