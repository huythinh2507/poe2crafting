import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
await p.goto('https://huythinh2507.github.io/poe2crafting/?group=8&class=90&item=3644');
await p.waitForSelector('#itemBox');
const st = () => p.evaluate(() => { const S = window.__craft.S, i = S.item; return `${i.rarity} mods=${i.mods.length} unrev=${i.unrevealed.length} sockets=${i.socketed.length} q=${i.quality} corrupted=${i.corrupted} lock=${i.lock} hist=${S.history.length} log=${S.log.length} method=${S.method?.handler || 'none'}`; });
const craft = async () => {
  await p.locator('.cur:has-text("Orb of Alchemy")').click(); await p.click('#itemBox');
  await p.locator('.cur:has-text("Armourer")').first().click().catch(() => {});
};
for (const which of ['#resetItem', '#reset']) {
  await p.click('[data-tab="Currencies"]');
  await p.locator('.cur:has-text("Orb of Alchemy")').click(); await p.click('#itemBox');
  console.log(which.padEnd(11), 'before:', await st());
  const btn = p.locator(which);
  await btn.scrollIntoViewIfNeeded();
  const bb = await btn.boundingBox();
  const at = await p.evaluate(({ x, y }) => { const e = document.elementFromPoint(x, y); return (e && (e.id || e.className || e.tagName)) || 'null'; }, { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 });
  console.log('            element at button centre:', at);
  await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await p.mouse.down(); await p.mouse.up();
  console.log('            after click:', await st());
}
console.log(errs.join('\n') || 'no errors');
await b.close();
