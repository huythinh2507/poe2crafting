import { DB, loadData, classesOfGroup, basesOfClass, classPool, poolEntry, affixOf, factionOf, essenceModIds } from './data.js';
import { newItem, applyMethod, foresee, addChances, essenceMod, essenceReplaces, socketEffect, socketAllowed, essenceApplicable, checkConstraints, handlerImplemented, modLines, modTemplate, openSlots, maxAffix, bonus, fullPool, rollMod,
  ctx, OMENS, toggleOmen, consumeOmens, removalPool, removalOpts, factionOmenApplies, craftedFull, desecratedChances, revealOptions, revealMod } from './engine.js';

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const S = {
  group: null, cls: null, base: null,
  item: null, history: [], log: [],
  method: null,       // selected method element
  baseSearch: '', modSearch: '', ilvl: 100,
  openFamilies: new Set(),
  openCurrency: null,   // currency family whose Basic/Greater/Perfect dropdown is open
  reveal: null,       // Well of Souls panel: { idx, options, rerolled }
  showDesec: false,
  tab: 'Currencies', sub: { Essences: 5, Socketables: 'Special runes' }, socketSearch: '',
  foresee: {},        // Hinekora's Lock: method id -> cached preview {item, changes}
};

// ---------- crafting method catalogue (Currencies + Generate from the game data) ----------
function methodCatalogue() {
  const out = [];
  // Constraints accumulate down the tree (method -> currency -> tier variant).
  const walk = (els, group, inherited, parent) => {
    for (const e of els || []) {
      const constraints = [...inherited, ...(e.constraints || [])];
      // siblings that are handlers of the same currency form a family (basic, Greater, Perfect)
      const family = e.handler && parent && parent.elements.filter(x => x.handler).length > 1 ? 'fam' + parent.id : null;
      if (e.handler) out.push({ ...e, group, constraints, family });
      walk(e.elements, group, constraints, e);
    }
  };
  for (const m of DB.raw.methods.crafting) {
    if (!['Currencies', 'Generate', 'Desecrate'].includes(m.label)) continue;
    walk(m.elements, m.label, m.constraints || [], null);
  }
  // The tablet-only Vaal Orb duplicates the normal one on equipment.
  const list = out.filter(m => !m.constraints.includes('tablet_base'));
  // Not in the site's method data, so added here.
  list.splice(list.findIndex(m => m.handler === 'poe2_divine') + 1, 0,
    { id: 9001, handler: 'hinekora_lock', name: "Hinekora's Lock", group: 'Currencies', constraints: ['is_modifiable'] });
  return list;
}
let CATALOGUE = [];
const QUALITY_HINT = '+5% quality (normal) / +2% (magic) / +1% (rare), max 20%.';
const HINTS = {
  poe2_fracture: 'Locks one random mod permanently. Needs a rare with 4+ mods.',
  poe2_vaal: '25% each: no change / reroll 1-3 mods / corruption enchant / +1 socket (casters: quality +-). Item becomes corrupted.',
  poe2_vaal_infuser: 'Adds quality beyond the 20% cap (max 30%). Assumed 25% chance to corrupt.',
  hinekora_lock: 'Preview the exact result of the next currency used. Any other change removes it.',
  blacksmith_whetstone: QUALITY_HINT, arcanist_etcher: QUALITY_HINT, armourer_scrap: QUALITY_HINT, glassblower_bauble: QUALITY_HINT,
};
const methodName = m => m.name || (m.item != null && DB.items.get(m.item) ? DB.text(DB.items.get(m.item).label) : ({
  spawn_normal_item: 'Normal item', spawn_magic_item: 'Magic item', spawn_rare_item: 'Rare item',
}[m.handler] || m.handler));

