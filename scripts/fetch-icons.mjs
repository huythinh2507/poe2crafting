// Download currency / essence / socketable / omen icons used by the UI into public/assets/items.
// Source: the same CDN path pattern craftofexile.com uses. Personal local use only (GGG art).
import fs from 'fs';
import path from 'path';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const raw = JSON.parse(fs.readFileSync(path.join(root, 'public/data/data.json'), 'utf8'));
const itemById = new Map(raw.items.entries.map(i => [i.id, i]));

const ids = new Set();
const walk = els => { for (const e of Array.isArray(els) ? els : []) { if (e.item != null) ids.add(e.item); walk(e.elements); } };
for (const m of raw.methods.crafting) walk(m.elements);
for (const e of raw.essences.entries) ids.add(e.item);
for (const e of raw.socketables.entries) ids.add(e.item);
for (const e of raw.methods.omens.entries) ids.add(e.item);
for (const i of raw.items.entries) if (/Hinekora/i.test(i.key)) ids.add(i.id);
for (const id of Object.keys(raw.emotions?.items || {})) ids.add(+id); // liquid emotions

// base item art for weapons: one-handed (group 7) and two-handed (group 8) classes
const weaponClasses = new Set([...(raw.classes.bygroup[7] || []), ...(raw.classes.bygroup[8] || [])]);
for (const i of raw.items.entries) if (weaponClasses.has(i.class) && i.domain === 1 && i.drop) ids.add(i.id);

const images = new Set();
for (const id of ids) { const img = itemById.get(id)?.image; if (img) images.add(img); }
console.log(`${ids.size} items, ${images.size} unique images`);

const out = rel => path.join(root, 'public/assets/items', rel + '.webp');
const todo = [...images].map(img => img.replace(/^Art\/2DItems\//, '')).filter(rel => !fs.existsSync(out(rel)));
console.log(`${todo.length} to download`);

// The CDNs answer unknown files with an HTML 200 page, so check for a real WebP (RIFF....WEBP).
const isWebp = buf => buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP';
const hosts = rel => [
  `https://beta.craftofexile.com/assets/poe2/items/${rel}.webp`,
  `https://cdn.poe2db.tw/image/Art/2DItems/${rel}.webp`,
];

// purge earlier bad downloads
for (const rel of [...images].map(i => i.replace(/^Art\/2DItems\//, ''))) {
  const f = out(rel);
  if (fs.existsSync(f) && !isWebp(fs.readFileSync(f))) fs.rmSync(f);
}
const todo2 = [...images].map(img => img.replace(/^Art\/2DItems\//, '')).filter(rel => !fs.existsSync(out(rel)));
// extras that have no item row in the data (Hinekora's Lock)
for (const extra of ['Currency/HinekorasLock']) if (!fs.existsSync(out(extra))) todo2.push(extra);
console.log(`${todo2.length} to (re)download`);

let ok = 0, miss = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (poe2crafting icon fetch)', Accept: 'image/webp,image/*' };
// poe2db first (it has item art for everything, CoE only has currencies), CoE as fallback
const order = rel => [hosts(rel)[1], hosts(rel)[0]];
async function grab(rel) {
  for (let attempt = 0; attempt < 3; attempt++) {
    for (const url of order(rel)) {
      try {
        const r = await fetch(url, { headers: HEADERS });
        if (!r.ok) continue;
        const buf = Buffer.from(await r.arrayBuffer());
        if (!isWebp(buf)) continue;
        fs.mkdirSync(path.dirname(out(rel)), { recursive: true });
        fs.writeFileSync(out(rel), buf);
        return true;
      } catch { /* retry */ }
    }
    await sleep(400 * (attempt + 1));
  }
  return false;
}
const queue = [...todo2];
await Promise.all(Array.from({ length: 4 }, async () => {
  while (queue.length) {
    const rel = queue.shift();
    if (await grab(rel)) ok++; else miss.push(rel);
  }
}));
console.log(`downloaded ${ok}, still missing ${miss.length}`, miss.slice(0, 8));
