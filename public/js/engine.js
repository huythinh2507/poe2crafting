// Pure crafting logic: no DOM access.
import { DB, classPool, lichPool, poolFor, corruptionPool, affixOf, essenceModIds, FACTIONS, META_POOLS } from './data.js';

export const MAX_AFFIX = { normal: [0, 0], magic: [1, 1], rare: [3, 3] };
export const MAX_QUALITY = 20;
export const MAX_QUALITY_VAAL = 30; // infusers may exceed the cap by up to 10%
const INFUSER_CORRUPT_CHANCE = 0.25; // assumption: wiki gives no number
const REVEAL_OPTIONS = 3;

// ---- Session context set by the UI (omens + tunable assumptions) ----
// GGG publishes no desecration weights ("cannot be obtained from game files"), so the reveal
// pool is configurable: Lich mods all share `lichWeight`; normal mods keep their data weights.
export const ctx = {
  omens: new Set(),
  settings: { includeNormal: true, lichWeight: 1000 },
};

// Omens are consumed by the *next* use of the currency they target ("for"). Wording follows poe2db.
// `todo` omens are listed but not simulated. `retired` omens exist in the data but can no longer be obtained
// (drop disabled in patch 0.3.0), so the UI hides them. `excl` = mutually exclusive groups.
export const OMENS = [
  // Chaos Orb
  { id: 'whittling', name: 'Omen of Whittling', for: 'poe2_chaos', hint: 'Chaos Orb removes the lowest-LEVEL modifier (required level, not tier). Unrevealed desecrated slots count as level 1. Ties: random.' },
  { id: 'erasure_prefix', name: 'Omen of Sinistral Erasure', for: 'poe2_chaos', hint: 'Chaos Orb removes only prefix modifiers.', excl: 'erasure' },
  { id: 'erasure_suffix', name: 'Omen of Dextral Erasure', for: 'poe2_chaos', hint: 'Chaos Orb removes only suffix modifiers.', excl: 'erasure' },
  // Orb of Annulment
  { id: 'annul_two', name: 'Omen of Greater Annulment', for: 'poe2_annulment', hint: 'Annulment removes two modifiers.', retired: true },
  { id: 'annul_prefix', name: 'Omen of Sinistral Annulment', for: 'poe2_annulment', hint: 'Annulment removes only prefix modifiers.', excl: 'annul' },
  { id: 'annul_suffix', name: 'Omen of Dextral Annulment', for: 'poe2_annulment', hint: 'Annulment removes only suffix modifiers.', excl: 'annul' },
  { id: 'light', name: 'Omen of Light', for: 'poe2_annulment', hint: 'Annulment removes only Desecrated modifiers (revealed or not).', excl: 'annul' },
  // Exalted Orb
  { id: 'exalt_two', name: 'Omen of Greater Exaltation', for: 'poe2_exalted', hint: 'Exalted Orb adds two random modifiers.' },
  { id: 'exalt_prefix', name: 'Omen of Sinistral Exaltation', for: 'poe2_exalted', hint: 'Exalted Orb adds only prefix modifiers.', excl: 'exalt' },
  { id: 'exalt_suffix', name: 'Omen of Dextral Exaltation', for: 'poe2_exalted', hint: 'Exalted Orb adds only suffix modifiers.', excl: 'exalt' },
  { id: 'exalt_homog', name: 'Omen of Homogenising Exaltation', for: 'poe2_exalted', hint: 'Exalted Orb adds a modifier of the same type (shares a tag) as an existing modifier.' },
  { id: 'exalt_catalyst', name: 'Omen of Catalysing Exaltation', for: 'poe2_exalted', todo: true, hint: 'Needs the catalyst system, not simulated yet.' },
  // Regal Orb
  { id: 'regal_prefix', name: 'Omen of Sinistral Coronation', for: 'poe2_regal', hint: 'Regal Orb adds only a prefix.', excl: 'regal', retired: true },
  { id: 'regal_suffix', name: 'Omen of Dextral Coronation', for: 'poe2_regal', hint: 'Regal Orb adds only a suffix.', excl: 'regal', retired: true },
  { id: 'regal_homog', name: 'Omen of Homogenising Coronation', for: 'poe2_regal', hint: 'Regal Orb adds a modifier of the same type (shares a tag) as an existing modifier.' },
  // Orb of Alchemy
  { id: 'alch_prefix', name: 'Omen of Sinistral Alchemy', for: 'poe2_alchemy', hint: 'Alchemy results in the maximum number of prefixes (3 prefixes, 1 suffix).', excl: 'alch', retired: true },
  { id: 'alch_suffix', name: 'Omen of Dextral Alchemy', for: 'poe2_alchemy', hint: 'Alchemy results in the maximum number of suffixes (3 suffixes, 1 prefix).', excl: 'alch', retired: true },
  // Vaal / Divine
  { id: 'corruption', name: 'Omen of Corruption', for: 'poe2_vaal', hint: 'Vaal Orb always results in a change (never the "no change" outcome).' },
  { id: 'blessed', name: 'Omen of the Blessed', for: 'poe2_divine', hint: 'Divine Orb rerolls only implicit modifiers.' },
  { id: 'sanctification', name: 'Omen of Sanctification', for: 'poe2_divine', todo: true, hint: 'Sanctification is not simulated yet.' },
  // Perfect / Corrupted / Alloy essences
  { id: 'crystal_prefix', name: 'Omen of Sinistral Crystallisation', for: 'poe2_essence', hint: 'Perfect / Corrupted essence (and alloy) removes only a prefix.', excl: 'crystal' },
  { id: 'crystal_suffix', name: 'Omen of Dextral Crystallisation', for: 'poe2_essence', hint: 'Perfect / Corrupted essence (and alloy) removes only a suffix.', excl: 'crystal' },
  // Desecration
  { id: 'sinistral', name: 'Omen of Sinistral Necromancy', for: 'poe2_desecrate', hint: 'Next desecration adds a prefix only.', excl: 'necro' },
  { id: 'dextral', name: 'Omen of Dextral Necromancy', for: 'poe2_desecrate', hint: 'Next desecration adds a suffix only.', excl: 'necro' },
  { id: 'putrefaction', name: 'Omen of Putrefaction', for: 'poe2_desecrate', hint: 'Replaces every unfractured modifier with an unrevealed desecrated one and corrupts the item.' },
  { id: 'echoes', name: 'Omen of Abyssal Echoes', for: 'reveal', hint: 'Lets you reroll the revealed options once.' },
  { id: 'Ulaman', name: 'Omen of the Sovereign', for: 'reveal', hint: 'Weapon / Jewellery only: one revealed option is guaranteed to be an Ulaman modifier.', excl: 'faction' },
  { id: 'Kurgal', name: 'Omen of the Blackblooded', for: 'reveal', hint: 'Weapon / Jewellery only: one revealed option is guaranteed to be a Kurgal modifier.', excl: 'faction' },
  { id: 'Amanamu', name: 'Omen of the Liege', for: 'reveal', hint: 'Weapon / Jewellery only: one revealed option is guaranteed to be an Amanamu modifier.', excl: 'faction' },
];
const OMEN_BY_ID = Object.fromEntries(OMENS.map(o => [o.id, o]));

