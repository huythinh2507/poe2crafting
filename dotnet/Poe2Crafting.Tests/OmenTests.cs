using Poe2Crafting.Engine.Crafting;
using Poe2Crafting.Engine.Data;
using Xunit;

namespace Poe2Crafting.Tests;

public class OmenTests
{
    private const int Runs = 150;

    private static CraftItem WithLich(CraftingEngine e, CraftItem item, bool fractured = false)
    {
        var used = item.Mods.Select(m => e.Db.Mods[m.ModId].Group).ToHashSet();
        var lich = e.Pools.LichPool(item.ClassId).First(p => p.Affix == Affix.Suffix && !used.Contains(p.Mod.Group));
        var mod = e.RollMod(lich.Mod);
        mod.Desecrated = true;
        mod.Fractured = fractured;
        item.Mods.Add(mod);
        return item;
    }

    // ================= Omen of Whittling: Chaos removes the lowest mod LEVEL (not tier) =================

    [Fact]
    public void Whittling_removes_the_modifier_with_the_lowest_level()
    {
        var e = T.Engine(1);
        for (var k = 0; k < Runs; k++)
        {
            var item = T.FourMods(e);
            var lowest = item.Mods.Min(m => T.LevelOf(e, m));
            e.Context.Omens.Clear(); e.Context.ToggleOmen("whittling");
            var removed = e.ApplyMethod(item, T.M("poe2_chaos"))![0];
            Assert.Equal(ChangeOp.Remove, removed.Op);
            Assert.Equal(lowest, T.LevelOf(e, removed.Mod!));
        }
    }

    [Fact]
    public void Whittling_ties_are_split_randomly()
    {
        var e = T.Engine(2);
        var sharedLevel = T.Levels(e, T.BodyArmourStr, Affix.Prefix).Intersect(T.Levels(e, T.BodyArmourStr, Affix.Suffix)).First(l => l > 1);
        var p = T.Levels(e, T.BodyArmourStr, Affix.Prefix);
        var s = T.Levels(e, T.BodyArmourStr, Affix.Suffix);

        var removedKeys = new Dictionary<string, int>();
        for (var k = 0; k < 400; k++)
        {
            var item = T.WithMods(e, T.BodyArmourStr, (Affix.Prefix, p[^2]), (Affix.Suffix, s[^3]), (Affix.Prefix, sharedLevel), (Affix.Suffix, sharedLevel));
            e.Context.Omens.Clear(); e.Context.ToggleOmen("whittling");
            var key = T.KeyOf(e, e.ApplyMethod(item, T.M("poe2_chaos"))![0].Mod!);
            removedKeys[key] = removedKeys.GetValueOrDefault(key) + 1;
        }
        Assert.Equal(2, removedKeys.Count);                                       // only the two tied mods are ever hit
        Assert.All(removedKeys.Values, n => Assert.InRange(n / 400.0, 0.38, 0.62));
    }

    [Fact]
    public void An_unrevealed_desecrated_slot_counts_as_level_1_so_Whittling_takes_it_first()
    {
        var e = T.Engine(3);
        var p = T.Levels(e, T.BodyArmourStr, Affix.Prefix).Where(l => l > 1).ToArray();
        var s = T.Levels(e, T.BodyArmourStr, Affix.Suffix).Where(l => l > 1).ToArray();
        for (var k = 0; k < 100; k++)
        {
            var item = T.WithMods(e, T.BodyArmourStr, (Affix.Prefix, p[0]), (Affix.Prefix, p[3]), (Affix.Suffix, s[3]));
            item.Unrevealed.Add(new UnrevealedSlot { Affix = Affix.Suffix });
            e.Context.Omens.Clear(); e.Context.ToggleOmen("whittling");
            var removed = e.ApplyMethod(item, T.M("poe2_chaos"))![0];
            Assert.Null(removed.Mod);
            Assert.Contains("Unrevealed", removed.Text);
        }
    }

