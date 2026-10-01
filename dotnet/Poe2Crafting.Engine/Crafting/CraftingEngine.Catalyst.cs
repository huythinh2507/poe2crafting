using Poe2Crafting.Engine.Data;

namespace Poe2Crafting.Engine.Crafting;

// Catalysts (rings, amulets; Refined ones on jewels).
// Quality is tied to one tag. It scales the rolled value of every mod carrying that tag (implicits too), and a different
// catalyst replaces it instead of adding. Each use gives round(30 x e^(-ilvl/30) - 0.3) clamped to 1-20 (a 1 becomes 2
// one time in five). Cap 20%, plus a Breach Ring's "+x% to Maximum Quality". Omen of Catalysing Exaltation turns the
// quality into a weight multiplier on that tag for the next Exalted Orb. These are the formulas craftofexile.com uses;
// GGG does not publish them.
public sealed partial class CraftingEngine
{
    /// <summary>Gain per catalyst use at an item level (random: 1 can become 2 one time in five).</summary>
    public int CatalystGain(int itemLevel)
    {
        var n = (int)Math.Round(Math.Clamp(30 * Math.Exp(-itemLevel / 30.0) - 0.3, 1, 20), MidpointRounding.AwayFromZero);
        return n == 1 && Rng.NextDouble() < 0.2 ? 2 : n;
    }

    /// <summary>Maximum catalyst quality: 20, plus the item's "+x% to Maximum Quality" (Breach Rings).</summary>
    public int CatalystCap(CraftItem item) => MaxQuality + (int)LocalStat(item, "local_maximum_quality_+");

    /// <summary>Weight multiplier the omen gives mods with the catalyst's tag: 1 + 0.2 per % up to 20, then 0.12 per % beyond (Breach Rings).</summary>
    public static double CatalystFactor(int quality)
    {
        var over = quality - MaxQuality;
        return over > 0 ? 1 + 0.12 * over + 0.2 * MaxQuality : 1 + 0.2 * quality;
    }

    private int? TagId(string key) => Db.Raw.Tags.Entries.FirstOrDefault(t => t.Key == key)?.Id;

    private IReadOnlyDictionary<int, double>? CatalystWeights(CatalystQuality c) =>
        TagId(c.Tag) is { } id ? new Dictionary<int, double> { [id] = CatalystFactor(c.Quality) } : null;

    private List<Change> UseCatalyst(CraftItem item, string tag)
    {
        if (item.Catalyst is { } old && old.Tag != tag) item.Catalyst = null;   // a different type wipes the old quality
        var before = item.Catalyst?.Quality ?? 0;
        var quality = Math.Min(CatalystCap(item), before + CatalystGain(item.ItemLevel));
        item.Catalyst = new CatalystQuality(tag, quality);
        return Note($"{char.ToUpperInvariant(tag[0])}{tag[1..]} catalyst quality +{quality - before}% (now {quality}%)");
    }

    /// <summary>Exalted Orb; Omen of Catalysing Exaltation makes it use up all the catalyst quality.</summary>
    private List<Change>? Exalted(CraftItem item, CraftMethod method)
    {
        var options = AddOptionsFor(Opts(method), "poe2_exalted", item);
        var changes = AddMany(item, Context.Has("exalt_two") ? 2 : 1, options);
        if (changes is not null && options.Positives is not null) item.Catalyst = null;
        return changes;
    }

    /// <summary>A rolled value as the item shows it: scaled by catalyst quality when the mod carries the catalyst's tag.</summary>
    public double CatalystScaled(CraftItem? item, Mod mod, double value)
    {
        if (item?.Catalyst is not { Quality: > 0 } c || TagId(c.Tag) is not { } tag || !Pools.GroupTags(mod).Contains(tag)) return value;
        return Math.Floor(value * (100 + c.Quality) / 100 + 1e-9);   // rounds DOWN: +3 needs 34% quality to become +4
    }
}
