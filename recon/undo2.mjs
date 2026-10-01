import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:5173/');
await p.waitForFunction(() => window.__craft);
const base = await p.evaluate(() => { const D = window.__craft.DB; return [...D.items.values()].find(i => D.text(i.label) === 'Maji Talisman')?.id; });
await p.goto(`http://localhost:5173/?group=8&class=90&item=${base}`);
await p.waitForSelector('#itemBox');
const snap = () => p.evaluate(() => JSON.stringify(window.__craft.S.item));
const info = () => p.evaluate(() => { const S = window.__craft.S; return `${S.item.rarity}/${S.item.mods.length} hist=${S.history.length}`; });
const states = [await snap()];
const steps = ['Orb of Transmutation', 'Orb of Augmentation', 'Regal Orb', 'Exalted Orb', 'Chaos Orb'];
for (const name of steps) {
  const fam = p.locator(`[data-family]:has-text("${name}")`);
  if (await fam.count()) { await fam.click(); await p.locator('.cur-wrap.open .cur-drop .cur').first().click(); }
  else await p.locator(`.cur:has-text("${name}")`).first().click();
  await p.locator('#itemBox').scrollIntoViewIfNeeded();
  const bx = await p.locator('#itemBox').boundingBox();
  await p.mouse.move(bx.x + 60, bx.y + 90); await p.mouse.move(bx.x + 80, bx.y + 100);
  await p.mouse.click(bx.x + 80, bx.y + 100);
  states.push(await snap());
  console.log('apply', name.padEnd(22), await info());
}
// undo each step with a REAL mouse click on the button, currency still selected, pointer path over the item first
for (let k = steps.length - 1; k >= 0; k--) {
  await p.locator('#undo').scrollIntoViewIfNeeded();
  const ub = await p.locator('#undo').boundingBox();
  const bx = await p.locator('#itemBox').boundingBox();
  await p.mouse.move(bx.x + 80, bx.y + 100);
  await p.mouse.move(ub.x + 10, ub.y + 8, { steps: 6 });
  await p.mouse.down(); await p.mouse.up();
  const now = await snap();
  console.log('undo', steps[k].padEnd(24), await info(), now === states[k] ? 'OK matches previous state' : 'MISMATCH');
}
console.log(errs.join('\n') || 'no errors');
await b.close();
