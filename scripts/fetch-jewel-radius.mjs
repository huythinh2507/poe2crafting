// Scrape poe2db's Time-Lost jewel pages to learn which radius modifiers act on Small and which on Notable passives.
// Our game data lists them as plain stats ("#% increased Armour"); in game (and on poe2db) they read
// "Small Passive Skills in Radius also grant #% increased Armour". Writes public/data/jewel-radius.json:
// { "JewelRadiusArmour": "Small", "JewelRadiusAreaofEffect": "Notable", ... } keyed by our modifier key.
// Run: node scripts/fetch-jewel-radius.mjs
import fs from 'fs';
import { chromium } from 'playwright';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const SLUGS = ['Time-Lost_Ruby', 'Time-Lost_Emerald', 'Time-Lost_Sapphire', 'Time-Lost_Diamond'];
const data = JSON.parse(fs.readFileSync(root + 'public/data/data.json', 'utf8'));
const lang = JSON.parse(fs.readFileSync(root + 'public/data/english.json', 'utf8'));
const strip = s => (s || '').replace(/\[([^\]|]*)\|([^\]]*)\]/g, '$2').replace(/\[([^\]]*)\]/g, '$1');
// numbers and ranges become '#', signs before '#' go, case and spacing are ignored
const norm = s => s.replace(/\(\d+(\.\d+)?[—–-]\d+(\.\d+)?\)/g, '#').replace(/\d+(\.\d+)?/g, '#').replace(/[+-]#/g, '#').replace(/\s+/g, ' ').trim().toLowerCase();

const browser = await chromium.launch();
const page = await browser.newPage();
const lines = []; // { scope, text } exactly as poe2db prints them; the trailing tag run (e.g. "DamageAttack") is still attached
for (const slug of SLUGS) {
  await page.goto(`https://poe2db.tw/us/${slug}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);
  const text = await page.evaluate(() => document.body.innerText);
  for (const raw of text.split('\n')) {
    const m = raw.trim().match(/^(Small|Notable) Passive Skills in Radius also grant (.*)$/);
    if (m) lines.push({ scope: m[1], text: norm(m[2]) });
  }
  console.log(slug, 'lines so far', lines.length);
}
await browser.close();

// A radius modifier of ours matches a poe2db line when the line starts with its text and only a one-word tag run follows.
const scopeOf = ours => {
  const found = new Set(lines.filter(l => l.text === ours || (l.text.startsWith(ours + ' ') && /^([a-z]+|energy shield)$/.test(l.text.slice(ours.length + 1)))).map(l => l.scope));
  return found.size === 1 ? [...found][0] : found.size > 1 ? 'CONFLICT' : null;
};

const groups = new Map(data.modgroups.entries.map(g => [g.id, g]));
const out = {}, unmatched = [];
const TIME_LOST = new Set([76, 77, 78, 79]);
for (const m of data.mods.entries) {
  if (!/^JewelRadius/.test(m.key) || /Size$|NodeEffect$|NotableEffect/.test(m.key)) continue;   // radius size and "Effect of Small/Notable Passive Skills" already say it
  const inTimeLost = [...TIME_LOST].some(c => data.classmods[c]?.[m.id] > 0);
  if (!inTimeLost || !groups.get(m.group)?.type) continue;
  const ours = norm([...new Set(m.stats.map(s => strip(lang[s.label])))].join(' '));
  const scope = scopeOf(ours);
  if (scope === 'Small' || scope === 'Notable') out[m.key] = scope;
  else unmatched.push(`${m.key} (${scope || 'no match'}): ${ours}`);
}
fs.writeFileSync(root + 'public/data/jewel-radius.json', JSON.stringify(out, null, 1));
console.log(`matched ${Object.keys(out).length} radius modifiers (${Object.values(out).filter(s => s === 'Small').length} Small, ${Object.values(out).filter(s => s === 'Notable').length} Notable)`);
if (unmatched.length) console.log(`unmatched (${unmatched.length}):\n  ` + unmatched.join('\n  '));