    [Fact]
    public void Whittling_never_removes_a_fractured_mod_and_takes_the_next_lowest_instead()
    {
        var e = T.Engine(4);
        for (var k = 0; k < 100; k++)
        {
            var item = T.FourMods(e);
            var sorted = item.Mods.OrderBy(m => T.LevelOf(e, m)).ToList();
            sorted[0].Fractured = true;
            e.Context.Omens.Clear(); e.Context.ToggleOmen("whittling");
            Assert.Same(sorted[1], e.ApplyMethod(item, T.M("poe2_chaos"))![0].Mod);
        }
    }

    [Fact]
    public void Whittling_with_Sinistral_or_Dextral_Erasure_picks_the_lowest_level_of_that_affix_only()
    {
        var e = T.Engine(5);
        var p = T.Levels(e, T.BodyArmourStr, Affix.Prefix);
        var s = T.Levels(e, T.BodyArmourStr, Affix.Suffix);
        for (var k = 0; k < 100; k++)
        {
            // a suffix has the lowest level overall, but prefix-only erasure must still hit a PREFIX
            var item = T.WithMods(e, T.BodyArmourStr, (Affix.Prefix, p[3]), (Affix.Prefix, p[6]), (Affix.Suffix, s[0]), (Affix.Suffix, s[5]));
            var lowestPrefix = item.Mods.Where(m => T.AffixOf(e, m) == Affix.Prefix).Min(m => T.LevelOf(e, m));
            e.Context.Omens.Clear(); e.Context.ToggleOmen("whittling"); e.Context.ToggleOmen("erasure_prefix");
            var removed = e.ApplyMethod(item, T.M("poe2_chaos"))![0].Mod!;
            Assert.Equal(Affix.Prefix, T.AffixOf(e, removed));
            Assert.Equal(lowestPrefix, T.LevelOf(e, removed));
        }
        for (var k = 0; k < 100; k++)
        {
            var item = T.WithMods(e, T.BodyArmourStr, (Affix.Prefix, p[0]), (Affix.Prefix, p[6]), (Affix.Suffix, s[3]), (Affix.Suffix, s[5]));
            var lowestSuffix = item.Mods.Where(m => T.AffixOf(e, m) == Affix.Suffix).Min(m => T.LevelOf(e, m));
            e.Context.Omens.Clear(); e.Context.ToggleOmen("whittling"); e.Context.ToggleOmen("erasure_suffix");
            var removed = e.ApplyMethod(item, T.M("poe2_chaos"))![0].Mod!;
            Assert.Equal(Affix.Suffix, T.AffixOf(e, removed));
            Assert.Equal(lowestSuffix, T.LevelOf(e, removed));
        }
    }

    [Fact]
    public void RemovalPool_shows_the_targets_a_UI_would_highlight()
    {
        var e = T.Engine();
        var item = T.FourMods(e);
        var targets = e.RemovalPool(item, new RemovalFilter(Whittle: true));
        Assert.All(targets, c => Assert.Equal(item.Mods.Min(m => T.LevelOf(e, m)), c.Level));
    }

    // ================= Omen of Light: Annulment removes only desecrated modifiers =================

    [Fact]
    public void Light_removes_only_the_desecrated_mod()
    {
        var e = T.Engine(6);
        for (var k = 0; k < 100; k++)
        {
            var item = WithLich(e, T.WithMods(e, T.BodyArmourStr, (Affix.Prefix, T.Levels(e, T.BodyArmourStr, Affix.Prefix)[1]),
                (Affix.Prefix, T.Levels(e, T.BodyArmourStr, Affix.Prefix)[4]), (Affix.Suffix, T.Levels(e, T.BodyArmourStr, Affix.Suffix)[2])));
            var desecrated = item.Mods.Single(m => m.Desecrated);
            e.Context.Omens.Clear(); e.Context.ToggleOmen("light");
            var changes = e.ApplyMethod(item, T.M("poe2_annulment"))!;
            Assert.Single(changes);
            Assert.Same(desecrated, changes[0].Mod);
        }
    }

