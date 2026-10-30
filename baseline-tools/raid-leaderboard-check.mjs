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
    start.search = '';
    await page.goto(start.toString(), {waitUntil: 'domcontentloaded'});
    async function ready() {
        await page.waitForFunction(() => typeof raidLeaderboardResult !== 'undefined' && raidLeaderboardResult,
            null, {timeout: 180000});
    }
    async function openFilters() {
        if(!await page.locator('#raid-filter-drawer').evaluate(el=>el.open))
            await page.locator('#raid-filter-trigger').click();
    }
    async function checkTierBands() {
        await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
        const valid=await page.locator('.raid-tier-group').evaluateAll(groups=>groups.every((group,index)=>{
            const tier=group.dataset.tier,band=group.querySelector('.raid-tier-band'),label=band.querySelector('.raid-tier-letter');
            const entries=[...group.querySelectorAll('.raid-entry')];
            const bounds=band.getBoundingClientRect(),first=entries[0].getBoundingClientRect(),last=entries.at(-1).getBoundingClientRect();
            const letter=label.getBoundingClientRect();
            const top=Math.max(bounds.top,document.querySelector('header').getBoundingClientRect().bottom,0),bottom=Math.min(bounds.bottom,innerHeight);
            const center=bottom>top?(top+bottom)/2-bounds.top:bounds.height/2;
            const expected=bounds.top+Math.max(letter.height/2,Math.min(bounds.height-letter.height/2,center));
            return band.textContent===tier&&band.querySelectorAll('.raid-tier-letter').length===1
                &&entries.every(entry=>raidLeaderboardTiers.get(entry.dataset.key)===tier&&!entry.querySelector('.raid-tier').textContent)
                &&Math.abs(bounds.top-first.top)<1&&Math.abs(bounds.bottom-last.bottom)<1
                &&Math.abs(letter.top+letter.height/2-expected)<1
                &&(index===0||groups[index-1].dataset.tier!==tier);
        }));
        assert(valid,'A tier must have one continuous band and one centered letter, including expanded rows.');
    }
    await ready();
    assert.equal(await page.title(), 'Raid Attacker Leaderboard - DialgaDex');
    assert(new URL(page.url()).searchParams.has('leaderboard'),'The root URL must open the raid leaderboard.');
    assert(await page.locator('.raid-entry').count() > 10);
    assert.equal(await page.locator('.raid-entry').count(),await page.evaluate(()=>raidLeaderboardResult.rows.length));
    assert.equal(await page.locator('#raid-more').count(),0);
    assert.equal(await page.locator('#raid-loading').isVisible(),false);
    assert.equal(await page.locator('#raid-intro-text').count(),0);
    await page.evaluate(async()=>{const sheet=new Image();sheet.src=ICONS_URL;await sheet.decode();});
    const tierAssignments=await page.evaluate(()=>Array.from(raidLeaderboardTiers));
    assert(await page.locator('.raid-entry').evaluateAll(elements=>elements.every(el=>
        el.querySelector('.raid-tier')&&el.querySelector('.raid-sprite.pokemon-icon')&&el.querySelector('.raid-species'))));
    assert.equal(await page.locator('.raid-entry > summary .raid-species').first().evaluate(el=>getComputedStyle(el).fontWeight),'700');
    assert(await page.locator('.raid-entry .raid-form').evaluateAll(elements=>elements.every(el=>/^\(.+\)$/.test(el.textContent))));
    assert(await page.locator('.raid-entry > summary .raid-form').evaluateAll(elements=>elements.every(el=>
        !/\bForme?\b/.test(el.textContent)&&!el.textContent.includes(el.previousElementSibling.textContent))));
    const labels=await page.locator('.raid-entry').evaluateAll(elements=>elements.map(el=>{
        const row=raidLeaderboardResult.rows.find(r=>r.key===el.dataset.key);
        return {id:row.id,form:row.form,shadow:row.shadow,label:el.querySelector('summary .raid-form')?.textContent};
    }));
    assert.equal(labels.find(row=>row.id===646&&row.form==='White')?.label,'(White)');
    for(const row of labels.filter(row=>row.id===492))assert(!/Hidden Power|Ground|Flying/.test(row.label));
    const regigigas=labels.find(row=>row.id===486&&row.shadow);
    if(regigigas)assert.equal(regigigas.label,'(Ground)');
    await checkTierBands();
    assert.equal(await page.locator('#raid-search,.raid-score-options,#raid-floor,#raid-weighting,#raid-result-count,#raid-data-scope,#raid-settings-summary,#raid-mega-settings').count(),0);
    assert.equal(await page.evaluate(()=>raidLeaderboardState.floor),80);
    assert.equal(await page.evaluate(()=>raidLeaderboardResult.scoring),'elite');
    assert.equal(await page.evaluate(()=>raidLeaderboardResult.floor),95);
    const elite=await page.evaluate(()=>{
        for(const row of raidLeaderboardResult.rows){
            const expected=row.matchups.reduce((sum,m)=>sum+raidLeaderboardResult.weights[m.bossIndex]
                *((m.ratio>=1-1e-9?1:0)+(m.ratio>=.95-1e-9?1:0)),0);
            if(Math.abs(row.points-expected)>1e-9||row.points<=0||row.near<1)
                throw new Error('Incorrect elite points or non-qualifying attacker: '+row.key);
        }
        return {count:raidLeaderboardResult.rows.length,leader:raidLeaderboardResult.rows[0].score};
    });
    assert.equal(elite.leader,100);
    assert.equal(await page.evaluate(()=>raidLeaderboardState.weighting),'groups');
    assert.deepEqual(await page.locator('#nav-drawer .menu a').allTextContents(),
        ['Raid Leaderboard','Type Rankings','Data Audit','Move Data','Type Chart']);
    assert.equal(await page.locator('#raid-filters').isVisible(),false);
    await openFilters();
    assert.equal(await page.locator('#raid-filters input[type="checkbox"]').count(),3);
    assert.equal(await page.locator('#raid-filters .settings-subtitle').innerText(),'Species Filters');
    for(const width of [320,390,900]){
        await page.setViewportSize({width,height:844});await fits();
        assert(await page.locator('#raid-filters').evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1;}),
            'The species filter drawer must fit the screen.');
        assert(await page.locator('#raid-filters .tooltiptext').evaluateAll(elements=>elements.every(el=>{
            const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1;
        })),'Species filter tooltips must fit the screen.');
        if(width===320&&process.env.RAID_LEADERBOARD_SCREENSHOT)
            await page.screenshot({path:process.env.RAID_LEADERBOARD_SCREENSHOT.replace(/\.png$/,'-filters.png')});
    }
    await page.setViewportSize({width:390,height:844});
    await page.locator('#raid-title > span').last().click();
    assert.equal(await page.locator('#raid-filters').isVisible(),false,'Clicking outside must close the drawer.');
    await page.locator('#raid-filter-trigger').focus();
    await page.locator('#raid-filter-trigger').press('Space');
    assert.equal(await page.locator('#raid-filters').isVisible(),true);
    await page.locator('#raid-filter-trigger').press('Escape');
    assert.equal(await page.locator('#raid-filters').isVisible(),false);
    const parity = await page.evaluate(async () => {
        if (JSON.stringify([jb_pkm, jb_fm, jb_cm]) !== window.raidOriginalData)
            throw new Error('The worker changed main-page Pokémon or move data.');
        const snapshot = GetRaidLeaderboardSnapshot();
        const before = JSON.stringify([jb_pkm, jb_fm, jb_cm]);
        const preview = settings_speculative;
        const originalPokemon = jb_pkm;
        const checks = raidLeaderboardResult.rows.slice(0, 12);
        const hp = raidLeaderboardResult.rows.find(row => row.id === 486 && row.shadow)
            || raidLeaderboardMatrix.attackers.find(row=>row.id===486&&row.shadow&&row.hiddenPowerType);
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
    await checkTierBands();
    async function fits() {
        const size = await page.evaluate(() => ({scroll:document.documentElement.scrollWidth, width:innerWidth}));
        assert(size.scroll <= size.width + 1, 'The mobile page must fit horizontally.');
    }
    await fits();
    if (process.env.RAID_LEADERBOARD_SCREENSHOT) {
        await page.locator('.raid-entry > summary').first().tap();
        await page.screenshot({path:process.env.RAID_LEADERBOARD_SCREENSHOT, fullPage:false});
    }
    const hpIndex=await page.locator('.raid-entry').evaluateAll(elements=>elements.findIndex(el=>
        GetRaidLeaderboardHiddenPowerType(raidLeaderboardResult.rows.find(row=>row.key===el.dataset.key))));
    if(hpIndex>=0){
        await page.locator('.raid-entry > summary').nth(hpIndex).tap();
        await page.locator('.raid-fixed-note').waitFor();
        assert.match(await page.locator('.raid-fixed-note').textContent(), /one fixed Hidden Power/);
    }
    const originalScores = await page.evaluate(() => raidLeaderboardResult.rows.map(row => [row.key,row.score]));
    await openFilters();
    await page.locator('#raid-shadows').uncheck();
    assert.equal(await page.locator('.raid-entry .shadow-text').count(), 0);
    assert.deepEqual(await page.evaluate(() => raidLeaderboardResult.rows.map(row => [row.key,row.score])), originalScores);
    await page.locator('#raid-shadows').check();
    await page.locator('#raid-legendaries').uncheck();
    assert(await page.evaluate(()=>[...document.querySelectorAll('.raid-entry')].every(el=>
        !raidLeaderboardResult.rows.find(r=>r.key===el.dataset.key).legendary)));
    assert.deepEqual(await page.evaluate(()=>raidLeaderboardResult.rows.map(row=>[row.key,row.score])),originalScores);
    await page.locator('#raid-legendaries').check();
    assert.deepEqual(await page.evaluate(()=>Array.from(raidLeaderboardTiers)),tierAssignments,
        'Species filters must not change Jenks tiers.');
    await checkTierBands();
    await page.locator('#raid-filter-trigger').click();
    const legacy=new URL(page.url());legacy.searchParams.set('weight','forms');legacy.searchParams.set('floor','70');
    await page.goto(legacy.toString());
    await ready();
    assert.equal(await page.evaluate(()=>raidLeaderboardResult.floor),95);
    assert.equal(await page.evaluate(()=>raidLeaderboardState.floor),80);
    assert.equal(await page.evaluate(()=>raidLeaderboardState.weighting),'groups');
    assert.deepEqual(await page.evaluate(()=>raidLeaderboardResult.rows.map(row=>[row.key,row.score])),originalScores,
        'Legacy scoring options must not alter the fixed equal-group leaderboard.');
    assert.equal(await page.locator('.raid-entry').count(),await page.evaluate(()=>raidLeaderboardResult.rows.length));
    await page.locator('#raid-column-headings button[data-sort="first"]').tap();
    const firstCounts = await page.locator('.raid-first').allTextContents();
    assert(firstCounts.map(Number).every((n,i,a) => i === 0 || a[i-1] >= n));
    await checkTierBands();
    await page.setViewportSize({width:320,height:740});
    await fits();
    await page.setViewportSize({width:900,height:900});
    await fits();
    await page.locator('#raid-rankings-back').click();
    await page.waitForFunction(() => document.querySelector('#strongest')?.checkVisibility());
    assert.equal(await page.locator('#strongest-raid-link').count(),0);
    await page.locator('#header-left').click();
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
    await openFilters();
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
    assert.equal((await page.locator('#filter-settings [data-i18n="filters.species.mega"]').textContent()).trim(),'Mega');
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
    const desktop=await browser.newPage({viewport:{width:1100,height:950},locale:'en-US',
        ignoreHTTPSErrors:process.env.PLAYWRIGHT_IGNORE_HTTPS_ERRORS==='1'});
    desktop.on('pageerror',error=>errors.push(error.message));
    await desktop.goto(base,{waitUntil:'domcontentloaded'});
    await desktop.locator('#raid-filter-trigger').waitFor();
    assert.equal(await desktop.locator('#raid-filters').isVisible(),false);
    await desktop.locator('#raid-filter-trigger').hover();
    await desktop.waitForFunction(()=>document.querySelector('#raid-filter-drawer').open);
    await desktop.locator('#raid-legendaries-label').hover();
    assert.equal(await desktop.locator('#raid-filters').isVisible(),true,'Moving into the popup must keep it open.');
    const font=await desktop.locator('#raid-unreleased-label').evaluate(el=>{
        const css=getComputedStyle(el);return [css.fontFamily,css.fontSize,css.fontWeight];
    });
    if(process.env.RAID_LEADERBOARD_SCREENSHOT)await desktop.screenshot({path:process.env.RAID_LEADERBOARD_SCREENSHOT.replace(/\.png$/,'-desktop.png')});
    await desktop.mouse.move(0,0);
    await desktop.waitForFunction(()=>!document.querySelector('#raid-filter-drawer').open);
    assert.equal(await desktop.locator('#raid-filters').isVisible(),false,'Moving away must close the popup.');
    await desktop.locator('#raid-rankings-back').click();
    await desktop.waitForFunction(()=>document.querySelector('#strongest')?.checkVisibility());
    const typeFont=await desktop.locator('#filter-settings [data-i18n="filters.species.unreleased"]').evaluate(el=>{
        const css=getComputedStyle(el);return [css.fontFamily,css.fontSize,css.fontWeight];
    });
    assert.deepEqual(font,typeFont,'Species filter fonts must match Type Rankings.');
    assert.equal(await desktop.locator('#strongest-raid-link').count(),0);
    await desktop.locator('#header-left').click();
    await desktop.waitForFunction(()=>document.querySelector('#raid-leaderboard')?.checkVisibility());
    const left=await desktop.locator('#raid-rankings-back').boundingBox();
    const right=await desktop.locator('#raid-boss-list').boundingBox();assert(right.x>left.x+left.width);
    await desktop.locator('#raid-boss-list').click();
    assert(new URL(desktop.url()).searchParams.has('leaderboard'));
    await desktop.close();
    assert.deepEqual(errors, []);
    console.log('Home/logo navigation, hover fonts, touch filters, fixed group weights, full lists, breakdowns, mobile fit, history and cancellation passed.');
} finally { await browser.close(); }