/** Toggle an omen on/off, switching off any it excludes. */
export function toggleOmen(id) {
  const o = OMEN_BY_ID[id];
  if (!o || o.todo) return;
  if (ctx.omens.has(id)) { ctx.omens.delete(id); return; }
  if (o.excl) for (const other of OMENS) if (other.excl === o.excl) ctx.omens.delete(other.id);
  ctx.omens.add(id);
}

/** Omens (ids) that the next use of `handler` consumes. */
export const omensConsumedBy = handler => OMENS.filter(o => o.for === baseHandler(handler)).map(o => o.id);
/** Called by the UI after a successful (non-preview) use of a currency. */
export function consumeOmens(handler) { for (const id of omensConsumedBy(handler)) ctx.omens.delete(id); }

const rnd = (min, max) => {
  if (Number.isInteger(min) && Number.isInteger(max)) return min + Math.floor(Math.random() * (max - min + 1));
  return Math.round((min + Math.random() * (max - min)) * 100) / 100;
};
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

export function rollMod(mod) {
  return { id: mod.id, rolls: mod.stats.map(s => rnd(s.range[0], s.range[1])) };
}

export function newItem(base, ilvl = 100) {
  return {
    baseId: base.id, classId: base.class, ilvl, rarity: 'normal',
    implicits: (base.implicits || []).map(id => rollMod(DB.mods.get(id))),
    mods: [],
    unrevealed: [],   // desecrated slots waiting for the Well of Souls: [{ affix, minLevel }]
    quality: 0,
    sockets: base.sockets || 0,
    socketed: [],     // [{ item, name, lines, influence?, suffix?, crafted?, transform? }]
    corrupted: false,
    corruption: [],   // Vaal enchant implicits
    lock: false,      // Hinekora's Lock armed
  };
}

const baseOf = item => DB.items.get(item.baseId);
const affixOfMod = m => affixOf(DB.mods.get(m.id));

// ---- Effects of socketed meta runes ----
export function bonus(item) {
  const b = { suffix: 0, crafted: 0, influences: new Set(), transform: null };
  for (const s of item.socketed) {
    b.suffix += s.suffix || 0;
    b.crafted += s.crafted || 0;
    if (s.influence) b.influences.add(s.influence);
    if (s.transform) b.transform = s.transform;
  }
  return b;
}

export const maxAffix = item => {
  const [p, s] = MAX_AFFIX[item.rarity];
  return [p, item.rarity === 'rare' ? s + bonus(item).suffix : s];
};

export const countAffix = (item, kind) =>
  item.mods.filter(m => affixOfMod(m) === kind).length + item.unrevealed.filter(u => u.affix === kind).length;

export function openSlots(item) {
  const [mp, ms] = maxAffix(item);
  return { prefix: mp - countAffix(item, 'prefix'), suffix: ms - countAffix(item, 'suffix') };
}

export const explicitCount = item => item.mods.length + item.unrevealed.length;
export const craftedFull = item => item.mods.filter(m => m.crafted).length >= 1 + bonus(item).crafted;

/** Normal pool plus any pools unlocked by socketed meta runes ("Can roll Destruction modifiers"). */
export function fullPool(item) {
  const extra = [...bonus(item).influences].flatMap(inf => poolFor(item.classId, inf));
  return [...classPool(item.classId), ...extra];
}

