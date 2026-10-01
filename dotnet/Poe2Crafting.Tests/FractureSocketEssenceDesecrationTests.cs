using Poe2Crafting.Engine.Crafting;
using Poe2Crafting.Engine.Data;
using Xunit;

namespace Poe2Crafting.Tests;

public class FractureTests
{
    private static CraftMethod Fracturing => T.M("poe2_fracture");

    private static CraftItem Rare(CraftingEngine e, int normalMods, int unrevealed = 0, int revealedDesecrated = 0)
    {
        var item = T.Item(e, T.Talisman);
        var used = new HashSet<int>();
        foreach (var entry in e.Pools.ClassPool(T.Talisman))
        {
            if (item.Mods.Count >= normalMods + revealedDesecrated) break;
            if (!used.Add(entry.Mod.Group)) continue;
            var mod = e.RollMod(entry.Mod);
            mod.Desecrated = item.Mods.Count >= normalMods;
            item.Mods.Add(mod);
        }
        for (var k = 0; k < unrevealed; k++) item.Unrevealed.Add(new UnrevealedSlot { Affix = Affix.Prefix });
        return item;
    }

    private bool Usable(CraftingEngine e, CraftItem item) => e.CheckConstraints(item, Fracturing.Constraints, Fracturing.Handler);

    // The Fracturing Orb needs 4 modifiers, and an UNREVEALED desecrated slot counts as one of them.
    [Fact]
    public void Four_modifiers_are_needed_and_unrevealed_desecrated_slots_count()
    {
        var e = T.Engine();
        Assert.False(Usable(e, Rare(e, 3)));
        Assert.True(Usable(e, Rare(e, 3, unrevealed: 1)));            // the reported case: 3 mods + 1 unrevealed
        Assert.True(Usable(e, Rare(e, 4)));
        Assert.True(Usable(e, Rare(e, 2, unrevealed: 2)));
        Assert.True(Usable(e, Rare(e, 1, unrevealed: 3)));
    }

    [Fact]
    public void Three_normal_mods_plus_an_unrevealed_slot_give_each_mod_a_one_in_three_chance()
    {
        var e = T.Engine(1);
        const int runs = 3000;
        var hits = new int[3];
        for (var k = 0; k < runs; k++)
        {
            var item = Rare(e, 3, unrevealed: 1);
            var changes = e.ApplyMethod(item, Fracturing)!;
            hits[item.Mods.IndexOf(changes[0].Mod!)]++;
            Assert.Single(item.Unrevealed);                           // the unrevealed slot is never touched
        }
        Assert.All(hits, n => Assert.InRange(n / (double)runs, 0.30, 0.37));
    }

    [Fact]
    public void Four_normal_mods_give_each_a_one_in_four_chance()
    {
        var e = T.Engine(2);
        const int runs = 3000;
        var hits = new int[4];
        for (var k = 0; k < runs; k++)
        {
            var item = Rare(e, 4);
            hits[item.Mods.IndexOf(e.ApplyMethod(item, Fracturing)![0].Mod!)]++;
        }
        Assert.All(hits, n => Assert.InRange(n / (double)runs, 0.22, 0.28));
    }

    [Fact]
    public void A_revealed_desecrated_mod_counts_but_can_never_be_fractured()
    {
        var e = T.Engine(3);
        var hits = new HashSet<int>();
        for (var k = 0; k < 1500; k++)
        {
            var item = Rare(e, 3, revealedDesecrated: 1);
            Assert.True(Usable(e, item));
            var chosen = e.ApplyMethod(item, Fracturing)![0].Mod!;
            Assert.False(chosen.Desecrated);
            hits.Add(item.Mods.IndexOf(chosen));
        }
        Assert.Equal(3, hits.Count);
    }

    [Fact]
    public void Nothing_to_lock_means_the_orb_refuses_and_only_one_fracture_is_allowed()
    {
        var e = T.Engine(4);
        var onlyUnrevealed = Rare(e, 0, unrevealed: 4);
        Assert.Null(e.ApplyMethod(onlyUnrevealed, Fracturing));

        var item = Rare(e, 4);
        e.ApplyMethod(item, Fracturing);
        Assert.False(Usable(e, item));                                // already fractured
    }

    [Fact]
    public void A_fractured_mod_survives_Chaos_Annulment_and_essences()
    {
        var e = T.Engine(5);
        for (var k = 0; k < 200; k++)
        {
            var item = Rare(e, 4);
            item.Mods[0].Fractured = true;
            e.ApplyMethod(item, T.M("poe2_chaos"));
            e.ApplyMethod(item, T.M("poe2_annulment"));
            Assert.Contains(item.Mods, m => m.Fractured);
        }
    }
}

