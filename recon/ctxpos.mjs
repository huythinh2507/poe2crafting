import { chromium } from 'playwright';
const b = await chromium.launch();
const errs = [];
for (const [w, h] of [[1500, 900], [1100, 700], [820, 900]]) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:5173/?group=8&class=90&item=3644');
  await p.waitForSelector('#itemBox');
  await p.evaluate(() => document.querySelectorAll('.fam:not(.ref) [data-add]')[0].click());
  await p.evaluate(() => document.querySelectorAll('.fam:not(.ref) [data-add]')[30].click());
  await p.evaluate(() => document.querySelectorAll('.fam:not(.ref) [data-add]')[40].click());
  const mods = p.locator('#itemBox .mod');
  const n = await mods.count();
  for (const i of [0, n - 1]) {
    await mods.nth(i).scrollIntoViewIfNeeded();
    await mods.nth(i).click({ button: 'right' });
    const r = await p.evaluate(() => {
      const m = document.querySelector('#ctxMenu').getBoundingClientRect(), box = document.querySelector('#itemBox').getBoundingClientRect();
      const t = document.querySelector('.ctx-target')?.getBoundingClientRect();
      const row = document.querySelector('.ctx-target').getBoundingClientRect(); const coversTarget = !(m.right <= row.left || m.left >= row.right || m.bottom <= row.top || m.top >= row.bottom);
      const overlap = !(m.right <= box.left || m.left >= box.right || m.bottom <= box.top || m.top >= box.bottom);
      return { menu: [Math.round(m.left), Math.round(m.top), Math.round(m.right), Math.round(m.bottom)], overlapsItem: overlap, coversClickedMod: coversTarget, insideWindow: m.left >= 0 && m.top >= 0 && m.right <= innerWidth && m.bottom <= innerHeight, targetOutlined: !!t };
    });
    console.log(`${w}x${h} mod ${i + 1}/${n}:`, JSON.stringify(r));
    await p.keyboard.press('Escape');
  }
  if (w === 1500) { await p.locator('#itemBox .mod').first().click({ button: 'right' }); await p.screenshot({ path: 'recon/ctxpos.png' }); }
  await p.close();
}
console.log(errs.join('\n') || 'no errors');
await b.close();