/**
 * "Minimum Modifier Level" never removes a mod type from the pool entirely: when no tier of a
 * group reaches the floor, the highest tier the item can still roll stays (confirmed by GGG:
 * a Perfect Exalted Orb can add "Energy Shield Recharge Rate" at mod level 48).
 * `entries` must already be limited to what the item can roll (item level, open slots, ...).
 */
export function applyMinLevel(entries, min) {
  if (!min) return entries;
  const byGroup = new Map();
  for (const e of entries) {
    if (!byGroup.has(e.mod.group)) byGroup.set(e.mod.group, []);
    byGroup.get(e.mod.group).push(e);
  }
  const out = [];
  for (const arr of byGroup.values()) {
    const high = arr.filter(e => e.mod.minlvl >= min);
    out.push(...(high.length ? high : [arr.reduce((a, b) => (b.mod.minlvl > a.mod.minlvl ? b : a))]));
  }
  return out;
}

// Mods that could be added right now. opts.minLevel = greater/perfect orb floor.
export function eligibleMods(item, opts = {}) {
  const open = openSlots(item);
  const used = new Set(item.mods.map(m => DB.mods.get(m.id).group));
  let rollable = fullPool(item).filter(e =>
    open[e.affix] > 0 && e.mod.minlvl <= item.ilvl && !used.has(e.mod.group) && (!opts.affix || e.affix === opts.affix));
  if (opts.homog) { // "same type as an existing modifier" = shares a tag with one
    const have = new Set(item.mods.flatMap(m => groupTags(DB.mods.get(m.id))));
    rollable = rollable.filter(e => groupTags(e.mod).some(t => have.has(t)));
  }
  return applyMinLevel(rollable, opts.minLevel);
}
const groupTags = mod => (DB.groups.get(mod.group)?.tags || []).filter(t => t !== 0);

/** Options for adding a mod, from the active omens of the currency being used. */
function addOpts(base, handler) {
  const o = ctx.omens, a = { ...base };
  if (handler === 'poe2_exalted') {
    if (o.has('exalt_prefix')) a.affix = 'prefix';
    if (o.has('exalt_suffix')) a.affix = 'suffix';
    if (o.has('exalt_homog')) a.homog = true;
  } else if (handler === 'poe2_regal') {
    if (o.has('regal_prefix')) a.affix = 'prefix';
    if (o.has('regal_suffix')) a.affix = 'suffix';
    if (o.has('regal_homog')) a.homog = true;
  }
  return a;
}

export function pickWeighted(entries) {
  const total = entries.reduce((s, e) => s + e.weight, 0);
  if (!total) return null;
  let r = Math.random() * total;
  for (const e of entries) { if ((r -= e.weight) < 0) return e; }
  return entries[entries.length - 1];
}

// ---- Fire/Cold/Lightning transform runes (Passion/Breath/Ire of Aldur) ----
// Data only defines equivalents for resistances: tag -> tier-aligned mod id lists.
function equivalentMod(modId, to) {
  const eq = DB.raw.mods.equivalencies || {};
  const tagKey = tag => DB.raw.tags.entries.find(t => String(t.id) === String(tag))?.key;
  let idx = -1;
  for (const ids of Object.values(eq)) if (ids.includes(modId)) idx = ids.indexOf(modId);
  if (idx < 0) return modId;
  for (const [tag, ids] of Object.entries(eq)) if (tagKey(tag) === to) return ids[idx] ?? modId;
  return modId;
}
const transformed = (item, mod) => {
  const to = bonus(item).transform;
  return to ? DB.mods.get(equivalentMod(mod.id, to)) || mod : mod;
};

const addRandom = (item, opts) => {
  const e = pickWeighted(eligibleMods(item, opts));
  if (!e) return null;
  const added = rollMod(transformed(item, e.mod));
  item.mods.push(added);
  return added;
};

// Fractured mods are locked in and never removed. Unrevealed desecrated slots can be removed
// and count as level 1 for Whittling.
const removable = item => item.mods.filter(m => !m.fractured);

/**
 * Mods a Fracturing Orb can lock: desecrated mods cannot be fractured (unrevealed ones still count
 * toward the 4-mod minimum), and an already-fractured mod is not a candidate. So 3 normal mods + 1
 * desecrated gives each normal mod a 1-in-3 chance instead of 1-in-4.
 */
export const fractureCandidates = item => item.mods.filter(m => !m.fractured && !m.desecrated);

/**
 * Everything a removal could hit, after omen filters.
 * opts: kind ('prefix'|'suffix'), desecrated (Omen of Light), whittle (Omen of Whittling).
 * Whittling keeps only the candidates with the lowest mod LEVEL (required level, not tier).
 */
export function removalPool(item, opts = {}) {
  let c = [
    ...removable(item).map(m => ({ m, level: DB.mods.get(m.id).minlvl, affix: affixOfMod(m), desecrated: !!m.desecrated })),
    ...item.unrevealed.map(u => ({ u, level: 1, affix: u.affix, desecrated: true })),
  ];
  if (opts.kind) c = c.filter(x => x.affix === opts.kind);
  if (opts.desecrated) c = c.filter(x => x.desecrated);
  if (opts.whittle && c.length) {
    const lowest = Math.min(...c.map(x => x.level));
    c = c.filter(x => x.level === lowest);
  }
  return c;
}

