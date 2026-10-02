# PoE2 Crafting

Path of Exile 2 crafting emulator

**Live demo: https://huythinh2507.github.io/poe2crafting/**

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
- `public/js/prices.js`, `spend.js`, `estimate.js` - prices, cost tracking, the repeat-until estimator
- `recon/*.mjs` - Playwright scripts: scraping the reference site and regression tests
  (`node recon/omens.mjs`, `node recon/bugs.mjs`, ... with the server running)

## Cost estimate
The item column shows an **Estimated cost** in Divine Orbs: every currency, essence, bone, rune and omen you use is counted, Undo takes it back, and
Reset item moves it into a session total. Prices come from poe.ninja (`public/data/prices-live.json`), then the Craft of Exile snapshot
(`public/data/prices.json`), then your own override (type a price in the breakdown). Anything with no price counts as 0 and is flagged.

- Prices are refreshed from a terminal with `npm run fetch-prices [league]`.
- **Updating the deployed site:** GitHub > Actions > *Refresh prices* > *Run workflow* (optionally type a league). It fetches from poe.ninja, commits
  `public/data/prices-live.json` and redeploys Pages. Manual on purpose, so poe.ninja is only asked when you want fresh prices.
- **Estimate odds & cost...** repeats the held currency (and armed omens) on copies of your item until a modifier you pick shows up (hundreds of
  simulated crafts) and reports average / median / 90% uses and cost.

## Jewels
Every modifier shows its tags (damage, attack, life, ...) on the item and in the pool, and a catalyst's quality marks the modifiers it boosts. Jewels take the Refined
catalysts, rings / amulets / belts the plain ones. Time-Lost jewel radius modifiers read "Small / Notable Passive Skills in Radius also grant ..." like in game;
which is which comes from poe2db (`node scripts/fetch-jewel-radius.mjs` writes `public/data/jewel-radius.json`).

## Updating data
```
npm run fetch-data [version]
npm run prepare-data
node scripts/fetch-icons.mjs
```

## Notes
Game data and art belong to Grinding Gear Games / Craft of Exile. Keep this repo private; personal use only.
Desecration reveal weights are an assumption (not published); see the settings on the Desecrate tab.
