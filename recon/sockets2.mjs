import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1500, height: 1400 } });
const errs = [];
p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:5173/');
await p.waitForFunction(() => window.__craft);
const R = await p.evaluate(async () => {
  const E = await import('/js/engine.js'), D = await import('/js/data.js');
  const { DB } = D;
  const out = {};
  const t = (k, ok, d = '') => { out[k] = (ok ? 'PASS ' : 'FAIL ') + d; };
  const nameOf = e => DB.text(DB.items.get(e.item)?.label);
  const find = n => DB.raw.socketables.entries.find(e => nameOf(e) === n);
  const mk = (cls, sockets) => { const it = E.newItem(D.basesOfClass(cls).pop(), 100); it.sockets = sockets; return it; };
  const sock = (it, name, slot) => E.applyMethod(it, { handler: 'poe2_socketable', socket: find(name), slot, properties: [], constraints: [] });
  const names = it => it.socketed.map(s => s.name);
  const MEDVED = "Medved's Tending", SERLE = "Serle's Triumph", ASTRID = "Astrid's Creativity";

  // ---- replacement ----
  let it = mk(4, 2);
  sock(it, 'Lesser Desert Rune'); sock(it, 'Desert Rune');
  t('S1 fills empty sockets in order', JSON.stringify(names(it)) === '["Lesser Desert Rune","Desert Rune"]', names(it).join(','));
  t('S2 full item + no target socket = refused (no accidental replace)', sock(it, 'Storm Rune') === null && names(it).length === 2);
  const r = sock(it, 'Storm Rune', 0);
  t('S3 clicking a filled socket replaces it', !!r && names(it)[0] === 'Storm Rune' && names(it).length === 2 && /destroyed Lesser Desert Rune/.test(r[0].text), r && r[0].text);
  t('S4 buttons stay usable on a full item (replaceable slots)', E.socketSlots(it, find('Glacial Rune')).length === 2, 'slots ' + E.socketSlots(it, find('Glacial Rune')));

  // ---- socket-bound ----
  it = mk(4, 2);
  const b1 = sock(it, MEDVED);
  t('B1 bound rune sockets normally and is flagged bound', !!b1 && it.socketed[0].bound === true);
  sock(it, 'Desert Rune');
  t('B2 replacing a bound socket is refused', sock(it, 'Glacial Rune', 0) === null && it.socketed[0].name === MEDVED);
  t('B3 only the unbound socket is offered', JSON.stringify(E.socketSlots(it, find('Glacial Rune'))) === '[1]', JSON.stringify(E.socketSlots(it, find('Glacial Rune'))));
  t('B4 bound rune keeps its effect (Soul pool unlocked)', E.bonus(it).influences.has(1003));
  const onlyBound = mk(4, 1); sock(onlyBound, MEDVED);
  t('B5 all sockets bound = nothing socketable', E.socketSlots(onlyBound, find('Desert Rune')).length === 0);
  it = mk(4, 1); sock(it, 'Desert Rune'); sock(it, MEDVED, 0);
  t('B6 a bound rune can replace an unbound one, then locks the socket', it.socketed[0].bound === true && sock(it, 'Storm Rune', 0) === null);
  it = mk(4, 2); sock(it, ASTRID);
  const had = E.bonus(it).crafted;
  sock(it, 'Desert Rune', 0);
  t("B7 replacing Astrid's Creativity drops its crafted-mod bonus", had === 1 && E.bonus(it).crafted === 0, `crafted bonus ${had} -> ${E.bonus(it).crafted}`);
  // the data flags: Serle's Triumph and Thrud's Might are bound, Astrid's Creativity is not
  t('B8 data flags: Serle bound, Astrid not bound', find(SERLE).bound === true && find(ASTRID).bound === false, `serle=${find(SERLE).bound} astrid=${find(ASTRID).bound}`);

  // ---- shared limits across a replacement ----
  const limited = DB.raw.socketables.entries.filter(e => e.limit === 2);
  let done = false;
  for (const cls of [4, 54, 33, 25, 37, 45, 59, 65, 24]) {
    if (done) break;
    for (let i = 0; i < limited.length && !done; i++) for (let j = 0; j < limited.length && !done; j++) {
      if (i === j) continue;
      const a = limited[i], c = limited[j];
      it = mk(cls, 2);
      if (!E.socketEffect(it, a) || !E.socketEffect(it, c)) continue;
      sock(it, nameOf(a));
      const second = sock(it, nameOf(c));        // second Ancient must be refused
      const repl = sock(it, nameOf(c), 0);       // replacing the first one is fine
      t(`L1 shared limit (class ${cls}): second refused, replacement allowed`, second === null && repl !== null && names(it).length === 1 && names(it)[0] === nameOf(c), `${nameOf(a)} -> ${nameOf(c)}`);
      done = true;
    }
  }
  if (!done) t('L1 shared limit', false, 'no pair of limit-2 augments fits one item class');
  return out;
});
for (const [k, v] of Object.entries(R)) console.log(k.padEnd(76), v);

// ---- UI ----
await p.goto('http://localhost:5173/?group=1&class=4&item=3408');
await p.waitForSelector('#itemBox');
await p.click('[data-tab="Socketables"]');
await p.click('[data-sub="Runes"]');
const pick = n => p.locator('.cur:not([disabled])').nth(n).click();
await pick(0); await p.click('#itemBox');
await pick(1); await p.click('#itemBox');
await pick(5);
console.log('UI full item: socket buttons still enabled:', (await p.locator('.cur:not([disabled])').count()) > 0, '| targetable sockets highlighted:', await p.locator('.socket.target').count());
await p.click('#itemBox');
console.log('UI click on item body when full ->', (await p.innerText('#log')).split('\n').slice(0, 3).join(' | '));
const before = await p.$$eval('.socket.filled', ss => ss.map(s => s.title));
await p.locator('.socket').nth(1).click();
const after = await p.$$eval('.socket.filled', ss => ss.map(s => s.title));
console.log('UI click socket 2: before', before, '| after', after);
await p.click('[data-sub="Special runes"]');
await p.fill('#socketSearch', 'Soul modifiers');
await p.locator('.cur:not([disabled])').first().click();
await p.locator('.socket').nth(0).click();
console.log('UI bound lock icons:', await p.locator('.socket.bound .lock').count(), '| tooltip:', await p.$eval('.socket.bound', s => s.title.replace(/\n/g, ' / ')).catch(() => 'n/a'));
// try to replace the bound socket again
await p.click('[data-sub="Runes"]');
await p.fill('#socketSearch', '');
await p.locator('.cur:not([disabled])').first().click();
console.log('bound socket highlighted as target:', await p.locator('.socket.bound.target').count(), '(expect 0)');
await p.locator('.socket.bound').scrollIntoViewIfNeeded();
await p.locator('#tooltip').screenshot({ path: 'recon/sockets-bound.png' });
console.log(errs.join('\n') || 'no errors');
await b.close();
