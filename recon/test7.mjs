import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1500, height: 1300 } });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
await p.goto('http://localhost:5173/?group=1&class=4&item=3408');
await p.waitForSelector('#itemBox');
const tab = t => p.click(`[data-tab="${t}"]`);
const rare = async () => { await p.click('#resetItem'); await tab('Currencies'); await p.locator('.cur:has-text("Orb of Alchemy")').click(); await p.click('#itemBox'); await tab('Desecrate'); };
const metas = () => p.$$eval('.reveal-opt .meta', os => os.map(o => o.innerText));

// lich pool composition for class 4
console.log(await p.evaluate(async () => {
  const d = await import('/js/data.js');
  return JSON.stringify(d.lichPool(4).map(e => e.affix[0] + ':' + e.faction + ':' + e.mod.minlvl));
}));

// Sovereign (Ulaman) + Dextral (suffix)
await rare();
await p.click('[data-omen="dextral"]');
await p.locator('.cur:has-text("Ancient Rib")').click(); await p.click('#itemBox');
await p.click('[data-omen="Ulaman"]');
const seen = new Set(); let n = 0;
for (let k = 0; k < 12; k++) { await p.click('[data-reveal="0"]'); for (const t of await metas()) { seen.add(t.split('·')[0].trim()); n++; } await p.click('#revealCancel'); }
console.log('Dextral+Sovereign: options', n, 'sources', [...seen]);
await p.click('[data-omen="Ulaman"]'); // off

// Gnawed @ ilvl 60
await rare();
await p.fill('#ilvl', '60'); await p.press('#ilvl', 'Tab');
await p.click('#resetItem'); await tab('Currencies'); await p.locator('.cur:has-text("Orb of Alchemy")').click(); await p.click('#itemBox'); await tab('Desecrate');
await p.locator('.cur:has-text("Gnawed Rib")').click(); await p.click('#itemBox');
await p.click('[data-reveal="0"]');
console.log('gnawed@60 options:', await metas());
await p.click('#revealCancel');
await p.click('#toggleDesec');
console.log((await p.innerText('#pool')).split('Desecrated pool')[1]?.slice(0, 700).replace(/\n/g, ' / '));

// Lich weight setting: weight 50000 -> lich dominate
await p.fill('#ilvl', '100'); await p.press('#ilvl', 'Tab');
await rare();
await p.click('[data-omen="dextral"]');
await p.locator('.cur:has-text("Preserved Rib")').click(); await p.click('#itemBox');
await p.fill('#lichWeight', '50000'); await p.press('#lichWeight', 'Tab');
let lich = 0, tot = 0;
for (let k = 0; k < 10; k++) { await p.click('[data-reveal="0"]'); for (const t of await metas()) { tot++; if (/Amanamu|Kurgal|Ulaman/.test(t)) lich++; } await p.click('#revealCancel'); }
console.log(`lichWeight=50000: lich options ${lich}/${tot}`);
await p.screenshot({ path: 'recon/mine7.png' });
console.log(errs.join('\n') || 'no errors');
await b.close();
