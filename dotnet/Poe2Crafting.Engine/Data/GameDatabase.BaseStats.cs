using Poe2Crafting.Engine.Crafting;

namespace Poe2Crafting.Engine.Data;

/// <summary>The stats a base item starts with, before quality or mods.</summary>
public sealed class BaseStats
{
    public required StatsKind Kind { get; init; }

    // weapon
    public Dictionary<string, double[]> Damage { get; init; } = new();
    public double Crit { get; init; }                  // percent
    public double AttacksPerSecond { get; init; }
    public double? Range { get; init; }

    // armour
    public double? Armour { get; init; }
    public double? Evasion { get; init; }
    public double? EnergyShield { get; init; }
    public double? Ward { get; init; }
    public double? Block { get; init; }

    // caster
    public double? Spirit { get; init; }
    public List<string> Skills { get; init; } = new();
}

public sealed partial class GameDatabase
{
    private static readonly string[] DamageTypes = { "physical", "fire", "cold", "lightning", "chaos" };
    private Dictionary<string, int>? _nameCounts;

    /// <summary>The game stat id behind a mod stat's index, e.g. "local_attack_speed_+%".</summary>
    public string? StatId(int? index) =>
        index is { } i && Raw.Stats.TryGetValue(i.ToString(), out var stat) ? stat.Id : null;

    private int BaseNameCount(string name)
    {
        _nameCounts ??= Raw.Items.Entries.Where(i => i.Domain == 1 && (i.DropLevel ?? 0) > 0)
            .GroupBy(i => Text(i.Label)).ToDictionary(g => g.Key, g => g.Count());
        return _nameCounts.GetValueOrDefault(name);
    }

    /// <summary>
    /// Base stats of a weapon / armour / caster base, or null if it has none. The game data has a weapon's total
    /// damage but not the hidden implicit that turns a share of it into fire / cold / lightning (Cinderbark Talisman:
    /// "30% of base damage is fire"), so poe2db's split is used, but only when it is unambiguous: a unique base name
    /// whose damage adds up to the data's total.
    /// </summary>
    public BaseStats? BaseStatsOf(BaseItem baseItem)
    {
        double? P(string key) => baseItem.Prop(key);
        var skills = (baseItem.Skills ?? new List<int>())
            .Select(id => Raw.Skills.Entries.FirstOrDefault(s => s.Id == id))
            .Where(s => s is not null).Select(s => ItemName(s!.Item)).Where(n => n.Length > 0).ToList();

        if (P("physical_damage_min") is { } min && P("physical_damage_max") is { } max)
        {
            var damage = new Dictionary<string, double[]> { ["physical"] = new[] { min, max } };
            var name = Text(baseItem.Label);
            if (WeaponBases.TryGetValue(name, out var reference) && BaseNameCount(name) == 1)
            {
                double Sum(int k) => DamageTypes.Sum(t => reference.Damage.TryGetValue(t, out var d) && d is not null ? d[k] : 0);
                if (Math.Abs(Sum(0) - min) <= 0.6 && Math.Abs(Sum(1) - max) <= 0.6)
                    damage = DamageTypes.Where(t => reference.Damage.TryGetValue(t, out var d) && d is not null)
                        .ToDictionary(t => t, t => reference.Damage[t]!);
            }
            return new BaseStats
            {
                Kind = StatsKind.Weapon, Damage = damage,
                Crit = (P("critical_strike_chance") ?? 0) / 100,
                AttacksPerSecond = 1000 / (P("attack_time") ?? 1000),
                Range = P("range") is { } r && r <= 300 ? r / 10 : null,
                Skills = skills,
            };
        }

        double? armour = P("armour"), evasion = P("evasion"), es = P("energyshield"), ward = P("ward");
        if (armour > 0 || evasion > 0 || es > 0 || ward > 0)
            return new BaseStats { Kind = StatsKind.Armour, Armour = armour, Evasion = evasion, EnergyShield = es, Ward = ward, Block = P("block"), Skills = skills };

        if (skills.Count > 0 || P("spirit") is not null)
            return new BaseStats { Kind = StatsKind.Caster, Skills = skills, Spirit = P("spirit") };
        return null;
    }
}
