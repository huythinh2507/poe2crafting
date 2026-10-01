using System.Text.RegularExpressions;
using Poe2Crafting.Engine.Data;

namespace Poe2Crafting.Engine.Crafting;

public enum StatsKind { Weapon, Armour, Caster }

/// <summary>A value with its base, so a UI can mark it "augmented" when it differs.</summary>
public readonly record struct Augmented(double Base, double Final)
{
    public bool IsAugmented => Math.Abs(Base - Final) > 0.005;
}

/// <summary>A damage range with its base.</summary>
public sealed record DamageRange(double BaseMin, double BaseMax, double Min, double Max);

public sealed record WeaponDps(double Physical, double Elemental)
{
    public double Total => Math.Round(Physical + Elemental, 2);
}

/// <summary>A skill a weapon grants, at the level its item level gives.</summary>
public sealed record GrantedSkill(string Name, int Level);

/// <summary>Spirit a sceptre grants: its base and the value after quality.</summary>
public sealed record SpiritStat(double Base, double Final);

public sealed record DefenceStat(string Key, string Label, double Base, double Final);

/// <summary>What the tooltip shows under the item name.</summary>
public sealed class ItemStats
{
    public required StatsKind Kind { get; init; }

    // weapon
    public IReadOnlyDictionary<string, DamageRange> Damage { get; init; } = new Dictionary<string, DamageRange>();
    public Augmented? Crit { get; init; }
    public Augmented? AttacksPerSecond { get; init; }
    public double? Range { get; init; }
    public WeaponDps? Dps { get; init; }

    // armour
    public IReadOnlyList<DefenceStat> Defences { get; init; } = Array.Empty<DefenceStat>();
    public Augmented? Block { get; init; }

    // caster
    public IReadOnlyList<GrantedSkill> Skills { get; init; } = Array.Empty<GrantedSkill>();
    public SpiritStat? Spirit { get; init; }

    /// <summary>Quality on a wand or staff improves the skill it grants, not the weapon (0 on sceptres).</summary>
    public double SkillQuality { get; init; }
}

public sealed partial class CraftingEngine
{
    // Displayed stats start from the base and respond to quality and to the item's LOCAL mods:
    //   weapon physical  = (base + added flat) x (1 + local increased% / 100) x (1 + quality% / 100)   quality: 1% MORE per 1%, martial weapons
    //   weapon elemental = base + added flat                     attacks per second = base x (1 + local attack speed% / 100)
    //   crit chance      = base + local "+x% to crit chance"     defence = (base + flat) x (1 + local increased% / 100) x (1 + quality% / 100)

    private static readonly string[] DamageTypes = { "physical", "fire", "cold", "lightning", "chaos" };

    /// <summary>Sum of a local stat (by game stat id) over every mod on the item: explicits, implicits and corruption enchants.</summary>
    public double LocalStat(CraftItem item, string statId)
    {
        double total = 0;
        foreach (var instance in item.Mods.Concat(item.Implicits).Concat(item.Corruption))
        {
            var mod = Db.Mods[instance.ModId];
            for (var i = 0; i < mod.Stats.Count; i++)
                if (Db.StatId(mod.Stats[i].Index) == statId && i < instance.Rolls.Length) total += instance.Rolls[i];
        }
        return total;
    }

    /// <summary>"#% increased Armour / Evasion / Energy Shield (and ...)" local mods, e.g. local_armour_and_energy_shield_+%.</summary>
    private double DefenceIncrease(CraftItem item, Regex kind)
    {
        double total = 0;
        foreach (var instance in item.Mods.Concat(item.Implicits).Concat(item.Corruption))
        {
            var mod = Db.Mods[instance.ModId];
            for (var i = 0; i < mod.Stats.Count; i++)
            {
                var id = Db.StatId(mod.Stats[i].Index) ?? "";
                if (id.StartsWith("local_", StringComparison.Ordinal) && id.EndsWith("_+%", StringComparison.Ordinal) && kind.IsMatch(id) && i < instance.Rolls.Length)
                    total += instance.Rolls[i];
            }
        }
        return total;
    }

    private static readonly Regex ArmourKey = new("armour|physical_damage_reduction_rating");
    private static readonly Regex EvasionKey = new("evasion");
    private static readonly Regex EnergyShieldKey = new("energy_shield");

    /// <summary>Level of a skill a weapon grants: the item level through the game data's threshold table.</summary>
    public int GrantedSkillLevel(int ilvl)
    {
        var level = 1;
        foreach (var row in Db.Raw.Skills.Scaling) if (ilvl >= row.Item) level = row.Gem;
        return level;
    }

