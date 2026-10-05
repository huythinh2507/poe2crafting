using System.Globalization;
using System.Text.RegularExpressions;
using Poe2Crafting.Engine.Data;

namespace Poe2Crafting.Engine.Crafting;

public sealed partial class CraftingEngine
{
    // ---- what a socketable does on this item ----------------------------------------------------

    /// <summary>
    /// The text of what the augment does on this item, or null if it does nothing here. The augment lists
    /// effects per item kind; the first that applies wins: martial weapon, caster weapon, armour,
    /// then the class-specific entry (keyed by class ENUM), then "all".
    /// </summary>
    public string? SocketEffect(CraftItem item, Socketable socketable) =>
        SocketStatOf(item, socketable) is { } stat ? SocketText(stat) : null;

    private SocketStat? SocketStatOf(CraftItem item, Socketable socketable)
    {
        var classKey = Db.ClassEnum(item.ClassId).ToString(CultureInfo.InvariantCulture);
        return (IsMartial(item) ? socketable.Martial : null)
               ?? (IsCaster(item) ? socketable.Caster : null)
               ?? (IsArmour(item) ? socketable.Armour : null)
               ?? (socketable.ByClass is { } byClass && byClass.TryGetValue(classKey, out var s) ? s : null)
               ?? socketable.All;
    }

    /// <summary>
    /// "#% increased effect of Socketed Augment Items" (Sovereign Alloy mod) applies to every augment, "... of Socketed Runes"
    /// (Aldur's Legacy) to runes only. They add. Only stats flagged <c>Scaling</c> in the data are scaled.
    /// </summary>
    public double SocketEffectPct(CraftItem item, bool isRune)
    {
        var pct = LocalStat(item, "local_socketed_items_effect_+%") + item.Socketed.Sum(s => s.AugmentEffect);
        if (isRune) pct += LocalStat(item, "local_rune_effect_+%") + item.Socketed.Sum(s => s.RuneEffect);
        return pct;
    }

    /// <summary>A whole-number meta effect ("+1 Suffix Modifier allowed") after the effect bonus: rounded down, so +1 becomes +2 at 100% or more.</summary>
    private int ScaledCount(CraftItem item, SocketedAugment augment, int count) =>
        count == 0 || !augment.Scaling ? count : (int)Math.Floor(count * (100 + SocketEffectPct(item, augment.IsRune)) / 100 + 1e-9);

    private string SocketText(SocketStat stat)
    {
        var label = Db.Text(stat.Output);
        var hashes = label.Count(c => c == '#');
        if (hashes == 2) return ReplaceFirst(ReplaceFirst(label, "#", FormatNumber(stat.Range[0])), "#", FormatNumber(stat.Range[1]));
        if (hashes == 1) return ReplaceFirst(label, "#", FormatRange(stat.Range[0], stat.Range[1]));
        return label;
    }

    // ---- limits ---------------------------------------------------------------------------------

    /// <summary>
    /// "Only N of this kind per item." Limit indexes 0 and 1 mean N copies of the SAME augment; the higher
    /// indexes (Ancient augments, Aldur's Legacy) are shared across every augment of that kind.
    /// </summary>
    private bool SocketAllowed(IReadOnlyList<SocketedAugment> socketed, Socketable socketable)
    {
        if (socketable.Limit is not { } limitIndex) return true;
        var limits = Db.Raw.Methods.Socketables.Limits;
        if (limitIndex < 0 || limitIndex >= limits.Count) return true;
        var same = socketed.Count(s => limitIndex <= 1 ? s.ItemId == socketable.Item : s.Limit == limitIndex);
        return same < limits[limitIndex].Number;
    }

    // ---- meta runes -----------------------------------------------------------------------------

    [GeneratedRegex(@"Can roll (\w+) modifiers")] private static partial Regex CanRollRegex();
    [GeneratedRegex(@"\+(\d+) Suffix Modifier allowed")] private static partial Regex ExtraSuffixRegex();
    [GeneratedRegex(@"Can have (\d+) additional Crafted Modifier")] private static partial Regex ExtraCraftedRegex();
    [GeneratedRegex(@"equivalent (Fire|Cold|Lightning) modifiers", RegexOptions.IgnoreCase)] private static partial Regex TransformRegex();

