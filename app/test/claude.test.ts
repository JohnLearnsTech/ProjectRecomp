/// <reference types="node" />
// The Claude client against a fake network: the request it sends and how it reads replies.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AiError } from '../src/domain/ai';
import { askJson, checkKey, MODEL, parseJson } from '../src/lib/claude';

type Call = { url: string; headers: Record<string, string>; body: any };
function fakeFetch(status: number, body: unknown, calls: Call[]) {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    const h: Record<string, string> = {};
    new Headers(init?.headers as HeadersInit).forEach((v, k) => { h[k] = v; });
    calls.push({ url: String(url), headers: h, body: init?.body ? JSON.parse(String(init.body)) : null });
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'request-id': 'req_1' } });
  }) as typeof fetch;
}
const msg = (text: string, stop = 'end_turn') => ({ id: 'msg_1', type: 'message', role: 'assistant', model: MODEL, stop_reason: stop, stop_details: null,
  content: [{ type: 'thinking', thinking: '', signature: 'x' }, { type: 'text', text }], usage: { input_tokens: 10, output_tokens: 20 } });

test('sends the prompt, photo, model, effort and server-side fallback with the user key', async () => {
  const calls: Call[] = [];
  const out = await askJson('Reply with JSON', { apiKey: 'sk-ant-test-key-000000000000', effort: 'low', images: [{ base64: 'AAAA', mediaType: 'image/jpeg' }], fetch: fakeFetch(200, msg('[{"name":"Dal","serving_g":150,"per100":{"kcal":110}}]'), calls) });
  assert.deepEqual(out, [{ name: 'Dal', serving_g: 150, per100: { kcal: 110 } }]);
  const c = calls[0];
  assert.match(c.url, /\/v1\/messages(\?beta=true)?$/);
  // SDK 1.x sends API keys as a bearer token (API version 2026-10-21).
  assert.equal(c.headers['authorization'], 'Bearer sk-ant-test-key-000000000000');
  assert.match(c.url, /^https:\/\/api\.anthropic\.com\//, 'always Anthropic, whatever the environment says');
  assert.match(c.headers['anthropic-beta'], /server-side-fallback-2026-07-01/);
  assert.equal(c.body.model, 'claude-opus-5-5');
  assert.equal(c.body.fallbacks, 'default');
  assert.deepEqual(c.body.output_config, { effort: 'low' });
  assert.equal(c.body.thinking, undefined, 'thinking is left to the model default (always on for Opus 5.5)');
  assert.equal(c.body.messages[0].content[0].type, 'image');
  assert.equal(c.body.messages[0].content[0].source.data, 'AAAA');
  assert.deepEqual(c.body.messages[0].content[1], { type: 'text', text: 'Reply with JSON' });
});

test('reads JSON wrapped in a fence or a sentence', () => {
  assert.deepEqual(parseJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJson('Here it is: [1,2,3] hope that helps'), [1, 2, 3]);
  assert.deepEqual(parseJson('{"headline":"ok"}'), { headline: 'ok' });
  assert.equal(parseJson('no json here'), undefined);
});

test('maps failures to the messages people see', async () => {
  const key = 'sk-ant-test-key-000000000000';
  const code = async (status: number, body: unknown, images = false) => {
    try { await askJson('x', { apiKey: key, fetch: fakeFetch(status, body, []), images: images ? [{ base64: 'A', mediaType: 'image/png' }] : [] }); return 'ok'; }
    catch (e) { return e instanceof AiError ? e.code : 'other:' + (e as Error).message; }
  };
  const err = (type: string) => ({ type: 'error', error: { type, message: type } });
  assert.equal(await code(401, err('authentication_error')), 'bad_key');
  assert.equal(await code(403, err('permission_error')), 'bad_key');
  assert.equal(await code(400, err('invalid_request_error'), true), 'image_rejected');
  assert.equal(await code(200, msg('', 'refusal')), 'refusal');
  assert.equal(await code(200, msg('I cannot produce JSON for that.')), 'invalid_json');
  try { await askJson('x', {}); assert.fail('should need a key'); } catch (e) { assert.equal((e as AiError).code, 'no_key'); }
});

test('checks a key against the Models API', async () => {
  const calls: Call[] = [];
  assert.equal(await checkKey('sk-ant-good', fakeFetch(200, { id: MODEL, type: 'model', display_name: 'Claude Opus 5.5', created_at: '2026-01-01T00:00:00Z' }, calls)), null);
  assert.match(calls[0].url, /\/v1\/models\/claude-opus-5-5/);
  assert.equal((await checkKey('sk-ant-bad', fakeFetch(401, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }, [])))?.code, 'bad_key');
});
