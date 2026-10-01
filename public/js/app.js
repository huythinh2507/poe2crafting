import { DB, loadData, classesOfGroup, basesOfClass, classPool, lichPool, specialPools, tagChips, poolEntry, affixOf, factionOf, essenceModIds } from './data.js';
import { CATALYSTS, catalystCap, newItem, applyMethod, foresee, addChances, essenceMod, essenceReplaces, socketEffect, socketSlots, essenceApplicable, fractureCandidates, checkConstraints, handlerImplemented, modLines, modTemplate, itemStats, openSlots, maxAffix, bonus, fullPool, rollMod, addModManually, setModValues, flagBlocked,
  ctx, OMENS, toggleOmen, togglePin, spendOmen, clearOmens, consumeOmens, removalPool, removalOpts, factionOmenApplies, craftedFull, desecratedChances, revealOptions, revealMod } from './engine.js';

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
  secClosed: new Set(),   // reference sections the user collapsed
  openPFam: new Set(),    // expanded families in the reference sections
  lichFaction: 'all',
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
      const family = group !== 'Catalysts' && e.handler && parent && parent.elements.filter(x => x.handler).length > 1 ? 'fam' + parent.id : null;
      if (e.handler) out.push({ ...e, group, constraints, family });
      walk(e.elements, group, constraints, e);
    }
  };
  for (const m of DB.raw.methods.crafting) {
    if (!['Currencies', 'Desecrate', 'Catalysts', 'Refined Catalysts'].includes(m.label)) continue; // the Generate tab (spawn a Normal/Magic/Rare item) was removed from the UI
    walk(m.elements, m.label.endsWith('Catalysts') ? 'Catalysts' : m.label, m.constraints || [], null);
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
/** Base item art (scripts/fetch-weapon-art.mjs + fetch-base-art.mjs); a missing file just removes the <img>. */
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
  S.history = []; S.log = []; S.method = null; S.foresee = {}; S.reveal = null;
  clearOmens(); // omens belong to the item being crafted
  url(); renderAll();
}

/** True when the current item has been crafted on (so leaving it would lose work). */
function itemHasWork() {
  const it = S.item;
  return !!it && (S.history.length > 0 || it.rarity !== 'normal' || it.mods.length > 0 || it.unrevealed.length > 0
    || it.socketed.length > 0 || it.quality > 0 || it.catalyst || it.corrupted);
}

/**
 * Go back to a picker from the breadcrumb: 'group' (choose a group again), 'class', or 'base'. The crafted item is dropped,
 * so ask first when there is work in it. Returns false if the user cancelled.
 */
function pickAgain(level) {
  if (itemHasWork() && !window.confirm('Switching drops this item and its crafting history. Continue?')) return false;
  if (level === 'group') S.cls = null;
  S.base = null; S.item = null;
  S.history = []; S.log = []; S.foresee = {}; S.reveal = null;
  S.method = null; S.openCurrency = null; S.ctx = null; S.modal = null;
  S.baseSearch = '';
  clearOmens();
  url(); renderAll();
  return true;
}

// Reset item: same base, fresh item, nothing held, no omens armed. (The Reset under the item.)
function reset() {
  if (!S.base) return;
  S.item = newItem(S.base, S.ilvl);
  S.history = []; S.log = []; S.foresee = {}; S.reveal = null;
  S.method = null; S.openCurrency = null;
  clearOmens({ keepPinned: true }); // a pinned combo survives "Reset item" so you can repeat it on a fresh item
  renderCraft();
}

// Start over: also forget the chosen item group, class and base, back to the first screen. (The Reset next to Change.)
function resetAll() {
  S.group = null; S.cls = null; S.base = null; S.item = null;
  S.history = []; S.log = []; S.foresee = {}; S.reveal = null;
  S.method = null; S.openCurrency = null; S.ctx = null; S.modal = null;
  S.baseSearch = ''; S.modSearch = ''; S.socketSearch = '';
  S.tab = 'Currencies';
  clearOmens();
  url(); renderAll();
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
  if (method.handler === 'poe2_socketable') {
    const full = S.item.socketed.length >= S.item.sockets;
    S.log.unshift({ name: methodName(method), changes: [{ op: 'note', text: full ? 'All sockets are full: click a socket on the item to replace its augment (socket-bound ones cannot be replaced)' : 'Cannot be socketed here (limit reached or no effect on this item)' }] });
    renderCraft();
    return;
  }
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
  spendOmen('echoes');
  S.reveal = { ...S.reveal, options: revealOptions(S.item, S.item.unrevealed[S.reveal.idx]), rerolled: true };
  renderCraft();
}

function pickReveal(i) {
  const r = S.reveal;
  if (!r || !r.options[i]) return;
  S.history.push(structuredClone(S.item));
  dropLock();
  const changes = revealMod(S.item, r.idx, r.options[i]);
  for (const f of ['Amanamu', 'Kurgal', 'Ulaman']) spendOmen(f);
  S.log.unshift({ name: 'Well of Souls reveal', changes });
  S.reveal = null;
  renderCraft();
}

/**
 * Run a manual edit as one undoable step. `fn(item)` returns the list of changes, or null to cancel (nothing recorded).
 */
function editItem(name, fn) {
  const snapshot = structuredClone(S.item);
  const changes = fn(S.item);
  if (!changes) { S.item = snapshot; renderCraft(); return false; }
  S.history.push(snapshot);
  dropLock();
  S.reveal = null;
  S.log.unshift({ name, changes });
  renderCraft();
  return true;
}

