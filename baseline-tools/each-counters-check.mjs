import assert from 'node:assert/strict';
import {chromium, devices} from 'playwright';

const base = process.env.FORK_URL;
if (!base) throw new Error('FORK_URL is required.');
const options = {headless: true};
if (process.env.PLAYWRIGHT_PROXY) {
  const u = new URL(process.env.PLAYWRIGHT_PROXY);
  options.proxy = {server: `${u.protocol}//${u.host}`, bypass: '<-loopback>,127.0.0.1,localhost'};
}

const browser = await chromium.launch(options);
try {
  const context = await browser.newContext({
    ...devices['iPhone 13'],
    locale: 'en-US',
    ignoreHTTPSErrors: process.env.PLAYWRIGHT_IGNORE_HTTPS_ERRORS === '1',
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.rankingLoads = 0;
    document.addEventListener('DOMContentLoaded', () => {
      const load = window.LoadStrongest;
      window.LoadStrongest = async function () {
        const n = ++window.rankingLoads;
        const result = await load.apply(this, arguments);
        window.completedRanking = n;
        return result;
      };
    }, {once: true});
  });
  const start = new URL(base);
  start.search = '?strongest&t=Each&v';
  await page.goto(start.toString(), {waitUntil: 'domcontentloaded'});
  await page.waitForFunction(() => window.completedRanking, null, {timeout: 120000});

  async function expectEach(counters) {
    assert.equal(await page.locator('#chk-versus').isEnabled(), true);
    assert.equal(await page.locator('#chk-versus').isChecked(), counters);
    assert.equal(new URL(page.url()).searchParams.has('v'), counters);
    assert.equal(await page.evaluate(() => str_pokemons.length), 18);
    assert.equal(await page.evaluate(() => document.querySelector('#strongest-links-types').selectedType), 'Each');
    assert.equal(await page.locator('#footnote-each-counters').isVisible(), counters);
    assert.equal(await page.title(), counters
      ? 'Best Counters against Each Type - DialgaDex'
      : 'Best Attackers of Each type - DialgaDex');
    const layout = await page.evaluate(() => ({
      labelFont: parseFloat(getComputedStyle(document.querySelector('.floating-label')).fontSize),
      labelWidth: document.querySelector('.floating-label').clientWidth,
      labelContentWidth: document.querySelector('.floating-label').scrollWidth,
      renderedHeights: [...document.querySelectorAll('#strongest-table tbody tr:not(#pad):not(#pad-btm)')]
        .map(row => row.getBoundingClientRect().height),
      virtualRowHeight: ROW_HEIGHT,
      labelsAligned: [...document.querySelectorAll('.floating-label')].every(label => {
        const type = tier_stops.find(tier => TranslatedTypeName(tier.type) === label.textContent);
        return type && Math.abs(parseFloat(label.style.top) - type.start * ROW_HEIGHT) < 1;
      }),
      scrollWidth: document.querySelector('#strongest-scroller').scrollWidth,
      viewportWidth: document.querySelector('#strongest-scroller').clientWidth,
    }));
    assert(layout.labelFont > 0, 'Defending-type labels must remain readable on a phone.');
    assert(layout.labelWidth >= layout.labelContentWidth, 'Type labels must fit their column.');
    assert(layout.renderedHeights.every(height => Math.abs(height - layout.virtualRowHeight) < 1),
      'Actual row heights must match the scrolling calculation.');
    assert(layout.labelsAligned, 'Defending-type labels must align with their rows.');
    assert(layout.scrollWidth <= layout.viewportWidth + 1, 'The phone summary must fit horizontally.');
  }
  await expectEach(true);
  await page.locator('#strongest-scroller').evaluate(element => { element.scrollTop = element.scrollHeight; });
  await page.waitForFunction(() => [...document.querySelectorAll('.floating-label')].some(label => label.textContent === 'Fairy'));
  await expectEach(true);
  await page.locator('#strongest-scroller').evaluate(element => { element.scrollTop = 0; });
  await page.waitForFunction(() => [...document.querySelectorAll('.floating-label')].some(label => label.textContent === 'Normal'));
  if (process.env.EACH_COUNTERS_SCREENSHOT)
    await page.screenshot({path: process.env.EACH_COUNTERS_SCREENSHOT, fullPage: true});

  const checks = await page.evaluate(async () => {
    const fields = p => [p.id, p.form, p.shadow, p.level, p.fm, p.cm, p.rat, p.dps, p.tdo];
    const profiles = [
      {name: 'Type Affinity on', affinity: true, mixed: true, offtype: true},
      {name: 'Type Affinity off', affinity: false, mixed: true, offtype: true},
      {name: 'Matching move types', affinity: true, mixed: false, offtype: false},
      {name: 'Unreleased attackers and bosses', affinity: true, mixed: true, offtype: true, unreleased: true},
    ];
    const results = [];
    for (const profile of profiles) {
      settings_type_affinity = profile.affinity;
      const search = {...GetDefaultSearchParams(), type: 'Each', versus: true,
        mixed: profile.mixed, offtype: profile.offtype, unreleased:!!profile.unreleased, real_damage: false};
      const before = JSON.stringify(search);
      const summary = await GetStrongestOfEachType(search);
      if (JSON.stringify(search) !== before) throw new Error('Each type mutated its input parameters.');
      if (summary.length !== POKEMON_TYPES.size) throw new Error('Incomplete Each type results.');
      let i = 0;
      for (const type of POKEMON_TYPES) {
        const individual = (await GetStrongestOfOneType({...search, type}))[0];
        if (JSON.stringify(fields(summary[i])) !== JSON.stringify(fields(individual)))
          throw new Error(`${profile.name}: ${type} differs from the individual Counters page.`);
        i++;
      }
      results.push({profile: profile.name, matchingTypes: i});
    }
    settings_type_affinity = true;
    return results;
  });
  console.log('Counter summary parity:', JSON.stringify(checks));

  async function transition(action) {
    const previous = await page.evaluate(() => window.rankingLoads);
    await action();
    await page.waitForFunction(n => window.completedRanking > n, previous, {timeout: 120000});
  }
  await transition(() => page.locator('#strongest-vs-lbl').tap());
  await expectEach(false);
  await transition(() => page.locator('#strongest-vs-lbl').tap());
  await expectEach(true);
  await page.reload();
  await page.waitForFunction(() => window.completedRanking, null, {timeout: 120000});
  await expectEach(true);
  await transition(() => page.locator('#strongest-links-types a[data-type="Fire"]').tap());
  assert.equal(await page.locator('#chk-versus').isChecked(), true);
  await transition(() => page.goBack());
  await expectEach(true);
  await transition(() => page.locator('#strongest-links-types a[data-type="Any"]').tap());
  assert.equal(await page.locator('#chk-versus').isDisabled(), true);
  await transition(() => page.locator('#strongest-links-types a[data-type="Each"]').tap());
  await expectEach(true);
  assert.deepEqual(errors, []);
  console.log('Each type mode toggle, direct URL, reload, Back, and All types detour passed.');
} finally {
  await browser.close();
}
