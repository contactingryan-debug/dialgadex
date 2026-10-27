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