// Click a mod in the lists to put it on the item. A Normal item becomes Magic, a Magic one Rare once it needs to.
// `desecrated` adds it from the Lich pool and flags it desecrated.
function addSpecific(modId, desecrated = false) {
  if (!S.item) return;
  const before = S.item.rarity;
  const ok = editItem('Manual add', it => {
    const added = addModManually(it, modId, { desecrated });
    if (!added) return null;
    const changes = [{ op: 'add', mod: added }];
    if (it.rarity !== before) changes.push({ op: 'note', text: `Item became ${it.rarity}` });
    return changes;
  });
  if (!ok) S.log.unshift({ name: 'Manual add', changes: [{ op: 'note', text: 'Cannot add that modifier here (same mod already present, no free slot, level too high, or the item is corrupted)' }] }), renderCraft();
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
  // Once a base is chosen the pickers are just a record of the choice (shown as the breadcrumb below), so they collapse
  // and the crafting area moves up. Click a breadcrumb to pick again.
  if (S.base) { $('#picker').innerHTML = ''; return; }
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
    <div class="row crumbs">
      <button class="chip active crumb" data-crumb="group" title="Pick a different item group">${esc(DB.text(DB.categories.find(c => c.id === S.group).label))}</button>
      <span class="crumb-sep">&rsaquo;</span>
      <button class="chip active crumb" data-crumb="class" title="Pick a different item class">${esc(DB.text(S.cls.label))}</button>
      <span class="crumb-sep">&rsaquo;</span>
      <button class="chip active crumb chip-base" data-crumb="base" title="Pick a different base of this class">${baseArt(S.base, 'chip-art')}${esc(baseName(S.base))}</button>
      <button class="btn" id="change" title="Pick a different base of this class">Change</button>
      <button class="btn" id="reset" title="Start over: clears the item group, class and base you chose">Reset</button>
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

// Always-visible list of armed omens (pinned ones marked), so a combo you set up stays obvious and easy to switch off.
function renderArmedBar() {
  if (!ctx.omens.size) return '';
  const chips = [...ctx.omens].map(id => {
    const o = OMENS.find(x => x.id === id);
    if (!o) return '';
    const pinned = ctx.pinned.has(id);
    return `<span class="armed-chip ${pinned ? 'pinned' : ''}" title="${esc(o.hint)}">${pinned ? '&#128204; ' : ''}${esc(o.name.replace('Omen of ', ''))}<button data-omen-off="${id}" title="Disarm">&times;</button></span>`;
  }).join('');
  return `<div class="armed"><span class="armed-label">Armed omens</span>${chips}</div>`;
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
      const pinned = ctx.pinned.has(o.id);
      return `<span class="omen-wrap ${pinned ? 'pinned' : ''}"><button class="chip ${ctx.omens.has(o.id) ? 'active' : ''} ${off ? 'off' : ''}" ${off ? 'disabled' : ''} data-omen="${o.id}" title="${esc(why)}">${esc(o.name.replace('Omen of ', ''))}${o.for === 'reveal' ? '<small>at reveal</small>' : ''}</button><button class="pin ${pinned ? 'on' : ''}" ${off ? 'disabled' : ''} data-pin="${o.id}" title="${pinned ? 'Pinned: stays armed after every use. Click to unpin.' : 'Pin: keep this omen armed after each use, to repeat a combo'}">&#128204;</button></span>`;
    }).join('') + '</div>';
}

// Which mods the selected removal currency (Chaos / Annulment / replacing essence) can hit, once an omen narrows it.
function removalTargets() {
  const m = S.method;
  if (!m || !S.item) return null;
  const h = handlerBase(m.handler);
  if (h === 'poe2_fracture') {
    if (S.item.mods.some(x => x.fractured)) return null; // only one fracture per item
    const cands = fractureCandidates(S.item).map(x => ({ m: x, level: DB.mods.get(x.id).minlvl, affix: affixOf(DB.mods.get(x.id)) }));
    return cands.length ? { cands, count: 1, fracture: true } : null;
  }
  const replacing = h === 'poe2_essence' && essenceReplaces(m.essence);
  if (!['poe2_chaos', 'poe2_annulment'].includes(h) && !replacing) return null;
  const { count, ...opts } = removalOpts(h, replacing);
  if (!Object.keys(opts).length) return null; // no omen filter: every unfractured mod is a candidate
  return { cands: removalPool(S.item, opts), count: count || 1, opts };
}

const TABS = ['Currencies', 'Essences', 'Desecrate', 'Socketables', 'Catalysts'];
const hasCatalystTab = it => !!it && (checkConstraints({ ...it, corrupted: false }, ['catalyst_base']) || checkConstraints({ ...it, corrupted: false }, ['refined_catalyst_base']));

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
    return { id: 'sock' + i, handler: 'poe2_socketable', socket: e, name, group: 'Socketables', cat: socketCat(e), constraints: ['socketable_base'] };
  }).filter(m => m.name && !m.name.startsWith('[DNT') && socketEffect(it, m.socket));
}

const allMethods = () => [...CATALOGUE, ...(S.item ? [...essenceMethods(S.item), ...socketMethods(S.item)] : [])];
const findMethod = id => allMethods().find(m => String(m.id) === String(id));