    /// <summary>
    /// Meta runes change the crafting rules rather than adding a stat. Their effect is only given as text
    /// ("+1 Suffix Modifier allowed", "Can roll Destruction modifiers", ...), so it is read from the text.
    /// </summary>
    private static (int? UnlocksPool, int ExtraSuffix, int ExtraCrafted, string? TransformTo) MetaEffects(string text)
    {
        int? pool = null;
        if (CanRollRegex().Match(text) is { Success: true } roll && ModPools.MetaPools.TryGetValue(roll.Groups[1].Value, out var influence))
            pool = influence;
        var suffix = ExtraSuffixRegex().Match(text) is { Success: true } s ? int.Parse(s.Groups[1].Value) : 0;
        var crafted = ExtraCraftedRegex().Match(text) is { Success: true } c ? int.Parse(c.Groups[1].Value) : 0;
        var transform = TransformRegex().Match(text) is { Success: true } t ? t.Groups[1].Value.ToLowerInvariant() : null;
        return (pool, suffix, crafted, transform);
    }

    // ---- where can it go? -----------------------------------------------------------------------

    /// <summary>
    /// The sockets an augment could be placed in. A filled socket can be replaced (the old augment is
    /// destroyed) unless the augment in it is socket-bound; limits are counted as if the replaced augment
    /// were already gone. Only the first empty socket counts as "empty".
    /// </summary>
    public IReadOnlyList<int> SocketSlots(CraftItem item, Socketable socketable)
    {
        var slots = new List<int>();
        if (SocketEffect(item, socketable) is null) return slots;

        for (var i = 0; i < item.Sockets; i++)
        {
            if (i > item.Socketed.Count) break;                       // can't skip over an empty socket
            if (i < item.Socketed.Count && item.Socketed[i].Bound) continue;
            var rest = item.Socketed.Where((_, k) => k != i).ToList();
            if (SocketAllowed(rest, socketable)) slots.Add(i);
        }
        return slots;
    }

    private List<Change>? ApplySocketable(CraftItem item, CraftMethod method)
    {
        var socketable = method.Socket ?? throw new ArgumentException("a socket method needs its Socketable");
        var effect = SocketEffect(item, socketable);
        var slots = SocketSlots(item, socketable);
        if (effect is null || slots.Count == 0) return null;

        // Replacing destroys an augment, so it only happens when a filled socket is named explicitly.
        var slot = method.Slot ?? (item.Socketed.Count < item.Sockets ? item.Socketed.Count : -1);
        if (!slots.Contains(slot)) return null;

        var meta = MetaEffects(effect);
        var stat = SocketStatOf(item, socketable)!;
        var statId = Db.StatId(stat.Index);
        var augment = new SocketedAugment
        {
            ItemId = socketable.Item, Limit = socketable.Limit, Name = Db.ItemName(socketable.Item),
            Lines = new List<string> { effect }, Bound = socketable.Bound,
            UnlocksPool = meta.UnlocksPool, ExtraSuffix = meta.ExtraSuffix, ExtraCrafted = meta.ExtraCrafted, TransformTo = meta.TransformTo,
            IsRune = socketable.Classify.Contains("rune"), Scaling = stat.Scaling,
            RuneEffect = statId == "local_rune_effect_+%" ? stat.Range[0] : 0,
            AugmentEffect = statId == "local_socketed_items_effect_+%" ? stat.Range[0] : 0,
        };

        var replaced = slot < item.Socketed.Count ? item.Socketed[slot] : null;
        if (replaced is not null) item.Socketed[slot] = augment; else item.Socketed.Add(augment);

        var changes = Note($"Socketed {augment.Name}: {effect}" + (replaced is null ? "" : $" (destroyed {replaced.Name})"));

        if (augment.TransformTo is { } element)
        {
            // Retroactively transform the resistances already on the item.
            item.Mods = item.Mods.Select(m =>
            {
                var to = EquivalentMod(m.ModId, element);
                if (to == m.ModId) return m;
                var replacement = RollMod(Db.Mods[to]);
                replacement.Fractured = m.Fractured; replacement.Desecrated = m.Desecrated; replacement.Crafted = m.Crafted;
                return replacement;
            }).ToList();
        }
        return changes;
    }

    // ---- tiny string helpers shared with ModText ---------------------------------------------------

    private static string ReplaceFirst(string text, string find, string replacement)
    {
        var index = text.IndexOf(find, StringComparison.Ordinal);
        return index < 0 ? text : string.Concat(text.AsSpan(0, index), replacement, text.AsSpan(index + find.Length));
    }

    /// <summary>Whole numbers print without decimals; others print at most 2 (always '.' as separator).</summary>
    internal static string FormatNumber(double n) =>
        n == Math.Floor(n) ? n.ToString("0", CultureInfo.InvariantCulture) : Math.Round(n, 2).ToString(CultureInfo.InvariantCulture);

    internal static string FormatRange(double a, double b) => a == b ? FormatNumber(a) : $"({FormatNumber(a)}-{FormatNumber(b)})";
}
