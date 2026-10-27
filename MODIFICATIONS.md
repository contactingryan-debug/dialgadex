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