const usable = (it, m) => checkConstraints(it, m.constraints, m.handler)
  && (m.handler !== 'poe2_essence' || essenceApplicable(it, m.essence))
  && (m.handler !== 'poe2_socketable' || socketSlots(it, m.socket).length > 0);

function methodButton(it, m) {
  const impl = handlerImplemented(m.handler);
  let hint = HINTS[m.handler] || '';
  const cat = /^poe2_(?:refined_)?catalyst_(\w+)$/.exec(m.handler);
  if (cat) hint = `Adds ${CATALYSTS[cat[1]]} quality: scales ${CATALYSTS[cat[1]]}-tagged modifiers. Gain per use falls with item level (item level 100: 1%, sometimes 2%). Max 20%. A different catalyst replaces the quality.`;
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
  const tabs = TABS.filter(t => t !== 'Catalysts' || hasCatalystTab(it));
  if (!tabs.includes(S.tab)) S.tab = 'Currencies';
  for (const t of tabs) h += `<button class="chip ${S.tab === t ? 'active' : ''}" data-tab="${t}">${t}</button>`;
  h += '</div>';
  if (S.tab === 'Catalysts') {
    h += '<div class="currencies">' + CATALOGUE.filter(m => m.group === 'Catalysts' && (!m.constraints.includes('refined_catalyst_base') || checkConstraints({ ...it, corrupted: false }, ['refined_catalyst_base']))).map(m => methodButton(it, m)).join('') + '</div>';
    h += `<p class="calc-note">${it.catalyst?.quality ? `Current: <b>${esc(it.catalyst.tag)}</b> quality +${it.catalyst.quality}% (max ${catalystCap(it)}%).` : 'No catalyst quality yet.'} Quality scales every modifier with the catalyst's tag. A different catalyst replaces it. Use <b>Omen of Catalysing Exaltation</b> (Currencies, Exalted Orb) to turn the quality into a higher chance of that tag.</p>`;
  } else if (S.tab === 'Currencies') {
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
    h += `<p class="calc-note">Sockets: ${it.socketed.length}/${it.sockets}. Click a socket on the item to place the selected augment there; a filled socket is replaced (the old augment is destroyed) unless it is socket-bound (marked with a lock).</p>`;
  }
  h += renderArmedBar() + renderOmens();
  $('#currencies').innerHTML = h;
  if (S.tab === 'Socketables') renderSocketList();
}