public class SocketTests
{
    private static Socketable Rune(string name) => T.Db.SocketableByName(name);

    private static CraftItem Armour(CraftingEngine e, int sockets = 2)
    {
        var item = T.Item(e, T.BodyArmourStr, Rarity.Normal);
        item.Sockets = sockets;
        return item;
    }

    private static IReadOnlyList<Change>? Put(CraftingEngine e, CraftItem item, string name, int? slot = null) =>
        e.ApplyMethod(item, T.Methods.ForSocketable(Rune(name), slot));

    private static string[] Names(CraftItem item) => item.Socketed.Select(s => s.Name).ToArray();

    [Fact]
    public void Empty_sockets_fill_in_order_and_replacing_needs_an_explicit_socket()
    {
        var e = T.Engine();
        var item = Armour(e);
        Put(e, item, "Lesser Desert Rune"); Put(e, item, "Desert Rune");
        Assert.Equal(new[] { "Lesser Desert Rune", "Desert Rune" }, Names(item));

        Assert.Null(Put(e, item, "Storm Rune"));                       // full, no target: refused, nothing destroyed
        Assert.Equal(2, item.Socketed.Count);

        var changes = Put(e, item, "Storm Rune", slot: 0)!;            // naming a filled socket replaces it
        Assert.Equal("Storm Rune", item.Socketed[0].Name);
        Assert.Contains("destroyed Lesser Desert Rune", changes[0].Text);
        Assert.Equal(2, e.SocketSlots(item, Rune("Glacial Rune")).Count); // both stay replaceable
    }

    [Fact]
    public void Socket_bound_runes_can_never_be_replaced()
    {
        var e = T.Engine();
        var item = Armour(e);
        Assert.NotNull(Put(e, item, "Medved's Tending"));               // bound: unlocks the Soul pool on body armour
        Assert.True(item.Socketed[0].Bound);
        Put(e, item, "Desert Rune");

        Assert.Null(Put(e, item, "Glacial Rune", slot: 0));
        Assert.Equal("Medved's Tending", item.Socketed[0].Name);
        Assert.Equal(new[] { 1 }, e.SocketSlots(item, Rune("Glacial Rune")));
        Assert.Contains(1003, e.Bonus(item).UnlockedPools);             // the bound rune keeps its effect
    }

    [Fact]
    public void An_item_whose_sockets_are_all_bound_takes_nothing_and_a_bound_rune_locks_the_socket_it_replaces()
    {
        var e = T.Engine();
        var allBound = Armour(e, 1);
        Put(e, allBound, "Medved's Tending");
        Assert.Empty(e.SocketSlots(allBound, Rune("Desert Rune")));

        var item = Armour(e, 1);
        Put(e, item, "Desert Rune");
        Put(e, item, "Medved's Tending", slot: 0);
        Assert.True(item.Socketed[0].Bound);
        Assert.Null(Put(e, item, "Storm Rune", slot: 0));
    }

    [Fact]
    public void Data_flags_Serle_is_bound_Astrid_is_not()
    {
        Assert.True(Rune("Serle's Triumph").Bound);
        Assert.True(Rune("Thrud's Might").Bound);
        Assert.False(Rune("Astrid's Creativity").Bound);
    }

    [Fact]
    public void Meta_runes_change_the_rules_and_replacing_one_takes_its_effect_away()
    {
        var e = T.Engine();
        var item = Armour(e, 3);
        Put(e, item, "Serle's Triumph");
        item.Rarity = Rarity.Rare;
        Assert.Equal((3, 4), e.MaxAffixes(item));                        // +1 suffix allowed

        var other = Armour(e);
        Put(e, other, "Astrid's Creativity");
        Assert.Equal(1, e.Bonus(other).ExtraCrafted);                    // limit of crafted mods is now 2
        Put(e, other, "Desert Rune", slot: 0);
        Assert.Equal(0, e.Bonus(other).ExtraCrafted);                    // replaced: the bonus is gone
    }

    [Fact]
    public void Soul_pool_rune_adds_mods_to_the_rollable_pool()
    {
        var e = T.Engine();
        var item = Armour(e);
        var before = e.FullPool(item).Count;
        Put(e, item, "Medved's Tending");
        Assert.True(e.FullPool(item).Count > before);
        Assert.Equal(144, before);
    }

