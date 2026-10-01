using Poe2Crafting.Engine.Data;

namespace Poe2Crafting.Engine.Crafting;

/// <summary>Extra rules for picking a mod to add. Omens and Greater/Perfect orbs set these.</summary>
/// <param name="MinLevel">Minimum Modifier Level of the currency (0 = none).</param>
/// <param name="Affix">Only add a prefix / only a suffix (Sinistral / Dextral omens).</param>
/// <param name="Homogenising">Only add a mod that shares a tag with one already on the item.</param>
public readonly record struct AddOptions(int MinLevel = 0, Affix? Affix = null, bool Homogenising = false);

/// <summary>Free prefix and suffix slots.</summary>
public readonly record struct OpenSlots(int Prefix, int Suffix)
{
    public int For(Affix affix) => affix == Affix.Prefix ? Prefix : Suffix;
    public bool Any => Prefix > 0 || Suffix > 0;
}

/// <summary>What the item's socketed meta runes change.</summary>
public sealed record MetaBonus(int ExtraSuffix, int ExtraCrafted, IReadOnlySet<int> UnlockedPools, string? Transform);

public sealed partial class CraftingEngine
{
    // ---- slots and affix limits ----------------------------------------------------------------

    /// <summary>Totals contributed by socketed meta runes ("+1 Suffix allowed", "Can roll Destruction modifiers", ...).</summary>
    public MetaBonus Bonus(CraftItem item) => new(
        item.Socketed.Sum(s => s.ExtraSuffix),
        item.Socketed.Sum(s => s.ExtraCrafted),
        item.Socketed.Where(s => s.UnlocksPool is not null).Select(s => s.UnlocksPool!.Value).ToHashSet(),
        item.Socketed.LastOrDefault(s => s.TransformTo is not null)?.TransformTo);

    /// <summary>How many prefixes / suffixes the item may have: 0 / 1 / 3 by rarity (+ meta-rune extras on rares).</summary>
    public (int Prefix, int Suffix) MaxAffixes(CraftItem item)
    {
        var (prefix, suffix) = item.Rarity switch
        {
            Rarity.Magic => (1, 1),
            Rarity.Rare => (3, 3),
            _ => (0, 0),
        };
        return (prefix, item.Rarity == Rarity.Rare ? suffix + Bonus(item).ExtraSuffix : suffix);
    }

    /// <summary>Affix slots taken, counting unrevealed desecrated slots (they reserve a slot).</summary>
    public int CountAffix(CraftItem item, Affix affix) =>
        item.Mods.Count(m => AffixOf(m) == affix) + item.Unrevealed.Count(u => u.Affix == affix);

    public OpenSlots OpenSlotsOf(CraftItem item)
    {
        var (maxPrefix, maxSuffix) = MaxAffixes(item);
        return new OpenSlots(maxPrefix - CountAffix(item, Affix.Prefix), maxSuffix - CountAffix(item, Affix.Suffix));
    }

    /// <summary>Explicit modifiers including unrevealed desecrated slots (what "4 modifiers" means for Fracturing).</summary>
    public int ExplicitCount(CraftItem item) => item.Mods.Count + item.Unrevealed.Count;

    /// <summary>Items may hold 1 crafted mod (alloy / perfect / corrupted essence), plus extras from runes.</summary>
    public bool CraftedFull(CraftItem item) => item.Mods.Count(m => m.Crafted) >= 1 + Bonus(item).ExtraCrafted;

    // ---- which mods can roll --------------------------------------------------------------------

    /// <summary>The normal pool plus any pools unlocked by socketed meta runes.</summary>
    public IReadOnlyList<PoolEntry> FullPool(CraftItem item)
    {
        var pool = new List<PoolEntry>(Pools.ClassPool(item.ClassId));
        foreach (var influence in Bonus(item).UnlockedPools) pool.AddRange(Pools.PoolFor(item.ClassId, influence));
        return pool;
    }

    /// <summary>
    /// "Minimum Modifier Level" (Greater / Perfect orbs) never removes a mod TYPE from the pool: when no
    /// tier of a mod group reaches the minimum, the highest tier the item can still roll stays. GGG
    /// confirmed this: a Perfect Exalted Orb (min 50) can add "Energy Shield Recharge Rate" at level 48.
    /// <paramref name="entries"/> must already be limited to what the item can roll.
    /// </summary>
    public static IReadOnlyList<PoolEntry> ApplyMinLevel(IReadOnlyList<PoolEntry> entries, int minLevel)
    {
        if (minLevel <= 0) return entries;
        var result = new List<PoolEntry>();
        foreach (var group in entries.GroupBy(e => e.Mod.Group))
        {
            var high = group.Where(e => e.Mod.MinLevel >= minLevel).ToList();
            result.AddRange(high.Count > 0 ? high : new[] { group.MaxBy(e => e.Mod.MinLevel)! });
        }
        return result;
    }

