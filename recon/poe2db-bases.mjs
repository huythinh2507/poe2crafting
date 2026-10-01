import { chromium } from 'playwright';
import fs from 'fs';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1600, height: 1200 } });
await p.goto('https://poe2db.tw/us/Talismans', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForTimeout(4000);
const rows = await p.evaluate(() => {
  const out = [];
  for (const tr of document.querySelectorAll('table tr')) {
    const cells = [...tr.querySelectorAll('td')].map(td => td.innerText.replace(/\s+/g, ' ').trim());
    if (cells.length >= 3 && /Talisman/.test(cells.join(' '))) out.push(cells);
  }
  return out;
});
console.log(rows.length);
for (const r of rows.slice(0, 40)) console.log(JSON.stringify(r));
const html = await p.content();
fs.writeFileSync('recon/poe2db-talismans.html', html);
await b.close();
