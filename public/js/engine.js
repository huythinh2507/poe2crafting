// Pure crafting logic: no DOM access.
import { DB, classPool, lichPool, poolFor, corruptionPool, affixOf, essenceModIds, baseStats, FACTIONS, META_POOLS } from './data.js';

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
  pinned: new Set(),   // pinned omens stay armed after use, so a combo (Chaos + Whittling) can be repeated
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
  { id: 'exalt_catalyst', name: 'Omen of Catalysing Exaltation', for: 'poe2_exalted', hint: 'Exalted Orb consumes all catalyst quality: modifiers with the catalyst\'s tag become more likely (weight x (1 + 0.2 x quality)).' },
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
  if (ctx.omens.has(id)) { ctx.omens.delete(id); ctx.pinned.delete(id); return; }   // switching an omen off also unpins it
  if (o.excl) for (const other of OMENS) if (other.excl === o.excl) { ctx.omens.delete(other.id); ctx.pinned.delete(other.id); }
  ctx.omens.add(id);
}

/** Pin an omen (arming it if needed) so it is NOT used up; click again to unpin (it stays armed for one more use). */
export function togglePin(id) {
  const o = OMEN_BY_ID[id];
  if (!o || o.todo) return;
  if (ctx.pinned.has(id)) { ctx.pinned.delete(id); return; }
  if (!ctx.omens.has(id)) toggleOmen(id);
  ctx.pinned.add(id);
}

/** Use up one omen (a reveal-phase omen, say) unless it is pinned. */
export function spendOmen(id) { if (!ctx.pinned.has(id)) ctx.omens.delete(id); }

/** Disarm omens. `keepPinned` leaves the pinned ones (used by "Reset item"). */
export function clearOmens({ keepPinned = false } = {}) {
  for (const id of [...ctx.omens]) if (!(keepPinned && ctx.pinned.has(id))) ctx.omens.delete(id);
  if (!keepPinned) ctx.pinned.clear();
}

/** Omens (ids) that the next use of `handler` consumes. */
export const omensConsumedBy = handler => OMENS.filter(o => o.for === baseHandler(handler)).map(o => o.id);
/** Called by the UI after a successful (non-preview) use of a currency. */
export function consumeOmens(handler) { for (const id of omensConsumedBy(handler)) spendOmen(id); }

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
    catalyst: null,   // jewellery catalyst quality: { tag: 'life', quality: 12 } (replaces the previous type when another catalyst is used)
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

/** Extra prefix / suffix slots from the base's own implicits (Dusk Ring: +1 prefix, -1 suffix; Penumbra: +2 / -2; Gloam and Tenebrous the reverse). */
export function implicitSlots(item) {
  const d = { prefix: 0, suffix: 0 };
  for (const inst of item.implicits) {
    const mod = DB.mods.get(inst.id);
    mod.stats.forEach((st, i) => {
      const id = DB.raw.stats[st.index]?.id;
      if (id === 'local_maximum_prefixes_allowed_+') d.prefix += inst.rolls[i];
      else if (id === 'local_maximum_suffixes_allowed_+') d.suffix += inst.rolls[i];
    });
  }
  return d;
}

export const maxAffix = item => {
  const [p, s] = MAX_AFFIX[item.rarity];
  if (item.rarity !== 'rare') return [p, s];
  const slots = implicitSlots(item);
  return [Math.max(0, p + slots.prefix), Math.max(0, s + slots.suffix + bonus(item).suffix)];
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
  if (opts.positives) { // weight multipliers for mods carrying a tag (Omen of Catalysing Exaltation)
    rollable = rollable.map(e => {
      const f = groupTags(e.mod).reduce((s, t) => s + (opts.positives[t] || 0), 0);
      return f > 0 ? { ...e, weight: e.weight * f } : e;
    });
  }
  return applyMinLevel(rollable, opts.minLevel);
}
const groupTags = mod => (DB.groups.get(mod.group)?.tags || []).filter(t => t !== 0);

