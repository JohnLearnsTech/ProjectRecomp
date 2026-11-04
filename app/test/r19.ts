/// <reference types="node" />
// Pulls function and table source out of reference/app/recomp.html (r19) for the parity tests.
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../../reference/app/recomp.html', import.meta.url), 'utf8');

/** Source of `function name(...){...}` or `var name = ...;` by brace matching. */
export function src(name: string): string {
  let at = html.search(new RegExp(`\\n\\s*function ${name}\\(`));
  let isVar = false;
  if (at < 0) { at = html.search(new RegExp(`\\n\\s*var ${name}\\s*=`)); isVar = true; }
  if (at < 0) throw new Error('missing ' + name);
  at = html.indexOf(isVar ? 'var' : 'function', at);
  if (isVar && !/[[{]/.test(html.slice(html.indexOf('=', at) + 1).trimStart()[0])) return html.slice(at, html.indexOf(';', at) + 1);
  let i = html.indexOf(isVar ? (html.slice(html.indexOf('=', at) + 1).trimStart()[0]) : '{', isVar ? html.indexOf('=', at) : at);
  let depth = 0, str: string | null = null, re = false;
  for (; i < html.length; i++) {
    const c = html[i];
    if (str) { if (c === '\\') i++; else if (c === str) str = null; continue; }
    if (re) { if (c === '\\') i++; else if (c === '/') re = false; continue; }
    if (c === '"' || c === "'") str = c;
    else if (c === '/' && html[i + 1] === '/') i = html.indexOf('\n', i);
    else if (c === '/' && /[(,=:!&|?{};]\s*$/.test(html.slice(Math.max(0, i - 3), i))) re = true;
    else if (c === '{' || c === '[') depth++;
    else if ((c === '}' || c === ']') && --depth === 0) break;
  }
  return html.slice(at, i + 1) + (isVar ? ';' : '');
}

