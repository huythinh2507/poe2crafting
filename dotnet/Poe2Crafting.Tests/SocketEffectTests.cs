using Poe2Crafting.Engine.Crafting;
using Xunit;

namespace Poe2Crafting.Tests;

/// <summary>The 5-suffix wand tech: Serle's Triumph (+1 suffix) scaled past 100% by Runeseeker's Call (+75% runes) and a Sovereign Alloy (+20-30% augments).</summary>
public class SocketEffectTests
{
    private static CraftItem Wand(CraftingEngine e)
    {
        var item = T.Item(e, T.Wand);
        item.Sockets = 2;
        return item;
    }

    private static void Put(CraftingEngine e, CraftItem item, string name, int? slot = null) =>
        Assert.NotNull(e.ApplyMethod(item, T.Methods.ForSocketable(T.Db.SocketableByName(name), slot)));

    private static void AddAlloy(CraftingEngine e, CraftItem item, double roll)
    {
        var mod = e.Db.Mods.Values.First(m => m.Key == "AlloyEffectOfSocketedAugments1");
        var instance = e.RollMod(mod);
        instance.Rolls[0] = roll;
        instance.Crafted = true;
        item.Mods.Add(instance);
    }

    [Fact]
    public void Serle_alone_gives_one_suffix()
    {
        var e = T.Engine();
        var item = Wand(e);
        Put(e, item, "Serle's Triumph");
        Assert.Equal(4, e.MaxAffixes(item).Suffix);
    }

    [Fact]
    public void Aldur_alone_or_alloy_alone_stays_under_100_percent()
    {
        var e = T.Engine();
        var aldur = Wand(e);
        Put(e, aldur, "Serle's Triumph");
        Put(e, aldur, "Legacy of Runeseeker's Call");
        Assert.Equal(75, e.SocketEffectPct(aldur, isRune: true));
        Assert.Equal(4, e.MaxAffixes(aldur).Suffix);

        var alloy = Wand(e);
        Put(e, alloy, "Serle's Triumph");
        AddAlloy(e, alloy, 30);
        Assert.Equal(4, e.MaxAffixes(alloy).Suffix);
    }

    [Fact]
    public void Aldur_plus_alloy_adds_and_reaches_five_suffixes_at_100_percent()
    {
        var e = T.Engine();
        var item = Wand(e);
        Put(e, item, "Serle's Triumph");
        Put(e, item, "Legacy of Runeseeker's Call");
        AddAlloy(e, item, 24);                                          // 75 + 24 = 99: still +1
        Assert.Equal(4, e.MaxAffixes(item).Suffix);
        item.Mods.Clear();
        AddAlloy(e, item, 25);                                          // 75 + 25 = 100: +2
        Assert.Equal(5, e.MaxAffixes(item).Suffix);
    }

    [Fact]
    public void Removing_the_multiplier_drops_the_cap_but_keeps_the_mods()
    {
        var e = T.Engine();
        var item = Wand(e);
        Put(e, item, "Serle's Triumph");
        Put(e, item, "Legacy of Runeseeker's Call");
        AddAlloy(e, item, 30);
        Assert.Equal(5, e.MaxAffixes(item).Suffix);
        var before = item.Mods.Count;
        Put(e, item, "Desert Rune", slot: 1);                           // replaces (destroys) Runeseeker's Call
        Assert.Equal(4, e.MaxAffixes(item).Suffix);
        Assert.Equal(before, item.Mods.Count);
    }
}
