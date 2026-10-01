import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1500, height: 1100 } });
await p.goto('http://localhost:5173/');
await p.waitForFunction(() => window.__craft);
const find = name => p.evaluate(n => { const c = window.__craft; const i = [...c.DB.items.values()].find(i => c.DB.text(i.label) === n && i.domain === 1); return { id: i.id, cls: i.class }; }, name);
for (const [name, file] of [['Dueling Wand', 'wand'], ['Cinderbark Talisman', 'tal']]) {
  const { id, cls } = await find(name);
  const grp = await p.evaluate(c => window.__craft.DB.classes.get(c).group, cls);
  await p.goto(`http://localhost:5173/?group=${grp}&class=${cls}&item=${id}`);
  await p.waitForSelector('#itemBox');
  await p.evaluate(() => { const c = window.__craft; c.S.item.quality = 20; c.S.item.ilvl = 84; c.renderCraft(); });
  console.log(file, (await p.locator('#itemBox .item-body').innerText()).replace(/\n+/g, ' | '));
  await p.locator('#tooltip').screenshot({ path: `recon/dps-${file}.png` });
}
await b.close();