let TARGETS = null;
const modHtml = (m, idx) => {
  const mod = DB.mods.get(m.id);
  const e = poolEntry(S.item.classId, m.id);
  const kind = affixOf(mod) || '';
  const faction = factionOf(mod);
  return `<div class="mod ${kind} ${m.fractured ? 'fractured' : ''} ${m.desecrated ? 'desecrated' : ''} ${m.crafted ? 'is-crafted' : ''} ${TARGETS?.cands.some(c => c.m === m) ? 'target' : ''}" data-remove="${idx}">${modLines(mod, m.rolls, S.item).map(esc).join('<br>')}
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
  const { cands, count, fracture } = TARGETS;
  if (fracture) {
    const pct = (100 / cands.length).toFixed(cands.length % 3 === 0 ? 1 : 0);
    const skipped = S.item.unrevealed.length;
    return `<div class="targets"><b>${esc(methodName(S.method))} will lock one of ${cands.length}:</b> <span class="calc-note">${pct}% each</span>
      ${cands.map(c => `<div>${esc(modLines(DB.mods.get(c.m.id), c.m.rolls).join(' / '))}</div>`).join('')}
      ${skipped ? `<div class="calc-note">${skipped} unrevealed desecrated slot${skipped > 1 ? 's' : ''} cannot be fractured but ${skipped > 1 ? 'still count' : 'still counts'} toward the 4-mod minimum. Reveal ${skipped > 1 ? 'them' : 'it'} and ${skipped > 1 ? 'they become' : 'it becomes'} a normal fracture candidate.</div>` : ''}</div>`;
  }
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

// Weapon damage / crit / speed or armour defences under the item name. A value that differs from the base (quality, local
// mods) is drawn in the "augmented" blue, like the game does.
const fmt1 = n => String(Math.round(n * 10) / 10);
const fmt2 = n => (Math.round(n * 100) / 100).toFixed(2);
const spanText = ([a, b]) => `${Math.round(a)}–${Math.round(b)}`;   // damage is shown as whole numbers, like the game
const differs = (a, b) => Math.abs(a - b) > 0.005;

function statLines(st) {
  if (!st) return [];
  const line = (label, value, aug, cls = '') => `<div class="prop ${cls}">${label}: <b class="${aug ? 'q' : ''}">${value}</b></div>`;
  const out = [];
  if (st.kind === 'weapon') {
    for (const el of ['physical', 'fire', 'cold', 'lightning', 'chaos']) {
      const d = st.damage[el];
      if (!d) continue;
      out.push(line(el === 'physical' ? 'Physical Damage' : `${el[0].toUpperCase()}${el.slice(1)} Damage`, spanText(d.final), differs(d.final[0], d.base[0]) || differs(d.final[1], d.base[1]), 'el-' + el));
    }
    out.push(line('Critical Hit Chance', fmt2(st.crit.final) + '%', differs(st.crit.final, st.crit.base)));
    out.push(line('Attacks per Second', fmt2(st.aps.final), differs(st.aps.final, st.aps.base)));
    if (st.range != null) out.push(line('Weapon Range', fmt1(st.range), false));
    // DPS row as on the trade site: only weapons that deal damage get one (wands, staves, sceptres, armour do not)
    const parts = [`<span>DPS: <b>${Math.round(st.dps.total)}</b></span>`];
    if (st.dps.physical > 0) parts.push(`<span>Physical DPS: <b>${fmt2(st.dps.physical)}</b></span>`);
    if (st.dps.elemental > 0) parts.push(`<span>Elemental DPS: <b>${fmt2(st.dps.elemental)}</b></span>`);
    out.push(`<div class="dps" title="Average of the shown damage range x the shown attacks per second, as the trade site computes it">${parts.join('')}</div>`);
  } else if (st.kind === 'armour') {
    for (const d of st.defences) out.push(line(d.label, fmt1(d.final), differs(d.final, d.base)));
    if (st.block) out.push(line('Block chance', fmt1(st.block.final) + '%', differs(st.block.final, st.block.base)));
  } else if (st.kind === 'caster') {
    if (st.spirit) out.push(line('Spirit', st.spirit.final, differs(st.spirit.final, st.spirit.base)));
    for (const s of st.skills) {
      const q = st.skillQuality ? ` <small class="skill-q" title="Quality on a wand or staff improves the skill it grants, not the weapon">skill quality +${st.skillQuality}%</small>` : '';
      out.push(`<div class="prop skill" title="The granted skill's level comes from the item level">Grants Skill: Level ${s.level} <b>${esc(s.name)}</b>${q}</div>`);
    }
  }
  return out;
}

function renderTooltip() {
  const it = S.item, b = S.base;
  TARGETS = removalTargets();
  const [name, sub] = itemName(it);
  const props = [];
  props.push(...statLines(itemStats(it)));
  const reqs = [`Level ${b.drop}`];
  const R = b.reqs || {};
  if (R.strength) reqs.push(`Str ${R.strength}`);
  if (R.dexterity) reqs.push(`Dex ${R.dexterity}`);
  if (R.intelligence) reqs.push(`Int ${R.intelligence}`);
  const implicit = it.implicits.map(m => `<div class="implicit">${modLines(DB.mods.get(m.id), m.rolls, it).map(esc).join('<br>')}</div>`).join('')
    + it.corruption.map(m => `<div class="corrupt-mod">${modLines(DB.mods.get(m.id), m.rolls).map(esc).join('<br>')}</div>`).join('');
  if (it.quality) props.unshift(`<div class="prop">Quality: <b class="q">+${it.quality}%</b></div>`);
  if (it.catalyst?.quality) props.unshift(`<div class="prop">Quality (${esc(it.catalyst.tag[0].toUpperCase() + it.catalyst.tag.slice(1))} Modifiers): <b class="q">+${it.catalyst.quality}%</b></div>`);
  // sockets drawn as rings; filled ones show the socketed rune / soul core art
  const socketRow = it.sockets ? `<div class="sockets">${Array.from({ length: it.sockets }, (_, i) => {
    const s = it.socketed[i];
    const targetable = S.method?.handler === 'poe2_socketable' && socketSlots(it, S.method.socket).includes(i);
    const cls = `socket ${s ? 'filled' : ''} ${s?.bound ? 'bound' : ''} ${targetable ? 'target' : ''}`;
    if (!s) return `<span class="${cls}" data-socket="${i}" title="Empty socket"></span>`;
    const art = s.item != null ? iconPath(s.item) : null;
    const tip = s.name + ': ' + s.lines.join(' / ') + (s.bound ? '\nSocket-bound: cannot be removed or replaced' : '');
    return `<span class="${cls}" data-socket="${i}" title="${esc(tip)}">${art ? `<img src="${art}" alt="" onerror="this.remove()">` : ''}${s.bound ? '<i class="lock">\u{1F512}</i>' : ''}</span>`;
  }).join('')}</div>` : '';
  const augments = it.socketed.map(x => `<div class="augment">${esc(x.name)}: ${x.lines.map(esc).join(' / ')}</div>`).join('');
  const prefixes = it.mods.map((m, i) => [m, i]).filter(([m]) => affixOf(DB.mods.get(m.id)) === 'prefix');
  const suffixes = it.mods.map((m, i) => [m, i]).filter(([m]) => affixOf(DB.mods.get(m.id)) === 'suffix');
  const mods = [...prefixes, ...suffixes].map(([m, i]) => modHtml(m, i)).join('')
    + it.unrevealed.map((u, i) => `<div class="unrevealed ${TARGETS?.cands.some(c => c.u === u) ? 'target' : ''}" data-unrev="${i}"><span>Unrevealed desecrated ${u.affix}</span> <button class="mini" data-reveal="${i}">Reveal at the Well of Souls</button></div>`).join('');
  $('#tooltip').innerHTML = `
    <div class="item-toolbar"><button class="mini" id="undo" ${S.history.length ? '' : 'disabled'}>Undo</button><button class="mini" id="resetItem" title="Back to a fresh item of the same base">Reset item</button></div>
    <div class="item ${it.rarity} ${S.method ? 'apply' : ''}" id="itemBox" title="${S.method ? 'Click to apply ' + esc(methodName(S.method)) : 'Select a crafting method'}">
      <div class="item-head">${esc(name)}${sub ? `<span class="sub">${esc(sub)}</span>` : ''}</div>
      <div class="item-body">
        ${baseArt(b, 'item-art')}
        ${socketRow}
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
  $('#pool').innerHTML = h + '</div>' + renderReferencePools();
}

