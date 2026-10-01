import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:5173/');
await p.waitForFunction(() => window.__craft);
// Maji Talisman = Talismans class 90
const base = await p.evaluate(() => { const D = window.__craft.DB; return [...D.items.values()].find(i => D.text(i.label) === 'Maji Talisman')?.id; });
await p.goto(`http://localhost:5173/?group=8&class=90&item=${base}`);
await p.waitForSelector('#itemBox');
const st = () => p.evaluate(() => { const i = window.__craft.S.item; return `${i.rarity} mods=${i.mods.length} history=${window.__craft.S.history.length}`; });
await p.locator('.cur:has-text("Orb of Alchemy")').click();
await p.locator('#itemBox').scrollIntoViewIfNeeded();
let box = await p.locator('#itemBox').boundingBox();
await p.mouse.move(box.x + 100, box.y + 100);
await p.click('#itemBox');
console.log('after alchemy:', await st());
console.log('undo disabled?', await p.$eval('#undo', b => b.disabled));
// real mouse click on the Undo button while the currency is still selected
await p.locator('#undo').scrollIntoViewIfNeeded(); const ub = await p.locator('#undo').boundingBox();
console.log('undo box', ub, 'element at its centre:', await p.evaluate(({ x, y }) => { const e = document.elementFromPoint(x, y); return e.id || e.className || e.tagName; }, { x: ub.x + ub.width / 2, y: ub.y + ub.height / 2 }));
await p.mouse.click(ub.x + ub.width / 2, ub.y + ub.height / 2);
console.log('after clicking Undo:', await st(), '| selected method still:', await p.evaluate(() => window.__craft.S.method?.handler));
console.log(errs.join('\n') || 'no errors');
await b.close();
