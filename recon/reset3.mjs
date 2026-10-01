import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:5173/?group=8&class=90&item=3644');
await p.waitForSelector('#itemBox');
const snap = () => p.evaluate(async () => { const c = window.__craft, E = await import('/js/engine.js'); return `rarity=${c.S.item.rarity} held=${c.S.method ? c.S.method.handler : 'none'} omens=[${[...E.ctx.omens]}] cursorIcon=${document.querySelector('#cursorIcon').hidden ? 'hidden' : 'visible'} activeChips=${document.querySelectorAll('[data-omen].active').length} activeCurrency=${document.querySelectorAll('.cur.active').length}`; });
for (const sel of ['#resetItem']) { // the top Reset clears the whole selection: see reset-all.mjs
  await p.click('[data-tab="Currencies"]');
  await p.locator('.cur:has-text("Orb of Alchemy")').click(); await p.click('#itemBox');
  await p.click('[data-family]:has-text("Chaos Orb")'); await p.locator('.cur-wrap.open .cur-drop .cur').first().click();
  await p.click('[data-omen="whittling"]'); await p.click('[data-omen="erasure_prefix"]');
  await p.locator('#itemBox').scrollIntoViewIfNeeded();
  const bx = await p.locator('#itemBox').boundingBox();
  await p.mouse.move(bx.x + 80, bx.y + 100);  // currency icon follows the pointer over the item
  console.log(sel.padEnd(11), 'before:', await snap());
  const l = p.locator(sel); await l.scrollIntoViewIfNeeded();
  const bb = await l.boundingBox();
  await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await p.mouse.down(); await p.mouse.up();
  console.log(' '.repeat(11), 'after: ', await snap());
}
// Change base also clears omens
await p.click('[data-tab="Currencies"]');
await p.locator('.cur:has-text("Orb of Alchemy")').click(); await p.click('#itemBox');
await p.click('[data-family]:has-text("Chaos Orb")'); await p.locator('.cur-wrap.open .cur-drop .cur').first().click();
await p.click('[data-omen="whittling"]');
await p.click('#change'); await p.locator('.base').first().click(); await p.waitForSelector('#itemBox');
console.log('new base:  ', await snap());
console.log(errs.join('\n') || 'no errors');
await b.close();
