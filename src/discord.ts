// Discord REST API helper — all calls go through here

const DISCORD_API = 'https://discord.com/api/v10';

export interface DiscordResponse {
  ok: boolean;
  status: number;
  data: unknown;
}

// Longest rate-limit wait we'll sit through inside a single request. Anything longer
// (usually a global or shared-bucket limit) is returned as an error instead of
// holding the Worker open.
const MAX_RETRY_WAIT_MS = 10_000;

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    // Non-JSON bodies happen on upstream 5xx (HTML error pages) — keep them readable
    return { message: text.slice(0, 500) };
  }
}

async function sendWithRetry(
  method: string,
  path: string,
  makeInit: () => RequestInit,
): Promise<DiscordResponse> {
  const url = `${DISCORD_API}${path}`;
  let lastStatus = 500;

  // Retry up to 2 times for rate limits
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, makeInit());
    lastStatus = res.status;

    if (res.status === 429) {
      const retryData = await readBody(res) as { retry_after?: number } | null;
      const retryAfter = (retryData?.retry_after ?? 1) * 1000;
      if (retryAfter > MAX_RETRY_WAIT_MS) {
        return { ok: false, status: 429, data: { message: `Rate limited; retry after ${Math.ceil(retryAfter / 1000)}s` } };
      }
      console.log(`Rate limited on ${method} ${path}, retrying in ${retryAfter}ms`);
      await new Promise(r => setTimeout(r, retryAfter));
      continue;
    }

    if (res.status === 204) {
      return { ok: true, status: 204, data: null };
    }

    const data = await readBody(res);
    return { ok: res.ok, status: res.status, data };
  }

  return { ok: false, status: lastStatus, data: { message: 'Rate limit retries exhausted' } };
}

export async function discordFetch(
  token: string,
  method: string,
  path: string,
  body?: unknown,
  extraHeaders?: Record<string, string>,
): Promise<DiscordResponse> {
  const headers: Record<string, string> = {
    Authorization: `Bot ${token}`,
    'User-Agent': 'CloudDiscord/1.0',
    ...extraHeaders,
  };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  return sendWithRetry(method, path, () => ({
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }));
}

// Helper to format a Discord message object into readable text
export function formatMessage(msg: any): string {
  const timestamp = msg.timestamp;
  const author = msg.author?.username ?? 'Unknown';
  const content = msg.content || '[no text content]';
  const attachments = msg.attachments?.length > 0
    ? `\n  Attachments: ${msg.attachments.map((a: any) => a.url).join(', ')}`
    : '';
  const embeds = msg.embeds?.length > 0
    ? `\n  Embeds: ${msg.embeds.length} embed(s)`
    : '';
  const replyTo = msg.message_reference?.message_id ? ` (reply to ${msg.message_reference.message_id})` : '';
  return `[${timestamp}] (ID: ${msg.id}) ${author}${replyTo}: ${content}${attachments}${embeds}`;
}

// Send a message with file attachment via multipart/form-data
export async function discordFetchMultipart(
  token: string,
  method: string,
  path: string,
  payload: Record<string, unknown>,
  fileData: Uint8Array,
  fileName: string,
  contentType: string,
): Promise<DiscordResponse> {
  // Build a fresh body per attempt so a retry never sends a consumed stream
  return sendWithRetry(method, path, () => {
    const form = new FormData();
    form.append('payload_json', JSON.stringify(payload));
    form.append('files[0]', new Blob([fileData], { type: contentType }), fileName);
    return {
      method,
      headers: {
        Authorization: `Bot ${token}`,
        'User-Agent': 'CloudDiscord/1.0',
      },
      body: form,
    };
  });
}

// Fetch an image attachment as base64, ready to return as MCP image content
export async function fetchImageAsBase64(url: string): Promise<{ data: string; mimeType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  // Encode in chunks: spreading a whole image into String.fromCharCode overflows the stack
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  const mimeType = (res.headers.get('content-type') || 'image/png').split(';')[0].trim();
  return { data: btoa(binary), mimeType };
}
