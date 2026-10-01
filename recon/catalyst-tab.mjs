import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:5173/'); await p.waitForFunction(() => window.__craft);
for (const [name, grp, cls, expect] of [['Iron Ring', 5, 33, true], ['Utility Belt', 5, 35, false], ['Shortsword', 7, 52, false]]) {
  const id = await p.evaluate(n => { const c = window.__craft; const i = [...c.DB.items.values()].find(i => c.DB.text(i.label) === n && i.domain === 1); return i && i.id; }, name);
  if (!id) { console.log('no base', name); continue; }
  const cl = await p.evaluate(i => window.__craft.DB.items.get(i).class, id);
  const gr = await p.evaluate(c => window.__craft.DB.classes.get(c).group, cl);
  await p.goto(`http://localhost:5173/?group=${gr}&class=${cl}&item=${id}`); await p.waitForSelector('#itemBox');
  const has = (await p.locator('.tabs .chip').allInnerTexts()).includes('Catalysts');
  console.log(name.padEnd(14), 'Catalysts tab', has, has === expect ? 'PASS' : 'FAIL');
}
console.log(errs.length ? errs.join('\n') : 'no errors');
await b.close();
