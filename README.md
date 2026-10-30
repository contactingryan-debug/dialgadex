# DialgaDex — MEGA project fork

Personal research fork of [DialgaDex](https://github.com/mgrann03/dialgadex),
based on upstream commit `0f958e7b09375fd58f327e42e3c41b2a7d18f27f`.

This fork preserves the native calculation engine and verifies current-only
raid-counter results against upstream. Optional future assumptions are enabled
through Unreleased and are identified in Data Audit.

**Baseline verified:** the local fork matches the official production site
exactly for all three reference bosses. See the
[validation summary](baseline-tools/validation-summary.json). The hosted copy is
[available here](https://contactingryan-debug.github.io/dialgadex/).

## Default settings

New page loads use **eDPS, L50, Super Mega L4, 6-Stack, Type Affinity on,
Off Types on, Mixed Types on, Party Power off, a 10-second relobby, and the
Best baseline**. This reference excludes Mega, Primal, and Ultra forms;
transformations can exceed 100%.
The selected controls and the internal default filters use the same preset.
The settings remain adjustable through the normal controls.

With **Unreleased on** and **Super Mega level 4**, all **Mega, Primal,
and Ultra transformations** use the selected base level +2, once: normally
L50 → L52. The rule uses form identity, including Ultra Necrozma, rather than
requiring a Super Mega raid tag. Existing native +2 boosts do not stack.
Current-only mode retains the native tier-8/9 level treatment; Data Preview
is independent of the projected level rule. Ultra Beasts, fusions, and Crowned
forms retain their normal levels. The actual CPM changes Attack, Defense,
and HP before native eDPS calculations. Boss HP/stat profiles do not change.

Type rankings and counters share the rule with default Pokédex levels.
Explicit calculator/URL levels remain the effective levels entered by the user.
Rankings show a projection note, and Data details / Copy details include the
default attacker level and its assumption. Placeholder move exclusions still
apply to Ultra Necrozma. Mega, Primal, and Ultra forms share the transformation
filter/team-size setting and are excluded from the non-Mega investment pool.

With **Unreleased on**, the saved +move assignments are also available.
Existing source definitions retain their values. Published power takes priority;
unknown base power is `round_to_5(147.391 - 0.125502 × base GO Attack +
16.80809 × duration_seconds)`. Unknown definitions assume 100 energy and inherit
the ordinary parent move's type and timing. The native Mega level power scaling
is applied once, separately from power prediction and the level +2 projection.

**P** marks a projected move. Click it to inspect its base power and assumptions,
or choose **Projected +moves** in Data Audit and use Copy details. Assignments
are scoped to individual forms, so identical move names can have different
estimated powers. Aerodactyl's Rock Slide+ remains an explicitly unverified
assignment hypothesis. No +move is invented for an unassigned form, and forecasts
do not make placeholder learnsets eligible. Data Preview is needed only for
forms absent from the current source roster. With the checked resource snapshot,
this adds 70 assignments: 69 estimated powers and published Night Shade+ (160).

The Mega Baxcalibur 3% projection is **331/221/244**. The stamina correction uses
`round((50 + 1.75 × 115) × .97) = 244`, applying the adjustment before rounding.
It is guarded to the reviewed unreleased source tuple 331/221/243; changed or
released source records are preserved.

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

**Raid Leaderboard** is the home page. Open it with the DialgaDex logo, the
navigation menu, or
[`?leaderboard`](https://contactingryan-debug.github.io/dialgadex/?leaderboard).
It defaults to released non-Mega/Primal/Ultra attackers, including Shadows,
fusions, and Crowned forms, against released tier 4+ bosses using native eDPS.
Use the **Attacker / Mega** toggle in the title to switch between separate
leaderboards. **Attacker** shows only non-Mega forms; **Mega** shows only Mega,
Primal, and Ultra transformations. XL controls appear in the Mega view. The
benchmark remains the best non-Mega attacker per boss. Each view scales scores
against the best non-Mega total under its own scoring rules. Mega scores and
matchup percentages may exceed 100. The Mega view
is recorded in `?leaderboard&megas` and remembered for navigation in the tab.
The current level, team size, Party Power, and relobby settings apply; eDPS
remains the scoring metric.

The funnel in the leaderboard header contains the Species Filters: Unreleased,
Shadow, and Legendary. Shadow is shown in the Attacker view. Legendary also
includes Mythical Pokémon and Ultra Beasts, as in Type Rankings.

Both views show every scoring attacker at once, with native mini sprites and
S/A/B/C/D/F tier colors. Jenks natural breaks assign tiers from Raid Score
within the selected view. Species display filters keep those tier assignments.
Each consecutive tier forms an uninterrupted color band with one letter,
centered in its visible portion as you scroll or expand an entry. Form labels
omit Form/Forme and repeated species names. A relevant fixed Hidden Power type
appears as a compact parenthesized type; unused Hidden Power labels stay hidden.
Calculation notes appear below the list. The species funnel opens and closes
on hover, matching Type Rankings, and retains touch and keyboard controls.
**Boss List →** currently returns to the leaderboard until the boss page is built.

The shared **Unreleased** option applies to both attackers and the
raid-boss pool throughout the rankings, Each type summaries, and leaderboard.
It is off by default and remembered for the browser tab. Current-only
calculations use the source data and exclude announced Data Preview changes.
With Unreleased on, unreleased attackers and raid-tagged bosses are
included; Data Preview additionally applies announced data when enabled.
Release status and raid eligibility remain separate: an attacker need not have
appeared in raids. The leaderboard URL records whether unreleased data is included.

For each boss, divide attacker eDPS by the best non-Mega eDPS in the selected
release pool. **Attacker** scoring awards **2 points at ≥100%, 1 point at
95–<100%, and 0 below 95%**. Only attackers with at least one qualifying matchup
are ranked. A win earns two points total; the ≥95% count already includes wins.
Old minimum-performance URL settings do not change these fixed tiers.

**Mega** scoring retains the 0–5-point curve, defaulting to zero at 80% and five
at 100%: `5 * clamp((relative_eDPS - 0.8) / 0.2, 0, 1)`. Mega performance above
100% remains capped at five.

Both views apply the same boss weights. Each raid group has total
weight one. Genesect, Deoxys, Arceus, and Silvally share it across included forms;
other major forms have separate groups. A form's allocation is shared across
raid formats, so regular/Shadow or ordinary/Super versions cannot add weight.
Separate Shadow raid profiles and their availability audit are deferred. The displayed score
is its weighted point total relative to the best non-Mega total (100) on that
view's scoring scale. The two views use different point rules.

Both views use fixed equal raid-group weights. Shadow and Legendary display
filters preserve the reference pool and score scale. Both views retain the same
per-boss eDPS benchmark. The list has no search bar or scoring-options menu;
the shared header retains calculation settings and species filters.
Each entry expands to contributing bosses, weighted points, relative eDPS,
and the optimal moves. ≥100% and ≥95% count boss forms reaching those
percentages of the best non-Mega eDPS. Winning margin uses the strongest other
non-Mega build; a transformed attacker compares with the best non-Mega build.
Hidden Power types are separate fixed builds: only the best aggregate build
is displayed, with alternative build totals available in its breakdown.
The score measures battle coverage; acquisition costs and roster-aware
upgrade recommendations remain a separate future step.

Mega/Primal/Ultra forms use their separately selected native team size and Mega
level. Unreleased also applies the existing forecast +moves and +2 level
rule, once; placeholder forms and boss-only Eternamax remain excluded. Expanded
breakdowns show the effective attacker level and clickable move assumptions.

Calculations run in an isolated Web Worker and cache up to four recent battle
settings and attacker-pool selections in memory. Navigating away cancels unfinished work. Existing type
rankings and individual counters retain their calculation formulas.

## Catch XL compatibility

The separate **XL ≥95%** leaderboard column adds the selected raid-group weights
for bosses where the displayed build reaches the chosen 90%, 95%, or 100% of
best non-Mega eDPS and its active transformation can boost the catch's XL chance.
It preserves combat points and the non-Mega reference. Sort by this column or
use **Strong + XL only**, which also enables transformations. URL parameters
`xl`, `xl-min`, and `sort=xl` preserve the view. Fixed Hidden Power builds are
never combined to inflate XL coverage.

The caught form is resolved separately from the fought form. Mega/Primal raids
use the base encounter; Necrozma/Kyurem fusions revert, Crowned Zacian/Zamazenta
yield Hero forms, and Hoopa Unbound stays Unbound. Uncertain future encounters
remain unknown or explicitly projected. Catch-type matching never uses the
Candy family's base Pokémon. Matching two types still qualifies only once.

Catch bonus profiles use ordinary Mega typing, with dedicated three-type rules
for Primal Kyogre, Primal Groudon and Mega Rayquaza. Standard Mega/Primal profiles
require at least High Level (2). Ultra Necrozma assumes Dragon/Psychic as an
explicit user-approved projection, without inventing its level system or XL
rate. This does not enable its placeholder learnset. Projected matches require
Unreleased and carry P labels.

Individual raid counter lists show catch details and XL badges and have an
**XL boosting options only** filter with no strength threshold. Results use the
selected metric and baseline from before XL filtering, then show the top ten
compatible species. The strength threshold remains a leaderboard tool.
**Hide non-XL Megas / Primals / Ultras** is enabled by default, keeping regular
counters alongside compatible transformations. Both filters preserve the same metric and baseline;
when both are selected, XL boosting options only takes precedence.
Catch-form rules, boost types, evidence, source links and unknown mappings are
inspectable in Data Audit and Copy details. An active transformation is required
at catch time; the feature predicts compatibility, not a guaranteed extra XL
count or an estimate of team attack boosts.

## Data audit and corrections

Open **Data Audit** from navigation, the leaderboard, or
[`?audit`](https://contactingryan-debug.github.io/dialgadex/?audit). Search by
Pokémon, form, or number, and filter availability, raid tags, incomplete data,
projections, local corrections, or unsupported source forms. Pokémon pages have
an expandable **Data details** panel. **Copy details** includes source/effective
flags, moves, stats and provenance, ranking inclusion reasons, group, weight,
and a direct page link. Clipboard failures offer selectable text.

Released means ever available, not currently in rotation. Shadow availability
controls attacker eligibility independently of general raid eligibility. The
audit distinguishes verified/announced raids, unverified upstream tags, and
future projections. A tag on an unreleased form is not evidence of a real raid.

Upstream resources remain live. Narrow corrections and source links live in
[`data/audit-overrides.json`](data/audit-overrides.json), while raw upstream
records remain inspectable. This pass adds Armored Mewtwo's missing tier-5 tag
and updates Minior's Meteor/Green release flags. Core forms are excluded from
raid calculations because their transformation is currently restricted to
non-raid battles. Future placeholder learnsets are excluded in both release
modes, while genuine released Splash/Struggle learnsets remain usable.

Eternamax Eternatus remains visible for inspection but is excluded from ordinary
raid calculations in both release modes: it is a Max Battle boss, not a
player-usable raid form. Regular Eternatus remains eligible. Data details and
Copy details explain this restriction and link the official event source.

Mega Zygarde **403/181/415** and Mega Baxcalibur **331/221/244** remain explicitly
unconfirmed projections, rather than game-data claims. Ultra Necrozma's stored
**337/196/200** matches the checked Game Master snapshot; the **359/209/213**
hypothesis is displayed separately and does not enable an incomplete form.
The manifest pins the checked Game Master and main-series sources and dates.

After editing assets, run `python tools/update-assets.py` to refresh entry,
template, worker, locale, and correction-manifest content versions.

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
npm run check:data-audit
npm run check:transformation-levels
FORK_URL=http://localhost:8000/ npm run check:transformation-browser
FORK_URL=http://localhost:8000/ npm run check:data-audit-browser
FORK_URL=http://localhost:8000/ npm run check:raid-leaderboard
```

Results are written to `baseline-tools/results/baseline-results.json`.
Matching settings and input-data hashes are required before numerical parity
can pass. The engine comparison restores identical upstream records on the
fork; local corrections and eligibility changes have separate audit checks.
Empty, missing, and nonfinite counter results fail the check.
The sites load live resource data, which can change independently of the code;
the report identifies the particular input version tested.

## Source and credits

See [MODIFICATIONS.md](MODIFICATIONS.md) for this fork's changes and validation
status. Original credits remain in the site's About page. The original
[GNU GPLv3 license](LICENSE) is retained.
