import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1500, height: 1100 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:5173/'); await p.waitForFunction(() => window.__craft);
console.log(JSON.stringify(await p.evaluate(async () => {
  const E = await import('/js/engine.js'), D = await import('/js/data.js'); const { DB } = D;
  const out = {}; const t = (k, ok, d = '') => { out[k] = (ok ? 'PASS ' : 'FAIL ') + d; };
  const nameOf = e => DB.text(DB.items.get(e.item)?.label);
  const find = n => DB.raw.socketables.entries.find(e => nameOf(e) === n);
  const mk = (cls, n = 3) => { const it = E.newItem(D.basesOfClass(cls).pop(), 100); it.sockets = n; return it; };
  const sock = (it, name, slot) => E.applyMethod(it, { handler: 'poe2_socketable', socket: find(name), slot, properties: [], constraints: [] });
  const MW = find('Masterwork Rune');
  const mw = (it, slot) => E.applyMethod(it, { handler: 'poe2_socketable', socket: MW, slot, properties: [], constraints: [] });
  const usable = it => E.socketSlots(it, MW).length > 0;
  const names = it => it.socketed.map(s => s.name);

  let it = mk(54);   // one-handed sword
  t('M0 nothing socketed: Masterwork unusable', !usable(it) && mw(it) === null);
  sock(it, 'Lesser Iron Rune');
  t('M1 a Lesser rune makes it usable', usable(it));
  const phys = x => Math.round(E.itemStats(x).damage.physical.final[1] * 100) / 100;
  const seq = [phys(it)]; const chain = [names(it)[0]];
  for (let i = 0; i < 4; i++) { const r = mw(it, 0); chain.push(r ? names(it)[0] : '(refused)'); seq.push(phys(it)); }
  t('M2 Lesser > Normal > Greater > Perfect, then refused', JSON.stringify(chain) === JSON.stringify(['Lesser Iron Rune', 'Iron Rune', 'Greater Iron Rune', 'Perfect Iron Rune', '(refused)']), chain.join(' > '));
  t('M3 the upgraded rune\'s stat reaches the item (phys damage rises each tier)', seq[0] < seq[1] && seq[1] < seq[2] && seq[2] < seq[3] && seq[3] === seq[4], seq.join(' < '));
  t('M4 Masterwork never takes a socket', names(it).length === 1 && !names(it).includes('Masterwork Rune'));
  t('M5 Perfect only: Masterwork unusable', !usable(it));

  // several runes: explicit slot required, other sockets untouched
  it = mk(54); sock(it, 'Greater Iron Rune'); sock(it, 'Desert Rune'); sock(it, 'Greater Body Rune');
  t('M6 two upgradable runes + no slot: refused', mw(it) === null && JSON.stringify(names(it)) === '["Greater Iron Rune","Desert Rune","Greater Body Rune"]');
  mw(it, 2);
  t('M7 explicit slot upgrades only that rune', JSON.stringify(names(it)) === '["Greater Iron Rune","Desert Rune","Perfect Body Rune"]', names(it).join(','));
  t('M8 targetable sockets listed', JSON.stringify(E.socketSlots(it, MW)) === '[0,1]', JSON.stringify(E.socketSlots(it, MW)));
  // single upgradable rune and no slot given: it is used
  it = mk(54); sock(it, 'Greater Mind Rune'); sock(it, 'Perfect Iron Rune');
  mw(it); t('M9 only one candidate: used without a slot', names(it)[0] === 'Perfect Mind Rune');

  // every family: Greater -> Perfect where a Perfect exists, never for special runes
  const fam = {}; let upgraded = 0, refused = 0, wrong = [];
  for (const e of DB.raw.socketables.entries) {
    const n = nameOf(e); if (e.classify?.[0] !== 'rune' || n.startsWith('[DNT') || e === MW) continue;
    for (const cls of [54, 4, 33, 25]) {
      const x = mk(cls); if (!E.socketEffect(x, e) || !sock(x, n)) continue;
      const next = E.nextRuneTier(e); const r = mw(x, 0);
      if (!!r !== !!next) wrong.push(n); else (r ? upgraded++ : refused++);
      if (r && !/^(Lesser |Greater |Perfect )?/.test(names(x)[0])) wrong.push('bad ' + n);
      break;
    }
  }
  t('F1 every rune upgrades iff its family has the next tier', wrong.length === 0, `${upgraded} upgraded, ${refused} refused; mismatches: ${wrong.slice(0, 5).join(', ')}`);
  const tempered = find('Greater Tempered Rune'); if (tempered) { const x = mk(54); const ok = E.socketEffect(x, tempered) && sock(x, 'Greater Tempered Rune'); t('F2 Greater Tempered Rune has no Perfect: refused', !ok || mw(x, 0) === null); }
  // bound special rune is not upgradable
  const x2 = mk(4, 1); sock(x2, "Medved's Tending"); t('F3 special / bound runes are not upgradable', !usable(x2));
  return out; }), null, 1));

// ---- UI: select Masterwork, click the socket
await p.goto('http://localhost:5173/?group=7&class=54'); await p.waitForSelector('[data-base]');
await p.locator('[data-base]').first().click(); await p.waitForSelector('#itemBox');
await p.evaluate(() => { const c = window.__craft; c.S.item.sockets = 3; });
await p.click('[data-tab="Socketables"]'); await p.click('[data-sub="Runes"]');
await p.fill('#socketSearch', 'Greater Iron'); await p.waitForTimeout(150);
await p.locator('.cur:not([disabled])').filter({ hasText: /^\s*Greater Iron Rune/ }).first().click(); await p.click('#itemBox');
await p.click('[data-sub="Special runes"]'); await p.fill('#socketSearch', 'Masterwork'); await p.waitForTimeout(150);
const mwBtn = p.locator('.cur').filter({ hasText: /Masterwork Rune/ }).first();
console.log('UI masterwork enabled:', !(await mwBtn.isDisabled()), '| hint:', (await mwBtn.getAttribute('title')));
await mwBtn.click(); await p.waitForTimeout(150);
console.log('UI targetable sockets:', await p.locator('.socket.target').count());
await p.locator('.socket').first().click(); await p.waitForTimeout(200);
console.log('UI socket now:', await p.$$eval('.socket.filled', s => s.map(x => x.title.split(':')[0])), '| log:', (await p.innerText('#log')).split('\n').slice(0, 3).join(' / '));
console.log('UI phys line:', await p.$$eval('#itemBox .prop', ps => ps.map(x => x.innerText).find(t => /Physical/.test(t))));
await p.screenshot({ path: 'recon/masterwork.png' });
console.log(errs.join('\n') || 'no errors');
await b.close();
