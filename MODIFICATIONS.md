# Modifications to upstream DialgaDex

Modified for Ryan's MEGA project on October 26, 2026 (America/Los_Angeles).

Base: `mgrann03/dialgadex` commit
`0f958e7b09375fd58f327e42e3c41b2a7d18f27f`.

## October 26, 2026 — hosting and baseline verification

- Removed the upstream custom-domain `CNAME` and added `.nojekyll` for static hosting.
- Made local resources, templates, locale loads, icons, fonts, and navigation
  work at both a domain root and a repository subpath.
- Added the browser comparison harness, pinned its dependency and lockfile,
  and added a GitHub Actions workflow to run it.
- Added setup and validation documentation.

At this baseline checkpoint, `scripts/calc.js` and `scripts/settings.js`
matched upstream. Edits to utility, ranking, move-display, translation,
and startup files only adjusted local URLs. Custom moves, stats, and
Mega-level rules were reserved for later work.

Baseline validation passed against the official production site with identical
loaded-data fingerprints and settings. For each of the three reference bosses,
the top 15 counters and all 63 released Mega/Primal counters matched exactly,
including movesets, eDPS, DPS, and TDO. The tested fork was served locally under
`/dialgadex/`; public hosting still requires enabling GitHub Pages.

See [the validation summary](baseline-tools/validation-summary.json) for the
timestamp, input fingerprint, source hashes, settings, and per-boss results.

## October 27, 2026 — project defaults

- Set the initial Pokémon level to 50 and Super Mega level to 4.
- Enabled Off Types in the initial checkbox, internal default search parameters,
  and the check used to recognize default filters for tier caching.
- Updated the selected level and Super Mega buttons to match the calculation
  defaults. The full preset is documented in the README.

The calculation formulas and upstream data sources are unchanged.

## October 27, 2026 — Best baseline and ranking navigation

- Set the initial comparison baseline to Best, including the selected control.
- Preserve the selected Attackers/Counters mode when changing a specific type.
- Build ranking URLs and type-selector links from the same resolved mode used
  for the calculation, including explicit requests to switch modes.
- Normalize All types and Each type to their supported Attackers view.

## October 27, 2026 — mode retention through aggregate views

- Remember the user's mode in the current tab instead of inferring it from
  the temporarily disabled aggregate-view toggle.
- Preserve that choice through All types, Each type, reloads, and returning
  through the main navigation, while direct type URLs retain their own mode.
- Synchronize the type selector with URL navigation so its current selection
  and change events match the displayed type.
- Version the changed scripts and the settings script in the entry page so
  browsers request fresh copies after this update.

## October 27, 2026 — Each type Counters

- Enable Counters for Each type, including mode-preserving links, reloads,
  and browser navigation.
- Select the best counter against each defending type using the same boss
  profiles and search settings as the corresponding individual Counters page.
- Preserve full counter ordering for tie consistency and avoid mutating the
  caller's search parameters while building the summary.
- Add mode-specific headings, page metadata, and an explanatory note in
  English, Spanish, and French.
- Version the changed calculation/controller scripts, ranking template,
  and translation resources so browsers load the complete feature together.
- Add automated 18-type parity and mobile navigation checks to the baseline
  validation workflow.
- Keep type labels readable on narrow phones and derive virtualized row
  sizing from the rendered CSS row height.

## October 27, 2026 — non-Mega raid points leaderboard

- Add a shareable leaderboard with continuous points based on relative eDPS,
  an 80% default floor, and boss-species weights shared across raid forms.
- Offer 70/80/90% floors, equal-form weighting, search, stable display filters,
  and sortable score, first-place, and within-5% columns.
- Calculate released non-Mega/Primal builds against released tier 4+ bosses
  using the existing battle functions in a Web Worker. Reconstruct released
  data from the preview's undo records without mutating the main page.
- Score fixed Hidden Power types separately, select the strongest aggregate
  build per attacker, and show contributing bosses and required movesets.
- Cancel background calculations on navigation; protect page visibility from
  stale template loads and reuse results when battle inputs have not changed.
- Add English, Spanish, and French text and content-versioned assets.
- Add mathematical scoring checks and native-engine/UI regression checks.

## October 27, 2026 — consistent release filtering

- Apply Include unreleased to both attacker availability and the tier 4+
  boss pool, including Type Affinity and Each type rankings.
- Use current source data throughout current-only calculations. Announced
  preview data is included only when both Include unreleased and Data Preview
  are on; reconstructing current data does not mutate the preview.
- Add the same release switch to the raid leaderboard, record it in its URL,
  and remember the shared preference within the browser tab.
- Preserve raid eligibility independently from release status and leave
  scoring formulas, grouping, and raid mechanics unchanged.
- Verify both modes, preview isolation, shared navigation, and native-engine
  parity. Compare current data with Data Preview disabled on both baseline sites.

## October 27, 2026 — raid groups and inspectable data audit

- Default to equal raid groups: Genesect, Deoxys, Arceus, and Silvally share one
  weight across forms; other major forms remain separate. Split a form's share
  across raid formats so adding regular/Shadow/Super profiles cannot inflate it.
  Retain equal-species and equal-form comparisons in scoring options.
- Defer separate Shadow raid history/profiles, retaining Shadow attacker
  availability and the general raid tag.
- Apply documented local corrections to Armored Mewtwo and Minior, retaining
  raw upstream records and their original flags for inspection.
- Exclude incomplete stats/move placeholders and explicitly restricted raid
  forms from calculation pools. Preserve genuine released zero-power learnsets.
  Validate alternate forms independently of the base form's release flag.
- Add searchable/filterable Data Audit and Pokémon Data details, including
  source/effective availability, raid provenance, HP/profile, move quality,
  displayed/ranking stats, projection sources, inclusion reasons, group, and
  weight. Copy details supports clipboard and a visible selection fallback.
- Keep the Mega Zygarde/Baxcalibur stat projections labeled unconfirmed, and
  distinguish Ultra Necrozma's Game Master record from the hypothetical forecast.
- Add mathematical/eligibility/clipboard/mobile checks and a reusable asset
  version updater. Engine parity still compares identical upstream records;
  audit corrections are verified separately.

## October 27, 2026 — projected levels for Mega, Primal, and Ultra forms

- With Include unreleased and Super Mega level 4, use base level +2 for all
  three transformation categories, including ordinary Megas and Ultra Necrozma.
  Preserve current-only native boosts and apply the offset once.
- Share level selection across attacker searches and default Pokédex levels;
  preserve explicit effective calculator levels. Avoid carrying a previous
  form's boosted level into another form or selected base-level profile.
- Apply native CPM to all three stats. Leave boss raid profiles unchanged and
  retain placeholder-move exclusions. Ultra Beasts, fusions, and Crowned forms
  do not receive the transformation projection.
- Align the transformation filter, team-size category, leaderboard exclusion,
  ranking note, and audit/copy metadata with Mega/Primal/Ultra terminology.
- Add unit and browser checks for conditional levels, no double boost,
  multi-level searches, real native eDPS, preview independence, and mobile UI.