function removeCandidate(item, c) {
  if (c.m) { item.mods.splice(item.mods.indexOf(c.m), 1); return { op: 'remove', mod: c.m }; }
  item.unrevealed.splice(item.unrevealed.indexOf(c.u), 1);
  return { op: 'remove', text: `Unrevealed desecrated ${c.u.affix}` };
}

/** Remove one random mod (optionally only of `kind`). Returns a change object or null. */
function removeRandom(item, kind = null, opts = {}) {
  const cands = removalPool(item, { ...opts, kind: kind || opts.kind });
  return cands.length ? removeCandidate(item, pick(cands)) : null;
}

/** Removal filters implied by the active omens for a currency. */
export function removalOpts(handler, essenceReplaces = false) {
  const o = ctx.omens, r = {};
  if (handler === 'poe2_chaos') {
    if (o.has('whittling')) r.whittle = true;
    if (o.has('erasure_prefix')) r.kind = 'prefix';
    if (o.has('erasure_suffix')) r.kind = 'suffix';
  } else if (handler === 'poe2_annulment') {
    if (o.has('annul_prefix')) r.kind = 'prefix';
    if (o.has('annul_suffix')) r.kind = 'suffix';
    if (o.has('light')) r.desecrated = true;
    r.count = o.has('annul_two') ? 2 : 1;
  } else if (handler === 'poe2_essence' && essenceReplaces) {
    if (o.has('crystal_prefix')) r.kind = 'prefix';
    if (o.has('crystal_suffix')) r.kind = 'suffix';
  }
  return r;
}

// ---- Item kind helpers (match the site's *_base constraints) ----
const MARTIAL = new Set([43, 44, 51, 52, 53, 54, 55, 57, 58, 65, 66, 67, 68, 90, 103]);
const CASTER = new Set([45, 46, 47, 48, 49, 50, 56, 59, 60, 61, 62, 63, 64]);
const SHIELDS = new Set([37, 38, 40, 41, 42]);
const groupOf = item => DB.classes.get(item.classId)?.group;
const isArmour = item => [1, 2, 3, 4].includes(groupOf(item)) || SHIELDS.has(item.classId);
export const isMartial = item => MARTIAL.has(item.classId);
export const isCaster = item => CASTER.has(item.classId);
const canSocket = item => (baseOf(item).sockets || 0) > 0;
const noDesecrated = item => !item.unrevealed.length && !item.mods.some(m => m.desecrated);

// ---- Constraints (same ids the site's method data uses) ----
const CONSTRAINTS = {
  rarity_normal: i => i.rarity === 'normal',
  rarity_magic: i => i.rarity === 'magic',
  rarity_rare: i => i.rarity === 'rare',
  rarity_not_rare: i => i.rarity !== 'rare',
  rarity_not_normal: i => i.rarity !== 'normal',
  can_be_rare: () => true,
  is_modifiable: i => !i.corrupted,
  can_corrupt: i => !i.corrupted && DB.classes.get(i.classId)?.corrupt !== false,
  corruptable_base: i => !i.corrupted,
  tablet_base: () => false,
  not_strongbox: i => groupOf(i) !== 15,
  open_affix: i => { const o = openSlots(i); return o.prefix > 0 || o.suffix > 0; },
  minimum_1_explicit: i => explicitCount(i) >= 1,
  minimum_4_explicits: i => explicitCount(i) >= 4, // an unrevealed desecrated slot counts too
  weapon_quality_base: isMartial,
  caster_quality_base: isCaster,
  armour_quality_base: isArmour,
  flask_base: i => groupOf(i) === 9,
  ring_or_amulet_base: i => i.classId === 33 || i.classId === 34,
  not_maximum_quality: i => i.quality < MAX_QUALITY,
  socketable_base: canSocket,
  not_maximum_sockets: i => i.sockets < (baseOf(i).sockets || 0),
  no_fracture: i => !i.mods.some(m => m.fractured),
  essence_base: () => true,
  has_empty_socket: i => i.socketed.length < i.sockets,
  // desecration
  desecration_base: i => BONE_BASES.some(f => f(i)),
  desecration_jawbone_base: i => isMartial(i) || isCaster(i) || groupOf(i) === 7 || groupOf(i) === 8 || i.classId === 36,
  desecration_rib_base: i => isArmour(i) || i.classId === 39,
  desecration_collarbone_base: i => [33, 34, 35].includes(i.classId),
  desecration_cranium_base: i => groupOf(i) === 10,
  desecration_vertebrae_base: i => groupOf(i) === 13,
  max_item_level_64: i => i.ilvl <= 64,
  not_desecrated: i => ctx.omens.has('putrefaction') || noDesecrated(i),
  has_unrevealed: i => i.unrevealed.length > 0,
};
const BONE_BASES = [
  i => CONSTRAINTS.desecration_jawbone_base(i), i => CONSTRAINTS.desecration_rib_base(i),
  i => CONSTRAINTS.desecration_collarbone_base(i), i => CONSTRAINTS.desecration_cranium_base(i),
  i => CONSTRAINTS.desecration_vertebrae_base(i),
];
// Extra per-handler requirements that aren't in the site's constraint lists.
const HANDLER_EXTRA = {
  poe2_fracture: ['no_fracture'],
  poe2_vaal_infuser: ['not_corrupted'],
  hinekora_lock: ['not_locked'],
};
CONSTRAINTS.not_corrupted = i => !i.corrupted;
CONSTRAINTS.not_locked = i => !i.lock;

