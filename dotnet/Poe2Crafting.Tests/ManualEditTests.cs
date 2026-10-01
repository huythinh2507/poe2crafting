using Poe2Crafting.Engine.Crafting;
using Poe2Crafting.Engine.Data;
using Xunit;

namespace Poe2Crafting.Tests;

public class ManualEditTests
{
    private static PoolEntry Pick(CraftingEngine e, int classId, Affix affix, int skip, params int[] usedGroups) =>
        e.Pools.ClassPool(classId).Where(p => p.Affix == affix && !usedGroups.Contains(p.Mod.Group)).GroupBy(p => p.Mod.Group).Skip(skip).First().First();

    [Fact]
    public void A_normal_item_becomes_magic_then_rare_as_mods_are_added()
    {
        var e = T.Engine();
        var item = T.Item(e, T.Talisman, Rarity.Normal);

        var p1 = Pick(e, T.Talisman, Affix.Prefix, 0);
        Assert.NotNull(e.AddModManually(item, p1.Mod.Id));
        Assert.Equal(Rarity.Magic, item.Rarity);

        var s1 = Pick(e, T.Talisman, Affix.Suffix, 0);
        Assert.NotNull(e.AddModManually(item, s1.Mod.Id));
        Assert.Equal(Rarity.Magic, item.Rarity);                    // one prefix + one suffix is still magic

        var p2 = Pick(e, T.Talisman, Affix.Prefix, 3, p1.Mod.Group);
        Assert.NotNull(e.AddModManually(item, p2.Mod.Id));
        Assert.Equal(Rarity.Rare, item.Rarity);                     // a second prefix needs a rare
        Assert.Equal(3, item.Mods.Count);
    }

    [Fact]
    public void The_same_mod_group_twice_a_full_affix_and_corrupted_items_are_refused()
    {
        var e = T.Engine();
        var item = T.Item(e, T.Talisman, Rarity.Normal);
        var first = Pick(e, T.Talisman, Affix.Prefix, 0);
        e.AddModManually(item, first.Mod.Id);
        var sameGroup = e.Pools.ClassPool(T.Talisman).First(p => p.Mod.Group == first.Mod.Group && p.Mod.Id != first.Mod.Id);
        Assert.Null(e.AddModManually(item, sameGroup.Mod.Id));

        var rare = T.Item(e, T.Talisman);
        var used = new List<int>();
        for (var k = 0; k < 3; k++) { var p = Pick(e, T.Talisman, Affix.Prefix, k, used.ToArray()); used.Add(p.Mod.Group); Assert.NotNull(e.AddModManually(rare, p.Mod.Id)); }
        Assert.Null(e.AddModManually(rare, Pick(e, T.Talisman, Affix.Prefix, 4, used.ToArray()).Mod.Id)); // 3 prefixes already

        rare.Corrupted = true;
        Assert.Null(e.AddModManually(rare, Pick(e, T.Talisman, Affix.Suffix, 0).Mod.Id));
    }

    [Fact]
    public void Lich_mods_can_be_added_as_desecrated_and_a_revealed_desecrated_mod_can_be_fractured()
    {
        var e = T.Engine();
        var item = T.Item(e, T.Talisman, Rarity.Normal);
        var lich = e.Pools.LichPool(T.Talisman).First(p => p.Affix == Affix.Prefix);
        var added = e.AddModManually(item, lich.Mod.Id, desecrated: true)!;
        Assert.True(added.Desecrated);
        Assert.Null(e.FlagBlocked(item, added, ModFlag.Fractured));
        Assert.Null(e.AddModManually(item, lich.Mod.Id));            // a Lich mod is not in the normal pool
    }

    [Fact]
    public void Set_values_clamps_to_each_stats_range()
    {
        var e = T.Engine();
        var item = T.FourMods(e);
        var mod = e.Db.Mods[item.Mods[0].ModId];
        var (low, high) = (mod.Stats[0].Range[0], mod.Stats[0].Range[1]);

        Assert.Equal(high, e.SetModValues(item, 0, new[] { 999999.0 })!.Rolls[0]);
        Assert.Equal(low, e.SetModValues(item, 0, new[] { -5.0 })!.Rolls[0]);
        Assert.Null(e.SetModValues(item, 99, new[] { 1.0 }));
    }

    [Fact]
    public void Flag_rules_only_one_fractured_mod_per_item()
    {
        var e = T.Engine();
        var item = T.FourMods(e);
        Assert.Null(e.FlagBlocked(item, item.Mods[0], ModFlag.Fractured));
        item.Mods[0].Fractured = true;

        Assert.Equal("An item can only have one fractured modifier", e.FlagBlocked(item, item.Mods[1], ModFlag.Fractured));
        Assert.Null(e.FlagBlocked(item, item.Mods[0], ModFlag.Fractured));                                  // can be removed again
        Assert.Null(e.FlagBlocked(item, item.Mods[0], ModFlag.Desecrated));                                // fractured + desecrated can coexist
        Assert.Null(e.FlagBlocked(item, item.Mods[1], ModFlag.Crafted));
    }
}
