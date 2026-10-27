/**
 * Compare an unmodified DialgaDex fork with the upstream production site.
 * No calculations are reimplemented: this calls each site's own functions.
 *
 * Run: FORK_URL=https://your-site.example npm run compare
 * Requires: npm install && npx playwright install chromium
 *
 * GPL-3.0 compatibility: test harness authored for the MEGA project.
 */
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';

const upstream = process.env.UPSTREAM_URL || 'https://www.dialgadex.com/';
const fork = process.env.FORK_URL;
if (!fork) {
  console.error('FORK_URL is required, e.g. FORK_URL=https://YOURNAME.github.io/ npm run compare');
  process.exit(2);
}
const hash = (value) => createHash('sha256').update(value).digest('hex');
const launchOptions = {headless: true};
if (process.env.PLAYWRIGHT_PROXY) {
  const proxyUrl = new URL(process.env.PLAYWRIGHT_PROXY);
  launchOptions.proxy = {
    server: `${proxyUrl.protocol}//${proxyUrl.host}`,
    bypass: '<-loopback>,127.0.0.1,localhost',
    ...(proxyUrl.username ? {username: decodeURIComponent(proxyUrl.username), password: decodeURIComponent(proxyUrl.password)} : {}),
  };
}
const cases = [
  { id: 905, name: 'Enamorus (Incarnate)', wantedForm: 'incarnate' },
  { id: 248, name: 'Mega Tyranitar', wantedForm: 'mega' },
  { id: 800, name: 'Dawn Wings Necrozma', wantedForm: 'dawnwings' },
];

async function measure(browser, url) {
  const page = await browser.newPage({ignoreHTTPSErrors: process.env.PLAYWRIGHT_IGNORE_HTTPS_ERRORS === '1'});
  const diagnostics = [];
  page.on('pageerror', err => diagnostics.push(`JS: ${err.message}`));
  page.on('response', response => {
    if (response.status() >= 400 && /\/((scripts|locales|templates|styles|components)\/|index\.)/.test(response.url()))
      diagnostics.push(`HTTP ${response.status()}: ${response.url()}`);
  });

  // FAQ avoids doing a large full-type ranking as the initial page loads.
  const start = new URL(url);
  start.search = '?faq';
  const response = await page.goto(start.toString(), {waitUntil: 'domcontentloaded', timeout: 60000});
  if (!response || response.status() >= 400) throw new Error(`${url}: home page HTTP ${response?.status()}`);
  await page.waitForFunction(() => {
    return typeof jb_pkm !== 'undefined' && Array.isArray(jb_pkm) && jb_pkm.length > 100 &&
      typeof jb_fm !== 'undefined' && Array.isArray(jb_fm) && jb_fm.length > 0 &&
      typeof jb_cm !== 'undefined' && Array.isArray(jb_cm) && jb_cm.length > 0 &&
      typeof jb_spec !== 'undefined' && Array.isArray(jb_spec) &&
      loading_val === LOADING_MAX_VAL &&
      typeof translationMap !== 'undefined' && translationMap?.pokedata &&
      typeof fallbackMap !== 'undefined' && fallbackMap?.pokedata &&
      typeof GetStrongestVersus === 'function' && typeof GetEnemyParams === 'function';
  }, null, {timeout: 120000});

  const actual = await page.evaluate(async (bosses) => {
    // Fix the agreed model inputs. These are browser-side variables from DialgaDex.
    // This baseline intentionally does NOT add L52 normalization for all Megas.
    settings_metric = 'eDPS';
    settings_default_level = [50];
    settings_xl_budget = false;
    settings_supermega_level = 4;
    settings_team_size_normal = 6;
    settings_team_size_mega = 6;
    settings_relobbytime = 10;
    settings_party_size = 1; // no party power
    settings_type_affinity = true;
    settings_newdps = true;
    settings_pve_turns = true;
    // Compare identical current data on both sites; the fork now excludes preview
    // data from current-only rankings while upstream does not enforce that policy.
    if (settings_speculative) PatchSpeculative(false);
    settings_speculative = false;

    const input = {
      metric: settings_metric, level: settings_default_level[0],
      megaLevel: settings_supermega_level, normalTeam: settings_team_size_normal,
      megaTeam: settings_team_size_mega, relobbySeconds: settings_relobbytime,
      partyPower: settings_party_size, typeAffinity: settings_type_affinity,
      newDps: settings_newdps, pveTurns: settings_pve_turns,
      speculative: settings_speculative,
      mixed: true, offType: true, elite: true,
      shadow: true, mega: true, unreleased: false,
    };
    const dataJson = JSON.stringify([jb_pkm, jb_fm, jb_cm, jb_spec]);
    const dataCounts = {pokemonForms: jb_pkm.length, fastMoves: jb_fm.length, chargedMoves: jb_cm.length};
    const results = [];
    const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const test of bosses) {
      const allForms = jb_pkm.filter(p => p.id === test.id);
      const boss = allForms.find(p => normalize(p.form) === test.wantedForm);
      if (!boss) {
        results.push({boss: test.name, error: `Boss form not found. Available: ${allForms.map(p => p.form).join(', ')}`});
        continue;
      }
      const search = {
        ...GetDefaultSearchParams(), type: 'Any', versus: false,
        unreleased: false, mega: true, shadow: true, legendary: true,
        elite: true, mixed: true, offtype: true, suboptimal: false,
        real_damage: true,
      };
      // DialgaDex returns ascending strength; reverse before selecting counters.
      const all = (await GetStrongestVersus(GetEnemyParams(boss), search)).reverse();
      const summarize = p => {
        if (![p.rat, p.dps, p.tdo].every(Number.isFinite) || p.rat <= 0)
          throw new Error(`Invalid counter rating for ${test.name}: ${p.name} ${p.form}`);
        return {
          pokemonId: p.id,
          pokemon: p.name,
          form: p.form || '',
          shadow: Boolean(p.shadow),
          fastMove: p.fm,
          chargedMove: p.cm,
          level: p.level,
          eDps: p.rat,
          dps: p.dps,
          tdo: p.tdo,
        };
      };
      const top = all.slice(0, 15).map(summarize);
      // Include every released Mega/Primal, even those outside the overall top 15.
      const megas = all.filter(p => /^(mega|primal)/i.test(p.form)).map(summarize);
      if (top.length !== 15 || megas.length === 0)
        throw new Error(`Incomplete counters for ${test.name}: ${top.length} top, ${megas.length} Mega/Primal`);
      results.push({boss: test.name, bossForm: boss.form, counterCount: all.length, top, megas});
    }
    return {input, dataCounts, sourceDataJson: dataJson, results};
  }, cases);

  const dataHash = hash(actual.sourceDataJson);
  delete actual.sourceDataJson; // Don't emit huge datasets into results file.
  await page.close();
  return {...actual, dataHash, diagnostics};
}

