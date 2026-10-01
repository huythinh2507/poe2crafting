import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1500, height: 1100 } });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
let dialogs = []; let answer = true;
p.on('dialog', async d => { dialogs.push(d.message()); answer ? await d.accept() : await d.dismiss(); });
const view = () => p.evaluate(() => { const S = window.__craft.S; return `group=${S.group} class=${S.cls?.id ?? null} base=${S.base?.id ?? null} | group chips shown=${document.querySelectorAll('[data-group]').length} class chips shown=${document.querySelectorAll('[data-class]').length} bases listed=${document.querySelectorAll('.base').length} | crafting area hidden=${document.querySelector('#craft').hidden}`; });
const crumbTop = () => p.locator('#craft .psec, #craft #currencies').first().evaluate(e => Math.round(e.getBoundingClientRect().top));

await p.goto('http://localhost:5173/?group=8&class=90&item=3644');
await p.waitForSelector('#itemBox');
console.log('1. item chosen  :', await view());
console.log('   breadcrumb   :', await p.$$eval('.crumb', cs => cs.map(c => c.innerText.trim())), '| crafting area starts at y =', await p.evaluate(() => Math.round(document.querySelector('#currencies').getBoundingClientRect().top)));

// untouched item: no confirmation
await p.click('[data-crumb="class"]');
console.log('2. click class crumb (untouched item), dialogs:', dialogs.length, '|', await view());
await p.locator('.base').first().click(); await p.waitForSelector('#itemBox');

// crafted item: confirm; dismiss keeps everything
await p.locator('.cur:has-text("Orb of Alchemy")').click(); await p.click('#itemBox');
answer = false; dialogs = [];
await p.click('[data-crumb="group"]');
console.log('3. crafted item, click group crumb, answer Cancel -> dialog:', JSON.stringify(dialogs[0]), '|', await view(), '| item still crafted:', await p.evaluate(() => window.__craft.S.item.rarity));
answer = true; dialogs = [];
await p.click('[data-crumb="group"]');
console.log('4. same, answer OK -> dialogs:', dialogs.length, '|', await view());
console.log('   group row back:', await p.locator('[data-group]').count() > 0, '| class cleared (no class chips):', await p.locator('[data-class]').count() === 0);

// pick another group + class + base
await p.click('[data-group="7"]'); await p.click('[data-class="54"]'); await p.locator('.base').first().click(); await p.waitForSelector('#itemBox');
console.log('5. picked One Hand Swords:', await view(), '| crumbs:', await p.$$eval('.crumb', cs => cs.map(c => c.innerText.trim())));

// Change on a crafted item also asks; on an untouched one it does not
dialogs = [];
await p.click('#change');
console.log('6. Change on untouched item, dialogs:', dialogs.length, '|', await view());
await p.locator('.base').nth(2).click(); await p.waitForSelector('#itemBox');
await p.locator('.cur:has-text("Orb of Alchemy")').click(); await p.click('#itemBox');
answer = false; await p.click('#change');
console.log('7. Change on crafted item + Cancel -> dialogs:', dialogs.length, '| still on the item:', await p.locator('#itemBox').count() === 1);
answer = true; await p.click('#change');
console.log('   Change + OK ->', await view());

// omens/held currency dropped on switch, Reset still works
await p.locator('.base').first().click(); await p.waitForSelector('#itemBox');
await p.click('#reset');
console.log('8. top Reset:', await view());
console.log(errs.join('\n') || 'no errors');
await b.close();