// ---------- reference pools: everything this item could ever roll ----------
// Below the interactive pool: one section per special pool the class can draw from (a meta rune's pool, the
// Minion / Genesis Tree pools) and the desecrated pool. Read-only, listing every tier; tiers above the item
// level are greyed.

const famText = arr => modTemplate(arr[0].mod);

function refColumn(secId, kind, entries, weightOf) {
  const q = S.modSearch.toLowerCase();
  const byGroup = new Map();
  for (const e of entries.filter(x => x.affix === kind)) {
    if (!byGroup.has(e.mod.group)) byGroup.set(e.mod.group, []);
    byGroup.get(e.mod.group).push(e);
  }
  const fams = [...byGroup.values()]
    .map(arr => ({ arr: arr.slice().sort((a, b) => a.tier - b.tier), text: famText(arr) }))
    .filter(f => !q || f.text.toLowerCase().includes(q))
    .sort((a, b) => a.text.localeCompare(b.text));
  const tiers = fams.reduce((n, f) => n + f.arr.length, 0);
  let h = `<div><h3 class="${kind}">${kind}es <small>${fams.length} mods · ${tiers} tiers</small></h3>`;
  for (const f of fams) {
    const key = secId + '|' + f.arr[0].mod.group;
    const faction = f.arr[0].faction;
    const chips = tagChips(f.arr[0].mod).map(t => `<span class="tagchip">${t}</span>`).join('');
    const maxLvl = Math.max(...f.arr.map(e => e.mod.minlvl));
    h += `<div class="fam ref ${S.openPFam.has(key) || !!q ? 'open' : ''}">
      <div class="fam-name" data-pfam="${key}"><span>${esc(f.text)}${faction ? ` <b class="faction desec-${faction}">${faction}</b>` : ''}${chips}</span>
        <small>${f.arr.length > 1 ? f.arr.length + ' tiers · ' : ''}lvl ${f.arr.length > 1 ? Math.min(...f.arr.map(e => e.mod.minlvl)) + '–' : ''}${maxLvl}</small></div>
      <div class="tiers">${f.arr.map(e => `<div class="tier ref ${e.mod.minlvl > S.item.ilvl ? 'above' : ''}" data-addref="${e.mod.id}" data-addlich="${e.lich ? 1 : 0}" title="${esc(DB.text(e.mod.label))} (click to add)">
        <span class="t">T${e.tier}</span><span class="txt">${modLines(e.mod).map(esc).join('<br>')}</span>
        <span class="lv">${e.mod.minlvl}</span><span class="pct">${weightOf(e)}</span></div>`).join('')}</div></div>`;
  }
  if (!fams.length) h += '<p class="calc-note">None.</p>';
  return h + `<div class="ptotal">Total <b>${fams.length}</b> mods${tiers !== fams.length ? ` · ${tiers} tiers` : ''}</div></div>`;
}

function refSection(id, title, note, entries, weightOf) {
  const open = !S.secClosed.has(id);
  return `<div class="psec ${open ? 'open' : ''}"><button class="psec-head" data-psec="${id}"><span>${esc(title)}</span><span class="caret">▾</span></button>
    ${open ? `${note ? `<p class="calc-note">${note}</p>` : ''}<div class="pool">${['prefix', 'suffix'].map(k => refColumn(id, k, entries, weightOf)).join('')}</div>` : ''}</div>`;
}

