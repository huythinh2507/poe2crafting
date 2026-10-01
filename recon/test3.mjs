import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1500, height: 1100 } });
const errs = [];
p.on('pageerror', e => errs.push(e.message));
p.on('console', m => m.type() === 'error' && errs.push(m.text()));
await p.goto('http://localhost:5173/?group=1&class=4&item=3408');
await p.waitForSelector('#itemBox');
const enabled = async () => (await p.$$eval('.cur', bs => bs.filter(x => !x.disabled).map(x => x.innerText.split('\n')[0]))).join(' | ');
const sel = name => `.cur:has-text("${name}")`;
const use = async name => { await p.locator(sel(name)).first().click(); await p.click('#itemBox'); };
const S = () => p.evaluate(() => {
  const i = window.__craft.S.item;
  return JSON.stringify({ r: i.rarity, mods: i.mods.length, fr: i.mods.filter(m => m.fractured).length, q: i.quality, soc: i.sockets, cor: i.corrupted, ce: i.corruption.length, lock: i.lock });
});
console.log('normal  :', await enabled());
await use("Armourer's Scrap"); console.log('scrap   :', await S());
await use('Orb of Alchemy'); console.log('alchemy :', await S());
await use("Armourer's Scrap"); console.log('scrap(r):', await S());
await use('Fracturing Orb'); console.log('fracture:', await S());
console.log('post-frac enabled:', await enabled());
const fid = await p.evaluate(() => window.__craft.S.item.mods.find(m => m.fractured).id);
for (let k = 0; k < 20; k++) { await p.locator('.cur:text-is("Chaos Orb")').click(); await p.click('#itemBox'); }
console.log('fractured mod survives 20 chaos:', await p.evaluate(id => window.__craft.S.item.mods.some(m => m.id === id && m.fractured), fid));

await use("Hinekora's Lock"); console.log('lock    :', await S());
await p.locator('.cur:text-is("Chaos Orb")').click();
const previewMods = await p.evaluate(() => { const f = Object.values(window.__craft.S.foresee)[0]; return JSON.stringify(f.item.mods); });
console.log('preview text:', (await p.innerText('.foresee')).replace(/\n/g, ' / '));
await p.click('#itemBox');
const actual = await p.evaluate(() => JSON.stringify(window.__craft.S.item.mods));
console.log('preview == result:', previewMods === actual, '| after:', await S());
await p.screenshot({ path: 'recon/mine3.png' });

const outcomes = {};
for (let k = 0; k < 60; k++) {
  await p.evaluate(() => { window.__craft.S.item.corrupted = false; });
  await p.evaluate(() => window.__craft.apply(window.__craft.CATALOGUE.find(m => m.handler === 'poe2_vaal')));
  const t = await p.evaluate(() => window.__craft.S.log[0].changes.find(c => c.op === 'note')?.text);
  const key = (t || '?').replace(/\d+/g, 'N');
  outcomes[key] = (outcomes[key] || 0) + 1;
}
console.log('vaal x60:', outcomes);
console.log('corrupted -> enabled:', await enabled());
console.log(errs.join('\n') || 'no errors');
await b.close();
