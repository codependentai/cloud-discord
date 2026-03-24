# Cloud Discord

A full-featured Discord MCP (Model Context Protocol) server that runs on Cloudflare Workers. Gives AI agents complete admin control over Discord servers — 59 tools covering messaging, moderation, forums, roles, files, voice notes, and more.

Deploy once, connect from any MCP-compatible client (Claude Code, Claude Desktop, Cursor, etc.).

## Features

**59 tools** across 12 categories:

| Category | Tools | What You Can Do |
|----------|-------|----------------|
| **Messaging** | 8 | Send, edit, delete, bulk delete, read history, send embeds, read/send DMs |
| **Moderation** | 4 | Kick, ban, unban, timeout members |
| **Roles** | 7 | Create, edit, delete, assign, remove roles, list member roles |
| **Channels** | 6 | Create, edit, delete channels, set slowmode, set permissions, list all |
| **Threads** | 3 | Create, manage (archive/lock), delete threads |
| **Forums** | 9 | Create/edit/list posts, manage tags, set layout/sort/guidelines |
| **Reactions** | 3 | Add, remove, get reactions |
| **Pins** | 3 | Pin, unpin, list pinned messages |
| **Files** | 2 | Send files to channels or DMs (via URL or base64) |
| **Voice** | 1 | Text-to-speech voice notes via ElevenLabs (optional) |
| **Server** | 4 | Guild info, audit log, list servers, member list |
| **Invites** | 3 | Create, list, delete invites |
| **Polls** | 1 | Create native Discord polls |

Plus:
- `/vibe` slash command — AI-powered channel vibe check (requires Anthropic API key)
- Direct file upload endpoint — send files from your machine without base64 encoding
- Secret-path authentication — your MCP endpoint is only accessible with your secret URL
- Rate limit handling with automatic retry

## Prerequisites