    [Fact]
    public void Shared_Ancient_limit_refuses_a_second_but_allows_replacing_the_first()
    {
        var e = T.Engine();
        var limited = T.Db.Raw.Socketables.Entries.Where(s => s.Limit == 2).ToList();
        foreach (var cls in new[] { T.BodyArmourStr, T.OneHandSword, 33, 25, 37, 45, 59 })
        {
            foreach (var a in limited) foreach (var b in limited)
            {
                if (a == b) continue;
                var item = T.Item(e, cls, Rarity.Normal); item.Sockets = 2;
                if (e.SocketEffect(item, a) is null || e.SocketEffect(item, b) is null) continue;

                e.ApplyMethod(item, T.Methods.ForSocketable(a));
                Assert.Null(e.ApplyMethod(item, T.Methods.ForSocketable(b)));                 // second Ancient refused
                Assert.NotNull(e.ApplyMethod(item, T.Methods.ForSocketable(b, slot: 0)));     // replacing the first is fine
                Assert.Single(item.Socketed);
                return;
            }
        }
        Assert.Fail("no pair of limit-2 augments fits one item class");
    }
}

public class EssenceTests
{
    [Fact]
    public void Lesser_essence_turns_a_magic_Talisman_rare_with_a_guaranteed_mod()
    {
        var e = T.Engine(1);
        var item = T.Item(e, T.Talisman, Rarity.Normal);
        e.ApplyMethod(item, T.M("poe2_transmutation"));
        var essence = T.Db.Raw.Essences.Entries.Where(x => x.Type == 0).First(x => e.EssenceApplicable(item, x));
        Assert.NotNull(e.ApplyMethod(item, T.Methods.ForEssence(essence)));
        Assert.Equal(Rarity.Rare, item.Rarity);
        Assert.Equal(2, item.Mods.Count);
    }

    [Fact]
    public void Alloys_replace_a_mod_with_a_crafted_one_and_only_one_crafted_mod_is_allowed()
    {
        var e = T.Engine(2);
        var item = T.FourMods(e);
        var alloy = T.Db.Raw.Essences.Entries.First(x => x.Type == 5 && e.Pools.EssenceModIds(x.Id, T.BodyArmourStr).Count > 0);
        var method = T.Methods.ForEssence(alloy);
        Assert.NotNull(e.ApplyMethod(item, method));
        Assert.Single(item.Mods, m => m.Crafted);
        Assert.False(e.EssenceApplicable(item, alloy));                  // crafted-mod limit reached

        var other = T.Db.Raw.Essences.Entries.First(x => x.Type == 3 && e.Pools.EssenceModIds(x.Id, T.BodyArmourStr).Count > 0);
        Assert.False(e.EssenceApplicable(item, other));                  // a Perfect essence is blocked too
    }

    [Fact]
    public void Astrids_Creativity_raises_the_crafted_limit_to_two()
    {
        var e = T.Engine(3);
        var item = T.FourMods(e);
        item.Sockets = 2;
        e.ApplyMethod(item, T.Methods.ForSocketable(T.Db.SocketableByName("Astrid's Creativity")));
        var alloys = T.Db.Raw.Essences.Entries.Where(x => x.Type == 5 && e.Pools.EssenceModIds(x.Id, T.BodyArmourStr).Count > 0).ToList();
        Assert.True(alloys.Count >= 2);
        Assert.NotNull(e.ApplyMethod(item, T.Methods.ForEssence(alloys[0])));
        Assert.True(e.EssenceApplicable(item, alloys[1]));
        Assert.NotNull(e.ApplyMethod(item, T.Methods.ForEssence(alloys[1])));
        Assert.Equal(2, item.Mods.Count(m => m.Crafted));
    }
}

public class DesecrationTests
{
    private static CraftItem RareTalisman(CraftingEngine e, int level = 100)
    {
        var item = T.Item(e, T.Talisman, Rarity.Rare, level);
        var used = new HashSet<int>();
        foreach (var entry in e.Pools.ClassPool(T.Talisman).Where(p => p.Mod.MinLevel <= level))
        {
            if (item.Mods.Count == 4) break;
            if (used.Add(entry.Mod.Group)) item.Mods.Add(e.RollMod(entry.Mod));
        }
        return item;
    }

    [Fact]
    public void A_bone_adds_one_unrevealed_slot_and_a_second_is_refused()
    {
        var e = T.Engine(1);
        var item = RareTalisman(e);
        var bone = T.Methods.ByName("Preserved Jawbone");
        Assert.True(e.TryCraft(item, bone).Success);
        Assert.Single(item.Unrevealed);
        Assert.Equal(4, item.Mods.Count);
        Assert.False(e.TryCraft(item, bone).Success);                    // only one desecration per item
    }

    [Fact]
    public void Gnawed_bones_need_item_level_64_or_less_and_Ancient_bones_set_a_minimum_level()
    {
        var e = T.Engine(2);
        var gnawed = T.Methods.ByName("Gnawed Jawbone");
        Assert.False(e.CheckConstraints(RareTalisman(e, 80), gnawed.Constraints, gnawed.Handler));
        Assert.True(e.CheckConstraints(RareTalisman(e, 60), gnawed.Constraints, gnawed.Handler));
        Assert.Equal(40, T.Methods.ByName("Ancient Jawbone").MinModLevel);
    }

