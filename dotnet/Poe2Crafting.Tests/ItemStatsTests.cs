using Poe2Crafting.Engine.Crafting;
using Poe2Crafting.Engine.Data;
using Xunit;

namespace Poe2Crafting.Tests;

public class ItemStatsTests
{
    private static CraftItem Make(CraftingEngine e, string baseName) => e.NewItem(T.Db.BaseByName(baseName), 100);

    private static void AssertRange(DamageRange? actual, double min, double max)
    {
        Assert.NotNull(actual);
        Assert.InRange(actual!.Min, min - 0.06, min + 0.06);
        Assert.InRange(actual.Max, max - 0.06, max + 0.06);
    }

    // The reported gap: poe2db lists physical AND elemental base damage; the game data only has the total.
    [Theory]
    [InlineData("Cinderbark Talisman", 12.6, 25.2, "fire", 5.4, 10.8)]
    [InlineData("Voltfang Talisman", 16.1, 91.0, "lightning", 6.9, 39.0)]
    [InlineData("Ashbark Talisman", 50.4, 105.0, "fire", 21.6, 45.0)]
    [InlineData("Thunder Talisman", 23.1, 130.9, "lightning", 9.9, 56.1)]
    public void Talismans_show_physical_and_elemental_base_damage_as_on_poe2db(string name, double pMin, double pMax, string element, double eMin, double eMax)
    {
        var e = T.Engine();
        var stats = e.ItemStatsOf(Make(e, name))!;
        Assert.Equal(StatsKind.Weapon, stats.Kind);
        Assert.Equal(2, stats.Damage.Count);
        AssertRange(stats.Damage["physical"], pMin, pMax);
        AssertRange(stats.Damage[element], eMin, eMax);
    }

    [Fact]
    public void A_purely_elemental_base_has_no_physical_part_and_a_plain_base_has_no_elemental_part()
    {
        var e = T.Engine();
        var flail = e.ItemStatsOf(Make(e, "Icicle Flail"))!;
        Assert.Equal(new[] { "cold" }, flail.Damage.Keys.ToArray());

        var sword = e.ItemStatsOf(Make(e, "Shortsword"))!;
        Assert.Equal(new[] { "physical" }, sword.Damage.Keys.ToArray());
        Assert.Equal(5, sword.Crit!.Value.Final, 2);
        Assert.Equal(1.55, sword.AttacksPerSecond!.Value.Final, 2);
    }

    // Quality on martial weapons is 1% MORE physical damage per 1%; elemental damage is not affected.
    [Fact]
    public void Quality_multiplies_physical_damage_but_not_elemental()
    {
        var e = T.Engine();
        var item = Make(e, "Cinderbark Talisman");
        item.Quality = 20;
        var stats = e.ItemStatsOf(item)!;
        AssertRange(stats.Damage["physical"], 12.6 * 1.2, 25.2 * 1.2);
        AssertRange(stats.Damage["fire"], 5.4, 10.8);
        Assert.True(stats.Dps!.Total > 0);
    }

    [Fact]
    public void Local_mods_added_damage_increased_physical_attack_speed_and_crit_change_the_displayed_stats()
    {
        var e = T.Engine();
        var item = Make(e, "Shortsword");
        ModInstance Max(string statId)
        {
            var mod = T.Db.Mods.Values.First(m => m.Stats.Any(s => T.Db.StatId(s.Index) == statId) && e.Pools.InfluenceOf(m) == ModPools.Normal);
            return new ModInstance { ModId = mod.Id, Rolls = mod.Stats.Select(s => s.Range[1]).ToArray() };
        }
        item.Mods.AddRange(new[] { Max("local_minimum_added_physical_damage"), Max("local_physical_damage_+%"), Max("local_attack_speed_+%"), Max("local_critical_strike_chance") });
        item.Quality = 10;

        var stats = e.ItemStatsOf(item)!;
        var inc = e.LocalStat(item, "local_physical_damage_+%");
        var expectMin = (6 + e.LocalStat(item, "local_minimum_added_physical_damage")) * (1 + inc / 100) * 1.1;
        var expectMax = (9 + e.LocalStat(item, "local_maximum_added_physical_damage")) * (1 + inc / 100) * 1.1;
        AssertRange(stats.Damage["physical"], expectMin, expectMax);
        Assert.Equal(1.55 * (1 + e.LocalStat(item, "local_attack_speed_+%") / 100), stats.AttacksPerSecond!.Value.Final, 2);
        Assert.Equal(5 + e.LocalStat(item, "local_critical_strike_chance"), stats.Crit!.Value.Final, 2);
        Assert.True(stats.AttacksPerSecond.Value.IsAugmented);
    }

    [Fact]
    public void Armour_quality_multiplies_the_defence()
    {
        var e = T.Engine();
        var item = Make(e, "Runeforged Warlord Cuirass");
        var baseArmour = e.ItemStatsOf(item)!.Defences.Single(d => d.Key == "armour").Base;
        item.Quality = 20;
        Assert.Equal(baseArmour * 1.2, e.ItemStatsOf(item)!.Defences.Single(d => d.Key == "armour").Final, 0);
    }

    [Fact]
    public void Caster_weapons_have_no_damage_but_show_their_granted_skill()
    {
        var e = T.Engine();
        var wand = e.ItemStatsOf(Make(e, "Withered Wand"))!;
        Assert.Equal(StatsKind.Caster, wand.Kind);
        Assert.Contains(wand.Skills, s => s.Name == "Chaos Bolt");
        Assert.Empty(wand.Damage);
        Assert.Null(wand.Dps);

        var sceptre = e.ItemStatsOf(Make(e, "Rattling Sceptre"))!;
        Assert.Equal(100, sceptre.Spirit!.Base);
    }

