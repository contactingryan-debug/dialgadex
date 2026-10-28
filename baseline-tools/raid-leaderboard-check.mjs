import assert from 'node:assert/strict';
import {chromium, devices} from 'playwright';

const base = process.env.FORK_URL;
if (!base) throw new Error('FORK_URL is required.');
const options = {headless: true};
if (process.env.PLAYWRIGHT_PROXY) {
    const url = new URL(process.env.PLAYWRIGHT_PROXY);
    options.proxy = {server: url.protocol + '//' + url.host, bypass: '<-loopback>,127.0.0.1,localhost'};
}
const browser = await chromium.launch(options);
try {
    const page = await browser.newPage({...devices['iPhone 13'], locale: 'en-US',
        ignoreHTTPSErrors: process.env.PLAYWRIGHT_IGNORE_HTTPS_ERRORS === '1'});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
        document.addEventListener('DOMContentLoaded', () => {
            const original = window.GetRaidLeaderboardSnapshot;
            window.GetRaidLeaderboardSnapshot = function() {
                window.raidOriginalData = JSON.stringify([jb_pkm, jb_fm, jb_cm]);
                return original();
            };
        }, {once: true});
    });
    const start = new URL(base);
    start.search = '?leaderboard';
    await page.goto(start.toString(), {waitUntil: 'domcontentloaded'});
    async function ready() {
        await page.waitForFunction(() => typeof raidLeaderboardResult !== 'undefined' && raidLeaderboardResult,
            null, {timeout: 180000});
    }
    await ready();
    assert.equal(await page.title(), 'Raid Attacker Leaderboard - DialgaDex');
    assert(await page.locator('.raid-entry').count() > 10);
    assert.equal(await page.locator('#raid-floor').inputValue(), '80');
    assert.equal(await page.locator('#raid-weighting').inputValue(), 'groups');
    const parity = await page.evaluate(async () => {
        if (JSON.stringify([jb_pkm, jb_fm, jb_cm]) !== window.raidOriginalData)
            throw new Error('The worker changed main-page Pokémon or move data.');
        const snapshot = GetRaidLeaderboardSnapshot();
        const before = JSON.stringify([jb_pkm, jb_fm, jb_cm]);
        const preview = settings_speculative;
        const originalPokemon = jb_pkm;
        const checks = raidLeaderboardResult.rows.slice(0, 12);
        const hp = raidLeaderboardResult.rows.find(row => row.id === 486 && row.shadow);
        if (!hp?.hiddenPowerType) throw new Error('Missing a fixed Hidden Power build.');
        checks.push(hp);
        let benchmarks = 0, movesets = 0;
        try {
            jb_pkm = snapshot.pokemon;
            const search = {...GetDefaultSearchParams(), type:'Any', mega:false, real_damage:true};
            for (const [bossIndex, boss] of raidLeaderboardMatrix.bosses.entries()) {
                const pokemon = jb_pkm.find(p => p.id === boss.id && p.form === boss.form);
                if (!pokemon?.released || pokemon.raid_tier < 4) throw new Error('Invalid boss pool.');
                const enemy = GetEnemyParams(pokemon);
                const best = (await GetStrongestVersus(enemy, search)).at(-1);
                if (Math.abs(best.rat - boss.bestEdps) > 1e-8)
                    throw new Error('Non-Mega benchmark differs for ' + boss.name + '/' + boss.form);
                benchmarks++;
                for (const row of checks) {
                    const recorded = row.matchups.find(matchup => matchup.bossIndex === bossIndex);
                    if (!recorded) continue;
                    let attacker = jb_pkm.find(p => p.id === row.id && p.form === row.form);
                    if (row.hiddenPowerType) {
                        const fixed = moves => (moves || []).map(move => move === 'Hidden Power'
                            ? move + ' ' + row.hiddenPowerType : move);
                        attacker = {...attacker, fm:fixed(attacker.fm), elite_fm:fixed(attacker.elite_fm)};
                        if (recorded.fm.startsWith('Hidden Power') && recorded.fm !== 'Hidden Power ' + row.hiddenPowerType)
                            throw new Error('An incompatible Hidden Power type earned points.');
                    }
                    const native = GetStrongestAgainstSpecificEnemy(attacker, row.shadow, row.level, enemy, search).at(-1);
                    if (Math.abs(native.rat - recorded.edps) > 1e-8 || native.fm !== recorded.fm || native.cm !== recorded.cm)
                        throw new Error('Worker moveset/eDPS differs from native: ' + row.name + ' vs ' + boss.name);
                    movesets++;
                }
            }
        } finally { jb_pkm = originalPokemon; }
        if (settings_speculative !== preview || JSON.stringify([jb_pkm, jb_fm, jb_cm]) !== before)
            throw new Error('Released-data calculation changed the main page.');
        if (raidLeaderboardMatrix.attackers.some(p => /^(Mega|Primal)/i.test(p.form) || /^(Mega |Primal )/.test(p.name)))
            throw new Error('Mega/Primal attacker in the non-Mega pool.');
        return {bosses:benchmarks, checkedMovesets:movesets, fixedHiddenPower:hp.hiddenPowerType,
            leader:raidLeaderboardResult.rows[0].name};
    });
    console.log('Native engine parity:', JSON.stringify(parity));

    await page.locator('.raid-entry > summary').first().tap();
    await page.locator('.raid-breakdown .raid-matchup').first().waitFor();
    const breakdown = await page.evaluate(() => {
        const row = raidLeaderboardResult.rows[0];
        const shown = document.querySelectorAll('.raid-breakdown .raid-matchup').length;
        return {shown, expected:row.matchups.filter(m => m.points > 1e-10).length,
            sum:row.matchups.reduce((sum, m) => sum + m.weightedPoints, 0), total:row.points};
    });
    assert.equal(breakdown.shown, breakdown.expected);
    assert(Math.abs(breakdown.sum - breakdown.total) < 1e-8);
    async function fits() {
        const size = await page.evaluate(() => ({scroll:document.documentElement.scrollWidth, width:innerWidth}));
        assert(size.scroll <= size.width + 1, 'The mobile page must fit horizontally.');
    }
    await fits();
    if (process.env.RAID_LEADERBOARD_SCREENSHOT) {
        await page.locator('.raid-entry > summary').first().tap();
        await page.screenshot({path:process.env.RAID_LEADERBOARD_SCREENSHOT, fullPage:false});
    }
    await page.locator('#raid-search').fill('Regigigas');
    await page.locator('.raid-entry > summary').first().tap();
    await page.locator('.raid-fixed-note').waitFor();
    assert.match(await page.locator('.raid-fixed-note').textContent(), /one fixed Hidden Power/);
    await page.locator('#raid-search').fill('Kyurem');
    assert.equal(await page.locator('.raid-entry').count(), 2);
    await page.locator('#raid-search').fill('no such pokemon xyz');
    assert.equal(await page.locator('#raid-empty').isVisible(), true);
    await page.locator('#raid-search').fill('');
    const originalScores = await page.evaluate(() => raidLeaderboardResult.rows.map(row => [row.key,row.score]));
    await page.locator('#raid-shadows').uncheck();
    assert.equal(await page.locator('.raid-entry .shadow-text').count(), 0);
    assert.deepEqual(await page.evaluate(() => raidLeaderboardResult.rows.map(row => [row.key,row.score])), originalScores);
    await page.locator('#raid-shadows').check();
    await page.locator('.raid-score-options > summary').tap();
    await page.locator('#raid-floor').selectOption('90');
    assert.equal(new URL(page.url()).searchParams.get('floor'), '90');
    assert.equal(await page.evaluate(() => raidLeaderboardResult.floor), 90);
    await page.locator('#raid-weighting').selectOption('forms');
    assert.equal(new URL(page.url()).searchParams.get('weight'), 'forms');
    await page.reload();
    await ready();
    assert.equal(await page.locator('#raid-floor').inputValue(), '90');
    assert.equal(await page.locator('#raid-weighting').inputValue(), 'forms');
    await page.locator('#raid-more').tap();
    assert(await page.locator('.raid-entry').count() > 25);
    await page.locator('#raid-column-headings button[data-sort="first"]').tap();
    const firstCounts = await page.locator('.raid-entry > summary > :nth-child(4)').allTextContents();
    assert(firstCounts.map(Number).every((n,i,a) => i === 0 || a[i-1] >= n));
    await page.setViewportSize({width:320,height:740});
    await fits();
    await page.setViewportSize({width:900,height:900});
    await fits();
    await page.locator('#raid-rankings-back').click();
    await page.waitForFunction(() => document.querySelector('#strongest')?.checkVisibility());
    await page.locator('#strongest-raid-link').click();
    await ready();
    await page.goBack();
    await page.waitForFunction(() => document.querySelector('#strongest')?.checkVisibility());
    await page.goForward();
    await ready();
    const currentPool = await page.evaluate(() => ({bosses:raidLeaderboardResult.bossCount,
        attackers:raidLeaderboardMatrix.attackers.length}));
    const availability = await page.evaluate(() => {
        const current = GetCalculationPokemon(false);
        const upcoming = GetCalculationPokemon(true);
        const currentBosses = GetRaidBosses();
        const upcomingBosses = GetRaidBosses(null, null, true);
        return {currentBosses:currentBosses.length, upcomingBosses:upcomingBosses.length,
            releasedOnly:currentBosses.every(p=>p.released),
            futureBosses:upcomingBosses.filter(p=>!current.some(c=>c.id===p.id&&c.form===p.form&&c.released)).length,
            previewPromotions:upcoming.filter(p=>p.released&&current.some(c=>c.id===p.id&&c.form===p.form&&!c.released)).length};
    });
    assert.equal(availability.currentBosses,currentPool.bosses);
    assert(availability.releasedOnly && availability.futureBosses > 0);
    await page.locator('#raid-unreleased').check();
    await page.waitForFunction(() => (raidLeaderboardResult && raidLeaderboardMatrix?.settings.includeUnreleased)
            || document.querySelector('#raid-retry:not([hidden])'),
        null,{timeout:240000});
    assert.equal(await page.locator('#raid-retry').isVisible(),false,await page.locator('#raid-status').textContent());
    assert(new URL(page.url()).searchParams.has('unreleased'));
    const futurePool = await page.evaluate(() => ({bosses:raidLeaderboardResult.bossCount,
        attackers:raidLeaderboardMatrix.attackers.length, shared:GetIncludeUnreleased(),
        containsFutureAttackers:raidLeaderboardMatrix.attackers.some(p=>
            !GetCalculationPokemon(false).some(c=>c.id===p.id&&c.form===p.form&&c.released))}));
    assert.equal(futurePool.bosses,availability.upcomingBosses);
    assert(futurePool.attackers>currentPool.attackers && futurePool.containsFutureAttackers && futurePool.shared);
    assert(await page.evaluate(()=>raidLeaderboardMatrix.attackers.some(p=>p.id===890&&p.form==='Normal')),
        'Regular Eternatus must remain in the investment pool.');
    assert(!await page.evaluate(()=>raidLeaderboardMatrix.attackers.some(p=>p.id===890&&p.form==='Eternamax')),
        'The Max Battle boss must not enter the investment pool.');
    await page.setViewportSize({width:320,height:740});
    await fits();
    await page.locator('#raid-rankings-back').click();
    await page.waitForFunction(() => document.querySelector('#strongest')?.checkVisibility());
    assert.equal(await page.evaluate(() => GetSearchParms('Any',false).unreleased),true);
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#strongest')?.checkVisibility());
    assert.equal(await page.evaluate(() => GetIncludeUnreleased()),true);
    await page.evaluate(() => $("#filter-settings input[value='unreleased']").prop('checked',false).trigger('change'));
    assert.equal(await page.evaluate(() => GetIncludeUnreleased()),false);
    await page.waitForFunction(() => document.querySelector('#strongest')?.checkVisibility());
    console.log('Release filter across both pools, navigation and reload:',JSON.stringify({currentPool,futurePool,availability}));
    await page.evaluate(() => { raidLeaderboardCache = null; });
    await page.evaluate(() => { LoadRaidLeaderboardAndUpdateURL(); });
    await page.waitForFunction(() => raidLeaderboardWorker !== null);
    await page.evaluate(() => LoadFAQAndUpdateURL());
    await page.waitForFunction(() => document.querySelector('#faq')?.checkVisibility());
    assert.equal(await page.evaluate(() => raidLeaderboardWorker), null);
    await page.waitForTimeout(100);
    assert.equal(await page.locator('#raid-leaderboard').isVisible(), false);
    assert.deepEqual(errors, []);
    console.log('Direct URL, fixed-build breakdown, search, scoring controls, stable display filters, mobile fit, history and cancellation passed.');
} finally { await browser.close(); }
