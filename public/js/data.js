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
    list.push({ mod, weight, affix, influence, faction: factionOf(mod) });
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
