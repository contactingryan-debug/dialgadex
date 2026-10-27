/**
 * MEGA Step 1: compare DialgaDex itself against the same unmodified fork.
 * No simulation formulas are reimplemented here.
 * GPL-3.0 project; see repository LICENSE and MEGA_BASELINE.md.
 */
import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";

const OFFICIAL_URL = process.env.UPSTREAM_URL || "https://www.dialgadex.com/";
const FORK_URL = process.env.FORK_URL || "http://127.0.0.1:8765/";
const CASES = [
  { id: 905, form: "incarnate", label: "Enamorus (Incarnate)" },
  { id: 248, form: "mega", label: "Mega Tyranitar" },
  { id: 800, form: "dawnwings", label: "Dawn Wings Necrozma" }
];

const digest = str => createHash("sha256").update(str).digest("hex");
const normalize = str => String(str || "").toLowerCase().replace(/[^a-z0-9]/g, "");

async function collect(browser, rootUrl) {
  const page = await browser.newPage();
  const issues = [];
  page.on("pageerror", e => issues.push("JS: " + e.message));
  page.on("response", r => {
    if (r.status() >= 400 && /\/(scripts|locales|templates|styles|components)\//.test(r.url()))
      issues.push("HTTP " + r.status() + ": " + r.url());
  });
  try {
    // FAQ is inexpensive, so startup does not recalculate all type rankings.
    const start = new URL(rootUrl);
    start.search = "?faq";
    const initial = await page.goto(start.href, { waitUntil: "domcontentloaded", timeout: 90000 });
    if (!initial || !initial.ok()) throw new Error("Homepage did not load: " + initial?.status());

    await page.waitForFunction(() =>
      typeof jb_pkm !== "undefined" && Array.isArray(jb_pkm) && jb_pkm.length > 100 &&
      typeof jb_fm !== "undefined" && Array.isArray(jb_fm) && jb_fm.length > 0 &&
      typeof jb_cm !== "undefined" && Array.isArray(jb_cm) && jb_cm.length > 0 &&
      typeof GetEnemyParams === "function" && typeof GetStrongestVersus === "function",
      null, { timeout: 120000 });

    const measured = await page.evaluate(async cases => {
      settings_metric = "eDPS";
      settings_default_level = [50];
      settings_xl_budget = false;
      settings_supermega_level = 4;
      settings_team_size_normal = 6;
      settings_team_size_mega = 6;
      settings_relobbytime = 10;
      settings_party_size = 1; // Party Power OFF
      settings_type_affinity = true;
      settings_newdps = true;
      settings_pve_turns = true;

      const settings = {
        metric: settings_metric, level: settings_default_level[0],
        superMegaLevel: settings_supermega_level,
        normalTeamSize: settings_team_size_normal,
        megaTeamSize: settings_team_size_mega,
        relobbySeconds: settings_relobbytime,
        partyPower: settings_party_size, typeAffinity: settings_type_affinity,
        newDps: settings_newdps, pveTurns: settings_pve_turns,
        includeShadows: true, includeMixed: true, includeOfftypes: true,
        includeElite: true, includeUnreleased: false
      };
      const pokemonMoveData = JSON.stringify([jb_pkm, jb_fm, jb_cm]);
      const results = [];
      for (const test of cases) {
        const matches = jb_pkm.filter(p => p.id === test.id);
        const boss = matches.find(p => String(p.form || "").toLowerCase()
          .replace(/[^a-z0-9]/g, "") === test.form);
        if (!boss) {
          results.push({
            boss: test.label,
            error: "Form unavailable; found: " + matches.map(p => p.form).join(", ")
          });
          continue;
        }
        const search = {
          ...GetDefaultSearchParams(),
          type: "Any", versus: false, real_damage: true,
          unreleased: false, mega: true, shadow: true, legendary: true,
          elite: true, mixed: true, offtype: true, suboptimal: false
        };
        // The source ranks its candidates in ascending eDPS order.
        const strongest = await GetStrongestVersus(GetEnemyParams(boss), search, 15);
        const top = strongest.slice().reverse().map(p => ({
          id: p.id, name: p.name, form: p.form || "", shadow: !!p.shadow,
          level: p.level, fast: p.fm, charged: p.cm,
          eDps: Number(p.rat.toFixed(6))
        }));
        results.push({ boss: test.label, form: boss.form, top });
      }
      return { settings, pokemonMoveData, results };
    }, CASES);

    const dataHash = digest(measured.pokemonMoveData);
    delete measured.pokemonMoveData;
    return { ...measured, dataHash, diagnostics: issues };
  } finally {
    await page.close();
  }
}

function check(a, b) {
  const errors = [];
  if (a.dataHash !== b.dataHash)
    errors.push("The loaded Pokémon/move data differ. Check for updates between loads.");
  if (JSON.stringify(a.settings) !== JSON.stringify(b.settings))
    errors.push("The calculation settings differ.");
  for (let i = 0; i < CASES.length; i++) {
    const original = a.results[i], fork = b.results[i];
    if (original?.error || fork?.error)
      errors.push(CASES[i].label + " unsupported: " + (original?.error || "") + " " + (fork?.error || ""));
    else if (JSON.stringify(original) !== JSON.stringify(fork))
      errors.push(CASES[i].label + ": top-15 Pokémon, movesets, or eDPS differ.");
  }
  if (b.diagnostics.length)
    errors.push("Fork browser diagnostics: " + b.diagnostics.join("; "));
  return errors;
}

const browser = await chromium.launch({headless:true});
let status = 1;
try {
  console.log("Comparing upstream:", OFFICIAL_URL);
  const original = await collect(browser, OFFICIAL_URL);
  console.log("Comparing fork:", FORK_URL);
  const fork = await collect(browser, FORK_URL);
  const errors = check(original, fork);
  const report = {
    timestamp: new Date().toISOString(),
    upstream: OFFICIAL_URL, forkUrl: FORK_URL,
    passed: errors.length === 0, errors, original, fork
  };
  mkdirSync("results", {recursive:true});
  writeFileSync("results/baseline-results.json", JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({
    passed: report.passed, errors,
    bosses: original.results.map((r, i) => ({
      boss: r.boss, original: r.top?.[0], fork: fork.results[i]?.top?.[0]
    }))
  }, null, 2));
  console.log("Full details: results/baseline-results.json");
  status = errors.length ? 1 : 0;
} catch (error) {
  console.error("Baseline runner failed:", error.stack || String(error));
} finally {
  await browser.close();
  process.exitCode = status;
}
