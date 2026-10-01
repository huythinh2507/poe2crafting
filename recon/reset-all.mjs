import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1500, height: 1100 } });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
await p.goto('http://localhost:5173/?group=8&class=90&item=3644');
await p.waitForSelector('#itemBox');
const snap = () => p.evaluate(async () => { const c = window.__craft, E = await import('/js/engine.js'); return `group=${c.S.group} class=${c.S.cls?.id ?? null} base=${c.S.base?.id ?? null} item=${c.S.item ? c.S.item.rarity + '/' + c.S.item.mods.length : null} held=${c.S.method?.handler ?? 'none'} omens=[${[...E.ctx.omens]}] url=${location.search || '(empty)'}`; });

// craft something, arm a currency and an omen, then hit the top Reset
await p.locator('.cur:has-text("Orb of Alchemy")').click(); await p.click('#itemBox');
await p.click('[data-family]:has-text("Chaos Orb")'); await p.locator('.cur-wrap.open .cur-drop .cur').first().click();
await p.click('[data-omen="whittling"]');
console.log('before:', await snap());
await p.click('#reset');
console.log('top Reset:', await snap());
console.log('  back at the first screen:', await p.locator('#picker .chip').count() > 0, '| selected-base bar gone:', await p.locator('#selected').innerText() === '' , '| craft area hidden:', await p.locator('#craft').isHidden());
console.log('  group chips none active:', await p.locator('[data-group].active').count() === 0, '| no class chips shown:', await p.locator('[data-class]').count() === 0);

// pick again works, and Reset item keeps the base
await p.click('[data-group="8"]'); await p.click('[data-class="90"]'); await p.locator('.base').first().click();
await p.waitForSelector('#itemBox');
await p.locator('.cur:has-text("Orb of Alchemy")').click(); await p.click('#itemBox');
console.log('re-picked + crafted:', await snap());
await p.click('#resetItem');
console.log('Reset item (under the item):', await snap());
console.log(errs.join('\n') || 'no errors');
await b.close();