- A [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier works)
- [Node.js](https://nodejs.org/) 18+
- A Discord bot with appropriate permissions

## Setup

### 1. Create a Discord Bot

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Click **New Application**, give it a name
3. Go to the **Bot** tab:
   - Click **Reset Token** and save the token — you'll need it later
   - Enable **Message Content Intent** under Privileged Gateway Intents
4. Go to the **General Information** tab:
   - Copy the **Application ID** (you'll need this for the `/vibe` command)
   - Copy the **Public Key** (you'll need this for `wrangler.toml`)
5. Go to **OAuth2 > URL Generator**:
   - Select scopes: `bot`, `applications.commands`
   - Select bot permissions: `Administrator` (or select individual permissions you need)
   - Copy the generated URL and open it in your browser to invite the bot to your server

### 2. Clone and Install

```bash
git clone https://github.com/codependentai/cloud-discord.git
cd cloud-discord
npm install
```

### 3. Configure

Edit `wrangler.toml`:

```toml
[vars]
# Generate a random secret: openssl rand -base64 24
MCP_SECRET_PATH = "your-random-secret-here"

# From Discord Developer Portal > General Information > Public Key
DISCORD_PUBLIC_KEY = "your-public-key-here"
```

### 4. Add Secrets

These are stored securely in Cloudflare — they never appear in your code:

```bash
# Required — your Discord bot token
npx wrangler secret put DISCORD_BOT_TOKEN
# Paste your bot token when prompted

# Optional — needed for the /vibe slash command
npx wrangler secret put ANTHROPIC_API_KEY

# Optional — needed for voice notes (discord_send_voice_note)
npx wrangler secret put ELEVENLABS_API_KEY
```

### 5. Deploy

```bash
npx wrangler deploy
```

Your MCP server is now live at:
```
https://cloud-discord.<your-subdomain>.workers.dev/mcp/<your-secret-path>
```

### 6. Connect to Your MCP Client

Add the server to your MCP client's configuration. For example, in Claude Code's `.mcp.json`:

```json
{
  "mcpServers": {
    "discord": {
      "type": "url",
      "url": "https://cloud-discord.<your-subdomain>.workers.dev/mcp/<your-secret-path>"
    }
  }
}
```

For Claude Desktop, add it to `claude_desktop_config.json` under `mcpServers` with the same format.

## Optional: Register the /vibe Slash Command

The `/vibe` command lets anyone in your Discord server run an AI-powered vibe check on the current channel. It reads the last 20 messages and summarizes what's happening.

Requires `ANTHROPIC_API_KEY` to be set.

```bash
DISCORD_APP_ID=your_app_id DISCORD_BOT_TOKEN=your_token npx tsx src/register-commands.ts
```

Then in Discord Developer Portal, set the **Interactions Endpoint URL** to:
```
https://cloud-discord.<your-subdomain>.workers.dev/interactions
```

## Optional: Voice Notes

The `discord_send_voice_note` tool generates speech using [ElevenLabs](https://elevenlabs.io/) and sends it as an audio file to Discord.

1. Sign up at [ElevenLabs](https://elevenlabs.io/) and get an API key
2. Add the secret: `npx wrangler secret put ELEVENLABS_API_KEY`
3. Find your voice ID in the [Voice Lab](https://elevenlabs.io/app/voice-lab)
4. Use the tool with `voice_id` and `text` parameters

If `ELEVENLABS_API_KEY` is not set, the tool will return an error when called but won't affect any other tools.

## Direct File Upload

For sending local files (images, audio, documents) without base64 encoding, use the direct upload endpoint:

```bash
# Send to a channel
curl -F "channel_id=CHANNEL_ID" \
     -F "file=@/path/to/file.mp3" \
     -F "message=Optional message" \
     https://cloud-discord.<your-subdomain>.workers.dev/mcp/<your-secret>/upload

# Send as DM
curl -F "user_id=USER_ID" \
     -F "file=@/path/to/image.png" \
     https://cloud-discord.<your-subdomain>.workers.dev/mcp/<your-secret>/upload
```

This is useful when the MCP tool's base64 parameter would be too large (e.g., audio files).

## Tool Reference

### Messaging
| Tool | Description |
|------|-------------|
| `discord_read_messages` | Read channel message history (1-100 messages) |
| `discord_read_dm_messages` | Read DM history with a user |
| `discord_send_message` | Send a message, optionally as a reply |
| `discord_send_dm` | Send a direct message to a user |
| `discord_edit_message` | Edit a bot message |
| `discord_delete_message` | Delete a message |
| `discord_bulk_delete_messages` | Delete 2-100 messages at once (must be <14 days old) |
| `discord_send_embed` | Send a rich embed with title, fields, images, colors |

### Moderation
| Tool | Description |
|------|-------------|
| `discord_kick_member` | Kick a member from the server |
| `discord_ban_member` | Ban a member, optionally delete their recent messages |
| `discord_unban_member` | Unban a user |
| `discord_timeout_member` | Timeout (mute) a member for up to 28 days |

### Roles
| Tool | Description |
|------|-------------|
| `discord_list_roles` | List all roles in a server |
| `discord_create_role` | Create a role with name, color, hoist, mentionable |
| `discord_edit_role` | Edit role name or color |
| `discord_delete_role` | Delete a role |
| `discord_assign_role` | Give a role to a member |
| `discord_remove_role` | Remove a role from a member |
| `discord_get_member_roles` | Get all roles for a member |

### Channels
| Tool | Description |
|------|-------------|
| `discord_list_channels` | List all channels organized by category |
| `discord_list_servers` | List all servers the bot is in |
| `discord_create_channel` | Create text, voice, category, or forum channels |
| `discord_edit_channel` | Edit name, topic, NSFW, position, category |
| `discord_delete_channel` | Delete a channel |
| `discord_set_slowmode` | Set slowmode (0-21600 seconds) |
| `discord_set_channel_permissions` | Set permission overwrites for roles/users |

### Threads
| Tool | Description |
|------|-------------|
| `discord_create_thread` | Create a thread, optionally from a message |
| `discord_manage_thread` | Archive, unarchive, lock, unlock threads |
| `discord_delete_thread` | Delete a thread |

### Forums
| Tool | Description |
|------|-------------|
| `discord_create_forum_post` | Create a forum post with optional tags |
| `discord_edit_forum_post` | Edit title, archive, lock, pin, change tags |
| `discord_list_forum_posts` | List active posts in a forum |
| `discord_list_archived_forum_posts` | List archived/closed posts |
| `discord_get_forum_tags` | Get available tags |
| `discord_create_forum_tag` | Add a tag (max 20 per forum) |
| `discord_edit_forum_tag` | Edit a tag's name, emoji, moderated status |
| `discord_delete_forum_tag` | Delete a tag |
| `discord_set_forum_default_reaction` | Set default reaction emoji for new posts |
| `discord_set_forum_settings` | Configure layout, sort order, guidelines, require tags |

### Reactions & Pins
| Tool | Description |
|------|-------------|
| `discord_add_reaction` | Add an emoji reaction |
| `discord_remove_reaction` | Remove a reaction (own or others) |
| `discord_get_message_reactions` | Get all reactions on a message |
| `discord_pin_message` | Pin a message |
| `discord_unpin_message` | Unpin a message |
| `discord_get_pinned_messages` | List all pinned messages |

### Files & Voice
| Tool | Description |
|------|-------------|
| `discord_send_file` | Send a file via URL or base64 |
| `discord_send_dm_file` | Send a file as DM via URL or base64 |
| `discord_send_voice_note` | Generate TTS audio and send (requires ElevenLabs) |

### Server & Members
| Tool | Description |
|------|-------------|
| `discord_get_guild_info` | Server details: name, members, boosts, verification |
| `discord_get_audit_log` | View audit log, filter by action type or user |
| `discord_get_guild_members` | List server members |
| `discord_get_user_info` | Get user details |
| `discord_change_nickname` | Change the bot's nickname |

### Invites & Polls
| Tool | Description |
|------|-------------|
| `discord_create_invite` | Create a channel invite with expiry and use limits |
| `discord_list_invites` | List all server invites |
| `discord_delete_invite` | Revoke an invite |
| `discord_create_poll` | Create a native Discord poll (2-10 options) |

### Images
| Tool | Description |
|------|-------------|
| `discord_fetch_image` | Fetch a message attachment as base64 |
| `discord_fetch_dm_image` | Fetch a DM attachment as base64 |

## Architecture

This is a single Cloudflare Worker (~330 KB) that:

1. Receives MCP JSON-RPC requests at `/mcp/<secret-path>`
2. Translates tool calls into Discord REST API requests
3. Returns formatted results to the MCP client

No database, no state, no containers. Auth is handled by the secret path in the URL — anyone with the URL can use all tools, so treat it like an API key.

The `/vibe` slash command handles Discord interactions at `/interactions` using signature verification.

## Development

```bash
# Run locally
npx wrangler dev

# Type check
npx tsc --noEmit

# Deploy
npx wrangler deploy
```

## License

MIT — see [LICENSE](LICENSE).

Built by [Codependent AI](https://codependentai.io).
