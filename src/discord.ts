// Discord REST API helper — all calls go through here

const DISCORD_API = 'https://discord.com/api/v10';

export interface DiscordResponse {
  ok: boolean;
  status: number;
  data: unknown;
}

export async function discordFetch(
  token: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<DiscordResponse> {
  const url = `${DISCORD_API}${path}`;

  const headers: Record<string, string> = {
    Authorization: `Bot ${token}`,
    'User-Agent': 'CloudDiscord/1.0',
  };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  let lastResponse: Response | null = null;

  // Retry up to 2 times for rate limits
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    lastResponse = res;

    if (res.status === 429) {
      const retryData = await res.json() as { retry_after?: number };
      const retryAfter = (retryData.retry_after ?? 1) * 1000;
      console.log(`Rate limited on ${method} ${path}, retrying in ${retryAfter}ms`);
      await new Promise(r => setTimeout(r, retryAfter));
      continue;
    }

    if (res.status === 204) {
      return { ok: true, status: 204, data: null };
    }

    const data = await res.json();
    return { ok: res.ok, status: res.status, data };
  }

  return { ok: false, status: lastResponse?.status ?? 500, data: { message: 'Rate limit retries exhausted' } };
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
  return `[${timestamp}] ${author}: ${content}${attachments}${embeds}`;
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
  const url = `${DISCORD_API}${path}`;

  const form = new FormData();
  form.append('payload_json', JSON.stringify(payload));
  form.append('files[0]', new Blob([fileData], { type: contentType }), fileName);

  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bot ${token}`,
        'User-Agent': 'CloudDiscord/1.0',
      },
      body: form,
    });

    lastResponse = res;

    if (res.status === 429) {
      const retryData = await res.json() as { retry_after?: number };
      const retryAfter = (retryData.retry_after ?? 1) * 1000;
      await new Promise(r => setTimeout(r, retryAfter));
      continue;
    }

    if (res.status === 204) {
      return { ok: true, status: 204, data: null };
    }

    const data = await res.json();
    return { ok: res.ok, status: res.status, data };
  }

  return { ok: false, status: lastResponse?.status ?? 500, data: { message: 'Rate limit retries exhausted' } };
}

// Fetch image attachment as base64 data URI
export async function fetchImageAsBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
  const buffer = await res.arrayBuffer();
  const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
  const contentType = res.headers.get('content-type') || 'image/png';
  return `data:${contentType};base64,${base64}`;
}
