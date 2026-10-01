import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
await p.goto('http://localhost:5173/'); await p.waitForFunction(() => window.__craft);
for (const [name, cls] of [['Iron Ring', 33], ['Lunar Amulet', 34]]) {
  const id = await p.evaluate(n => [...window.__craft.DB.items.values()].find(i => window.__craft.DB.text(i.label) === n && i.domain === 1).id, name);
  await p.goto(`http://localhost:5173/?group=5&class=${cls}&item=${id}`); await p.waitForSelector('#itemBox');
  await p.locator('[data-tab=Essences]').click();
  const subs = await p.locator('.chips.sub .chip').allInnerTexts();
  console.log(name, 'subtabs', subs);
  for (const s of await p.locator('.chips.sub .chip').all()) {
    await s.click();
    const names = await p.locator('#currencies .cur').allInnerTexts();
    const dis = await p.locator('#currencies .cur[disabled]').count();
    console.log('  ', (await s.innerText()).padEnd(12), names.map(n => n.split('\n')[0]).join(' | '), `(disabled ${dis})`);
  }
}
await b.close();
