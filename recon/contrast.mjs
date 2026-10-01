import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
await p.goto('http://localhost:5173/?group=8&class=90&item=3644');
await p.waitForSelector('#itemBox');
const lum = ([r, g, bl]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(bl); };
const rgb = s => s.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
const ratio = (fg, bg) => { const a = lum(rgb(fg)), c = lum(rgb(bg)); return ((Math.max(a, c) + 0.05) / (Math.min(a, c) + 0.05)).toFixed(1); };
const bg = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
const samples = { 'omens hint (calc-note/omens-note)': '.omens-note', 'armed label': null, 'fam tier count': '.fam-name small', 'item type line (Talismans)': '.item-body .kind', 'meta text on mods': null };
for (const [name, sel] of Object.entries(samples)) {
  if (!sel) continue;
  const c = await p.$eval(sel, e => getComputedStyle(e).color);
  console.log(name.padEnd(36), c.padEnd(22), 'contrast vs page', ratio(c, '#0d0b0a'));
}
await p.screenshot({ path: 'recon/contrast.png', clip: { x: 100, y: 330, width: 900, height: 330 } });
await b.close();
