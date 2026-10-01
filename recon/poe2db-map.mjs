import { chromium } from 'playwright';
import fs from 'fs';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
await p.goto('https://poe2db.tw/us/Two_Hand_Swords', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForTimeout(4000);
const rows = await p.evaluate(() => {
  const out = [];
  for (const img of document.querySelectorAll('img')) {
    if (!/2DItems\/Weapons/i.test(img.src)) continue;
    let el = img, name = '';
    for (let k = 0; k < 6 && el; k++) { el = el.parentElement; const a = el?.querySelector('a[href]:not([href^="#"])'); if (a && a.innerText.trim()) { name = a.innerText.trim(); break; } }
    out.push(img.src.replace('https://cdn.poe2db.tw/image/', '') + '  <-  ' + name);
  }
  return out;
});
console.log(rows.length); console.log(rows.slice(0, 20).join('\n'));
fs.writeFileSync('recon/poe2db-2h.html', await p.content());
await b.close();