/** Options for adding a mod, from the active omens of the currency being used. */
function addOpts(base, handler, item) {
  const o = ctx.omens, a = { ...base };
  if (handler === 'poe2_exalted') {
    if (o.has('exalt_catalyst') && item?.catalyst?.quality > 0) a.positives = catalystWeights(item.catalyst);
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
 * Mods a Fracturing Orb can lock: every mod on the item that is not already fractured, INCLUDING a desecrated mod
 * once it has been revealed. An UNREVEALED desecrated slot is the exception: it counts toward the 4-mod minimum but
 * cannot be fractured, so 3 mods + 1 unrevealed slot gives each mod a 1-in-3 chance instead of 1-in-4.
 * (Guides only describe the unrevealed slot; none says a revealed desecrated mod is excluded.)
 */
export const fractureCandidates = item => item.mods.filter(m => !m.fractured);

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
  catalyst_base: i => !i.corrupted && (i.classId === 33 || i.classId === 34 || i.classId === 105), // rings, amulets, Grasping Mail
  refined_catalyst_base: i => !i.corrupted && groupOf(i) === 10,                                 // jewels
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

// ---- Catalysts (rings, amulets; Refined ones on jewels) ----
// Quality is tied to one tag. It scales the rolled value of every mod carrying that tag (implicits too), and a different
// catalyst replaces it instead of adding. Each use gives round(30 x e^(-ilvl/30) - 0.3) clamped to 1-20 (a 1 becomes 2
// one time in five): a rarely-more-than-1% at high item level. Cap 20%, plus a Breach Ring's "+x% to Maximum Quality".
// Omen of Catalysing Exaltation turns the quality into a weight multiplier on that tag for the next Exalted Orb.
// Formulas are the ones craftofexile.com uses (read from its calculator); GGG does not publish them.
export const CATALYSTS = {
  adaptive: 'attribute', carapace: 'defences', chayula: 'chaos', esh: 'lightning', flesh: 'life', neural: 'mana',
  necrotic: 'minion', reaver: 'attack', sibilant: 'caster', skittering: 'speed', tul: 'cold', uulnetol: 'physical', xoph: 'fire',
};
export const catalystTagId = key => DB.raw.tags.entries.find(t => t.key === key)?.id;
export const catalystGain = ilvl => {
  const n = Math.round(Math.max(1, Math.min(30 * Math.exp(-ilvl / 30) - 0.3, 20)));
  return n === 1 && Math.random() < 0.2 ? 2 : n;
};
export const catalystCap = item => MAX_QUALITY + localStatOf(item, 'local_maximum_quality_+');
const localStatOf = (item, statId) => {
  let total = 0;
  for (const inst of [...item.implicits, ...item.mods]) {
    DB.mods.get(inst.id).stats.forEach((st, i) => { if (DB.raw.stats[st.index]?.id === statId) total += inst.rolls[i] || 0; });
  }
  return total;
};
/** Weight multiplier the omen gives mods with the catalyst's tag: 1 + 0.2 per % up to 20, then 0.12 per % beyond (Breach Rings). */
export function catalystFactor(quality) {
  const over = quality - MAX_QUALITY;
  return over > 0 ? 1 + 0.12 * over + 0.2 * MAX_QUALITY : 1 + 0.2 * quality;
}
const catalystWeights = c => ({ [catalystTagId(c.tag)]: catalystFactor(c.quality) });
function useCatalyst(item, tag) {
  if (item.catalyst && item.catalyst.tag !== tag) item.catalyst = null; // a different type wipes the old quality
  const before = item.catalyst?.quality || 0;
  const quality = Math.min(catalystCap(item), before + catalystGain(item.ilvl));
  item.catalyst = { tag, quality };
  return note(`${tag[0].toUpperCase() + tag.slice(1)} catalyst quality +${quality - before}% (now ${quality}%)`);
}
/** Rolled value of a mod stat as the item shows it: scaled by catalyst quality when the mod carries the catalyst's tag. */
export function catalystScaled(item, mod, value) {
  const c = item?.catalyst;
  if (!c || !c.quality || !groupTags(mod).includes(catalystTagId(c.tag))) return value;
  return Math.floor(value * (100 + c.quality) / 100 + 1e-9);   // rounds DOWN: +3 needs 34% quality to become +4
}

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
  poe2_regal: (i, o) => { i.rarity = 'rare'; return addMany(i, 1, addOpts(o, 'poe2_regal', i)); },
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
  poe2_exalted: (i, o) => {
    const opts = addOpts(o, 'poe2_exalted', i);
    const out = addMany(i, ctx.omens.has('exalt_two') ? 2 : 1, opts);
    if (out && opts.positives) i.catalyst = null; // the omen consumes all the catalyst quality
    return out;
  },
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
    // Omen of the Blessed: implicits only. A fractured mod is locked against currency, so its values are never rerolled.
    if (!ctx.omens.has('blessed')) i.mods = i.mods.map(m => (m.fractured ? m : reroll(m)));
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
  ...Object.fromEntries(Object.entries(CATALYSTS).flatMap(([name, tag]) => [
    ['poe2_catalyst_' + name, i => useCatalyst(i, tag)],
    ['poe2_refined_catalyst_' + name, i => useCatalyst(i, tag)],
  ])),
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
  if (needsMod && !eligibleMods(probeRarity(item, handler), addOpts(opts, handler, item)).length) return null;
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
  const list = eligibleMods(probeRarity(item, handler), addOpts({ minLevel: minLevelOf(method) }, handler, item));
  const total = list.reduce((s, e) => s + e.weight, 0);
  return { total, map: new Map(list.map(e => [e.mod.id, e.weight / total])) };
}

// ---- Manual editing ---------------------------------------------------------------------------
// For setting up an item you bought (a magic base that already has two good mods) or testing a what-if. These are
// not currency: nothing here is random except the value roll of a freshly added mod.

const RARITY_ORDER = { normal: 0, magic: 1, rare: 2 };

/**
 * Add a specific mod to an item. A Normal item becomes Magic, and a Magic item becomes Rare as soon as it would hold
 * more than one prefix or one suffix. `desecrated` picks it from the desecrated (Lich) pool and flags it so.
 * Returns the added mod, or null if it cannot go on (same group present, no free slot, level too high, corrupted).
 */
export function addModManually(item, modId, { desecrated = false } = {}) {
  if (item.corrupted) return null;
  const entry = (desecrated ? lichPool(item.classId) : fullPool(item)).find(x => x.mod.id === modId);
  if (!entry || entry.mod.minlvl > item.ilvl) return null;
  if (item.mods.some(m => DB.mods.get(m.id).group === entry.mod.group)) return null;

  const prefixes = countAffix(item, 'prefix') + (entry.affix === 'prefix' ? 1 : 0);
  const suffixes = countAffix(item, 'suffix') + (entry.affix === 'suffix' ? 1 : 0);
  const needed = prefixes > 1 || suffixes > 1 ? 'rare' : 'magic';
  const rarity = RARITY_ORDER[needed] > RARITY_ORDER[item.rarity] ? needed : item.rarity;
  if (openSlots({ ...item, rarity })[entry.affix] <= 0) return null;

  item.rarity = rarity;
  const added = rollMod(transformed(item, entry.mod));
  if (desecrated) added.desecrated = true;
  item.mods.push(added);
  return added;
}

/** Overwrite the rolled values of mod `idx`, clamped to each stat's range. Returns the mod, or null. */
export function setModValues(item, idx, rolls) {
  const m = item.mods[idx];
  if (!m) return null;
  const mod = DB.mods.get(m.id);
  m.rolls = mod.stats.map((s, i) => {
    const [a, b] = s.range[0] <= s.range[1] ? s.range : [s.range[1], s.range[0]];
    const v = Math.min(b, Math.max(a, Number(rolls[i])));
    return Number.isFinite(v) ? (Number.isInteger(a) && Number.isInteger(b) ? Math.round(v) : Math.round(v * 100) / 100) : m.rolls[i];
  });
  return m;
}

/** Why a flag cannot be set on a mod (null = fine). Used to grey out context-menu entries. */
export function flagBlocked(item, m, flag) {
  if (flag === 'fractured') {
    if (m.fractured) return null;                                   // can always be removed again
    if (item.mods.some(x => x.fractured)) return 'An item can only have one fractured modifier';
  }
  return null;
}

// ---- Displayed item stats ------------------------------------------------------------------------------------
// What the tooltip shows under the item name: a weapon's damage / crit / attack speed, an armour's defences. They start from the
// base and respond to quality and to the item's LOCAL mods (added damage, % increased physical damage, attack speed, ...).
//   weapon physical = (base + added flat) x (1 + local increased% / 100) x (1 + quality% / 100)   (quality: 1% MORE per 1%, martial weapons)
//   weapon elemental = base + added flat                    attacks per second = base x (1 + local attack speed% / 100)
//   crit chance = base + local "+x% to crit chance"          defence = (base + flat) x (1 + local increased% / 100) x (1 + quality% / 100)

/** Sum of a local stat (by game stat id) over every mod on the item: explicits, implicits and corruption enchants. */
export function localStat(item, statId) {
  let total = 0;
  for (const m of [...item.mods, ...item.implicits, ...item.corruption]) {
    DB.mods.get(m.id)?.stats.forEach((s, i) => { if (DB.raw.stats[s.index]?.id === statId) total += m.rolls[i] || 0; });
  }
  return total;
}

const DEFENCE_KEYS = { armour: /armour|physical_damage_reduction_rating/, evasion: /evasion/, energyshield: /energy_shield/ };
const DEFENCE_FLAT = { armour: 'local_base_physical_damage_reduction_rating', evasion: 'local_base_evasion_rating', energyshield: 'local_energy_shield' };

/** Percent-increased bonus for one defence from every local "#% increased Armour / Evasion / Energy Shield (and ...)" mod. */
function defenceIncrease(item, kind) {
  let total = 0;
  for (const m of [...item.mods, ...item.implicits, ...item.corruption]) {
    DB.mods.get(m.id)?.stats.forEach((s, i) => {
      const id = DB.raw.stats[s.index]?.id || '';
      if (/^local_.*_\+%$/.test(id) && DEFENCE_KEYS[kind].test(id)) total += m.rolls[i] || 0;
    });
  }
  return total;
}

/**
 * DPS the way the trade site shows it: the DISPLAYED (rounded) damage range, averaged, times the DISPLAYED attacks per second
 * (2 decimals). 507-837 physical at 1.56 aps = 672 x 1.56 = 1048.32 Physical DPS; 7-349 lightning = 178 x 1.56 = 277.68 Elemental DPS.
 * `damage` is { physical|fire|cold|lightning|chaos: { final: [min, max] } }.
 */
export function weaponDps(damage, aps) {
  const shownAps = Math.round(aps * 100) / 100;
  const avg = d => (Math.round(d.final[0]) + Math.round(d.final[1])) / 2;
  const physical = damage.physical ? Math.round(avg(damage.physical) * shownAps * 100) / 100 : 0;
  const elemental = Math.round(['fire', 'cold', 'lightning', 'chaos'].reduce((s, el) => s + (damage[el] ? avg(damage[el]) * shownAps : 0), 0) * 100) / 100;
  return { physical, elemental, total: Math.round((physical + elemental) * 100) / 100 };
}

/** Final stats for the tooltip, or null if the base has none. Each number carries its base so the UI can mark "augmented". */
export function itemStats(item) {
  const base = DB.items.get(item.baseId);
  const bs = base && baseStats(base);
  if (!bs) return null;
  const quality = item.quality || 0;

  if (bs.kind === 'weapon') {
    const flat = el => [localStat(item, `local_minimum_added_${el}_damage`), localStat(item, `local_maximum_added_${el}_damage`)];
    const incPhys = localStat(item, 'local_physical_damage_+%');
    const qualityMult = isMartial(item) ? 1 + quality / 100 : 1;          // quality: 1% more physical damage per 1%
    const damage = {};
    for (const el of ['physical', 'fire', 'cold', 'lightning', 'chaos']) {
      const b = bs.damage[el] || [0, 0], f = flat(el);
      if (!bs.damage[el] && !f[0] && !f[1]) continue;
      const raw = [b[0] + f[0], b[1] + f[1]];
      const final = el === 'physical' ? raw.map(v => v * (1 + incPhys / 100) * qualityMult) : raw;
      damage[el] = { base: b, final };
    }
    const aps = bs.aps * (1 + localStat(item, 'local_attack_speed_+%') / 100);
    const crit = bs.crit + localStat(item, 'local_critical_strike_chance');
    const { physical: physDps, elemental: eleDps } = weaponDps(damage, aps);
    return { kind: 'weapon', damage, crit: { base: bs.crit, final: crit }, aps: { base: bs.aps, final: aps }, range: bs.range, skills: bs.skills,
      dps: { physical: physDps, elemental: eleDps, total: physDps + eleDps } };
  }

  if (bs.kind === 'armour') {
    const defences = [];
    for (const [key, label] of [['armour', 'Armour'], ['evasion', 'Evasion Rating'], ['energyshield', 'Energy Shield']]) {
      const b = bs.defences[key];
      if (!b) continue;
      const final = (b + localStat(item, DEFENCE_FLAT[key])) * (1 + defenceIncrease(item, key) / 100) * (1 + quality / 100);
      defences.push({ key, label, base: b, final });
    }
    if (bs.defences.ward) defences.push({ key: 'ward', label: 'Runic Ward', base: bs.defences.ward, final: bs.defences.ward });
    const block = bs.block ? { base: bs.block, final: bs.block * (1 + localStat(item, 'local_block_chance_+%') / 100) } : null;
    return { kind: 'armour', defences, block };
  }
  // Wands, staves and sceptres have no damage of their own. Quality does not touch the weapon: on wands and staves it is the
  // GRANTED SKILL's quality. Sceptres get no quality effect, and Spirit never scales with quality.
  const level = grantedSkillLevel(item.ilvl);
  const isSceptre = item.classId === 56;
  return {
    kind: 'caster', skills: bs.skills.map(name => ({ name, level })),
    skillQuality: isSceptre ? 0 : quality,
    spirit: bs.spirit ? { base: bs.spirit, final: bs.spirit } : null,
  };
}

/** Level of a skill granted by a weapon: set by the item level through the game data's curve (item level thresholds -> level). */
export function grantedSkillLevel(ilvl) {
  let level = 1;
  for (const row of DB.raw.skills.scaling) if (ilvl >= row.item) level = row.gem;
  return level;
}

// ---- Formatting ----

/** Roll-less family title, e.g. "#% increased maximum Life". */
export const modTemplate = mod => [...new Set(mod.stats.map(s => DB.text(s.label)))].join(' / ');

/** Text lines for a mod. rolls omitted = show full ranges (pool view). */
export function modLines(mod, rolls, item) {
  const labels = mod.stats.map(s => DB.text(s.label));
  const sc = v => catalystScaled(item, mod, v);   // catalyst quality scales the value and its range
  const fmt = (s, i) => {
    const [a, b] = s.range.map(sc);
    const v = rolls ? rolls[i] : null;
    if (v == null) return a === b ? fmtNum(a) : `(${fmtNum(a)}-${fmtNum(b)})`;
    return a === b ? fmtNum(sc(v)) : `${fmtNum(sc(v))}(${fmtNum(a)}-${fmtNum(b)})`;
  };
  // "# to #" style: one label shared by N stats
  const label0 = labels[0] || '';
  if (new Set(labels).size === 1 && mod.stats.length > 1 && (label0.match(/#/g) || []).length === mod.stats.length) {
    let k = 0;
    return [label0.replace(/#/g, () => fmt(mod.stats[k], k++))];
  }
  return mod.stats.map((s, i) => labels[i].replace('#', fmt(s, i)));
}
