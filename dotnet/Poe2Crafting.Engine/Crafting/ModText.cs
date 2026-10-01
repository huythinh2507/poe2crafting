namespace Poe2Crafting.Engine.Crafting;

public sealed partial class CraftingEngine
{
    /// <summary>The mod's family title without numbers, e.g. "#% increased maximum Life".</summary>
    public string ModTemplate(Data.Mod mod) =>
        string.Join(" / ", mod.Stats.Select(s => Db.Text(s.Label)).Distinct());

    /// <summary>
    /// Display text for a mod, one line per stat (or one line for "adds # to #" damage mods). With rolls it
    /// shows the value and its range: "+178(175-189) to maximum Life". Without rolls it shows the range only.
    /// </summary>
    public string[] ModLines(Data.Mod mod, double[]? rolls = null)
    {
        var labels = mod.Stats.Select(s => Db.Text(s.Label)).ToList();

        string Format(int i)
        {
            var (a, b) = (mod.Stats[i].Range[0], mod.Stats[i].Range[1]);
            if (rolls is null || i >= rolls.Length) return FormatRange(a, b);
            var v = rolls[i];
            return a == b ? FormatNumber(v) : $"{FormatNumber(v)}({FormatNumber(a)}-{FormatNumber(b)})";
        }

        // "Adds # to # Fire Damage": one label shared by two stats (min and max) becomes a single line.
        var first = labels.FirstOrDefault() ?? "";
        if (labels.Distinct().Count() == 1 && mod.Stats.Count > 1 && first.Count(c => c == '#') == mod.Stats.Count)
        {
            var line = first;
            for (var k = 0; k < mod.Stats.Count; k++) line = ReplaceFirst(line, "#", Format(k));
            return new[] { line };
        }

        return labels.Select((label, i) => ReplaceFirst(label, "#", Format(i))).ToArray();
    }

    /// <summary>Convenience: the lines for a mod that is on an item.</summary>
    public string[] ModLines(ModInstance instance) => ModLines(ModOf(instance), instance.Rolls);
}
