using Poe2Crafting.Engine.Crafting;
using Poe2Crafting.Engine.Data;
using Xunit;

namespace Poe2Crafting.Tests;

public class DataAndPoolTests
{
    [Fact]
    public void Game_data_loads_and_text_markup_is_stripped()
    {
        Assert.Equal(3183, T.Db.Mods.Count);
        var life = T.Db.Mods.Values.First(m => m.Key == "IncreasedLife1");
        Assert.Equal("Hale", T.Db.ModName(life)); // a prefix name
        Assert.DoesNotContain("[", T.Db.Text(life.Stats[0].Label));
    }

    [Fact]
    public void Normal_pool_contains_no_desecrated_or_meta_pool_mods()
    {
        var e = T.Engine();
        var pool = e.Pools.ClassPool(T.BodyArmourStr);
        Assert.Equal(144, pool.Count);
        Assert.DoesNotContain(pool, p => p.Mod.Key.StartsWith("AbyssMod"));
        Assert.DoesNotContain(pool, p => p.Mod.Key.Contains("Influence"));
        Assert.Equal(10, e.Pools.LichPool(T.BodyArmourStr).Count);
    }

    [Fact]
    public void Tier_one_is_the_highest_level_in_a_group()
    {
        var e = T.Engine();
        foreach (var group in e.Pools.ClassPool(T.OneHandSword).GroupBy(p => p.Mod.Group))
        {
            var top = group.Single(p => p.Tier == 1);
            Assert.Equal(group.Max(p => p.Mod.MinLevel), top.Mod.MinLevel);
        }
    }

    // The essence table is keyed by the class ENUM. Class id 4 (Body Armours STR) collides with enum 4 (Amulet).
    [Fact]
    public void Essence_lookup_uses_the_class_enum_not_the_class_id()
    {
        var e = T.Engine();
        Assert.Equal(24, T.Db.ClassEnum(T.BodyArmourStr)); // Body Armour
        Assert.Equal(110, T.Db.ClassEnum(T.Talisman));     // Talisman

        var talismanEssences = T.Db.Raw.Essences.Entries.Count(x => e.Pools.EssenceModIds(x.Id, T.Talisman).Count > 0);
        Assert.Equal(37, talismanEssences);

        // Lesser Essence of the Body gives Life on a body armour; the amulet list (enum 4) is a different one.
        var essence = T.Db.EssenceByName("Lesser Essence of the Body");
        var mod = e.EssenceMod(T.Item(e, T.BodyArmourStr), essence)!;
        Assert.Contains("Life", T.Db.Text(mod.Stats[0].Label));
    }

    [Fact]
    public void Every_item_class_with_bases_has_essences_except_claws()
    {
        var e = T.Engine();
        var without = T.Db.Classes.Values
            .Where(c => T.Db.BasesOfClass(c.Id).Any())
            .Where(c => !T.Db.Raw.Essences.Entries.Any(x => e.Pools.EssenceModIds(x.Id, c.Id).Count > 0))
            .Select(c => T.Db.Text(c.Label)).ToList();
        Assert.Equal(new[] { "Claws" }, without);
    }

    [Fact]
    public void Mod_text_formats_ranges_and_rolls()
    {
        var e = T.Engine();
        var life = T.Db.Mods.Values.First(m => m.Key == "IncreasedLife5");
        var range = life.Stats[0].Range;
        Assert.Equal($"+({range[0]}-{range[1]}) to maximum Life", e.ModLines(life)[0]);

        var rolled = new ModInstance { ModId = life.Id, Rolls = new[] { range[0] } };
        Assert.Equal($"+{range[0]}({range[0]}-{range[1]}) to maximum Life", e.ModLines(rolled)[0]);

        // "Adds # to # damage": two stats, one label, one line.
        var thorns = T.Db.Mods.Values.First(m => m.Stats.Count == 2 && T.Db.Text(m.Stats[0].Label).Contains("Thorns"));
        Assert.Single(e.ModLines(thorns));
    }
}
