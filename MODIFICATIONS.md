# Modifications to upstream DialgaDex

Modified for Ryan's MEGA project on October 26, 2026 (America/Los_Angeles).

Base: `mgrann03/dialgadex` commit
`0f958e7b09375fd58f327e42e3c41b2a7d18f27f`.

- Removed the upstream custom-domain `CNAME` and added `.nojekyll` for static hosting.
- Made local resources, templates, locale loads, icons, fonts, and navigation
  work at both a domain root and a repository subpath.
- Added the browser comparison harness, pinned its dependency and lockfile,
  and added a GitHub Actions workflow to run it.
- Added setup and validation documentation.

`scripts/calc.js` and `scripts/settings.js` are unchanged. Edits to utility,
ranking, move-display, translation, and startup files only adjust local URLs.
No custom moves, stats, or Mega-level rules have been applied.

Baseline validation passed against the official production site with identical
loaded-data fingerprints and settings. For each of the three reference bosses,
the top 15 counters and all 63 released Mega/Primal counters matched exactly,
including movesets, eDPS, DPS, and TDO. The tested fork was served locally under
`/dialgadex/`; public hosting still requires enabling GitHub Pages.

See [the validation summary](baseline-tools/validation-summary.json) for the
timestamp, input fingerprint, source hashes, settings, and per-boss results.
