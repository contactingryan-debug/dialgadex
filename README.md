# DialgaDex — MEGA project fork

Personal research fork of [DialgaDex](https://github.com/mgrann03/dialgadex),
based on upstream commit `0f958e7b09375fd58f327e42e3c41b2a7d18f27f`.

The first step preserves the native calculation engine while verifying that
this copy produces the same raid-counter results. Custom projected moves,
stat changes, and normalized L52 treatment are reserved for the next step.

**Baseline verified:** the local fork matches the official production site
exactly for all three reference bosses. See the
[validation summary](baseline-tools/validation-summary.json). The hosted copy is
[available here](https://contactingryan-debug.github.io/dialgadex/).

## Default settings

New page loads use **eDPS, L50, Super Mega L4, 6-Stack, Type Affinity on,
Off Types on, Mixed Types on, Party Power off, a 10-second relobby, and the
Best baseline**.
The selected controls and the internal default filters use the same preset.
The settings remain adjustable through the normal controls.

The rankings type selector remembers the chosen Attackers/Counters mode for
the current browser tab, including detours through All types, reloads,
and returning through the main navigation. All types shows Attackers while
preserving the choice used when returning to a supported Counters view.
Direct links and Back/Forward navigation restore their specified view. The
highlighted type stays synchronized with the displayed rankings.

**Each type** supports both modes. In **Counters**, its 18 rows show the best
counter against each defending type under the current settings. With Type
Affinity on, each row uses raid bosses that have that type; with it off, each
row uses the same single-type target as the individual Counters page. Winners,
movesets, and scores follow the corresponding individual view, including ties.

## Raid attacker leaderboard

Open **Raid Leaderboard** from the rankings page or navigation menu, or use
[`?leaderboard`](https://contactingryan-debug.github.io/dialgadex/?leaderboard).
It ranks released non-Mega/Primal attackers, including Shadows, fusions, and
Crowned forms, against released tier 4+ bosses using native eDPS calculations.
The current level, team size, Party Power, and relobby settings apply; eDPS
remains the scoring metric.

The shared **Include unreleased** option applies to both attackers and the
raid-boss pool throughout the rankings, Each type summaries, and leaderboard.
It is off by default and remembered for the browser tab. Current-only
calculations use the source data and exclude announced Data Preview changes.
With Include unreleased on, unreleased attackers and raid-tagged bosses are
included; Data Preview additionally applies announced data when enabled.
Release status and raid eligibility remain separate: an attacker need not have
appeared in raids. The leaderboard URL records whether unreleased data is included.

For each boss, divide attacker eDPS by the best non-Mega eDPS in the selected pool. The
default awards points linearly from zero at 80% performance to five at 100%:
`5 * clamp((relative_eDPS - 0.8) / 0.2, 0, 1)`. Each boss species has total
weight one, shared across its included high-tier forms. The displayed score
is its weighted point total relative to the overall leader (100).

Scoring options support 70%, 80%, and 90% floors and equal weight per form.
Search and display filters preserve the reference pool and score scale.
Each entry expands to contributing bosses, weighted points, relative eDPS,
and the optimal moves. #1 and within-5% counts refer to boss forms; ties count.
Hidden Power types are separate fixed builds: only the best aggregate build
is displayed, with alternative build totals available in its breakdown.
The score measures battle coverage; acquisition costs and roster-aware
upgrade recommendations remain a separate future step.

Calculations run in an isolated Web Worker and cache the most recent battle
settings in memory. Navigating away cancels unfinished work. Existing type
rankings and individual counters retain their calculation formulas.

## Host this fork

The site works at a domain root or a repository subpath. The inherited
`CNAME` has been removed so this fork does not claim the original site's domain.

For this repository, open
[Settings → Pages](https://github.com/contactingryan-debug/dialgadex/settings/pages),
choose **Deploy from a branch**, select **main** and **/(root)**, and save.
GitHub will display the published URL after its deployment completes.
The expected address is `https://contactingryan-debug.github.io/dialgadex/`.
Keep the custom domain field empty.

For a local preview, run `python3 -m http.server 8000` from the repository,
then open `http://localhost:8000/?faq`.

## Verify the baseline

The **DialgaDex baseline parity** GitHub Actions workflow compares the official
site with the checked-out fork served under its repository subpath. It runs
on pushes to `main`, pull requests, or manual dispatch. On a new fork, GitHub
may require enabling workflows once in the Actions tab.

The workflow also checks all 18 Each type Counters rows against the individual
type rankings with Type Affinity on, Type Affinity off, and matching move types.
Mobile toggle, direct-link, reload, and navigation checks cover the new view.

Raid scoring checks cover point boundaries, form weighting, tied leaders,
duplicate movesets, and fixed Hidden Power builds. The leaderboard browser
check compares every boss benchmark and the leading entries' movesets with
the native calculator, then exercises mobile layout, scoring controls,
search, display filters, URLs, history, and cancellation.

The manual workflow also accepts a deployed URL. No repository variable or
secret is needed. Its `baseline-comparison` artifact records inputs, data
fingerprints, the top 15 counters, and every released Mega/Primal for:

- Enamorus (Incarnate)
- Mega Tyranitar
- Dawn Wings Necrozma

Settings: **eDPS, L50, Super Mega L4, six-Pokémon normal and Mega teams,
10-second relobby, Party Power off, Type Affinity on, mixed and off-type
moves on, elite moves and shadows on, released attackers only**. Announced
Data Preview is disabled on both sites for a like-for-like comparison of
current source data and is recorded in the report. Native
L4 level treatment is preserved; this is not the future normalized L52 scenario.

To run the same comparison locally:

```sh
cd baseline-tools
npm ci
npx playwright install chromium
FORK_URL=http://localhost:8000/ npm run compare
FORK_URL=http://localhost:8000/ npm run check:each-counters
npm run check:raid-points
npm run check:release-filter
FORK_URL=http://localhost:8000/ npm run check:raid-leaderboard
```

Results are written to `baseline-tools/results/baseline-results.json`.
Matching settings and input-data hashes are required before numerical parity
can pass. Empty, missing, and nonfinite counter results fail the check.
The sites load live resource data, which can change independently of the code;
the report identifies the particular input version tested.

## Source and credits

See [MODIFICATIONS.md](MODIFICATIONS.md) for this fork's changes and validation
status. Original credits remain in the site's About page. The original
[GNU GPLv3 license](LICENSE) is retained.
