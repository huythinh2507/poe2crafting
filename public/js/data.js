// Loads and indexes the raw game data (compact, index-based format).
export const DB = {};

const strip = s => (s || '').replace(/\[([^\]|]*)\|([^\]]*)\]/g, '$2').replace(/\[([^\]]*)\]/g, '$1');

export async function loadData() {
  const [raw, lang] = await Promise.all([
    fetch('data/data.json').then(r => r.json()),
    fetch('data/english.json').then(r => r.json()),
  ]);
  const byId = block => {
    const m = new Map();
    for (const e of block.entries) m.set(e.id, e);
    return m;
  };
  DB.raw = raw;
  DB.L = lang;
  DB.text = i => (i == null ? '' : strip(lang[i]));
  DB.categories = raw.categories.entries;
  DB.classes = byId(raw.classes);
  DB.items = byId(raw.items);
  DB.mods = byId(raw.mods);
  DB.groups = byId(raw.modgroups);
  DB.classmods = raw.classmods;
  DB.groupClasses = raw.classes.bygroup;
  return DB;
}

export function classesOfGroup(groupId) {
  return (DB.groupClasses[groupId] || []).map(id => DB.classes.get(id)).filter(Boolean);
}

export function basesOfClass(classId) {
  return [...DB.items.values()]
    .filter(i => i.class === classId && i.domain === 1 && i.drop)
    .sort((a, b) => a.drop - b.drop || DB.text(a.label).localeCompare(DB.text(b.label)));
}

// ---- Mod pools --------------------------------------------------------------------------
// A mod group's `influence` says which pool the mod belongs to:
//   6    = normal explicit pool (random currency)
//   1000 = desecrated "Lich" mods (Amanamu / Kurgal / Ulaman), only via bones + Well of Souls
//   1002-1007 = meta-rune pools (Chronomancy, Soul, Berserking, Marksman, Decay, Destruction)
//   others = jewellery / genesis-tree / legacy pools we don't roll
export const INFLUENCE = { NORMAL: 6, DESECRATED: 1000 };
export const META_POOLS = {
  Chronomancy: 1002, Soul: 1003, Berserking: 1004, Marksman: 1005, Decay: 1006, Destruction: 1007,
};
export const FACTIONS = ['Amanamu', 'Kurgal', 'Ulaman'];

export const influenceOf = mod => DB.groups.get(mod.group)?.influence;
export const factionOf = mod => FACTIONS.find(f => mod.key.includes(f)) || null;

// Affix kind of a mod: 'prefix' | 'suffix' | null (implicit / corruption / special).
export function affixOf(mod) {
  const t = DB.groups.get(mod.group)?.type;
  return t === 1 ? 'prefix' : t === 2 ? 'suffix' : null;
}

/**
 * Our data has no Destruction pool ("Can roll Destruction modifiers", Thrud's Might) for these weapon classes,
 * although the game gives it to every weapon: poe2db lists it for Talismans. For a class that has none we use the
 * pool of the closest class that does: influence -> { classId -> class to borrow from }. The UI flags borrowed pools.
 */
export const POOL_BORROW = {
  1007: { 43: 55, 44: 55, 58: 57, 65: 68, 90: 57, 103: 57 }, // Spears/Flails <- One Hand Maces, Quarterstaves <- Two Hand Maces, Crossbows/Talismans/Cannon <- Bows
};

const cache = new Map();
/** Weighted entries of a class for one influence pool, with tier numbers per mod group. */
export function poolFor(classId, influence = INFLUENCE.NORMAL) {
  const key = classId + ':' + influence;
  if (cache.has(key)) return cache.get(key);
  const cm = DB.classmods[classId] || {};
  const list = [];
  for (const [id, weight] of Object.entries(cm)) {
    const mod = DB.mods.get(+id);
    if (!mod || weight <= 0 || influenceOf(mod) !== influence) continue;
    const affix = affixOf(mod);
    if (!affix) continue;
    list.push({ mod, weight, affix, influence, faction: factionOf(mod), lich: influence === INFLUENCE.DESECRATED });
  }
  const byGroup = new Map();
  for (const e of list) {
    if (!byGroup.has(e.mod.group)) byGroup.set(e.mod.group, []);
    byGroup.get(e.mod.group).push(e);
  }
  for (const arr of byGroup.values()) {
    arr.sort((a, b) => b.mod.minlvl - a.mod.minlvl);
    arr.forEach((e, i) => { e.tier = i + 1; });
  }
  const borrowFrom = !list.length ? POOL_BORROW[influence]?.[classId] : null;
  if (borrowFrom) {
    const borrowed = poolFor(borrowFrom, influence).map(e => ({ ...e, borrowedFrom: borrowFrom }));
    cache.set(key, borrowed);
    return borrowed;
  }
  cache.set(key, list);
  return list;
}

