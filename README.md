# PoE2 Crafting

Local Path of Exile 2 crafting emulator, inspired by Craft of Exile. Vanilla JS, no build step.

```
npm install        # only needed for the Playwright test scripts
npm start          # http://localhost:5173
```

## What it simulates
Currencies (incl. Greater/Perfect tiers), Fracturing, Vaal, quality orbs, Hinekora's Lock preview,
essences and alloys, desecration (bones, Well of Souls reveal), socketables and meta runes,
and the crafting omens (Whittling, Light, Erasure, Annulment, Exaltation, Coronation, ...).

## C# version of the logic
`dotnet/` holds the same crafting rules in C# (readable, typed, 66 tests, console demo). The website still runs
the JavaScript engine; the C# project exists so the logic can be read and checked. See `dotnet/README.md`.

```
dotnet test dotnet/Poe2Crafting.sln
dotnet run --project dotnet/Poe2Crafting.Cli
```

## Layout
- `public/js/data.js` - game data loading and mod pools
- `public/js/engine.js` - crafting rules (pure logic, no DOM)
- `public/js/app.js` - UI
- `public/data/` - game data JSON (from craftofexile.com's data files)
- `public/assets/items/` - currency icons (`scripts/fetch-icons.mjs`)
- `recon/*.mjs` - Playwright scripts: scraping the reference site and regression tests
  (`node recon/omens.mjs`, `node recon/bugs.mjs`, ... with the server running)

## Updating data
```
npm run fetch-data [version]
npm run prepare-data
node scripts/fetch-icons.mjs
```

## Notes
Game data and art belong to Grinding Gear Games / Craft of Exile. Keep this repo private; personal use only.
Desecration reveal weights are an assumption (not published); see the settings on the Desecrate tab.
