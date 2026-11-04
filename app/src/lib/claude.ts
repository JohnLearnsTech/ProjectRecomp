// Calls Claude with the person's own Anthropic key, straight from the phone. The key is read
// from SecureStore for each call and sent only to Anthropic; nothing passes through Recomp's
// servers, so the owner pays for nobody's use (reference/00-BUILD-PLAN.md).
import Anthropic from '@anthropic-ai/sdk';
import { AiError } from '../domain/ai';

export const MODEL = 'claude-opus-5-5';

// Where the key comes from. lib/ai.ts points this at SecureStore; tests pass a key directly.
let keySource: () => Promise<string | null> = async () => null;
export const setKeySource = (f: () => Promise<string | null>) => { keySource = f; };

type Opts = {
  images?: { base64: string; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' }[];
  effort?: 'low' | 'medium' | 'high';
  maxTokens?: number;
  timeoutMs?: number;
  /** Injected in tests. */
  fetch?: typeof fetch;
  apiKey?: string;
};

function client(apiKey: string, o: Opts) {
  return new Anthropic({
    apiKey,
    // Pinned so no environment variable can send a user's key anywhere else.
    baseURL: 'https://api.anthropic.com',
    // A phone app holding its user's own key is exactly the bring-your-own-key case; the
    // SDK's browser guard is about shipping a developer's key to strangers.
    dangerouslyAllowBrowser: true,
    maxRetries: 2,
    timeout: o.timeoutMs ?? 120000,
    ...(o.fetch ? { fetch: o.fetch } : {}),
  });
}

/** r19 sampler.json(): one prompt (plus photos) in, parsed JSON out. */
export async function askJson(prompt: string, o: Opts = {}): Promise<unknown> {
  const apiKey = o.apiKey ?? (await keySource());
  if (!apiKey) throw new AiError('no_key');
  const content: Anthropic.Beta.BetaContentBlockParam[] = [
    ...(o.images ?? []).map((im) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: im.mediaType, data: im.base64 } })),
    { type: 'text', text: prompt },
  ];
  let res: Anthropic.Beta.BetaMessage;
  try {
    res = await client(apiKey, o).beta.messages.create({
      model: MODEL,
      max_tokens: o.maxTokens ?? 16000,
      // Server-side fallback: if a safety classifier declines, the API retries on a
      // suitable model inside the same call instead of failing.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: o.effort ?? 'medium' },
      messages: [{ role: 'user', content }],
    });
  } catch (e) {
    throw mapError(e, !!o.images?.length);
  }
  if (res.stop_reason === 'refusal') throw new AiError('refusal');
  const text = res.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text').map((b) => b.text).join('').trim();
  const parsed = parseJson(text);
  if (parsed === undefined) throw new AiError('invalid_json');
  return parsed;
}

/** The prompts ask for JSON only; tolerate a code fence or a sentence around it. */
export function parseJson(text: string): unknown {
  const tryParse = (s: string) => { try { return JSON.parse(s); } catch { return undefined; } };
  let v = tryParse(text);
  if (v !== undefined) return v;
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) { v = tryParse(fence[1].trim()); if (v !== undefined) return v; }
  const starts = [text.indexOf('['), text.indexOf('{')].filter((i) => i >= 0);
  if (!starts.length) return undefined;
  const a = Math.min(...starts), close = text[a] === '[' ? ']' : '}', b = text.lastIndexOf(close);
  return b > a ? tryParse(text.slice(a, b + 1)) : undefined;
}

function mapError(e: unknown, hadImages: boolean): AiError {
  if (e instanceof AiError) return e;
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return new AiError('bad_key');
  if (e instanceof Anthropic.RateLimitError) return new AiError('rate_limited');
  if (e instanceof Anthropic.APIConnectionTimeoutError) return new AiError('timeout');
  if (e instanceof Anthropic.BadRequestError && hadImages) return new AiError('image_rejected');
  if (e instanceof Anthropic.APIError && (e.status === 529 || e.status === 503)) return new AiError('overloaded');
  if (e instanceof Anthropic.APIConnectionError) return new AiError('network');
  return new AiError('network', e instanceof Error ? e.message : String(e));
}

/** Checks a key without spending tokens: the Models API answers only for a valid key. */
export async function checkKey(apiKey: string, f?: typeof fetch) {
  try { await client(apiKey, { fetch: f, timeoutMs: 20000 }).models.retrieve(MODEL); return null; }
  catch (e) { return mapError(e, false); }
}
