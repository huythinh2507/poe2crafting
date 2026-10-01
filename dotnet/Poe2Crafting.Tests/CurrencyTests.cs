using Poe2Crafting.Engine.Crafting;
using Poe2Crafting.Engine.Data;
using Xunit;

namespace Poe2Crafting.Tests;

public class CurrencyTests
{
    [Fact]
    public void Transmutation_makes_a_magic_item_with_one_mod_and_Alchemy_a_rare_with_four()
    {
        var e = T.Engine();
        var item = T.Item(e, T.BodyArmourStr, Rarity.Normal);
        Assert.NotNull(e.ApplyMethod(item, T.M("poe2_transmutation")));
        Assert.Equal(Rarity.Magic, item.Rarity);
        Assert.Single(item.Mods);

        var fresh = T.Item(e, T.BodyArmourStr, Rarity.Normal);
        e.ApplyMethod(fresh, T.M("poe2_alchemy"));
        Assert.Equal(Rarity.Rare, fresh.Rarity);
        Assert.Equal(4, fresh.Mods.Count);
    }

    [Fact]
    public void Greater_and_Perfect_orbs_come_from_the_data_with_the_right_minimum_levels()
    {
        Assert.Equal(44, T.M("poe2_transmutation_greater").MinModLevel);
        Assert.Equal(70, T.M("poe2_transmutation_perfect").MinModLevel);
        Assert.Equal(35, T.M("poe2_chaos_greater").MinModLevel);
        Assert.Equal(50, T.M("poe2_exalted_perfect").MinModLevel);
        Assert.Equal("poe2_chaos", CraftingEngine.BaseHandler("poe2_chaos_perfect"));
        Assert.Equal("poe2_desecrate", CraftingEngine.BaseHandler("poe2_desecrate_low"));
    }

    [Fact]
    public void Perfect_transmutation_only_rolls_mods_of_level_70_or_the_best_tier_of_a_mod_with_none()
    {
        var e = T.Engine(7);
        for (var k = 0; k < 100; k++)
        {
            var item = T.Item(e, T.BodyArmourStr, Rarity.Normal);
            e.ApplyMethod(item, T.M("poe2_transmutation_perfect"));

            // Minimum Modifier Level never removes a mod type: a group with no tier >= 70 keeps its best tier.
            var mod = e.Db.Mods[item.Mods[0].ModId];
            var group = e.Pools.ClassPool(T.BodyArmourStr).Where(p => p.Mod.Group == mod.Group).ToList();
            var floor = group.Any(p => p.Mod.MinLevel >= 70) ? 70 : group.Max(p => p.Mod.MinLevel);
            Assert.True(mod.MinLevel >= floor);
        }
    }

    // GGG confirmed: Minimum Modifier Level never removes a mod type. If no tier of a mod reaches the minimum,
    // its highest tier the item can roll stays (a Perfect Exalted Orb can add Energy Shield Recharge Rate at level 48).
    [Fact]
    public void Minimum_level_keeps_the_highest_tier_of_a_mod_that_has_none_high_enough()
    {
        var e = T.Engine();
        var item = T.Item(e, T.Gloves);
        var eligible = e.EligibleMods(item, new AddOptions(MinLevel: 50));
        Assert.Contains(eligible, p => p.Mod.Key == "EnergyShieldRechargeRate4" && p.Mod.MinLevel == 48);
    }

    [Theory]
    [InlineData(T.BodyArmourStr)]
    [InlineData(T.Gloves)]
    [InlineData(T.OneHandSword)]
    [InlineData(T.Wand)]
    [InlineData(33)]
    [InlineData(34)]
    [InlineData(35)]
    public void Minimum_level_pool_matches_the_rule_for_every_group(int classId)
    {
        const int min = 50;
        var e = T.Engine();
        var item = T.Item(e, classId);
        var eligible = e.EligibleMods(item, new AddOptions(MinLevel: min)).Select(p => p.Mod.Id).ToHashSet();

        foreach (var group in e.Pools.ClassPool(classId).Where(p => p.Mod.MinLevel <= item.ItemLevel).GroupBy(p => p.Mod.Group))
        {
            var high = group.Where(p => p.Mod.MinLevel >= min).ToList();
            var expected = high.Count > 0 ? high : new List<PoolEntry> { group.MaxBy(p => p.Mod.MinLevel)! };
            Assert.True(expected.All(p => eligible.Contains(p.Mod.Id)), $"group {group.Key}: a tier that should be in the pool is missing");
            Assert.True(group.Except(expected).All(p => !eligible.Contains(p.Mod.Id)), $"group {group.Key}: a tier below the minimum leaked in");
        }
    }

    [Fact]
    public void Chaos_removes_one_mod_and_adds_one()
    {
        var e = T.Engine();
        var item = T.FourMods(e);
        var changes = e.ApplyMethod(item, T.M("poe2_chaos"))!;
        Assert.Equal(4, item.Mods.Count);
        Assert.Equal(new[] { ChangeOp.Remove, ChangeOp.Add }, changes.Select(c => c.Op));
    }

    [Fact]
    public void A_Perfect_Chaos_Orbs_added_mod_respects_its_minimum_level()
    {
        var e = T.Engine(11);
        for (var k = 0; k < 100; k++)
        {
            var item = T.FourMods(e);
            var added = e.ApplyMethod(item, T.M("poe2_chaos_perfect"))!.Single(c => c.Op == ChangeOp.Add).Mod!;
            var mod = e.Db.Mods[added.ModId];
            var group = e.Pools.ClassPool(T.BodyArmourStr).Where(p => p.Mod.Group == mod.Group).ToList();
            var expectedFloor = group.Any(p => p.Mod.MinLevel >= 50) ? 50 : group.Max(p => p.Mod.MinLevel);
            Assert.True(mod.MinLevel >= expectedFloor);
        }
    }