    [Fact]
    public void Light_can_remove_an_unrevealed_slot_and_does_nothing_when_there_is_no_desecrated_mod()
    {
        var e = T.Engine(7);
        var item = T.FourMods(e);
        item.Mods.RemoveRange(2, 2);
        item.Unrevealed.Add(new UnrevealedSlot { Affix = Affix.Prefix });
        e.Context.ToggleOmen("light");
        Assert.NotNull(e.ApplyMethod(item, T.M("poe2_annulment")));
        Assert.Empty(item.Unrevealed);
        Assert.Equal(2, item.Mods.Count);

        var plain = T.FourMods(e);
        Assert.Null(e.ApplyMethod(plain, T.M("poe2_annulment")));                 // no desecrated target
        Assert.Equal(4, plain.Mods.Count);                                         // and nothing was lost
    }

    [Fact]
    public void Light_cannot_remove_a_fractured_desecrated_mod_and_excludes_the_affix_annulment_omens()
    {
        var e = T.Engine(8);
        var item = WithLich(e, T.WithMods(e, T.BodyArmourStr, (Affix.Prefix, T.Levels(e, T.BodyArmourStr, Affix.Prefix)[1])), fractured: true);
        e.Context.ToggleOmen("light");
        Assert.Null(e.ApplyMethod(item, T.M("poe2_annulment")));

        e.Context.Omens.Clear();
        e.Context.ToggleOmen("light"); e.Context.ToggleOmen("annul_prefix");
        Assert.False(e.Context.Has("light"));
        Assert.True(e.Context.Has("annul_prefix"));
    }

    // ================= the other omens =================

    [Fact]
    public void Annulment_omens_remove_two_or_only_one_affix()
    {
        var e = T.Engine(9);
        for (var k = 0; k < 100; k++)
        {
            e.Context.Omens.Clear(); e.Context.ToggleOmen("annul_two");
            var two = T.FourMods(e);
            Assert.Equal(2, e.ApplyMethod(two, T.M("poe2_annulment"))!.Count);
            Assert.Equal(2, two.Mods.Count);

            e.Context.Omens.Clear(); e.Context.ToggleOmen("annul_prefix");
            var prefixOnly = T.FourMods(e);
            Assert.Equal(Affix.Prefix, T.AffixOf(e, e.ApplyMethod(prefixOnly, T.M("poe2_annulment"))![0].Mod!));

            e.Context.Omens.Clear(); e.Context.ToggleOmen("annul_suffix");
            var suffixOnly = T.FourMods(e);
            Assert.Equal(Affix.Suffix, T.AffixOf(e, e.ApplyMethod(suffixOnly, T.M("poe2_annulment"))![0].Mod!));
        }
    }

    [Fact]
    public void Erasure_omens_make_Chaos_remove_only_prefixes_or_suffixes()
    {
        var e = T.Engine(10);
        for (var k = 0; k < 100; k++)
        {
            e.Context.Omens.Clear(); e.Context.ToggleOmen("erasure_prefix");
            Assert.Equal(Affix.Prefix, T.AffixOf(e, e.ApplyMethod(T.FourMods(e), T.M("poe2_chaos"))![0].Mod!));
            e.Context.Omens.Clear(); e.Context.ToggleOmen("erasure_suffix");
            Assert.Equal(Affix.Suffix, T.AffixOf(e, e.ApplyMethod(T.FourMods(e), T.M("poe2_chaos"))![0].Mod!));
        }
    }