// Icons live in public/assets/items (fetched by scripts/fetch-icons.mjs), keyed by the item's art path.
const iconPath = id => {
  const img = DB.items.get(id)?.image;
  return img ? 'assets/items/' + img.replace(/^Art\/2DItems\//, '') + '.webp' : null;
};
/** Base item art (weapons so far), sized by the base's inventory footprint. */
const baseArt = (b, cls = 'base-art') => {
  const src = b.image ? 'assets/items/' + b.image.replace(/^Art\/2DItems\//, '') + '.webp' : null;
  return src ? `<img class="${cls}" src="${src}" alt="" onerror="this.remove()">` : '';
};
function methodIcon(m) {
  let id = m.item ?? m.essence?.item ?? m.socket?.item;
  if (m.handler === 'hinekora_lock') return 'assets/items/Currency/HinekorasLock.webp'; // no item row in the data
  return id != null ? iconPath(id) : null;
}
const iconTag = m => { const src = methodIcon(m); return src ? `<img class="cur-icon" src="${src}" alt="" onerror="this.remove()">` : ''; };

const minLvlOf = m => (m.properties || []).find(p => p.key === 'min_mod_level')?.value || 0;

// ---------- state helpers ----------
const baseName = b => DB.text(b.label);
const url = () => {
  const p = new URLSearchParams();
  if (S.group) p.set('group', S.group);
  if (S.cls) p.set('class', S.cls.id);
  if (S.base) p.set('item', S.base.id);
  history.replaceState(null, '', '?' + p);
};

function selectBase(base) {
  S.base = base;
  S.item = newItem(base, S.ilvl);
  S.history = []; S.log = []; S.method = null; S.foresee = {};
  url(); renderAll();
}

function reset() {
  if (!S.base) return;
  S.item = newItem(S.base, S.ilvl);
  S.history = []; S.log = []; S.foresee = {}; S.reveal = null;
  renderCraft();
}

function undo() {
  const prev = S.history.pop();
  if (!prev) return;
  S.item = prev; S.foresee = {}; S.reveal = null;
  S.log.unshift({ undo: true });
  renderCraft();
}

const dropLock = () => { if (S.item) S.item.lock = false; S.foresee = {}; };

function getForesee(method) {
  if (!S.foresee[method.id]) S.foresee[method.id] = foresee(S.item, method) || { failed: true };
  return S.foresee[method.id];
}

function failApply(method) {
  const active = [...ctx.omens].length ? ' (check the active omens)' : '';
  S.log.unshift({ name: methodName(method), changes: [{ op: 'note', text: 'Cannot be applied: no valid target on this item' + active }] });
  renderCraft();
}

function apply(method, silent) {
  if (!S.item || !checkConstraints(S.item, method.constraints, method.handler)) return false;
  const snapshot = structuredClone(S.item);
  let changes;
  if (S.item.lock && method.handler !== 'hinekora_lock') {
    // Foresight: commit exactly the outcome that was previewed.
    const f = getForesee(method);
    if (f.failed) { if (!silent) failApply(method); return false; }
    S.item = f.item; changes = f.changes; S.foresee = {};
  } else {
    changes = applyMethod(S.item, method);
  }
  if (!changes) {
    S.item = snapshot;
    if (!silent) failApply(method);
    return false;
  }
  S.history.push(snapshot);
  S.reveal = null;
  consumeOmens(method.handler); // omens are used up by the currency they target
  S.log.unshift({ name: methodName(method), changes });
  if (!silent) renderCraft();
  return true;
}

function openReveal(idx) {
  const u = S.item.unrevealed[idx];
  if (!u) return;
  S.reveal = { idx, options: revealOptions(S.item, u), rerolled: false };
  renderCraft();
}

function rerollReveal() {
  if (!S.reveal || S.reveal.rerolled || !ctx.omens.has('echoes')) return;
  ctx.omens.delete('echoes');
  S.reveal = { ...S.reveal, options: revealOptions(S.item, S.item.unrevealed[S.reveal.idx]), rerolled: true };
  renderCraft();
}

function pickReveal(i) {
  const r = S.reveal;
  if (!r || !r.options[i]) return;
  S.history.push(structuredClone(S.item));
  dropLock();
  const changes = revealMod(S.item, r.idx, r.options[i]);
  for (const f of ['Amanamu', 'Kurgal', 'Ulaman']) ctx.omens.delete(f);
  S.log.unshift({ name: 'Well of Souls reveal', changes });
  S.reveal = null;
  renderCraft();
}

function addSpecific(modId) {
  const it = S.item;
  const mod = DB.mods.get(modId);
  if (!it || it.rarity === 'normal') return;
  const e = fullPool(it).find(x => x.mod.id === modId);
  if (!e || openSlots(it)[e.affix] <= 0) return;
  if (it.mods.some(m => DB.mods.get(m.id).group === mod.group)) return;
  S.history.push(structuredClone(it));
  dropLock();
  const added = rollMod(mod);
  it.mods.push(added);
  S.log.unshift({ name: 'Manual add', changes: [{ op: 'add', mod: added }] });
  renderCraft();
}

function removeSpecific(idx) {
  if (S.item.mods[idx].fractured) return;
  S.history.push(structuredClone(S.item));
  dropLock();
  const [m] = S.item.mods.splice(idx, 1);
  S.log.unshift({ name: 'Manual remove', changes: [{ op: 'remove', mod: m }] });
  renderCraft();
}

// ---------- rendering ----------
function renderPicker() {
  const cats = DB.categories.filter(c => !c.legacy);
  let h = '<h2>Choose an item group</h2><div class="chips">';
  for (const c of cats) h += `<button class="chip ${S.group === c.id ? 'active' : ''}" data-group="${c.id}">${esc(DB.text(c.label))}</button>`;
  h += '</div>';
  if (S.group) {
    h += '<h2>Choose an item class</h2><div class="chips">';
    for (const c of classesOfGroup(S.group)) h += `<button class="chip ${S.cls?.id === c.id ? 'active' : ''}" data-class="${c.id}">${esc(DB.text(c.label))}</button>`;
    h += '</div>';
  }
  if (S.cls && !S.base) {
    h += `<h2>Choose a base</h2><div class="row"><input id="baseSearch" class="input" placeholder="Search bases" value="${esc(S.baseSearch)}"></div><div class="bases" id="bases"></div>`;
  }
  $('#picker').innerHTML = h;
  if (S.cls && !S.base) renderBases();
}

function renderBases() {
  const q = S.baseSearch.toLowerCase();
  const bases = basesOfClass(S.cls.id).filter(b => baseName(b).toLowerCase().includes(q));
  $('#bases').innerHTML = bases.map(b =>
    `<button class="base" data-base="${b.id}"><span class="base-thumb">${baseArt(b, 'base-thumb-img')}</span><span class="base-info"><span>${esc(baseName(b))}</span><span class="base-lvl">iLvl ${b.drop}</span></span></button>`).join('') || '<p class="calc-note">No bases.</p>';
}

function renderSelected() {
  if (!S.base) { $('#selected').innerHTML = ''; return; }
  $('#selected').innerHTML = `
    <h2>Selected item base</h2>
    <div class="row">
      <span class="chip active">${esc(DB.text(DB.categories.find(c => c.id === S.group).label))}</span>
      <span class="chip active">${esc(DB.text(S.cls.label))}</span>
      <span class="chip active chip-base">${baseArt(S.base, 'chip-art')}${esc(baseName(S.base))}</span>
      <button class="btn" id="change">Change</button>
      <button class="btn" id="reset">Reset</button>
    </div>
    <div class="row">
      <input id="modSearch" class="input" placeholder="Search modifiers for this base" value="${esc(S.modSearch)}">
      <label>iLvl <input id="ilvl" class="input small" type="number" min="1" max="100" value="${S.ilvl}"></label>
    </div>`;
}

const handlerBase = h => (h.startsWith('poe2_desecrate') ? 'poe2_desecrate' : h.replace(/_(greater|perfect)$/, ''));

// Omens that matter for what is selected right now.
function relevantOmens() {
  if (S.tab === 'Desecrate') return OMENS.filter(o => !o.retired && (o.for === 'poe2_desecrate' || o.for === 'reveal'));
  const m = S.method;
  if (!m) return [];
  const base = handlerBase(m.handler);
  if (base === 'poe2_essence' && !essenceReplaces(m.essence)) return [];
  return OMENS.filter(o => !o.retired && o.for === base);
}

function renderOmens() {
  const list = relevantOmens();
  if (!list.length) {
    if (S.tab === 'Desecrate') return '';
    return `<p class="calc-note omens-note">${S.method ? 'No obtainable omens work with this currency.' : 'Select a currency to see the omens that work with it.'}</p>`;
  }
  const faction = it => !factionOmenApplies(it);
  return '<h3 class="subhead">Omens <small>(consumed by the next use of the currency)</small></h3><div class="chips sub">'
    + list.map(o => {
      const off = o.todo || (['Ulaman', 'Kurgal', 'Amanamu'].includes(o.id) && faction(S.item));
      const why = o.todo ? o.hint : off ? 'Weapon / Jewellery only.' : o.hint;
      return `<button class="chip ${ctx.omens.has(o.id) ? 'active' : ''} ${off ? 'off' : ''}" ${off ? 'disabled' : ''} data-omen="${o.id}" title="${esc(why)}">${esc(o.name.replace('Omen of ', ''))}${o.for === 'reveal' ? '<small>at reveal</small>' : ''}</button>`;
    }).join('') + '</div>';
}

// Which mods the selected removal currency (Chaos / Annulment / replacing essence) can hit, once an omen narrows it.
function removalTargets() {
  const m = S.method;
  if (!m || !S.item) return null;
  const h = handlerBase(m.handler);
  const replacing = h === 'poe2_essence' && essenceReplaces(m.essence);
  if (!['poe2_chaos', 'poe2_annulment'].includes(h) && !replacing) return null;
  const { count, ...opts } = removalOpts(h, replacing);
  if (!Object.keys(opts).length) return null; // no omen filter: every unfractured mod is a candidate
  return { cands: removalPool(S.item, opts), count: count || 1, opts };
}

const TABS = ['Currencies', 'Essences', 'Desecrate', 'Socketables', 'Generate'];

function essenceMethods(it) {
  const E = DB.raw.essences;
  return E.entries.filter(e => essenceModIds(e.id, it.classId).length).map(e => ({
    id: 'ess' + e.id, handler: 'poe2_essence', essence: e, name: DB.text(e.label), group: 'Essences',
    constraints: ['is_modifiable', e.type <= 2 ? 'rarity_magic' : 'rarity_rare'],
  }));
}

const socketCat = e => {
  const c = e.classify;
  if (c[0] === 'rune') return c.length > 1 ? 'Runes' : 'Special runes';
  if (c[0] === 'soul_core') return 'Soul cores';
  if (c[0] === 'idol') return 'Idols';
  return 'Abyssal eyes';
};
const SOCKET_CATS = ['Special runes', 'Runes', 'Soul cores', 'Idols', 'Abyssal eyes'];

function socketMethods(it) {
  return DB.raw.socketables.entries.map((e, i) => {
    const name = DB.text(DB.items.get(e.item)?.label);
    return { id: 'sock' + i, handler: 'poe2_socketable', socket: e, name, group: 'Socketables', cat: socketCat(e), constraints: ['socketable_base', 'has_empty_socket'] };
  }).filter(m => m.name && !m.name.startsWith('[DNT') && socketEffect(it, m.socket));
}

const allMethods = () => [...CATALOGUE, ...(S.item ? [...essenceMethods(S.item), ...socketMethods(S.item)] : [])];
const findMethod = id => allMethods().find(m => String(m.id) === String(id));

const usable = (it, m) => checkConstraints(it, m.constraints, m.handler)
  && (m.handler !== 'poe2_essence' || essenceApplicable(it, m.essence))
  && (m.handler !== 'poe2_socketable' || socketAllowed(it, m.socket));

function methodButton(it, m) {
  const impl = handlerImplemented(m.handler);
  let hint = HINTS[m.handler] || '';
  let extra = minLvlOf(m) ? `<small class="lvl">Min mod lvl ${minLvlOf(m)}</small>` : '';
  const maxIlvl = (m.properties || []).find(p => p.key === 'max_item_level')?.value;
  if (maxIlvl) extra = `<small class="lvl">Item level ≤ ${maxIlvl}</small>`;
  if (m.handler === 'poe2_essence') {
    const mod = essenceMod(it, m.essence);
    const txt = mod ? modLines(mod).join(' / ') : '';
    hint = txt; extra = `<small class="lvl">${esc(txt)}</small>`;
  } else if (m.handler === 'poe2_socketable') {
    const txt = socketEffect(it, m.socket).join(' / ');
    hint = txt; extra = `<small class="lvl">${esc(txt)}</small>`;
  }
  return `<button class="cur ${S.method?.id === m.id ? 'active' : ''}" data-method="${m.id}" ${usable(it, m) && impl ? '' : 'disabled'} title="${esc(hint)}">${iconTag(m)}<span class="cur-text">${esc(methodName(m))}${extra}</span></button>`;
}

function renderSocketList() {
  const q = S.socketSearch.toLowerCase();
  const it = S.item;
  const list = socketMethods(it).filter(m => m.cat === S.sub.Socketables && (!q || (m.name + ' ' + socketEffect(it, m.socket)).toLowerCase().includes(q)));
  $('#socketList').innerHTML = list.map(m => methodButton(it, m)).join('') || '<p class="calc-note">Nothing fits this item.</p>';
}

// Currencies with Greater / Perfect variants collapse into one button that drops down into its tiers.
function currencyButtons(it, methods) {
  const seen = new Set();
  let h = '';
  for (const m of methods) {
    if (!m.family) { h += methodButton(it, m); continue; }
    if (seen.has(m.family)) continue;
    seen.add(m.family);
    const tiers = methods.filter(x => x.family === m.family);
    const open = S.openCurrency === m.family;
    const active = tiers.some(x => x.id === S.method?.id);
    const usableCount = tiers.filter(x => usable(it, x) && handlerImplemented(x.handler)).length;
    h += `<div class="cur-wrap ${open ? 'open' : ''}">
      <button class="cur has-drop ${active ? 'active' : ''}" data-family="${m.family}" ${usableCount ? '' : 'disabled'}>${iconTag(tiers[0])}<span class="cur-text">${esc(methodName(tiers[0]))}</span><span class="caret">▾</span></button>
      <div class="cur-drop">${tiers.map(x => methodButton(it, x)).join('')}</div></div>`;
  }
  return h;
}

function renderCurrencies() {
  const it = S.item;
  let h = '<h2>Choose a crafting method</h2><div class="chips tabs">';
  for (const t of TABS) h += `<button class="chip ${S.tab === t ? 'active' : ''}" data-tab="${t}">${t}</button>`;
  h += '</div>';
  if (S.tab === 'Currencies' || S.tab === 'Generate') {
    h += '<div class="currencies">' + currencyButtons(it, CATALOGUE.filter(m => m.group === S.tab)) + '</div>';
  } else if (S.tab === 'Desecrate') {
    h += '<div class="currencies">' + CATALOGUE.filter(m => m.group === 'Desecrate').map(m => methodButton(it, m)).join('') + '</div>';
    h += `<div class="row settings">
      <label title="GGG publishes no reveal weights. Tick to let normal explicit mods appear in reveals (needed for Gnawed bones on low item levels)."><input type="checkbox" id="includeNormal" ${ctx.settings.includeNormal ? 'checked' : ''}> Normal mods in reveal pool</label>
      <label title="Weight of every Lich (Amanamu / Kurgal / Ulaman) mod relative to normal mods (1000 per tier).">Lich mod weight <input id="lichWeight" class="input small" type="number" min="1" value="${ctx.settings.lichWeight}"></label>
    </div>
    <p class="calc-note">A bone adds an <b>unrevealed</b> desecrated mod (rare items only, one per item; on a full item a random mod is removed first). Reveal it with the Well of Souls button on the item: pick 1 of 3 options. Reveal weights are an assumption, see settings.</p>`;
  } else if (S.tab === 'Essences') {
    const E = DB.raw.essences;
    h += '<div class="chips sub">' + E.types.map((t, i) => `<button class="chip ${S.sub.Essences === i ? 'active' : ''}" data-sub="${i}">${esc(DB.text(t.label))}</button>`).join('') + '</div>';
    const list = essenceMethods(it).filter(m => m.essence.type === S.sub.Essences);
    h += '<div class="currencies">' + (list.map(m => methodButton(it, m)).join('') || '<p class="calc-note">None for this item class.</p>') + '</div>';
    if (S.sub.Essences >= 3) h += '<p class="calc-note">Removes a random mod, adds a guaranteed one. Only one crafted mod per item (alloys, perfect and corrupted essences).</p>';
  } else if (S.tab === 'Socketables') {
    h += '<div class="chips sub">' + SOCKET_CATS.map(c => `<button class="chip ${S.sub.Socketables === c ? 'active' : ''}" data-sub="${c}">${c}</button>`).join('') + '</div>';
    h += `<div class="row"><input id="socketSearch" class="input" placeholder="Search socketables" value="${esc(S.socketSearch)}"></div><div class="currencies" id="socketList"></div>`;
    h += `<p class="calc-note">Sockets: ${it.socketed.length}/${it.sockets}. Bases with no sockets cannot take augments.</p>`;
  }
  h += renderOmens();
  $('#currencies').innerHTML = h;
  if (S.tab === 'Socketables') renderSocketList();
}

let TARGETS = null;
const modHtml = (m, idx) => {
  const mod = DB.mods.get(m.id);
  const e = poolEntry(S.item.classId, m.id);
  const kind = affixOf(mod) || '';
  const faction = factionOf(mod);
  return `<div class="mod ${kind} ${m.fractured ? 'fractured' : ''} ${m.desecrated ? 'desecrated' : ''} ${TARGETS?.cands.some(c => c.m === m) ? 'target' : ''}" data-remove="${idx}">${modLines(mod, m.rolls).map(esc).join('<br>')}
    <span class="meta"><b>${kind}</b> “${esc(DB.text(mod.label))}” · ${e ? 'tier ' + e.tier : 'special'} · mod lvl ${mod.minlvl}${m.crafted ? ' · <b class="crafted">crafted</b>' : ''}${m.desecrated ? ` · <b class="desec">desecrated${faction ? ' · ' + faction : ''}</b>` : ''}${m.fractured ? ' · <b class="frac">fractured</b>' : ''}</span></div>`;
};

function itemName(it) {
  const base = baseName(S.base);
  if (it.rarity === 'normal') return [base, ''];
  const pre = it.mods.find(m => affixOf(DB.mods.get(m.id)) === 'prefix');
  const suf = it.mods.find(m => affixOf(DB.mods.get(m.id)) === 'suffix');
  if (it.rarity === 'magic') return [`${pre ? DB.text(DB.mods.get(pre.id).label) + ' ' : ''}${base}${suf ? ' ' + DB.text(DB.mods.get(suf.id).label) : ''}`, ''];
  return ['Rare ' + DB.text(DB.classes.get(it.classId).label).replace(/s \(.*/, ''), base];
}

function renderTargets() {
  if (!TARGETS) return '';
  const { cands, count } = TARGETS;
  const line = c => {
    const text = c.m ? modLines(DB.mods.get(c.m.id), c.m.rolls).join(' / ') : `Unrevealed desecrated ${c.u.affix}`;
    return `<div>${esc(text)} <span class="calc-note">· mod lvl ${c.level}${c.u ? ' (counts as 1)' : ''}</span></div>`;
  };
  const whit = ctx.omens.has('whittling');
  return `<div class="targets"><b>${esc(methodName(S.method))} will remove ${count > 1 ? count + ' of' : cands.length > 1 ? 'one of' : ''}:</b>
    ${cands.map(line).join('') || '<div class="calc-note">No valid target.</div>'}
    ${whit ? '<div class="calc-note">Whittling: lowest required mod level; ties are random.</div>' : ''}</div>`;
}

function renderReveal() {
  const r = S.reveal;
  if (!r) return '';
  const it = S.item, u = it.unrevealed[r.idx];
  if (!u) return '';
  const { entries } = desecratedChances(it, u);
  const chance = id => entries.find(e => e.mod.id === id)?.chance || 0;
  const opts = r.options.map((e, i) => `<button class="reveal-opt ${e.lich ? 'lich' : ''}" data-pick="${i}">
      <span class="txt">${modLines(e.mod).map(esc).join('<br>')}</span>
      <span class="meta">${e.lich ? `<b class="desec">${e.faction}</b>` : 'normal'} · ilvl ${e.mod.minlvl} · ${(chance(e.mod.id) * 100).toFixed(1)}% per draw</span></button>`).join('');
  const reroll = ctx.omens.has('echoes') && !r.rerolled ? '<button class="mini" id="revealReroll">Reroll (Abyssal Echoes)</button>' : '';
  return `<div class="reveal"><b>Well of Souls — desecrated ${u.affix}</b>
    ${opts || '<div class="calc-note">No modifier can be revealed here (item level / bone / omen too restrictive).</div>'}
    <div class="item-actions">${reroll}<button class="mini" id="revealCancel">Cancel</button></div></div>`;
}

function renderForesee() {
  const it = S.item;
  if (!it.lock) return '';
  if (!S.method || S.method.handler === 'hinekora_lock') return '<div class="foresee"><b>Foresight active</b><br>Select a currency to preview its outcome.</div>';
  const f = getForesee(S.method);
  if (f.failed) return `<div class="foresee"><b>Foresight: ${esc(methodName(S.method))}</b><br>Cannot be applied to this item.</div>`;
  const lines = f.changes.map(changeHtml).join('');
  return `<div class="foresee"><b>Foresight: ${esc(methodName(S.method))}</b>${lines}<div class="calc-note">Click the item to commit this exact result.</div></div>`;
}

function renderTooltip() {
  const it = S.item, b = S.base;
  TARGETS = removalTargets();
  const [name, sub] = itemName(it);
  const props = [];
  const P = b.props || {};
  const label = { armour: 'Armour', evasion: 'Evasion Rating', energyshield: 'Energy Shield', ward: 'Runic Ward', block: 'Block chance' };
  for (const [k, v] of Object.entries(label)) if (P[k]) props.push(`<div class="prop">${v}: <b>${P[k]}</b></div>`);
  const reqs = [`Level ${b.drop}`];
  const R = b.reqs || {};
  if (R.strength) reqs.push(`Str ${R.strength}`);
  if (R.dexterity) reqs.push(`Dex ${R.dexterity}`);
  if (R.intelligence) reqs.push(`Int ${R.intelligence}`);
  const implicit = it.implicits.map(m => `<div class="implicit">${modLines(DB.mods.get(m.id), m.rolls).map(esc).join('<br>')}</div>`).join('')
    + it.corruption.map(m => `<div class="corrupt-mod">${modLines(DB.mods.get(m.id), m.rolls).map(esc).join('<br>')}</div>`).join('');
  if (it.quality) props.unshift(`<div class="prop">Quality: <b class="q">+${it.quality}%</b></div>`);
  if (it.sockets) props.push(`<div class="prop">Sockets: <b>${it.socketed.map(() => '●').concat(Array(it.sockets - it.socketed.length).fill('○')).join(' ')}</b></div>`);
  const augments = it.socketed.map(x => `<div class="augment">${esc(x.name)}: ${x.lines.map(esc).join(' / ')}</div>`).join('');
  const prefixes = it.mods.map((m, i) => [m, i]).filter(([m]) => affixOf(DB.mods.get(m.id)) === 'prefix');
  const suffixes = it.mods.map((m, i) => [m, i]).filter(([m]) => affixOf(DB.mods.get(m.id)) === 'suffix');
  const mods = [...prefixes, ...suffixes].map(([m, i]) => modHtml(m, i)).join('')
    + it.unrevealed.map((u, i) => `<div class="unrevealed ${TARGETS?.cands.some(c => c.u === u) ? 'target' : ''}"><span>Unrevealed desecrated ${u.affix}</span> <button class="mini" data-reveal="${i}">Reveal at the Well of Souls</button></div>`).join('');
  $('#tooltip').innerHTML = `
    <div class="item ${it.rarity} ${S.method ? 'apply' : ''}" id="itemBox" title="${S.method ? 'Click to apply ' + esc(methodName(S.method)) : 'Select a crafting method'}">
      <div class="item-head">${esc(name)}${sub ? `<span class="sub">${esc(sub)}</span>` : ''}</div>
      <div class="item-body">
        ${baseArt(b, 'item-art')}
        <div class="kind">${esc(DB.text(S.cls.label))}</div>
        ${props.join('')}
        <div class="sep"></div>
        <div>Item Level: <b>${it.ilvl}</b></div>
        <div class="prop">Requires ${reqs.join(', ')}</div>
        ${implicit ? '<div class="sep"></div>' + implicit : ''}
        ${mods ? '<div class="sep"></div>' + mods : ''}
        ${augments ? '<div class="sep"></div>' + augments : ''}
        ${it.corrupted ? '<div class="corrupted">Corrupted</div>' : ''}
      </div>
      <div class="item-actions"><button class="mini" id="undo" ${S.history.length ? '' : 'disabled'}>Undo</button><button class="mini" id="resetItem">Reset</button></div>
    </div>${renderTargets()}${renderReveal()}${renderForesee()}`;
}

const OP_LABEL = { add: 'Added', remove: 'Removed', reroll: 'Rerolled', fracture: 'Fractured' };
function changeHtml(c) {
  if (c.op === 'note') return `<div class="reroll">${esc(c.text)}</div>`;
  if (c.text) return `<div class="${c.op}">${OP_LABEL[c.op]}: ${esc(c.text)}</div>`;
  return `<div class="${c.op}">${OP_LABEL[c.op]}: ${modLines(DB.mods.get(c.mod.id), c.mod.rolls).map(esc).join(' / ')}</div>`;
}

function renderLog() {
  const items = S.log.slice(0, 30).map(l => {
    if (l.undo) return '<div class="entry reroll">Undo</div>';
    const lines = l.changes.map(changeHtml).join('');
    return `<div class="entry"><b>${esc(l.name)}</b>${lines}</div>`;
  }).join('');
  $('#log').innerHTML = `<h3>Last changes</h3>${items || '<div class="empty">Nothing yet.</div>'}`;
}

function renderPool() {
  const it = S.item;
  const q = S.modSearch.toLowerCase();
  const chance = S.method ? addChances(it, S.method) : null;
  const present = new Set(it.mods.map(m => DB.mods.get(m.id).group));
  const presentIds = new Set(it.mods.map(m => m.id));
  const pool = fullPool(it).filter(e => e.mod.minlvl <= it.ilvl);
  const metaOn = bonus(it).influences.size > 0;
  const minLvl = S.method ? minLvlOf(S.method) : 0;
  let h = minLvl && chance
    ? `<p class="calc-note min-note"><b>${esc(methodName(S.method))}</b> can only add mods of level ${minLvl}+. Lower tiers are greyed out. A mod with no tier that high keeps its highest tier.</p>`
    : '';
  h += '<div class="pool">';
  for (const kind of ['prefix', 'suffix']) {
    const byGroup = new Map();
    for (const e of pool.filter(x => x.affix === kind)) {
      if (!byGroup.has(e.mod.group)) byGroup.set(e.mod.group, []);
      byGroup.get(e.mod.group).push(e);
    }
    const fams = [...byGroup.values()].map(arr => ({ arr, text: modTemplate(arr[0].mod) }))
      .filter(f => !q || f.text.toLowerCase().includes(q) || f.arr.some(e => DB.text(e.mod.label).toLowerCase().includes(q)))
      .sort((a, b) => a.text.localeCompare(b.text));
    const open = openSlots(it)[kind];
    const cap = maxAffix(it)[kind === 'prefix' ? 0 : 1];
    h += `<div><h3 class="${kind}">${kind}es <small>(${cap - open}/${cap} used)</small></h3>`;
    for (const f of fams) {
      const g = f.arr[0].mod.group;
      const isOpen = S.openFamilies.has(g) || !!q;
      const famPct = chance ? f.arr.reduce((s, e) => s + (chance.map.get(e.mod.id) || 0), 0) : 0;
      h += `<div class="fam ${present.has(g) ? 'present' : ''} ${isOpen ? 'open' : ''}">
        <div class="fam-name" data-fam="${g}"><span>${esc(f.text)}${f.arr[0].influence !== 6 ? ' <b class="desec">meta rune pool</b>' : ''}</span><small>${chance ? (famPct * 100).toFixed(famPct < 0.1 ? 2 : 1) + '%' : f.arr.length + ' tiers'}</small></div>
        <div class="tiers">`;
      for (const e of f.arr) {
        const p = chance?.map.get(e.mod.id);
        // excluded purely by the currency's Minimum Modifier Level (Greater / Perfect orbs)
        const belowMin = !!chance && !p && minLvl > 0 && e.mod.minlvl < minLvl && e.mod.minlvl <= it.ilvl && !present.has(g);
        const tip = belowMin ? `Below the minimum modifier level (${minLvl}) of ${methodName(S.method)}` : DB.text(e.mod.label);
        h += `<div class="tier ${presentIds.has(e.mod.id) ? 'on' : ''} ${present.has(g) && !presentIds.has(e.mod.id) ? 'blocked' : ''} ${belowMin ? 'below' : ''}" data-add="${e.mod.id}" title="${esc(tip)}">
          <span class="t">T${e.tier}</span><span class="txt">${modLines(e.mod).map(esc).join('<br>')}</span>
          <span class="lv">${e.mod.minlvl}</span><span class="pct">${p ? (p * 100).toFixed(p < 0.1 ? 2 : 1) + '%' : belowMin ? `<small>&lt; lvl ${minLvl}</small>` : '–'}</span></div>`;
      }
      h += '</div></div>';
    }
    h += '</div>';
  }
  $('#pool').innerHTML = h + '</div>' + renderDesecratedPool();
}

// Lich mods grouped by faction with their share of the (assumed) reveal pool.
function renderDesecratedPool() {
  const it = S.item;
  if (it.rarity !== 'rare') return '';
  const minLevel = S.method?.handler?.startsWith('poe2_desecrate') ? minLvlOf(S.method) : 0;
  let h = `<h2>Desecrated pool <button class="mini" id="toggleDesec">${S.showDesec ? 'Hide' : 'Show'}</button></h2>`;
  if (!S.showDesec) return h;
  h += `<p class="calc-note">Share of one reveal draw, minimum mod level ${minLevel}. Lich weight ${ctx.settings.lichWeight}${ctx.settings.includeNormal ? ', normal mods included' : ', Lich mods only'}.</p><div class="pool">`;
  for (const affix of ['prefix', 'suffix']) {
    const { entries, total } = desecratedChances(it, { affix, minLevel });
    const lich = entries.filter(e => e.lich).sort((a, b) => a.faction.localeCompare(b.faction) || a.mod.key.localeCompare(b.mod.key));
    const normalShare = entries.filter(e => !e.lich).reduce((s, e) => s + e.chance, 0);
    h += `<div><h3 class="${affix}">Desecrated ${affix}es <small>${lich.length} Lich mods · normal mods ${(normalShare * 100).toFixed(1)}%</small></h3>`;
    for (const e of lich) {
      h += `<div class="fam"><div class="tier"><span class="t desec-${e.faction}">${e.faction.slice(0, 3)}</span><span class="txt">${modLines(e.mod).map(esc).join('<br>')}</span><span class="lv">${e.mod.minlvl}</span><span class="pct">${(e.chance * 100).toFixed(2)}%</span></div></div>`;
    }
    if (!lich.length) h += '<p class="calc-note">No Lich mods for this slot / item level.</p>';
    h += '</div>';
  }
  return h + '</div>';
}

// The selected currency follows the pointer while it is over the item, like holding it in the game.
function updateCursorIcon() {
  const el = $('#cursorIcon');
  if (!el) return;
  const m = S.method;
  const src = m && methodIcon(m);
  el.querySelector('img').src = src || '';
  el.querySelector('img').hidden = !src;
  el.querySelector('span').textContent = m ? methodName(m) : '';
  el.dataset.active = m ? '1' : '';
  const box = $('#itemBox');
  if (box) box.classList.toggle('hold', !!src);
  if (!m) el.hidden = true;
}

function renderCraft() {
  if (!S.item) { $('#craft').hidden = true; $('#cursorIcon') && ($('#cursorIcon').hidden = true); return; }
  $('#craft').hidden = false;
  renderCurrencies(); renderTooltip(); renderLog(); renderPool();
  updateCursorIcon();
}

function renderAll() { renderPicker(); renderSelected(); renderCraft(); }

// ---------- events ----------
document.addEventListener('click', e => {
  if (S.openCurrency && !e.target.closest('.cur-wrap')) { S.openCurrency = null; renderCurrencies(); }
  const t = e.target.closest('[data-group],[data-class],[data-base],[data-method],[data-family],[data-tab],[data-sub],[data-omen],[data-reveal],[data-pick],[data-fam],[data-add],[data-remove],#change,#reset,#resetItem,#undo,#revealReroll,#revealCancel,#toggleDesec,#itemBox');
  if (!t) return;
  if (t.dataset.group) {
    S.group = +t.dataset.group; S.cls = null; S.base = null; S.item = null; url(); renderAll();
  } else if (t.dataset.class) {
    S.cls = DB.classes.get(+t.dataset.class); S.base = null; S.item = null; S.baseSearch = ''; url(); renderAll();
  } else if (t.dataset.base) {
    selectBase(DB.items.get(+t.dataset.base));
  } else if (t.dataset.family) {
    S.openCurrency = S.openCurrency === t.dataset.family ? null : t.dataset.family;
    renderCurrencies();
  } else if (t.dataset.tab) {
    S.tab = t.dataset.tab; S.method = null; renderCraft();
  } else if (t.dataset.sub != null) {
    S.sub[S.tab] = S.tab === 'Essences' ? +t.dataset.sub : t.dataset.sub; S.method = null; renderCraft();
  } else if (t.dataset.omen) {
    toggleOmen(t.dataset.omen);
    S.foresee = {}; S.reveal = null; renderCraft();
  } else if (t.dataset.reveal != null) {
    openReveal(+t.dataset.reveal);
  } else if (t.dataset.pick != null) {
    pickReveal(+t.dataset.pick);
  } else if (t.id === 'revealReroll') {
    rerollReveal();
  } else if (t.id === 'revealCancel') {
    S.reveal = null; renderCraft();
  } else if (t.id === 'toggleDesec') {
    S.showDesec = !S.showDesec; renderPool();
  } else if (t.dataset.method) {
    S.method = String(S.method?.id) === t.dataset.method ? null : findMethod(t.dataset.method);
    S.openCurrency = null;
    renderCraft();
  } else if (t.dataset.fam) {
    const g = +t.dataset.fam;
    S.openFamilies.has(g) ? S.openFamilies.delete(g) : S.openFamilies.add(g);
    renderPool();
  } else if (t.dataset.add) {
    addSpecific(+t.dataset.add);
  } else if (t.dataset.remove != null && !e.target.closest('#itemBox[data-noremove]')) {
    // Alt-click removes a specific mod; plain click applies the selected method.
    if (e.altKey) removeSpecific(+t.dataset.remove);
    else if (S.method) apply(S.method);
  } else if (t.id === 'itemBox') {
    if (S.method) apply(S.method);
  } else if (t.id === 'change') {
    S.base = null; S.item = null; url(); renderAll();
  } else if (t.id === 'reset' || t.id === 'resetItem') {
    reset();
  } else if (t.id === 'undo') {
    undo();
  }
});

document.addEventListener('input', e => {
  if (e.target.id === 'baseSearch') { S.baseSearch = e.target.value; renderBases(); }
  else if (e.target.id === 'socketSearch') { S.socketSearch = e.target.value; renderSocketList(); }
  else if (e.target.id === 'modSearch') { S.modSearch = e.target.value; if (S.item) renderPool(); }
});
document.addEventListener('change', e => {
  if (e.target.id === 'includeNormal') { ctx.settings.includeNormal = e.target.checked; renderCraft(); }
  if (e.target.id === 'lichWeight') { ctx.settings.lichWeight = Math.max(1, +e.target.value || 1000); renderCraft(); }
  if (e.target.id === 'ilvl') {
    S.ilvl = Math.max(1, Math.min(100, +e.target.value || 100));
    e.target.value = S.ilvl;
    if (S.item) { S.item.ilvl = S.ilvl; dropLock(); renderCraft(); }
  }
});
document.addEventListener('pointermove', e => {
  const el = $('#cursorIcon');
  if (!el) return;
  // Undo / Reset live inside the item box: no currency in hand over them, so they stay clickable
  if (S.method && e.target.closest('#itemBox') && !e.target.closest('.item-actions')) {
    el.hidden = false;
    el.style.transform = `translate(${e.clientX + 16}px, ${e.clientY + 16}px)`;
  } else el.hidden = true;
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && S.method) { S.method = null; S.openCurrency = null; renderCraft(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !/INPUT/.test(document.activeElement?.tagName)) { e.preventDefault(); undo(); }
});

// ---------- boot ----------
(async function boot() {
  await loadData();
  CATALOGUE = methodCatalogue();
  $('#app').innerHTML = '<div id="picker"></div><div id="selected"></div><div id="craft" hidden><div id="currencies"></div><div class="layout"><div><h2>Modifiers</h2><div id="pool"></div></div><div class="sticky"><div id="tooltip"></div><div id="log" class="log"></div></div></div></div><div id="cursorIcon" hidden><img alt="" hidden><span></span></div>';
  const p = new URLSearchParams(location.search);
  if (p.get('group')) S.group = +p.get('group');
  if (p.get('class')) S.cls = DB.classes.get(+p.get('class'));
  renderAll();
  if (p.get('item') && DB.items.get(+p.get('item'))) selectBase(DB.items.get(+p.get('item')));
  window.__craft = { S, DB, ctx, apply, renderCraft, openReveal, pickReveal, CATALOGUE, allMethods, findMethod }; // debug handle
})();