function renderReferencePools() {
  const it = S.item;
  const socketedInfluences = bonus(it).influences;
  let h = '<h2 class="ref-title">Other pools <small>everything else this item can roll</small></h2>';
  const cls = DB.classes.get(it.classId);

  for (const pool of specialPools(it.classId)) {
    const borrowed = pool.borrowedFrom != null
      ? `Our data has no ${esc(pool.name)} pool for ${esc(DB.text(cls.label))}; showing the ${esc(DB.text(DB.classes.get(pool.borrowedFrom).label))} pool (the same set poe2db lists for it).`
      : '';
    const active = socketedInfluences.has(pool.influence) ? ' <b class="desec">active</b>' : '';
    const how = pool.influence >= 1009 ? 'Special pool, not unlocked by anything this tool simulates.' : `Unlocked by socketing ${esc(pool.name)}.`;
    h += refSection('meta' + pool.influence, pool.influence >= 1009 ? pool.name : `${pool.name} modifiers`, `${how} ${borrowed}${active}`, pool.entries, e => e.weight);
  }

  const lich = lichPool(it.classId);
  if (lich.length) {
    const shown = S.lichFaction === 'all' ? lich : lich.filter(e => e.faction === S.lichFaction);
    const chips = ['all', 'Amanamu', 'Kurgal', 'Ulaman'].map(f => `<button class="chip ${S.lichFaction === f ? 'active' : ''}" data-lichf="${f}">${f === 'all' ? 'All' : f}</button>`).join('');
    const note = `Revealed at the Well of Souls after a bone. GGG publishes no weights: every Lich mod uses weight ${ctx.settings.lichWeight} (Desecrate tab setting). `
      + '<div class="chips sub">' + chips + '</div>';
    h += refSection('desecrated', 'Desecrated Modifiers', note, shown, () => ctx.settings.lichWeight);
  }
  return h;
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

// ---------- right-click actions on a mod, and the dialogs they open ----------
// S.ctx = { kind: 'mod'|'unrev', idx, x, y }   S.modal = { type: 'values'|'details', idx }

const CTX_W = 250;

/**
 * Where the Actions menu goes: next to the item, never on top of it. It sits to the left of the item box (the item stays
 * fully visible), level with the mod that was right-clicked, and is kept inside the window. If there is no room on the
 * left it goes to the right of the item, and as a last resort it is centred.
 */
function ctxPosition(buttons) {
  const height = 62 + buttons * 54;                       // header + one row per button
  const box = $('#itemBox')?.getBoundingClientRect();
  const row = $(`#itemBox [data-remove="${S.ctx.idx}"], #itemBox [data-unrev="${S.ctx.idx}"]`)?.getBoundingClientRect();
  const gap = 14;
  let x;
  if (box && box.left - CTX_W - gap >= 8) x = box.left - CTX_W - gap;
  else if (box && box.right + CTX_W + gap <= window.innerWidth - 8) x = box.right + gap;
  else x = Math.max(8, (window.innerWidth - CTX_W) / 2);
  let wantY = (row ? row.top : S.ctx.y) - 20;
  const noSideRoom = !box || (box.left - CTX_W - gap < 8 && box.right + CTX_W + gap > window.innerWidth - 8);
  if (noSideRoom && row) {
    // narrow layout: the item fills the width, so keep the menu clear of the clicked mod by docking it to the opposite edge
    wantY = row.top + row.height / 2 > window.innerHeight / 2 ? 8 : window.innerHeight - height - 8;
  }
  const y = Math.max(8, Math.min(wantY, window.innerHeight - height - 8));
  return { x, y };
}

function renderOverlay() {
  const el = $('#overlay');
  if (!el) return;
  const it = S.item;
  let h = '';

  if (S.ctx && it) {
    const { kind, idx } = S.ctx;
    let items;
    if (kind === 'mod' && it.mods[idx]) {
      const m = it.mods[idx];
      const row = (action, label, blocked) => `<button class="ctx-btn" data-ctx="${action}" ${blocked ? 'disabled' : ''} title="${esc(blocked || '')}">${label}</button>`;
      items = row('remove', 'Remove modifier')
        + row('values', 'Modify values')
        + row('fracture', m.fractured ? 'Remove fracture' : 'Fracture modifier', flagBlocked(it, m, 'fractured'))
        + row('crafted', m.crafted ? 'Remove crafted mark' : 'Crafted modifier')
        + row('desecrate', m.desecrated ? 'Remove desecrated mark' : 'Desecrate modifier', flagBlocked(it, m, 'desecrated'))
        + row('details', 'View modifier details');
    } else if (kind === 'unrev' && it.unrevealed[idx]) {
      items = `<button class="ctx-btn" data-ctx="unrev-remove">Remove unrevealed slot</button>
        <button class="ctx-btn" data-ctx="unrev-reveal">Reveal at the Well of Souls</button>`;
    }
    if (items) {
      const { x, y } = ctxPosition(kind === 'mod' ? 6 : 2);
      h += `<div id="ctxMenu" style="left:${x}px;top:${y}px"><div class="ctx-head"><b>Actions</b><button class="mini" data-ctx="close">Close</button></div>${items}</div>`;
    }
  }

  if (S.modal && it) h += renderModal();
  el.innerHTML = h;
  document.querySelectorAll('.ctx-target').forEach(n => n.classList.remove('ctx-target'));
  if (S.ctx && it) document.querySelector(`#itemBox [data-remove="${S.ctx.idx}"], #itemBox [data-unrev="${S.ctx.idx}"]`)?.classList.add('ctx-target');
}

function renderModal() {
  const it = S.item;
  const m = it.mods[S.modal.idx];
  if (!m) return '';
  const mod = DB.mods.get(m.id);
  const entry = poolEntry(it.classId, m.id);
  const wrap = body => `<div class="modal-back" data-modal="cancel"><div class="modal" id="modalBox">${body}</div></div>`;

  if (S.modal.type === 'values') {
    const rows = mod.stats.map((s, i) => {
      const [a, b] = s.range[0] <= s.range[1] ? s.range : [s.range[1], s.range[0]];
      const whole = Number.isInteger(a) && Number.isInteger(b);
      const label = DB.text(s.label);
      return `<label class="val-row"><span>${esc(label.replace('#', '▢'))}</span>
        <input class="input small" type="number" data-valinput="${i}" min="${a}" max="${b}" step="${whole ? 1 : 0.01}" value="${m.rolls[i]}"><small>${a}–${b}</small></label>`;
    }).join('');
    return wrap(`<h3>Modify values</h3><p class="calc-note">${esc(modLines(mod, m.rolls).join(' / '))}</p>${rows}
      <div class="modal-actions"><button class="btn" data-modal="save">Save</button><button class="mini" data-modal="cancel">Cancel</button></div>`);
  }

  // details
  const pool = poolEntry(it.classId, m.id);
  const siblings = pool ? fullPoolAll(it.classId, mod.group) : [];
  const poolName = entry?.influence === 1000 ? 'Desecrated (Lich)' : entry?.influence >= 1002 ? `${specialPoolName(entry.influence)} pool` : 'Normal pool';
  const flags = [m.fractured && 'fractured', m.desecrated && 'desecrated', m.crafted && 'crafted'].filter(Boolean).join(', ') || 'none';
  const kv = (k, v) => `<tr><td>${k}</td><td>${v}</td></tr>`;
  const stats = mod.stats.map((s, i) => `${esc(DB.text(s.label).replace('#', `${m.rolls[i]}`))} <small class="calc-note">(range ${s.range[0]}–${s.range[1]})</small>`).join('<br>');
  const tiers = siblings.map(e => `<div class="tier ref ${e.mod.id === m.id ? 'on' : ''}"><span class="t">T${e.tier}</span><span class="txt">${modLines(e.mod).map(esc).join('<br>')}</span><span class="lv">${e.mod.minlvl}</span><span class="pct">${e.weight}</span></div>`).join('');
  return wrap(`<h3>Modifier details</h3>
    <table class="kv">${kv('Name', esc(DB.text(mod.label)))}${kv('Type', affixOf(mod) || 'special')}${kv('Pool', poolName)}${kv('Tier', pool ? 'T' + pool.tier : '–')}
      ${kv('Mod level', mod.minlvl)}${kv('Weight', pool ? pool.weight : '–')}${kv('Mod key', `<code>${esc(mod.key)}</code>`)}${kv('Group', mod.group)}${kv('Flags', flags)}${kv('Values', stats)}</table>
    ${tiers ? `<h4>All tiers of this mod</h4><div class="tiers-box">${tiers}</div>` : ''}
    <div class="modal-actions"><button class="mini" data-modal="cancel">Close</button></div>`);
}

const fullPoolAll = (classId, group) => [...classPool(classId), ...lichPool(classId), ...specialPools(classId).flatMap(p => p.entries)]
  .filter(e => e.mod.group === group).sort((a, b) => a.tier - b.tier);
const specialPoolName = influence => specialPools(S.item.classId).find(p => p.influence === influence)?.name || 'Special';

function ctxAction(action) {
  const ctx = S.ctx;
  S.ctx = null;
  if (!ctx || action === 'close') { renderOverlay(); return; }
  const { idx, kind } = ctx;

  if (kind === 'unrev') {
    if (action === 'unrev-reveal') { renderOverlay(); openReveal(idx); return; }
    editItem('Manual remove', it => { const [u] = it.unrevealed.splice(idx, 1); return u ? [{ op: 'remove', text: `Unrevealed desecrated ${u.affix}` }] : null; });
    return;
  }
  const m = S.item.mods[idx];
  if (!m) { renderOverlay(); return; }
  if (action === 'values' || action === 'details') { S.modal = { type: action, idx }; renderOverlay(); return; }
  if (action === 'remove') {
    editItem('Manual remove', it => { const [x] = it.mods.splice(idx, 1); return [{ op: 'remove', mod: x }]; });
  } else if (action === 'fracture') {
    editItem('Manual edit', it => {
      const x = it.mods[idx];
      if (flagBlocked(it, x, 'fractured')) return null;
      x.fractured = !x.fractured;
      return [{ op: 'note', text: `${x.fractured ? 'Fractured' : 'Un-fractured'}: ${modLines(DB.mods.get(x.id), x.rolls).join(' / ')}` }];
    });
  } else if (action === 'crafted') {
    editItem('Manual edit', it => {
      const x = it.mods[idx];
      x.crafted = !x.crafted;
      return [{ op: 'note', text: `${x.crafted ? 'Marked crafted' : 'Crafted mark removed'}: ${modLines(DB.mods.get(x.id), x.rolls).join(' / ')}` }];
    });
  } else if (action === 'desecrate') {
    editItem('Manual edit', it => {
      const x = it.mods[idx];
      if (flagBlocked(it, x, 'desecrated')) return null;
      x.desecrated = !x.desecrated;
      return [{ op: 'note', text: `${x.desecrated ? 'Marked desecrated' : 'Desecrated mark removed'}: ${modLines(DB.mods.get(x.id), x.rolls).join(' / ')}` }];
    });
  }
}

function modalAction(action) {
  const modal = S.modal;
  if (action !== 'save' || !modal) { S.modal = null; renderOverlay(); return; }
  const rolls = [...document.querySelectorAll('[data-valinput]')].map(i => i.value);
  S.modal = null;
  editItem('Modify values', it => {
    const m = setModValues(it, modal.idx, rolls);
    return m ? [{ op: 'reroll', mod: m }] : null;
  });
}

function renderCraft() {
  if (!S.item) { $('#craft').hidden = true; $('#cursorIcon') && ($('#cursorIcon').hidden = true); return; }
  $('#craft').hidden = false;
  renderCurrencies(); renderTooltip(); renderLog(); renderPool();
  updateCursorIcon(); renderOverlay();
}

function renderAll() { renderPicker(); renderSelected(); renderCraft(); }

// ---------- events ----------
// Right-click a mod (or an unrevealed slot) on the item to open its actions.
document.addEventListener('contextmenu', e => {
  const mod = e.target.closest('.mod[data-remove]');
  const unrev = e.target.closest('.unrevealed[data-unrev]');
  if (!S.item || !(mod || unrev)) return;
  e.preventDefault();
  S.modal = null;
  S.ctx = mod ? { kind: 'mod', idx: +mod.dataset.remove, x: e.clientX, y: e.clientY } : { kind: 'unrev', idx: +unrev.dataset.unrev, x: e.clientX, y: e.clientY };
  renderOverlay();
});

document.addEventListener('click', e => {
  if (S.ctx && !e.target.closest('#ctxMenu')) { S.ctx = null; renderOverlay(); }
  if (e.target.closest('[data-ctx]')) { ctxAction(e.target.closest('[data-ctx]').dataset.ctx); return; }
  const modalTarget = e.target.closest('[data-modal]');
  if (modalTarget) {
    // clicking the dark backdrop closes the dialog; clicking on the dialog's own text does not
    if (modalTarget.classList.contains('modal-back') && e.target.closest('#modalBox')) return;
    modalAction(modalTarget.dataset.modal); return;
  }
  if (S.openCurrency && !e.target.closest('.cur-wrap')) { S.openCurrency = null; renderCurrencies(); }
  const t = e.target.closest('[data-group],[data-class],[data-base],[data-crumb],[data-method],[data-family],[data-socket],[data-tab],[data-sub],[data-omen],[data-omen-off],[data-pin],[data-reveal],[data-pick],[data-fam],[data-pfam],[data-psec],[data-lichf],[data-add],[data-addref],[data-remove],#change,#reset,#resetItem,#undo,#revealReroll,#revealCancel,#itemBox');
  if (!t) return;
  if (t.dataset.group) {
    S.group = +t.dataset.group; S.cls = null; S.base = null; S.item = null; url(); renderAll();
  } else if (t.dataset.class) {
    S.cls = DB.classes.get(+t.dataset.class); S.base = null; S.item = null; S.baseSearch = ''; url(); renderAll();
  } else if (t.dataset.base) {
    selectBase(DB.items.get(+t.dataset.base));
  } else if (t.dataset.socket != null) {
    // clicking a socket places the held augment there; no-op for any other currency
    if (S.method?.handler === 'poe2_socketable') {
      if (!apply({ ...S.method, slot: +t.dataset.socket })) { /* failApply already logged */ }
    } else if (S.method) apply(S.method);
  } else if (t.dataset.family) {
    S.openCurrency = S.openCurrency === t.dataset.family ? null : t.dataset.family;
    renderCurrencies();
  } else if (t.dataset.tab) {
    S.tab = t.dataset.tab; S.method = null; renderCraft();
  } else if (t.dataset.sub != null) {
    S.sub[S.tab] = S.tab === 'Essences' ? +t.dataset.sub : t.dataset.sub; S.method = null; renderCraft();
  } else if (t.dataset.omenOff) {
    const id = t.dataset.omenOff;
    if (ctx.omens.has(id)) toggleOmen(id);          // switching it off also unpins it
    S.foresee = {}; S.reveal = null; renderCraft();
  } else if (t.dataset.pin) {
    togglePin(t.dataset.pin);
    S.foresee = {}; S.reveal = null; renderCraft();
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
  } else if (t.dataset.pfam) {
    S.openPFam.has(t.dataset.pfam) ? S.openPFam.delete(t.dataset.pfam) : S.openPFam.add(t.dataset.pfam);
    renderPool();
  } else if (t.dataset.psec) {
    S.secClosed.has(t.dataset.psec) ? S.secClosed.delete(t.dataset.psec) : S.secClosed.add(t.dataset.psec);
    renderPool();
  } else if (t.dataset.lichf) {
    S.lichFaction = t.dataset.lichf; renderPool();
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
  } else if (t.dataset.addref) {
    addSpecific(+t.dataset.addref, t.dataset.addlich === '1');
  } else if (t.dataset.remove != null && !e.target.closest('#itemBox[data-noremove]')) {
    // Alt-click removes a specific mod; plain click applies the selected method.
    if (e.altKey) removeSpecific(+t.dataset.remove);
    else if (S.method) apply(S.method);
  } else if (t.id === 'itemBox') {
    if (S.method) apply(S.method);
  } else if (t.dataset.crumb) {
    pickAgain(t.dataset.crumb);
  } else if (t.id === 'change') {
    pickAgain('base');
  } else if (t.id === 'reset') {
    resetAll();
  } else if (t.id === 'resetItem') {
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
  if (e.key === 'Escape' && (S.ctx || S.modal)) { S.ctx = null; S.modal = null; renderOverlay(); return; }
  if (e.key === 'Escape' && S.method) { S.method = null; S.openCurrency = null; renderCraft(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !/INPUT/.test(document.activeElement?.tagName)) { e.preventDefault(); undo(); }
});

// ---------- boot ----------
(async function boot() {
  await loadData();
  CATALOGUE = methodCatalogue();
  $('#app').innerHTML = '<div id="picker"></div><div id="selected"></div><div id="craft" hidden><div class="layout"><div class="main-col"><div id="currencies"></div><h2>Modifiers</h2><div id="pool"></div></div><div class="sticky"><div id="tooltip"></div><div id="log" class="log"></div></div></div></div><div id="cursorIcon" hidden><img alt="" hidden><span></span></div><div id="overlay"></div>';
  const p = new URLSearchParams(location.search);
  if (p.get('group')) S.group = +p.get('group');
  if (p.get('class')) S.cls = DB.classes.get(+p.get('class'));
  renderAll();
  if (p.get('item') && DB.items.get(+p.get('item'))) selectBase(DB.items.get(+p.get('item')));
  window.__craft = { S, DB, ctx, apply, renderCraft, openReveal, pickReveal, CATALOGUE, allMethods, findMethod }; // debug handle
})();