export const checkConstraints = (item, list = [], handler) =>
  [...list, ...(HANDLER_EXTRA[handler ? baseHandler(handler) : ''] || (handler?.startsWith('spawn_') ? ['not_corrupted'] : []))]
    .every(c => (CONSTRAINTS[c] ? CONSTRAINTS[c](item) : false));

const added = a => (a ? [{ op: 'add', mod: a }] : []);
const note = text => [{ op: 'note', text }];
const qualityGain = item => ({ normal: 5, magic: 2, rare: 1 }[item.rarity]);

function chaosOnce(item) {
  const rem = removeRandom(item);
  return rem ? [rem, ...added(addRandom(item))] : [];
}

// Add `n` mods, all-or-nothing (returns null if the item can't take them).
function addMany(item, n, opts) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const a = addRandom(item, opts);
    if (!a) return null;
    out.push({ op: 'add', mod: a });
  }
  return out;
}

function vaal(item) {
  item.corrupted = true;
  // Omen of Corruption removes the "no change" outcome
  const roll = ctx.omens.has('corruption') ? 1 + Math.floor(Math.random() * 3) : Math.floor(Math.random() * 4);
  if (roll === 0) return note('Corrupted — no other change');
  if (roll === 1) {
    const n = 1 + Math.floor(Math.random() * 3);
    const out = [];
    for (let k = 0; k < n; k++) out.push(...chaosOnce(item));
    return [...note(`Corrupted — rerolled ${n}×`), ...out];
  }
  const enchant = () => {
    const e = pickWeighted(corruptionPool(item.classId));
    if (!e) return note('Corrupted — no enchant available');
    const m = rollMod(e.mod);
    item.corruption.push(m);
    return [{ op: 'add', mod: m }];
  };
  if (roll === 2) return [...note('Corrupted — enchantment'), ...enchant()];
  if (canSocket(item)) { item.sockets += 1; return note(`Corrupted — +1 socket (${item.sockets})`); }
  if (isCaster(item)) {
    const delta = Math.floor(Math.random() * 11) * (Math.random() < 0.5 ? -1 : 1);
    item.quality = Math.max(0, Math.min(23, item.quality + delta));
    return note(`Corrupted — quality ${delta >= 0 ? '+' : ''}${delta}% (now ${item.quality}%)`);
  }
  return [...note('Corrupted — enchantment'), ...enchant()];
}

const addQuality = (item, cap = MAX_QUALITY) => {
  const before = item.quality;
  item.quality = Math.min(cap, item.quality + qualityGain(item));
  return note(`Quality +${item.quality - before}% (now ${item.quality}%)`);
};

// ---- Essences (incl. Alloys) ----
// Essence mod for a class: highest tier the item level allows.
export function essenceMod(item, essence) {
  const ids = essenceModIds(essence.id, item.classId);
  const mods = ids.map(id => DB.mods.get(id)).filter(Boolean);
  const fit = mods.filter(m => m.minlvl <= item.ilvl).sort((a, b) => b.minlvl - a.minlvl);
  return fit[0] || mods.sort((a, b) => a.minlvl - b.minlvl)[0] || null;
}
export const essenceReplaces = essence => essence.type >= 3; // Perfect, Corrupted, Alloy

/** Can this essence work on the item right now? (UI greys the button out when not) */
export function essenceApplicable(item, essence) {
  const mod = essenceMod(item, essence);
  if (!mod) return false;
  const clash = item.mods.some(m => DB.mods.get(m.id).group === mod.group);
  if (!essenceReplaces(essence)) return item.rarity === 'magic' && !clash;
  return item.rarity === 'rare' && !craftedFull(item);
}

function essence(item, _o, method) {
  const e = method.essence;
  const mod = essenceMod(item, e);
  if (!mod) return null;
  const kind = affixOf(mod);
  if (!essenceReplaces(e)) {
    if (item.rarity !== 'magic' || item.mods.some(m => DB.mods.get(m.id).group === mod.group)) return null;
    item.rarity = 'rare';
    if (openSlots(item)[kind] <= 0) return null;
    const rolled = rollMod(mod);
    item.mods.push(rolled);
    return [{ op: 'add', mod: rolled }];
  }
  if (item.rarity !== 'rare' || craftedFull(item)) return null;
  const filter = removalOpts('poe2_essence', true);
  const gone = removeRandom(item, filter.kind || (openSlots(item)[kind] > 0 ? null : kind));
  if (!gone) return null;
  if (item.mods.some(m => DB.mods.get(m.id).group === mod.group) || openSlots(item)[kind] <= 0) return null;
  const rolled = { ...rollMod(mod), crafted: true };
  item.mods.push(rolled);
  return [gone, { op: 'add', mod: rolled }];
}