    [Fact]
    public void Exaltation_omens_add_two_or_only_one_affix_or_a_same_type_mod()
    {
        var e = T.Engine(11);
        var p = T.Levels(e, T.BodyArmourStr, Affix.Prefix);
        var s = T.Levels(e, T.BodyArmourStr, Affix.Suffix);
        for (var k = 0; k < 100; k++)
        {
            CraftItem Two() => T.WithMods(e, T.BodyArmourStr, (Affix.Prefix, p[1]), (Affix.Suffix, s[2]));

            e.Context.Omens.Clear(); e.Context.ToggleOmen("exalt_two");
            var greater = Two();
            Assert.Equal(2, e.ApplyMethod(greater, T.M("poe2_exalted"))!.Count);
            Assert.Equal(4, greater.Mods.Count);

            e.Context.Omens.Clear(); e.Context.ToggleOmen("exalt_prefix");
            Assert.Equal(Affix.Prefix, T.AffixOf(e, e.ApplyMethod(Two(), T.M("poe2_exalted"))![0].Mod!));
            e.Context.Omens.Clear(); e.Context.ToggleOmen("exalt_suffix");
            Assert.Equal(Affix.Suffix, T.AffixOf(e, e.ApplyMethod(Two(), T.M("poe2_exalted"))![0].Mod!));

            e.Context.Omens.Clear(); e.Context.ToggleOmen("exalt_homog");
            var homog = Two();
            var haveTags = homog.Mods.SelectMany(m => e.Pools.GroupTags(e.Db.Mods[m.ModId])).ToHashSet();
            var added = e.ApplyMethod(homog, T.M("poe2_exalted"))![0].Mod!;
            Assert.Contains(e.Pools.GroupTags(e.Db.Mods[added.ModId]), haveTags.Contains);
        }
    }

    [Fact]
    public void Greater_Exaltation_needs_two_free_slots_and_otherwise_changes_nothing()
    {
        var e = T.Engine(12);
        var p = T.Levels(e, T.BodyArmourStr, Affix.Prefix);
        var s = T.Levels(e, T.BodyArmourStr, Affix.Suffix);
        var item = T.WithMods(e, T.BodyArmourStr, (Affix.Prefix, p[1]), (Affix.Prefix, p[3]), (Affix.Prefix, p[5]), (Affix.Suffix, s[2]), (Affix.Suffix, s[4]));
        e.Context.ToggleOmen("exalt_two");
        Assert.Null(e.ApplyMethod(item, T.M("poe2_exalted")));
        Assert.Equal(5, item.Mods.Count);                                          // all-or-nothing
    }

    [Fact]
    public void Retired_omens_stay_in_the_catalogue_but_flagged()
    {
        foreach (var id in new[] { "annul_two", "alch_prefix", "alch_suffix", "regal_prefix", "regal_suffix" })
            Assert.True(OmenCatalogue.Find(id)!.Retired);
        Assert.False(OmenCatalogue.Find("whittling")!.Retired);
    }

    [Fact]
    public void Blessed_and_not_simulated_omens_behave()
    {
        var e = T.Engine();
        e.Context.ToggleOmen("sanctification");                                    // not simulated: cannot be armed
        Assert.False(e.Context.Has("sanctification"));
    }

    [Fact]
    public void Crystallisation_makes_Perfect_essences_remove_only_the_chosen_affix()
    {
        var e = T.Engine(13);
        var essence = T.Db.Raw.Essences.Entries.First(x => x.Type == 3 && e.Pools.EssenceModIds(x.Id, T.BodyArmourStr).Count > 0);
        var method = T.Methods.ForEssence(essence);
        var removedAffixes = new HashSet<Affix?>();
        for (var k = 0; k < 80; k++)
        {
            e.Context.Omens.Clear(); e.Context.ToggleOmen("crystal_prefix");
            var changes = e.ApplyMethod(T.FourMods(e), method);
            if (changes is not null) removedAffixes.Add(T.AffixOf(e, changes[0].Mod!));
        }
        Assert.Equal(new HashSet<Affix?> { Affix.Prefix }, removedAffixes);
    }
}