export const classPool = classId => poolFor(classId, INFLUENCE.NORMAL);
export const lichPool = classId => poolFor(classId, INFLUENCE.DESECRATED);

// modId -> pool entry (normal, desecrated or meta) for a class
export function poolEntry(classId, modId) {
  const mod = DB.mods.get(modId);
  if (!mod) return null;
  return poolFor(classId, influenceOf(mod)).find(e => e.mod.id === modId) || null;
}

/**
 * Essence data (and socketables) are keyed by the item *class enum* (Wand, One Hand Sword, Body Armour,
 * Talisman, ...), not by our class ids. Several enums collide with class ids, so always convert.
 */
export const classEnum = classId => DB.classes.get(classId)?.class;
export const essenceModIds = (essenceId, classId) => DB.raw.essences.byessences[essenceId]?.[classEnum(classId)] || [];

// Vaal corruption enchants (modgroup type 5) available to a class, with weights.
export function corruptionPool(classId) {
  const cm = DB.classmods[classId] || {};
  const list = [];
  for (const [id, weight] of Object.entries(cm)) {
    const mod = DB.mods.get(+id);
    if (!mod || weight <= 0) continue;
    if (DB.groups.get(mod.group)?.type === 5) list.push({ mod, weight });
  }
  return list;
}

// ---- Reference views: every pool an item can draw from ---------------------------------------
const POOL_LABELS = { 1009: 'Minion modifiers', 1010: 'Genesis Tree modifiers' };
let runeNames = null;

/** Name of the meta rune that unlocks a pool ("Thrud's Might" for Destruction), read from the runes' own text. */
export function runeNameFor(influence) {
  if (!runeNames) {
    runeNames = {};
    for (const e of DB.raw.socketables.entries) {
      const stats = [e.martial, e.armour, e.caster, e.all, ...Object.values(e.class || {})].filter(Boolean);
      for (const s of stats) {
        const m = DB.text(s.output).match(/Can roll (\w+) modifiers/);
        if (m && META_POOLS[m[1]]) runeNames[META_POOLS[m[1]]] = DB.text(DB.items.get(e.item)?.label);
      }
    }
  }
  return runeNames[influence] || POOL_LABELS[influence] || `Pool ${influence}`;
}

const metaCache = new Map();
/**
 * Every special pool (other than the normal and desecrated ones) a class can draw from: the six meta-rune pools
 * where the class has them, plus the Minion / Genesis Tree pools on jewellery. { influence, name, entries, borrowedFrom }
 */
export function specialPools(classId) {
  if (metaCache.has(classId)) return metaCache.get(classId);
  const influences = new Set(Object.values(META_POOLS));
  for (const id of Object.keys(DB.classmods[classId] || {})) {
    const mod = DB.mods.get(+id);
    const inf = mod && influenceOf(mod);
    if (inf >= 1009 && affixOf(mod)) influences.add(inf);
  }
  const out = [];
  for (const influence of [...influences].sort((a, b) => a - b)) {
    const entries = poolFor(classId, influence);
    if (entries.length) out.push({ influence, name: runeNameFor(influence), entries, borrowedFrom: entries[0].borrowedFrom ?? null });
  }
  metaCache.set(classId, out);
  return out;
}

// Tag chips shown next to a mod family (the usual poe2db-style damage / element / defence tags).
const CHIP_TAGS = ['damage', 'elemental', 'fire', 'cold', 'lightning', 'chaos', 'physical', 'attack', 'caster', 'minion', 'speed',
  'critical', 'life', 'mana', 'resistance', 'attribute', 'ailment', 'curse', 'armour', 'evasion', 'defences', 'poison', 'bleed'];
export function tagChips(mod) {
  const keys = (DB.groups.get(mod.group)?.tags || []).map(t => DB.raw.tags.entries.find(x => x.id === t)?.key);
  return CHIP_TAGS.filter(k => keys.includes(k)).slice(0, 3);
}
