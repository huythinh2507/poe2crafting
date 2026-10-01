namespace Poe2Crafting.Engine.Data;

public enum Affix { Prefix, Suffix }

/// <summary>
/// A mod that can roll, with its spawn weight. <see cref="Tier"/> is 1 for the best tier of its group.
/// </summary>
public sealed class PoolEntry
{
    public required Mod Mod { get; init; }
    public required double Weight { get; init; }
    public required Affix Affix { get; init; }

    /// <summary>Which pool the mod belongs to (see <see cref="ModPools"/> influence constants).</summary>
    public required int Influence { get; init; }

    /// <summary>"Amanamu" / "Kurgal" / "Ulaman" for desecrated Lich mods, otherwise null.</summary>
    public string? Faction { get; init; }

    public int Tier { get; set; }

    /// <summary>True when this entry came from the desecrated (Lich) pool.</summary>
    public bool IsLich { get; init; }

    public PoolEntry WithWeight(double weight, bool isLich) => new()
    {
        Mod = Mod, Weight = weight, Affix = Affix, Influence = Influence, Faction = Faction, Tier = Tier, IsLich = isLich,
    };
}

/// <summary>
/// Which mods can roll on which item. The game data has one big table per class (class id -> mod id ->
/// weight) that mixes several pools. A mod group's `Influence` number says which pool a mod is in.
/// </summary>
public sealed class ModPools
{
    /// <summary>The normal explicit pool, rolled by Transmutation / Augmentation / Chaos / Exalted / ...</summary>
    public const int Normal = 6;

    /// <summary>Desecrated "Lich" mods (Amanamu / Kurgal / Ulaman); only bones + the Well of Souls reach these.</summary>
    public const int Desecrated = 1000;

    /// <summary>Pools unlocked by socketing a meta rune ("Can roll Destruction modifiers", ...).</summary>
    public static readonly IReadOnlyDictionary<string, int> MetaPools = new Dictionary<string, int>
    {
        ["Chronomancy"] = 1002, ["Soul"] = 1003, ["Berserking"] = 1004,
        ["Marksman"] = 1005, ["Decay"] = 1006, ["Destruction"] = 1007,
    };

    public static readonly string[] Factions = { "Amanamu", "Kurgal", "Ulaman" };

    private readonly GameDatabase _db;
    private readonly Dictionary<(int classId, int influence), List<PoolEntry>> _cache = new();

    public ModPools(GameDatabase db) => _db = db;

    public int InfluenceOf(Mod mod) => _db.Groups[mod.Group].Influence;

    public string? FactionOf(Mod mod) => Factions.FirstOrDefault(f => mod.Key.Contains(f));

    /// <summary>Prefix or suffix; null for anything that is not an explicit affix (implicits, enchants, ...).</summary>
    public Affix? AffixOf(Mod mod) => _db.Groups[mod.Group].Type switch
    {
        1 => Affix.Prefix,
        2 => Affix.Suffix,
        _ => null,
    };

    /// <summary>All weighted mods of one pool for a class, with tier numbers assigned per mod group.</summary>
    public IReadOnlyList<PoolEntry> PoolFor(int classId, int influence)
    {
        if (_cache.TryGetValue((classId, influence), out var cached)) return cached;

        var list = new List<PoolEntry>();
        if (_db.Raw.ClassMods.TryGetValue(classId.ToString(), out var table))
        {
            foreach (var (modIdText, weight) in table)
            {
                if (weight <= 0 || !_db.Mods.TryGetValue(int.Parse(modIdText), out var mod)) continue;
                if (InfluenceOf(mod) != influence) continue;
                if (AffixOf(mod) is not { } affix) continue;
                list.Add(new PoolEntry
                {
                    Mod = mod, Weight = weight, Affix = affix, Influence = influence,
                    Faction = FactionOf(mod), IsLich = influence == Desecrated,
                });
            }
        }

        // Tier 1 = the highest mod level inside a group.
        foreach (var group in list.GroupBy(e => e.Mod.Group))
        {
            var tier = 1;
            foreach (var entry in group.OrderByDescending(e => e.Mod.MinLevel)) entry.Tier = tier++;
        }

        _cache[(classId, influence)] = list;
        return list;
    }

    public IReadOnlyList<PoolEntry> ClassPool(int classId) => PoolFor(classId, Normal);
    public IReadOnlyList<PoolEntry> LichPool(int classId) => PoolFor(classId, Desecrated);

    /// <summary>The pool entry (tier, weight, affix) of a specific mod on a class, whichever pool it is in.</summary>
    public PoolEntry? Entry(int classId, int modId) =>
        _db.Mods.TryGetValue(modId, out var mod)
            ? PoolFor(classId, InfluenceOf(mod)).FirstOrDefault(e => e.Mod.Id == modId)
            : null;

    /// <summary>Vaal-orb corruption enchants (mod group type 5) a class can receive.</summary>
    public IReadOnlyList<(Mod Mod, double Weight)> CorruptionPool(int classId)
    {
        var result = new List<(Mod, double)>();
        if (_db.Raw.ClassMods.TryGetValue(classId.ToString(), out var table))
            foreach (var (modIdText, weight) in table)
                if (weight > 0 && _db.Mods.TryGetValue(int.Parse(modIdText), out var mod) && _db.Groups[mod.Group].Type == 5)
                    result.Add((mod, weight));
        return result;
    }

    /// <summary>
    /// The guaranteed mods an essence gives on a class. Remember: this table is keyed by the class
    /// ENUM, so the class id is converted first.
    /// </summary>
    public IReadOnlyList<int> EssenceModIds(int essenceId, int classId) =>
        _db.Raw.Essences.ByEssence.TryGetValue(essenceId.ToString(), out var byClass)
        && byClass.TryGetValue(_db.ClassEnum(classId).ToString(), out var ids)
            ? ids
            : Array.Empty<int>();

    /// <summary>Tags of a mod's group, without the generic "default" tag (id 0).</summary>
    public IEnumerable<int> GroupTags(Mod mod) => _db.Groups[mod.Group].Tags.Where(t => t != 0);
}
