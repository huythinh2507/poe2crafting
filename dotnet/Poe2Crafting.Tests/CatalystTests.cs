using Poe2Crafting.Engine.Crafting;
using Poe2Crafting.Engine.Data;
using Xunit;

namespace Poe2Crafting.Tests;

public class CatalystTests
{
    private static CraftItem Make(CraftingEngine e, string name, int ilvl = 100)
    {
        var item = e.NewItem(T.Db.BaseByName(name), ilvl);
        item.Rarity = Rarity.Rare;
        return item;
    }

    private static CraftMethod Catalyst(string name) => T.M("poe2_catalyst_" + name);

    [Fact]
    public void Every_catalyst_handler_is_implemented()
    {
        var e = T.Engine();
        foreach (var name in new[] { "adaptive", "carapace", "chayula", "esh", "flesh", "neural", "necrotic", "reaver", "sibilant", "skittering", "tul", "uulnetol", "xoph" })
        {
            Assert.True(e.IsImplemented("poe2_catalyst_" + name));
            Assert.True(e.IsImplemented("poe2_refined_catalyst_" + name));
        }
    }

    [Fact]
    public void Gain_per_use_falls_with_item_level()
    {
        var e = T.Engine();
        Assert.Equal(20, e.CatalystGain(1));
        var high = Enumerable.Range(0, 2000).Select(_ => e.CatalystGain(100)).ToList();
        Assert.All(high, g => Assert.InRange(g, 1, 2));
        Assert.InRange(high.Count(g => g == 2) / 2000.0, 0.15, 0.25);
    }

    [Fact]
    public void Quality_stacks_to_the_cap_and_a_different_catalyst_replaces_it()
    {
        var e = T.Engine();
        var ring = Make(e, "Iron Ring");
        for (var k = 0; k < 40; k++) e.ApplyMethod(ring, Catalyst("flesh"));
        Assert.Equal(new CatalystQuality("life", 20), ring.Catalyst);
        e.ApplyMethod(ring, Catalyst("tul"));
        Assert.Equal("cold", ring.Catalyst!.Tag);
        Assert.InRange(ring.Catalyst.Quality, 1, 2);
    }

    [Fact]
    public void A_breach_ring_raises_the_cap()
    {
        var e = T.Engine();
        var ring = Make(e, "Breach Ring");
        Assert.Equal(40, e.CatalystCap(ring));
        for (var k = 0; k < 100; k++) e.ApplyMethod(ring, Catalyst("flesh"));
        Assert.Equal(40, ring.Catalyst!.Quality);
    }

    [Fact]
    public void Constraint_allows_rings_and_amulets_only()
    {
        var e = T.Engine();
        var list = new[] { "catalyst_base" };
        Assert.True(e.CheckConstraints(Make(e, "Iron Ring"), list));
        Assert.True(e.CheckConstraints(Make(e, "Lunar Amulet"), list));
        Assert.False(e.CheckConstraints(Make(e, "Shortsword"), list));
    }

    [Fact]
    public void Quality_scales_matching_mods_only()
    {
        var e = T.Engine();
        var life = T.Db.Raw.Tags.Entries.First(t => t.Key == "life").Id;
        var mod = T.Db.Mods.Values.First(m => e.Pools.GroupTags(m).Contains(life) && m.Stats.Count == 1 && m.Stats[0].Range[1] >= 30);
        var ring = Make(e, "Iron Ring");
        ring.Catalyst = new CatalystQuality("life", 20);
        Assert.Equal(Math.Round(30 * 1.2), e.CatalystScaled(ring, mod, 30));
        var other = T.Db.Mods.Values.First(m => !e.Pools.GroupTags(m).Contains(life) && m.Stats.Count == 1);
        Assert.Equal(30, e.CatalystScaled(ring, other, 30));
        Assert.Equal(30, e.CatalystScaled(Make(e, "Iron Ring"), mod, 30));   // no catalyst: untouched
    }

    // Values round DOWN: a +3 needs 34% quality to become +4 (3 x 1.17 = 3.51 stays 3).
    [Fact]
    public void Scaled_values_round_down()
    {
        var e = T.Engine();
        var life = T.Db.Raw.Tags.Entries.First(t => t.Key == "life").Id;
        var mod = T.Db.Mods.Values.First(m => e.Pools.GroupTags(m).Contains(life) && m.Stats.Count == 1);
        var ring = Make(e, "Iron Ring");
        double At(int quality) { ring.Catalyst = new CatalystQuality("life", quality); return e.CatalystScaled(ring, mod, 3); }
        Assert.Equal(3, At(17));
        Assert.Equal(3, At(33));
        Assert.Equal(4, At(34));
    }

    [Fact]
    public void Omen_factor_is_x5_at_20_percent_and_x2_at_5_percent()
    {
        Assert.Equal(5, CraftingEngine.CatalystFactor(20), 6);
        Assert.Equal(2, CraftingEngine.CatalystFactor(5), 6);
        Assert.Equal(7.4, CraftingEngine.CatalystFactor(40), 6);
    }

    [Fact]
    public void Catalysing_omen_boosts_the_tag_and_consumes_the_quality()
    {
        var e = T.Engine();
        var life = T.Db.Raw.Tags.Entries.First(t => t.Key == "life").Id;
        double LifeChance(CraftItem item, bool omen)
        {
            e.Context.Omens.Clear();
            if (omen) e.Context.Omens.Add("exalt_catalyst");
            var chances = e.AddChances(item, T.M("poe2_exalted"));
            e.Context.Omens.Clear();
            return chances.ByModId.Where(kv => e.Pools.GroupTags(T.Db.Mods[kv.Key]).Contains(life)).Sum(kv => kv.Value);
        }

        var ring = Make(e, "Iron Ring");
        ring.Catalyst = new CatalystQuality("life", 20);
        var without = LifeChance(ring, false);
        var with = LifeChance(ring, true);
        Assert.True(with > without * 2, $"{without:F3} -> {with:F3}");

        // no quality: the omen changes nothing
        Assert.Equal(without, LifeChance(Make(e, "Iron Ring"), true), 9);

        // using it consumes the quality
        e.Context.Omens.Add("exalt_catalyst");
        Assert.NotNull(e.ApplyMethod(ring, T.M("poe2_exalted")));
        Assert.Null(ring.Catalyst);
    }

    // Essence of the Breach adds "+20% to Maximum Quality" on rings and amulets, which raises the catalyst cap.
    [Fact]
    public void Essence_of_the_Breach_raises_the_catalyst_cap()
    {
        var e = T.Engine();
        var essence = T.Db.EssenceByName("Essence of the Breach");
        foreach (var (name, expected) in new[] { ("Iron Ring", 40), ("Breach Ring", 60), ("Lunar Amulet", 40) })
        {
            var item = Make(e, name);
            for (var k = 0; k < 3; k++) e.ApplyMethod(item, T.M("poe2_exalted"));
            var cap = e.CatalystCap(item);
            Assert.NotNull(e.ApplyMethod(item, T.Methods.ForEssence(essence)));
            Assert.Equal(expected, e.CatalystCap(item));
            Assert.True(e.CatalystCap(item) > cap);
        }
    }
}
