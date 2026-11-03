// Pulls the static data tables out of reference/app/recomp.html (r19) into JSON so the
// native app uses exactly the web app's values. Re-run after updating the reference app:
//   node scripts/extract-r19-data.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('..', import.meta.url).pathname;
const html = readFileSync(root + 'reference/app/recomp.html', 'utf8');

// Grab `var NAME = <literal>;` by bracket matching from the first [ or {.
function literal(name) {
  const at = html.indexOf(`var ${name} = `);
  if (at < 0) throw new Error(`${name} not found`);
  let i = html.indexOf('=', at) + 1;
  while (/\s/.test(html[i])) i++;
  const open = html[i], close = open === '[' ? ']' : '}';
  let depth = 0, inStr = null, j = i;
  for (; j < html.length; j++) {
    const c = html[j];
    if (inStr) { if (c === '\\') j++; else if (c === inStr) inStr = null; continue; }
    if (c === '"' || c === "'") inStr = c;
    else if (c === '/' && html[j + 1] === '/') { j = html.indexOf('\n', j); }
    else if (c === open) depth++;
    else if (c === close && --depth === 0) break;
  }
  return vm.runInNewContext('(' + html.slice(i, j + 1) + ')');
}

const out = {
  foods: literal('FOODS'),
  lifts: literal('LIFTS_DEFAULT'),
  names: literal('NAMES_DEFAULT'),
  quotes: literal('LINES'),
  mobPre: literal('MOB_PRE'),
  mobPost: literal('MOB_POST'),
  floors: literal('FLOORS'),
};
const ver = (html.match(/20\d\d-\d\d-\d\d r\d+/) || ['unknown'])[0];
for (const [k, v] of Object.entries(out)) {
  writeFileSync(`${root}app/src/domain/data/${k}.json`, JSON.stringify(v, null, 1) + '\n');
  console.log(k, Array.isArray(v) ? v.length : Object.keys(v).length);
}
writeFileSync(`${root}app/src/domain/data/SOURCE.md`, `Generated from reference/app/recomp.html (${ver}) by scripts/extract-r19-data.mjs. Do not edit by hand.\n`);
