import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1500, height: 1400 } });
const errs = [];
p.on('pageerror', e => errs.push(e.message));
p.on('console', m => m.type() === 'error' && errs.push(m.text()));
await p.goto('http://localhost:5173/?group=1&class=4&item=3408');
await p.waitForSelector('#itemBox');
const tab = t => p.click(`[data-tab="${t}"]`);
const omens = () => p.$$eval('[data-omen]', os => os.map(o => (o.classList.contains('active') ? '[x]' : '[ ]') + o.innerText.replace(/\n/g, ' ')));

await p.locator('.cur:has-text("Orb of Alchemy")').click(); await p.click('#itemBox');
// pick Chaos, no omen yet
await p.click('[data-family]:has-text("Chaos Orb")'); await p.click('.cur-wrap.open .cur-drop .cur >> nth=0');
console.log('omens offered for Chaos:', await omens());
console.log('targets panel before omen:', await p.locator('.targets').count());

// Whittling on
await p.click('[data-omen="whittling"]');
const lvls = await p.evaluate(() => window.__craft.S.item.mods.map(m => window.__craft.DB.mods.get(m.id).minlvl));
console.log('mod levels on item:', lvls);
console.log('highlighted:', await p.locator('.mod.target').count(), '| panel:', (await p.innerText('.targets')).replace(/\n/g, ' / '));
await p.screenshot({ path: 'recon/omens1.png' });

// Whittling + Sinistral Erasure
await p.click('[data-omen="erasure_prefix"]');
console.log('with prefix erasure panel:', (await p.innerText('.targets')).replace(/\n/g, ' / '));

// apply: omens consumed, lowest removed
const lowest = Math.min(...(await p.evaluate(() => window.__craft.S.item.mods.filter(m => window.__craft.DB.mods.get(m.id).group && true).map(m => window.__craft.DB.mods.get(m.id).minlvl))));
await p.click('#itemBox');
console.log('after chaos, omens still active:', (await omens()).filter(o => o.startsWith('[x]')));
console.log('log head:', (await p.innerText('#log')).split('\n').slice(0, 5).join(' | '));

// Light with nothing desecrated -> feedback, omen kept
await p.locator('[data-tab="Currencies"]').click();
await p.locator('.cur:has-text("Orb of Annulment")').click();
await p.click('[data-omen="light"]');
await p.click('#itemBox');
console.log('Light with no target ->', (await p.innerText('#log')).split('\n').slice(0, 3).join(' | '), '| light still on:', (await omens()).some(o => o.startsWith('[x]') && /Light/.test(o)));

// desecrate then Light removes it
await tab('Desecrate');
await p.locator('.cur:has-text("Preserved Rib")').click(); await p.click('#itemBox');
await p.locator('[data-tab="Currencies"]').click();
await p.locator('.cur:has-text("Orb of Annulment")').click();
if (!(await omens()).some(o => o.startsWith('[x]') && /Light/.test(o))) await p.click('[data-omen="light"]');
console.log('Light targets:', (await p.innerText('.targets')).replace(/\n/g, ' / '));
await p.click('#itemBox');
console.log('after Light:', await p.evaluate(() => JSON.stringify({ unrevealed: window.__craft.S.item.unrevealed.length, mods: window.__craft.S.item.mods.length })));
await p.screenshot({ path: 'recon/omens2.png' });
console.log(errs.join('\n') || 'no errors');
await b.close();