    /// <summary>
    /// DPS the way the trade site shows it: the DISPLAYED (rounded) damage range averaged, times the DISPLAYED (2 decimal)
    /// attacks per second. 507-837 physical at 1.56 = 672 x 1.56 = 1048.32.
    /// </summary>
    public static WeaponDps ComputeDps(IReadOnlyDictionary<string, DamageRange> damage, double attacksPerSecond)
    {
        var shownAps = Math.Round(attacksPerSecond, 2, MidpointRounding.AwayFromZero);
        double Average(DamageRange d) => (Math.Round(d.Min, MidpointRounding.AwayFromZero) + Math.Round(d.Max, MidpointRounding.AwayFromZero)) / 2;
        var physical = damage.TryGetValue("physical", out var phys) ? Math.Round(Average(phys) * shownAps, 2) : 0;
        var elemental = Math.Round(damage.Where(kv => kv.Key != "physical").Sum(kv => Average(kv.Value) * shownAps), 2);
        return new WeaponDps(physical, elemental);
    }

    /// <summary>Final stats for the tooltip, or null if the base has none.</summary>
    public ItemStats? ItemStatsOf(CraftItem item)
    {
        var baseItem = Db.Items[item.BaseId];
        var bs = Db.BaseStatsOf(baseItem);
        if (bs is null) return null;
        var quality = item.Quality;

        if (bs.Kind == StatsKind.Weapon)
        {
            var incPhysical = LocalStat(item, "local_physical_damage_+%");
            var qualityMultiplier = IsMartial(item) ? 1 + quality / 100.0 : 1;
            var damage = new Dictionary<string, DamageRange>();
            foreach (var type in DamageTypes)
            {
                bs.Damage.TryGetValue(type, out var b);
                var addMin = LocalStat(item, $"local_minimum_added_{type}_damage");
                var addMax = LocalStat(item, $"local_maximum_added_{type}_damage");
                if (b is null && addMin == 0 && addMax == 0) continue;
                var (baseMin, baseMax) = b is null ? (0.0, 0.0) : (b[0], b[1]);
                var (min, max) = (baseMin + addMin, baseMax + addMax);
                if (type == "physical")
                {
                    var multiplier = (1 + incPhysical / 100) * qualityMultiplier;
                    (min, max) = (min * multiplier, max * multiplier);
                }
                damage[type] = new DamageRange(baseMin, baseMax, min, max);
            }

            var aps = bs.AttacksPerSecond * (1 + LocalStat(item, "local_attack_speed_+%") / 100);
            var crit = bs.Crit + LocalStat(item, "local_critical_strike_chance");

            return new ItemStats
            {
                Kind = StatsKind.Weapon, Damage = damage,
                Crit = new Augmented(bs.Crit, crit), AttacksPerSecond = new Augmented(bs.AttacksPerSecond, aps),
                Range = bs.Range, Skills = bs.Skills.Select(n => new GrantedSkill(n, GrantedSkillLevel(item.ItemLevel))).ToList(), Dps = ComputeDps(damage, aps),
            };
        }

        if (bs.Kind == StatsKind.Armour)
        {
            var defences = new List<DefenceStat>();
            void Add(string key, string label, double? baseValue, string flatId, Regex kind)
            {
                if (baseValue is not { } b || b == 0) return;
                var final = (b + LocalStat(item, flatId)) * (1 + DefenceIncrease(item, kind) / 100) * (1 + quality / 100.0);
                defences.Add(new DefenceStat(key, label, b, final));
            }
            Add("armour", "Armour", bs.Armour, "local_base_physical_damage_reduction_rating", ArmourKey);
            Add("evasion", "Evasion Rating", bs.Evasion, "local_base_evasion_rating", EvasionKey);
            Add("energyshield", "Energy Shield", bs.EnergyShield, "local_energy_shield", EnergyShieldKey);
            if (bs.Ward is { } ward && ward > 0) defences.Add(new DefenceStat("ward", "Runic Ward", ward, ward));
            Augmented? block = bs.Block is { } blk && blk > 0 ? new Augmented(blk, blk * (1 + LocalStat(item, "local_block_chance_+%") / 100)) : null;
            return new ItemStats { Kind = StatsKind.Armour, Defences = defences, Block = block };
        }

        // Wands, staves and sceptres deal no damage and show no DPS. Quality does not touch the weapon: on wands and staves it is the
        // granted skill's quality, sceptres get no quality effect. Spirit never scales with quality.
        var level = GrantedSkillLevel(item.ItemLevel);
        var isSceptre = baseItem.ClassId == 56;
        return new ItemStats
        {
            Kind = StatsKind.Caster, Skills = bs.Skills.Select(n => new GrantedSkill(n, level)).ToList(),
            SkillQuality = isSceptre ? 0 : quality,
            Spirit = bs.Spirit is { } sp ? new SpiritStat(sp, sp) : null,
        };
    }
}
