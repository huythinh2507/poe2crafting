import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
await p.goto('http://localhost:5173/?group=1&class=4&item=3408');
await p.waitForSelector('#itemBox');
const top = () => p.$$eval('.currencies > .cur-wrap > .cur, .currencies > .cur', bs => bs.map(x => (x.disabled ? '(x)' : '') + x.innerText.replace(/[\n▾]/g, ' ').trim()));
console.log('top level:', await top());
await p.click('[data-family] >> nth=0');
console.log('open dropdown:', await p.$$eval('.cur-wrap.open .cur-drop .cur', bs => bs.map(x => x.innerText.replace(/\n/g, ' '))));
await p.screenshot({ path: 'recon/dropdown.png', clip: { x: 100, y: 500, width: 1100, height: 330 } });
await p.click('.cur-wrap.open .cur-drop .cur:has-text("Greater")');
console.log('selected:', await p.evaluate(() => window.__craft.S.method.handler), '| dropdown closed:', await p.locator('.cur-wrap.open').count() === 0, '| group highlighted:', await p.locator('.has-drop.active').count());
await p.click('#itemBox');
console.log('applied greater transmutation ->', await p.evaluate(() => { const i = window.__craft.S.item; return i.rarity + ' mod lvl ' + window.__craft.DB.mods.get(i.mods[0].id).minlvl; }));
// every family (augmentation, regal, chaos, exalted) is grouped
const fams = await p.$$eval('[data-family]', bs => bs.map(x => x.innerText.replace(/[\n▾]/g, ' ').trim()));
console.log('families:', fams);
// click-outside closes
await p.click('[data-family]:not([disabled]) >> nth=0'); console.log('opened:', await p.locator('.cur-wrap.open').count()); await p.click('h2 >> nth=0');
console.log('outside click closes:', await p.locator('.cur-wrap.open').count() === 0);
console.log(errs.join('\n') || 'no errors');
await b.close();