    // The official trade example (Honour Gnarl talisman): 507-837 physical + 7-349 lightning at 1.56 aps.
    [Fact]
    public void Dps_is_computed_from_the_displayed_values_like_the_trade_site()
    {
        var damage = new Dictionary<string, DamageRange>
        {
            ["physical"] = new(0, 0, 507, 837), ["lightning"] = new(0, 0, 7, 349),
        };
        var dps = CraftingEngine.ComputeDps(damage, 1.56);
        Assert.Equal(1048.32, dps.Physical, 2);
        Assert.Equal(277.68, dps.Elemental, 2);
        Assert.Equal(1326, Math.Round(dps.Total));

        var rounded = CraftingEngine.ComputeDps(new Dictionary<string, DamageRange> { ["physical"] = new(0, 0, 506.6, 837.4) }, 1.5625);
        Assert.Equal(1048.32, rounded.Physical, 2);
    }

    [Fact]
    public void Wand_quality_is_skill_quality_and_leaves_the_weapon_alone()
    {
        var e = T.Engine();
        var wand = Make(e, "Dueling Wand");
        wand.Quality = 20;
        var stats = e.ItemStatsOf(wand)!;
        Assert.Equal(20, stats.SkillQuality);
        Assert.Null(stats.Dps);
        Assert.Empty(stats.Damage);
        Assert.Equal(e.GrantedSkillLevel(100), stats.Skills[0].Level);
    }

    [Fact]
    public void Granted_skill_level_follows_item_level()
    {
        var e = T.Engine();
        Assert.Equal(1, e.GrantedSkillLevel(1));
        Assert.Equal(18, e.GrantedSkillLevel(78));
        Assert.Equal(19, e.GrantedSkillLevel(84));
        Assert.Equal(20, e.GrantedSkillLevel(100));
    }

    [Fact]
    public void Sceptre_quality_does_not_change_spirit()
    {
        var e = T.Engine();
        var sceptre = Make(e, "Rattling Sceptre");
        sceptre.Quality = 20;
        var stats = e.ItemStatsOf(sceptre)!;
        Assert.Equal(100, stats.Spirit!.Final);
        Assert.Equal(0, stats.SkillQuality);
    }

    [Fact]
    public void Martial_quality_raises_physical_dps()
    {
        var e = T.Engine();
        var item = Make(e, "Cinderbark Talisman");
        var before = e.ItemStatsOf(item)!.Dps!.Physical;
        item.Quality = 20;
        Assert.True(e.ItemStatsOf(item)!.Dps!.Physical > before * 1.15);
    }

    [Fact]
    public void When_two_bases_share_a_name_the_data_values_are_kept_not_guessed()
    {
        var e = T.Engine();
        var golden = T.Db.Raw.Items.Entries.First(i => T.Db.Text(i.Label) == "Golden Blade" && i.Domain == 1);
        Assert.Equal(new[] { "physical" }, e.ItemStatsOf(e.NewItem(golden))!.Damage.Keys.ToArray());
    }

    [Fact]
    public void Every_weapon_base_computes_and_its_elemental_split_adds_up_to_the_data_total()
    {
        var e = T.Engine();
        var classes = T.Db.Raw.Classes.Entries.Where(c => c.Group is 7 or 8).Select(c => c.Id).ToHashSet();
        var bad = new List<string>();
        var count = 0;
        foreach (var b in T.Db.Raw.Items.Entries.Where(i => i.Domain == 1 && (i.DropLevel ?? 0) > 0 && i.ClassId is { } c && classes.Contains(c)))
        {
            count++;
            var stats = e.ItemStatsOf(e.NewItem(b));
            if (stats?.Kind != StatsKind.Weapon || b.Prop("physical_damage_min") is not { } dataMin || b.Prop("physical_damage_max") is not { } dataMax) continue;
            var min = stats.Damage.Values.Sum(d => d.Min);
            var max = stats.Damage.Values.Sum(d => d.Max);
            if (Math.Abs(min - dataMin) > 0.7 || Math.Abs(max - dataMax) > 0.7) bad.Add(T.Db.Text(b.Label));
        }
        Assert.Equal(407, count);
        Assert.Empty(bad);
    }
}

public class RingSlotTests
{
    [Theory]
    [InlineData("Dusk Ring", 4, 2)]
    [InlineData("Gloam Ring", 2, 4)]
    [InlineData("Penumbra Ring", 5, 1)]
    [InlineData("Tenebrous Ring", 1, 5)]
    [InlineData("Iron Ring", 3, 3)]
    [InlineData("Dusk Amulet", 4, 2)]
    [InlineData("Penumbra Amulet", 5, 1)]
    [InlineData("Lament Amulet", 2, 3)]
    [InlineData("Portent Amulet", 3, 2)]
    [InlineData("Absent Amulet", 2, 2)]
    [InlineData("Twisted Amulet", 2, 3)]
    [InlineData("Distorted Amulet", 3, 2)]
    [InlineData("Gold Amulet", 3, 3)]
    public void Ring_implicits_move_slots_between_prefixes_and_suffixes(string name, int prefixes, int suffixes)
    {
        var e = T.Engine();
        var ring = e.NewItem(T.Db.BaseByName(name), 100);
        ring.Rarity = Rarity.Rare;
        Assert.Equal((prefixes, suffixes), e.MaxAffixes(ring));
    }

    [Fact]
    public void Magic_rings_keep_one_prefix_and_one_suffix()
    {
        var e = T.Engine();
        var ring = e.NewItem(T.Db.BaseByName("Dusk Ring"), 100);
        ring.Rarity = Rarity.Magic;
        Assert.Equal((1, 1), e.MaxAffixes(ring));
    }
}