function verify(original, copy) {
  const errors = [];
  if (original.dataHash !== copy.dataHash)
    errors.push('Loaded Pokémon/move data differ (the websites may have loaded different data versions).');
  if (JSON.stringify(original.input) !== JSON.stringify(copy.input))
    errors.push('Calculation settings differ.');
  for (let i = 0; i < cases.length; i++) {
    const a = original.results[i], b = copy.results[i];
    if (a?.error || b?.error) {
      errors.push(`${cases[i].name}: boss missing or unsupported: ${a?.error || ''} ${b?.error || ''}`);
      continue;
    }
    if (JSON.stringify(a) !== JSON.stringify(b))
      errors.push(`${cases[i].name}: counters/movesets/eDPS differ.`);
  }
  for (const [label, snapshot] of [['Upstream', original], ['Fork', copy]])
    if (snapshot.diagnostics.length)
      errors.push(label + ' diagnostics: ' + snapshot.diagnostics.join('; '));
  return errors;
}

let browser;
let report = {timestamp: new Date().toISOString(), upstream, fork, passed: false};
try {
  browser = await chromium.launch(launchOptions);
  console.log('Running upstream baseline:', upstream);
  const original = await measure(browser, upstream);
  report.original = original;
  console.log('Running fork baseline:', fork);
  const copy = await measure(browser, fork);
  report.copy = copy;
  const errors = verify(original, copy);
  report = {
    timestamp: new Date().toISOString(), upstream, fork,
    passed: errors.length === 0,
    errors,
    original,
    copy,
  };
  for (const result of original.results)
    console.log(`${result.boss}: ${result.error || (result.top.length + ' top counters and ' + result.megas.length + ' Mega/Primal counters captured')}`);
  console.log(errors.length ? `BASELINE FAILED:\n${errors.map(s => ` - ${s}`).join('\n')}` : 'BASELINE PASSED: all three boss-form matchups identical.');
  console.log('Report: results/baseline-results.json');
  process.exitCode = errors.length ? 1 : 0;
} catch (error) {
  report.errors = [error.stack || String(error)];
  console.error(report.errors[0]);
  process.exitCode = 1;
} finally {
  mkdirSync('results', {recursive: true});
  writeFileSync('results/baseline-results.json', JSON.stringify(report, null, 2) + '\n');
  await browser?.close();
}