// ---- Socketables (runes, soul cores, idols, ...) ----
const fmtNum = n => (Number.isInteger(n) ? String(n) : String(+n.toFixed(2)));
const fmtRange = ([a, b]) => (a === b ? fmtNum(a) : `(${fmtNum(a)}-${fmtNum(b)})`);
function socketText(stat) {
  const label = DB.text(stat.output);
  const hashes = (label.match(/#/g) || []).length;
  if (hashes === 2) return label.replace('#', fmtNum(stat.range[0])).replace('#', fmtNum(stat.range[1]));
  if (hashes === 1) return label.replace('#', fmtRange(stat.range));
  return label;
}

/** Effect lines of socketable `e` on `item`, or null if it does nothing there. */
export function socketEffect(item, e) {
  const classKey = DB.classes.get(item.classId)?.class;
  const stat = (isMartial(item) && e.martial) || (isCaster(item) && e.caster) || (isArmour(item) && e.armour)
    || e.class?.[classKey] || e.all || null;
  return stat ? [socketText(stat)] : null;
}

export function socketAllowed(item, e) {
  if (e.limit == null) return true;
  const lim = DB.raw.methods.socketables.limits[e.limit];
  if (!lim) return true;
  const same = item.socketed.filter(s => (e.limit <= 1 ? s.item === e.item : s.limit === e.limit));
  return same.length < lim.number;
}

/** Meta-rune effects parsed from the rune's own text. */
export function metaEffects(text) {
  const out = {};
  const roll = text.match(/Can roll (\w+) modifiers/);
  if (roll && META_POOLS[roll[1]]) out.influence = META_POOLS[roll[1]];
  const suf = text.match(/\+(\d+) Suffix Modifier allowed/);
  if (suf) out.suffix = +suf[1];
  const crafted = text.match(/Can have (\d+) additional Crafted Modifier/);
  if (crafted) out.crafted = +crafted[1];
  const tr = text.match(/equivalent (Fire|Cold|Lightning) modifiers/i);
  if (tr) out.transform = tr[1].toLowerCase();
  return out;
}

/**
 * Sockets an augment could go into. Filled sockets are replaceable (the old augment is destroyed)
 * unless the augment is socket-bound; limits (one Ancient, one Aldur's Legacy, ...) are counted as
 * if the replaced augment were already gone. Only the first empty socket counts as "empty".
 */
export function socketSlots(item, e) {
  if (!socketEffect(item, e)) return [];
  const out = [];
  for (let i = 0; i < item.sockets; i++) {
    if (i > item.socketed.length) break;
    if (item.socketed[i]?.bound) continue;
    const rest = { ...item, socketed: item.socketed.filter((_, k) => k !== i) };
    if (socketAllowed(rest, e)) out.push(i);
  }
  return out;
}

function socket(item, _o, method) {
  const e = method.socket;
  const lines = socketEffect(item, e);
  const slots = socketSlots(item, e);
  if (!lines || !slots.length) return null;
  // UI passes the clicked socket as method.slot; otherwise use the first empty socket (else the first replaceable)
  let slot = method.slot;
  // replacing destroys an augment, so it only happens when a filled socket is clicked explicitly
  if (slot == null) slot = item.socketed.length < item.sockets ? item.socketed.length : -1;
  if (!slots.includes(slot)) return null;
  const name = DB.text(DB.items.get(e.item)?.label);
  const rec = { item: e.item, limit: e.limit, name, lines, bound: !!e.bound, ...metaEffects(lines.join(' ')) };
  const replaced = item.socketed[slot];
  if (replaced) item.socketed[slot] = rec; else item.socketed.push(rec);
  const out = note(`Socketed ${name}: ${lines.join(' / ')}${replaced ? ` (destroyed ${replaced.name})` : ''}`);
  if (rec.transform) {
    // retroactively transform resistances already on the item
    item.mods = item.mods.map(m => {
      const to = equivalentMod(m.id, rec.transform);
      return to === m.id ? m : { ...m, ...rollMod(DB.mods.get(to)), id: to };
    });
  }
  return out;
}

// ---- Desecration: bones add an unrevealed slot, the Well of Souls reveals one of 3 options ----
function desecrate(item, o) {
  if (item.rarity !== 'rare') return null;
  const minLevel = o.minLevel || 0;
  if (ctx.omens.has('putrefaction')) {
    const gone = item.mods.filter(m => !m.fractured);
    if (!gone.length) return null;
    item.mods = item.mods.filter(m => m.fractured);
    const out = gone.map(m => { item.unrevealed.push({ affix: affixOfMod(m), minLevel }); return { op: 'remove', mod: m }; });
    item.corrupted = true;
    return [...out, ...note(`Putrefaction: ${gone.length} unrevealed desecrated modifiers, item corrupted`)];
  }
  const open = openSlots(item);
  let affix = ctx.omens.has('sinistral') ? 'prefix' : ctx.omens.has('dextral') ? 'suffix' : null;
  const out = [];
  if (!affix) {
    const kinds = ['prefix', 'suffix'].filter(k => open[k] > 0);
    if (kinds.length) affix = pick(kinds);
    else { // full item: a random modifier is removed first and its slot is reused
      const gone = removeRandom(item);
      if (!gone) return null;
      out.push(gone);
      affix = gone.mod ? affixOfMod(gone.mod) : pick(['prefix', 'suffix']);
    }
  } else if (open[affix] <= 0) {
    const gone = removeRandom(item, affix);
    if (!gone) return null;
    out.push(gone);
  }
  item.unrevealed.push({ affix, minLevel });
  return [...out, ...note(`Unrevealed desecrated ${affix} added — reveal it at the Well of Souls`)];
}

/** Weighted candidates for one unrevealed slot. Lich mods share ctx.settings.lichWeight. */
export function desecratedPool(item, u) {
  const used = new Set(item.mods.map(m => DB.mods.get(m.id).group));
  const ok = e => e.affix === u.affix && e.mod.minlvl <= item.ilvl && !used.has(e.mod.group);
  const lich = applyMinLevel(lichPool(item.classId).filter(ok), u.minLevel)
    .map(e => ({ ...e, weight: ctx.settings.lichWeight, lich: true }));
  const normal = ctx.settings.includeNormal ? applyMinLevel(fullPool(item).filter(ok), u.minLevel) : [];
  return [...lich, ...normal];
}

/** Per-draw probability of each mod in the pool (weight / total). */
export function desecratedChances(item, u) {
  const pool = desecratedPool(item, u);
  const total = pool.reduce((s, e) => s + e.weight, 0);
  return { total, entries: pool.map(e => ({ ...e, chance: total ? e.weight / total : 0 })) };
}

/** Draw up to 3 distinct (by mod group) options, weighted without replacement. */
/** Faction omens (Sovereign / Liege / Blackblooded) only work on Weapon or Jewellery desecration. */
export const factionOmenApplies = item => CONSTRAINTS.desecration_jawbone_base(item) || CONSTRAINTS.desecration_collarbone_base(item);

export function revealOptions(item, u) {
  let pool = desecratedPool(item, u);
  const out = [];
  const faction = factionOmenApplies(item) && FACTIONS.find(f => ctx.omens.has(f));
  if (faction) { // one option is guaranteed to be a random mod of that faction
    const guaranteed = pickWeighted(pool.filter(e => e.lich && e.faction === faction));
    if (guaranteed) { out.push(guaranteed); pool = pool.filter(x => x.mod.group !== guaranteed.mod.group); }
  }
  while (out.length < REVEAL_OPTIONS && pool.length) {
    const e = pickWeighted(pool);
    out.push(e);
    pool = pool.filter(x => x.mod.group !== e.mod.group);
  }
  return out;
}

/** Replace unrevealed slot `idx` by the chosen entry. */
export function revealMod(item, idx, entry) {
  item.unrevealed.splice(idx, 1);
  const m = { ...rollMod(transformed(item, entry.mod)), desecrated: true };
  item.mods.push(m);
  return [{ op: 'add', mod: m }];
}

// ---- Handlers: mutate item, return change list, or null if impossible ----
const HANDLERS = {
  poe2_transmutation: (i, o) => { i.rarity = 'magic'; return added(addRandom(i, o)); },
  poe2_augmentation: (i, o) => added(addRandom(i, o)),
  poe2_regal: (i, o) => { i.rarity = 'rare'; return addMany(i, 1, addOpts(o, 'poe2_regal')); },
  poe2_alchemy: (i, o) => {
    i.rarity = 'rare'; i.mods = []; i.unrevealed = [];
    // Sinistral / Dextral Alchemy: three of one affix, one of the other
    const order = ctx.omens.has('alch_prefix') ? ['prefix', 'prefix', 'prefix', 'suffix']
      : ctx.omens.has('alch_suffix') ? ['suffix', 'suffix', 'suffix', 'prefix'] : [null, null, null, null];
    const out = [];
    for (const affix of order) out.push(...added(addRandom(i, { ...o, affix }) || addRandom(i, o)));
    return out;
  },
  poe2_chaos: (i, o) => {
    const rem = removeRandom(i, null, removalOpts('poe2_chaos'));
    if (!rem) return null;
    const out = [rem, ...added(addRandom(i, o))];
    return out;
  },
  poe2_exalted: (i, o) => addMany(i, ctx.omens.has('exalt_two') ? 2 : 1, addOpts(o, 'poe2_exalted')),
  poe2_annulment: i => {
    const { count, ...opts } = removalOpts('poe2_annulment');
    const out = [];
    for (let k = 0; k < count; k++) { const r = removeRandom(i, null, opts); if (r) out.push(r); }
    return out.length ? out : null;
  },
  poe2_divine: i => {
    const out = [];
    const reroll = m => { const n = { ...m, ...rollMod(DB.mods.get(m.id)) }; out.push({ op: 'reroll', mod: n }); return n; };
    i.implicits = i.implicits.map(reroll);
    if (!ctx.omens.has('blessed')) i.mods = i.mods.map(reroll); // Omen of the Blessed: implicits only
    return out;
  },
  poe2_fracture: i => {
    const cands = fractureCandidates(i);
    if (!cands.length) return null;
    const m = pick(cands);
    m.fractured = true;
    return [{ op: 'fracture', mod: m }];
  },
  poe2_vaal: vaal,
  poe2_vaal_infuser: i => {
    const out = addQuality(i, MAX_QUALITY_VAAL);
    if (Math.random() < INFUSER_CORRUPT_CHANCE) { i.corrupted = true; out.push(...note('Corrupted')); }
    return out;
  },
  blacksmith_whetstone: i => addQuality(i),
  arcanist_etcher: i => addQuality(i),
  armourer_scrap: i => addQuality(i),
  glassblower_bauble: i => addQuality(i),
  artificer: i => { i.sockets += 1; return note(`Socket added (${i.sockets})`); },
  poe2_essence: essence,
  poe2_socketable: socket,
  poe2_desecrate: desecrate,
  hinekora_lock: i => { i.lock = true; return note("Hinekora's Lock armed — the next currency's result is foreseen"); },
  spawn_normal_item: i => { i.rarity = 'normal'; i.mods = []; i.unrevealed = []; return []; },
  spawn_magic_item: i => {
    i.rarity = 'magic'; i.mods = []; i.unrevealed = [];
    const out = added(addRandom(i));
    if (Math.random() < 0.5) out.push(...added(addRandom(i)));
    return out;
  },
  spawn_rare_item: i => {
    i.rarity = 'rare'; i.mods = []; i.unrevealed = [];
    const n = 4 + Math.floor(Math.random() * 3);
    const out = [];
    for (let k = 0; k < n; k++) out.push(...added(addRandom(i)));
    return out;
  },
};

// Greater/Perfect variants (poe2_chaos_greater, ...) share the base handler; only min_mod_level differs.
// Desecration bones (poe2_desecrate_low/mid/high/breach) all share one handler too.
const baseHandler = h => (h.startsWith('poe2_desecrate') ? 'poe2_desecrate' : h.replace(/_(greater|perfect)$/, ''));
export const handlerImplemented = h => baseHandler(h) in HANDLERS;

const minLevelOf = method => {
  for (const p of method?.properties || []) if (p.key === 'min_mod_level') return p.value;
  return 0;
};

// Rarity the item will have when the new mod is picked.
const probeRarity = (item, handler) => {
  const p = structuredClone(item);
  if (handler === 'poe2_transmutation') p.rarity = 'magic';
  if (handler === 'poe2_regal' || handler === 'poe2_alchemy') p.rarity = 'rare';
  if (handler === 'poe2_alchemy') { p.mods = []; p.unrevealed = []; }
  if (handler === 'poe2_chaos' && p.mods.length) p.mods.pop(); // approximate: removal frees a slot
  return p;
};

/** Apply method element ({handler, properties}) in place. Returns change list, or null if impossible. */
export function applyMethod(item, method) {
  const handler = baseHandler(method.handler);
  const fn = HANDLERS[handler];
  if (!fn) return null;
  const opts = { minLevel: minLevelOf(method) };
  const needsMod = ['poe2_transmutation', 'poe2_augmentation', 'poe2_regal', 'poe2_exalted', 'poe2_alchemy', 'poe2_chaos'].includes(handler);
  if (needsMod && !eligibleMods(probeRarity(item, handler), addOpts(opts, handler)).length) return null;
  const out = fn(item, opts, method);
  return out && out.filter(c => c.mod || c.text);
}

/** Hinekora's Lock preview: resolve the method on a clone. Result is cached by the caller. */
export function foresee(item, method) {
  const clone = structuredClone(item);
  clone.lock = false;
  const changes = applyMethod(clone, method);
  return changes ? { item: clone, changes } : null;
}

/** Next-mod chances for `method`: { total, map: modId -> probability }. */
export function addChances(item, method) {
  if (method && ['poe2_essence', 'poe2_socketable'].includes(method.handler)) return { total: 0, map: new Map() };
  const handler = method ? baseHandler(method.handler) : null;
  const list = eligibleMods(probeRarity(item, handler), addOpts({ minLevel: minLevelOf(method) }, handler));
  const total = list.reduce((s, e) => s + e.weight, 0);
  return { total, map: new Map(list.map(e => [e.mod.id, e.weight / total])) };
}

// ---- Formatting ----

/** Roll-less family title, e.g. "#% increased maximum Life". */
export const modTemplate = mod => [...new Set(mod.stats.map(s => DB.text(s.label)))].join(' / ');

/** Text lines for a mod. rolls omitted = show full ranges (pool view). */
export function modLines(mod, rolls) {
  const labels = mod.stats.map(s => DB.text(s.label));
  const fmt = (s, i) => {
    const [a, b] = s.range;
    const v = rolls ? rolls[i] : null;
    if (v == null) return a === b ? fmtNum(a) : `(${fmtNum(a)}-${fmtNum(b)})`;
    return a === b ? fmtNum(v) : `${fmtNum(v)}(${fmtNum(a)}-${fmtNum(b)})`;
  };
  // "# to #" style: one label shared by N stats
  const label0 = labels[0] || '';
  if (new Set(labels).size === 1 && mod.stats.length > 1 && (label0.match(/#/g) || []).length === mod.stats.length) {
    let k = 0;
    return [label0.replace(/#/g, () => fmt(mod.stats[k], k++))];
  }
  return mod.stats.map((s, i) => labels[i].replace('#', fmt(s, i)));
}
