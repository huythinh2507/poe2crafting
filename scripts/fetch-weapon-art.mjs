// Download weapon base art that plain HTTP requests can't get (poe2db's CDN wants a poe2db.tw referer).
// Fetches from inside a real poe2db page so the browser sends the right headers.
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const raw = JSON.parse(fs.readFileSync(path.join(root, 'public/data/data.json'), 'utf8'));
const classes = new Set([...(raw.classes.bygroup[7] || []), ...(raw.classes.bygroup[8] || [])]);
const out = rel => path.join(root, 'public/assets/items', rel + '.webp');

const todo = [...new Set(raw.items.entries
  .filter(i => classes.has(i.class) && i.domain === 1 && i.drop && i.image)
  .map(i => i.image.replace(/^Art\/2DItems\//, '')))].filter(rel => !fs.existsSync(out(rel)));
console.log(`${todo.length} weapon images to fetch`);

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('https://poe2db.tw/us/One_Hand_Swords', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(2500);

let ok = 0; const miss = [];
for (let i = 0; i < todo.length; i += 8) {
  const batch = todo.slice(i, i + 8);
  const res = await page.evaluate(async rels => Promise.all(rels.map(async rel => {
    try {
      const r = await fetch(`https://cdn.poe2db.tw/image/Art/2DItems/${rel}.webp`);
      if (!r.ok) return [rel, null];
      const buf = new Uint8Array(await r.arrayBuffer());
      const head = String.fromCharCode(...buf.slice(0, 4)) + String.fromCharCode(...buf.slice(8, 12));
      if (head !== 'RIFFWEBP') return [rel, null];
      let bin = ''; for (let k = 0; k < buf.length; k += 8192) bin += String.fromCharCode(...buf.subarray(k, k + 8192));
      return [rel, btoa(bin)];
    } catch { return [rel, null]; }
  })), batch);
  for (const [rel, b64] of res) {
    if (!b64) { miss.push(rel); continue; }
    fs.mkdirSync(path.dirname(out(rel)), { recursive: true });
    fs.writeFileSync(out(rel), Buffer.from(b64, 'base64'));
    ok++;
  }
}
console.log(`fetched ${ok}, missing ${miss.length}`, miss.slice(0, 10));
await browser.close();