    [Fact]
    public void Vaal_corrupts_and_the_four_outcomes_are_about_equally_likely()
    {
        var e = T.Engine(3);
        var buckets = new Dictionary<string, int>();
        for (var k = 0; k < 800; k++)
        {
            var item = T.WithMods(e, T.BodyArmourStr, (Affix.Prefix, T.Levels(e, T.BodyArmourStr, Affix.Prefix)[3]));
            var changes = e.ApplyMethod(item, T.M("poe2_vaal"))!;
            Assert.True(item.Corrupted);
            var text = changes[0].Text!;
            var key = text.Contains("no other change") ? "none" : text.Contains("rerolled") ? "reroll" : text.Contains("enchantment") ? "enchant" : "socket";
            buckets[key] = buckets.GetValueOrDefault(key) + 1;
        }
        Assert.Equal(4, buckets.Count);
        Assert.All(buckets.Values, n => Assert.InRange(n / 800.0, 0.19, 0.31));
    }

    [Fact]
    public void Omen_of_Corruption_removes_the_no_change_outcome()
    {
        var e = T.Engine(3);
        e.Context.ToggleOmen("corruption");
        for (var k = 0; k < 400; k++)
        {
            var item = T.WithMods(e, T.BodyArmourStr, (Affix.Prefix, T.Levels(e, T.BodyArmourStr, Affix.Prefix)[3]));
            Assert.DoesNotContain("no other change", e.ApplyMethod(item, T.M("poe2_vaal"))![0].Text);
        }
    }

    [Fact]
    public void Quality_orbs_add_5_2_or_1_percent_up_to_the_cap()
    {
        var e = T.Engine();
        var scrap = T.M("armourer_scrap");
        var normal = T.Item(e, T.BodyArmourStr, Rarity.Normal);
        e.ApplyMethod(normal, scrap);
        Assert.Equal(5, normal.Quality);

        var rare = T.Item(e, T.BodyArmourStr, Rarity.Rare);
        e.ApplyMethod(rare, scrap);
        Assert.Equal(1, rare.Quality);

        rare.Quality = 19;
        e.ApplyMethod(rare, scrap);
        Assert.Equal(20, rare.Quality);
        Assert.False(e.CheckConstraints(rare, scrap.Constraints, scrap.Handler)); // at the cap, no longer usable
    }

    [Fact]
    public void Divine_rerolls_unfractured_values_never_a_fractured_mod_and_Blessed_only_touches_implicits()
    {
        var e = T.Engine(5);
        var item = T.FourMods(e);
        item.Mods[0].Fractured = true;
        var snapshot = item.Mods.Select(m => string.Join(",", m.Rolls)).ToList();
        e.Context.ToggleOmen("blessed");
        var changes = e.ApplyMethod(item, T.M("poe2_divine"))!;
        Assert.Equal(item.Implicits.Count, changes.Count);                         // only the implicits were rerolled
        Assert.Equal(snapshot, item.Mods.Select(m => string.Join(",", m.Rolls)).ToList());

        e.Context.Omens.Clear();
        var fracturedRolls = (double[])item.Mods[0].Rolls.Clone();
        var rerolledSomewhere = false;
        for (var k = 0; k < 40; k++)
        {
            var before = item.Mods.Skip(1).Select(m => string.Join(",", m.Rolls)).ToList();
            e.ApplyMethod(item, T.M("poe2_divine"));
            rerolledSomewhere |= !before.SequenceEqual(item.Mods.Skip(1).Select(m => string.Join(",", m.Rolls)));
        }
        Assert.True(item.Mods[0].Fractured);
        Assert.Equal(fracturedRolls, item.Mods[0].Rolls);                           // locked: Divine never changes a fractured mod
        Assert.True(rerolledSomewhere);                                             // while the other mods still reroll
    }

    // ---- Hinekora's Lock -------------------------------------------------------------------------

    [Fact]
    public void Hinekoras_Lock_previews_exactly_what_the_real_craft_then_does()
    {
        var e = T.Engine(21);
        var item = T.FourMods(e);
        Assert.True(e.TryCraft(item, T.M("hinekora_lock")).Success);
        Assert.True(item.Locked);

        var chaos = T.M("poe2_chaos");
        var preview = e.Foresee(item, chaos)!;
        Assert.True(item.Locked);                                                   // previewing changes nothing

        var result = e.TryCraft(item, chaos);
        Assert.True(result.Success);
        Assert.False(item.Locked);                                                  // the Lock is used up
        Assert.Equal(preview.Item.Mods.Select(m => (m.ModId, string.Join(",", m.Rolls))),
                     item.Mods.Select(m => (m.ModId, string.Join(",", m.Rolls))));
    }

    [Fact]
    public void TryCraft_refuses_when_constraints_fail_and_leaves_the_item_alone()
    {
        var e = T.Engine();
        var normal = T.Item(e, T.BodyArmourStr, Rarity.Normal);
        var result = e.TryCraft(normal, T.M("poe2_chaos"));                         // needs a rare item
        Assert.False(result.Success);
        Assert.Empty(normal.Mods);
    }

    [Fact]
    public void Omens_are_consumed_only_by_the_currency_they_target()
    {
        var e = T.Engine();
        e.Context.ToggleOmen("whittling");
        e.Context.ConsumeOmens("poe2_exalted");
        e.Context.ConsumeOmens("poe2_annulment");
        Assert.True(e.Context.Has("whittling"));
        e.Context.ConsumeOmens("poe2_chaos_perfect");
        Assert.False(e.Context.Has("whittling"));
    }
}