    [Fact]
    public void Revealing_gives_three_distinct_options_and_the_chosen_mod_is_flagged_desecrated()
    {
        var e = T.Engine(3);
        var item = RareTalisman(e);
        e.TryCraft(item, T.Methods.ByName("Preserved Jawbone"));
        var slot = item.Unrevealed[0];

        var options = e.RevealOptions(item, slot);
        Assert.Equal(3, options.Count);
        Assert.Equal(3, options.Select(o => o.Mod.Group).Distinct().Count());

        e.RevealMod(item, 0, options[0]);
        Assert.Empty(item.Unrevealed);
        Assert.True(item.Mods.Last().Desecrated);
    }

    [Fact]
    public void Gnawed_bone_on_a_level_60_item_can_only_reveal_normal_mods()
    {
        var e = T.Engine(4);
        var item = RareTalisman(e, 60);
        e.TryCraft(item, T.Methods.ByName("Gnawed Jawbone"));
        var options = e.RevealOptions(item, item.Unrevealed[0]);
        Assert.NotEmpty(options);
        Assert.DoesNotContain(options, o => o.IsLich);                  // Lich mods start at level 65
    }

    [Fact]
    public void Lich_weight_setting_controls_how_often_Lich_mods_appear()
    {
        var e = T.Engine(5);
        var item = RareTalisman(e);
        e.TryCraft(item, T.Methods.ByName("Preserved Jawbone"));
        var slot = item.Unrevealed[0];

        double LichShare(double weight)
        {
            e.Context.Desecration = new DesecrationSettings(true, weight);
            return e.DesecratedChances(item, slot).Where(c => c.Entry.IsLich).Sum(c => c.Chance);
        }
        Assert.True(LichShare(50_000) > 0.9);
        Assert.True(LichShare(1000) < LichShare(50_000));
        Assert.InRange(e.DesecratedChances(item, slot).Sum(c => c.Chance), 0.999, 1.001);
    }

    [Fact]
    public void Faction_omen_guarantees_an_option_from_that_faction_on_weapons_only()
    {
        var e = T.Engine(6);
        var sword = T.Item(e, T.OneHandSword);
        var body = T.Item(e, T.BodyArmourStr);
        Assert.True(e.FactionOmenApplies(sword));
        Assert.False(e.FactionOmenApplies(body));

        foreach (var affix in new[] { Affix.Prefix, Affix.Suffix })
        {
            if (!e.Pools.LichPool(T.OneHandSword).Any(p => p.Affix == affix && p.Faction == "Ulaman")) continue;
            for (var k = 0; k < 100; k++)
            {
                e.Context.Omens.Clear(); e.Context.ToggleOmen("Ulaman");
                var options = e.RevealOptions(sword, new UnrevealedSlot { Affix = affix });
                Assert.Equal(3, options.Count);
                Assert.Contains(options, o => o.IsLich && o.Faction == "Ulaman");
            }
        }
    }

    [Fact]
    public void Putrefaction_turns_every_unfractured_mod_into_an_unrevealed_slot_and_corrupts()
    {
        var e = T.Engine(7);
        var item = RareTalisman(e);
        item.Mods[0].Fractured = true;
        e.Context.ToggleOmen("putrefaction");
        Assert.NotNull(e.ApplyMethod(item, T.Methods.ByName("Preserved Jawbone")));
        Assert.Single(item.Mods);
        Assert.Equal(3, item.Unrevealed.Count);
        Assert.True(item.Corrupted);
    }

    [Fact]
    public void On_a_full_item_a_bone_removes_a_random_mod_first_and_reuses_its_slot()
    {
        var e = T.Engine(8);
        var item = RareTalisman(e);
        var p = e.Pools.ClassPool(T.Talisman);
        while (e.OpenSlotsOf(item).Any)
        {
            var affix = e.OpenSlotsOf(item).Prefix > 0 ? Affix.Prefix : Affix.Suffix;
            var entry = p.First(x => x.Affix == affix && !item.Mods.Any(m => e.Db.Mods[m.ModId].Group == x.Mod.Group));
            item.Mods.Add(e.RollMod(entry.Mod));
        }
        Assert.Equal(6, item.Mods.Count);
        var changes = e.ApplyMethod(item, T.Methods.ByName("Preserved Jawbone"))!;
        Assert.Equal(ChangeOp.Remove, changes[0].Op);
        Assert.Equal(5, item.Mods.Count);
        Assert.Single(item.Unrevealed);
    }
}