    /// <summary>
    /// Every mod that could be added to the item right now: it has a free slot of that affix, the item
    /// level is high enough, no mod of the same group is present, then omen and minimum-level rules.
    /// </summary>
    public IReadOnlyList<PoolEntry> EligibleMods(CraftItem item, AddOptions options = default)
    {
        var open = OpenSlotsOf(item);
        var usedGroups = item.Mods.Select(m => ModOf(m).Group).ToHashSet();

        var rollable = FullPool(item)
            .Where(e => open.For(e.Affix) > 0
                        && e.Mod.MinLevel <= item.ItemLevel
                        && !usedGroups.Contains(e.Mod.Group)
                        && (options.Affix is null || e.Affix == options.Affix))
            .ToList();

        if (options.Homogenising)
        {
            // "same type as an existing modifier" = shares a tag with one
            var haveTags = item.Mods.SelectMany(m => Pools.GroupTags(ModOf(m))).ToHashSet();
            rollable = rollable.Where(e => Pools.GroupTags(e.Mod).Any(haveTags.Contains)).ToList();
        }
        return ApplyMinLevel(rollable, options.MinLevel);
    }

    /// <summary>Add-mod options for a currency, taking the armed omens into account.</summary>
    private AddOptions AddOptionsFor(AddOptions baseOptions, string handler)
    {
        var o = Context;
        return handler switch
        {
            "poe2_exalted" => baseOptions with
            {
                Affix = o.Has("exalt_prefix") ? Affix.Prefix : o.Has("exalt_suffix") ? Affix.Suffix : baseOptions.Affix,
                Homogenising = o.Has("exalt_homog"),
            },
            "poe2_regal" => baseOptions with
            {
                Affix = o.Has("regal_prefix") ? Affix.Prefix : o.Has("regal_suffix") ? Affix.Suffix : baseOptions.Affix,
                Homogenising = o.Has("regal_homog"),
            },
            _ => baseOptions,
        };
    }

    /// <summary>Pick one eligible mod by weight, roll it and put it on the item. Null if nothing is eligible.</summary>
    private ModInstance? AddRandom(CraftItem item, AddOptions options)
    {
        var entry = PickWeighted(EligibleMods(item, options));
        if (entry is null) return null;
        var added = RollMod(Transformed(item, entry.Mod));
        item.Mods.Add(added);
        return added;
    }

    /// <summary>Add n mods, all-or-nothing: null when the item cannot take them all.</summary>
    private List<Change>? AddMany(CraftItem item, int count, AddOptions options)
    {
        var changes = new List<Change>();
        for (var k = 0; k < count; k++)
        {
            var added = AddRandom(item, options);
            if (added is null) return null;
            changes.Add(Change.Added(added));
        }
        return changes;
    }

    // ---- Fire / Cold / Lightning transform runes (Passion, Breath, Ire of Aldur) ----------------

    /// <summary>
    /// The data only defines equivalents for resistances: tag id -> a list of mod ids that line up
    /// tier by tier (fire resist tier 1 = cold resist tier 1 = lightning resist tier 1).
    /// </summary>
    internal int EquivalentMod(int modId, string toElement)
    {
        var equivalencies = Db.Raw.Mods.Equivalencies;
        var index = -1;
        foreach (var ids in equivalencies.Values)
            if (ids.Contains(modId)) index = ids.IndexOf(modId);
        if (index < 0) return modId;

        foreach (var (tagId, ids) in equivalencies)
        {
            var key = Db.Raw.Tags.Entries.FirstOrDefault(t => t.Id.ToString() == tagId)?.Key;
            if (key == toElement) return index < ids.Count ? ids[index] : modId;
        }
        return modId;
    }

    private Mod Transformed(CraftItem item, Mod mod)
    {
        var to = Bonus(item).Transform;
        if (to is null) return mod;
        return Db.Mods.TryGetValue(EquivalentMod(mod.Id, to), out var replacement) ? replacement : mod;
    }
}
