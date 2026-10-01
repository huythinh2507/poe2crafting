import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1500, height: 1100 } });
const errs = [];
p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:5173/');
await p.waitForFunction(() => window.__craft);
// every droppable base: art file loads
const res = await p.evaluate(async () => {
  const { DB } = window.__craft; const bad = []; let n = 0; const seen = new Set();
  for (const i of DB.items.values()) {
    if (i.domain !== 1 || !i.drop) continue; n++;
    const src = 'assets/items/' + i.image.replace(/^Art\/2DItems\//, '') + '.webp';
    if (seen.has(src)) continue; seen.add(src);
    const ok = await new Promise(r => { const im = new Image(); im.onload = () => r(im.naturalWidth > 0); im.onerror = () => r(false); im.src = src; });
    if (!ok) bad.push(src);
  }
  return { bases: n, unique: seen.size, bad };
});
console.log(res);
// UI spot checks across classes
const cases = [['Rings'], ['Amulets'], ['Belts'], ['Quivers'], ['Foci'], ['Bucklers'], ['Body Armours (STR)'], ['Helmets (DEX/INT)'], ['Gloves (INT)'], ['Boots (STR/DEX)']];
for (const [name] of cases) {
  const r = await p.evaluate(async n => {
    const { DB } = window.__craft; const c = [...DB.classes.values()].find(c => DB.text(c.label) === n);
    return c ? { id: c.id, group: c.group } : null;
  }, name);
  if (!r) { console.log('no class', name); continue; }
  await p.goto(`http://localhost:5173/?group=${r.group}&class=${r.id}`);
  await p.waitForTimeout(500);
  const thumbs = await p.evaluate(() => [...document.querySelectorAll('.base-thumb-img')].map(i => i.complete && i.naturalWidth > 0));
  console.log(name.padEnd(22), 'thumbs', thumbs.length, 'loaded', thumbs.filter(Boolean).length);
}
await p.goto('http://localhost:5173/?group=1&class=' + (await p.evaluate(() => [...window.__craft.DB.classes.values()].find(c => window.__craft.DB.text(c.label) === 'Body Armours (STR)').id)));
await p.waitForTimeout(500);
await p.locator('.base').nth(5).click();
await p.waitForTimeout(500);
await p.screenshot({ path: 'recon/base-art.png' });
console.log(errs.length ? errs.join('\n') : 'no errors');
await b.close();
