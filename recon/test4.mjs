import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1500, height: 1200 } });
const errs = [];
p.on('pageerror', e => errs.push(e.message));
p.on('console', m => m.type() === 'error' && errs.push(m.text()));
await p.goto('http://localhost:5173/?group=1&class=4&item=3408');
await p.waitForSelector('#itemBox');
const tab = t => p.click(`[data-tab="${t}"]`);
const sub = v => p.click(`[data-sub="${v}"]`);
const btns = async () => p.$$eval('.cur', bs => bs.map(x => (x.disabled ? '(x)' : '') + x.innerText.replace(/\n/g, ' :: ')));
const use = async sel => { await p.locator(sel).first().click(); await p.click('#itemBox'); };
const mods = () => p.evaluate(() => JSON.stringify(window.__craft.S.item.mods.map(m => [window.__craft.DB.mods.get(m.id).key, !!m.crafted])));
const st = () => p.evaluate(() => { const i = window.__craft.S.item; return `${i.rarity} mods=${i.mods.length} sockets=${i.socketed.length}/${i.sockets}`; });

// Essences: lesser on magic
await use('.cur:has-text("Orb of Transmutation") >> nth=0');
await tab('Essences'); await sub(0);
console.log('lesser list:', (await btns()).length, (await btns()).slice(0, 3));
await p.locator('.cur:not([disabled])').first().click(); await p.click('#itemBox');
console.log('after lesser essence:', await st(), await mods());

// Alloys on rare
await sub(5);
console.log('alloy list (class 4):', await btns());
await p.locator('.cur:not([disabled])').first().click(); await p.click('#itemBox');
console.log('after alloy:', await st(), await mods());
console.log('alloys now:', await btns());
await p.screenshot({ path: 'recon/mine4a.png' });

// Perfect essence blocked while crafted exists
await sub(3);
console.log('perfect (should be disabled):', (await btns()).slice(0, 2));

// Socketables
await tab('Socketables');
console.log('special rune count:', (await btns()).length);
await sub('Runes');
console.log('runes:', (await btns()).length, (await btns()).slice(0, 2));
await p.locator('.cur:not([disabled])').first().click(); await p.click('#itemBox');
await p.locator('.cur:not([disabled])').first().click(); await p.click('#itemBox');
console.log('after 2 sockets:', await st());
console.log('third rune enabled?', (await btns()).filter(x => !x.startsWith('(x)')).length, '(expect 0)');
console.log((await p.innerText('#tooltip')).split('\n').filter(l => /●|○|Rune|Soul|Alloy|Corrupt/.test(l)).join(' | '));
await p.screenshot({ path: 'recon/mine4b.png' });

// legacy limit: reset, try two legacy runes
await p.click('#resetItem');
await tab('Socketables'); await sub('Special runes');
await p.fill('#socketSearch', 'Legacy of');
const legacy = await btns();
console.log('legacy fits body armour:', legacy.length);
if (legacy.length) {
  await p.locator('.cur:not([disabled])').first().click(); await p.click('#itemBox');
  console.log('after 1 legacy, enabled legacy left:', (await btns()).filter(x => !x.startsWith('(x)')).length, '(expect 0: limit 1)');
}
console.log(errs.join('\n') || 'no errors');
await b.close();
