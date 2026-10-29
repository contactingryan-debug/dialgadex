import assert from 'node:assert/strict';
import {chromium,devices} from 'playwright';

const base=process.env.FORK_URL;
if(!base)throw new Error('FORK_URL is required.');
const options={headless:true};
if(process.env.PLAYWRIGHT_PROXY){const proxy=new URL(process.env.PLAYWRIGHT_PROXY);
    options.proxy={server:proxy.protocol+'//'+proxy.host,bypass:'<-loopback>,127.0.0.1,localhost'};}
const browser=await chromium.launch(options);
try {
    const page=await browser.newPage({...devices['iPhone 13'],locale:'en-US',permissions:['clipboard-read','clipboard-write'],
        ignoreHTTPSErrors:process.env.PLAYWRIGHT_IGNORE_HTTPS_ERRORS==='1'});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    const start=new URL(base);start.search='?leaderboard&xl&sort=xl';
    await page.goto(start.toString(),{waitUntil:'domcontentloaded'});
    async function ready(future=false) {
        await page.waitForFunction(future=>typeof raidLeaderboardResult!=='undefined'&&raidLeaderboardResult
            &&raidLeaderboardMatrix?.settings.includeUnreleased===future&&raidLeaderboardMatrix.settings.includeMegas,
            future,{timeout:240000});
    }
    async function fits() {assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'XL view overflows.');}
    await ready();
    assert.equal(await page.locator('#raid-megas').isChecked(),true);
    assert.equal(await page.locator('#raid-xl-only').isChecked(),true);
    assert(await page.locator('.raid-entry').count()>0);
    const verified=await page.evaluate(()=>{
        let matches=0;
        for(const row of raidLeaderboardResult.rows) {
            const expected=row.matchups.reduce((sum,m)=>sum+(m.xl?.eligible&&m.ratio>=.95-1e-9?raidLeaderboardResult.weights[m.bossIndex]:0),0);
            if(Math.abs(row.xlCoverage-expected)>1e-10)throw new Error('XL coverage weighting differs.');
            for(const m of row.matchups.filter(m=>m.xl?.eligible)) {
                const encounter=raidLeaderboardMatrix.bosses[m.bossIndex].catch;
                if(!m.xl.matchedTypes.length||m.xl.matchedTypes.some(t=>!encounter.types.includes(t)||!row.xlProfile.types.includes(t)))
                    throw new Error('XL type intersection differs.');
                matches++;
            }
        }
        for(const [id,form,types] of [[888,'Crowned_sword',['Fairy']],[889,'Crowned_shield',['Fighting']],
            [800,'Dawn_wings',['Psychic']],[800,'Dusk_mane',['Psychic']]]) {
            const encounter=raidLeaderboardMatrix.bosses.find(b=>b.id===id&&b.form===form)?.catch;
            if(JSON.stringify(encounter?.types)!==JSON.stringify(types))throw new Error('Incorrect catch typing '+id+'/'+form);
        }
        const visible=[...document.querySelectorAll('.raid-entry')].map(el=>raidLeaderboardResult.rows.find(r=>r.key===el.dataset.key));
        if(visible.some(r=>!(r.xlCoverage>0)))throw new Error('A non-qualifying attacker passed Strong + XL.');
        if(visible.some((r,i)=>i&&r.xlCoverage>visible[i-1].xlCoverage+1e-10))throw new Error('XL sort is incorrect.');
        return {matches,dualAttackers:raidLeaderboardResult.rows.filter(r=>r.xlCoverage>0).length};
    });
    const scores=await page.evaluate(()=>raidLeaderboardResult.rows.map(r=>[r.key,r.points,r.score]));
    await page.locator('.raid-score-options > summary').click();
    await page.locator('#raid-xl-threshold').selectOption('100');
    assert(new URL(page.url()).searchParams.get('xl-min')==='100');
    assert.deepEqual(await page.evaluate(()=>raidLeaderboardResult.rows.map(r=>[r.key,r.points,r.score])),scores);
    await page.locator('#raid-xl-threshold').selectOption('95');
    await page.locator('.raid-entry > summary').first().click();
    await page.locator('.raid-breakdown .raid-matchup').first().waitFor();
    assert.match(await page.locator('.raid-breakdown').innerText(),/Strong \+ XL:.*weighted raids/);
    assert.match(await page.locator('.raid-breakdown').innerText(),/Catch:/);
    for(const width of [320,390,900]){await page.setViewportSize({width,height:844});await fits();}
    // Mewtwo has both strong and weak compatible Megas. Capture the full native
    // result so XL-only percentages can be checked against the unfiltered pool.
    await page.evaluate(()=>{
        const render=ProcessAndSetCountersFromArray;
        window.counterRenders=0;
        ProcessAndSetCountersFromArray=function(counters,...args){
            window.counterInputs=counters;
            render(counters,...args);window.counterRenders++;
        };
        SetXLStrongThreshold(100);
        LoadPokedexAndUpdateURL(GetPokeDexMon(150,'Normal'));
    });
    await page.waitForFunction(()=>window.counterRenders>0&&!document.querySelector('#counters-loading'),null,{timeout:120000});
    assert.equal(await page.locator('#counters-xl-threshold').count(),0);
    assert.match(await page.locator('.counters-xl-controls').innerText(),/XL boosting options only/);
    assert.equal(await page.locator('#counters-hide-non-xl').isChecked(),false);
    async function setCounterFilter(selector,checked) {
        const before=await page.evaluate(()=>window.counterRenders);
        await page.locator(selector).setChecked(checked);
        await page.waitForFunction(n=>window.counterRenders>n&&!document.querySelector('#counters-loading'),before,{timeout:120000});
    }
    async function checkXLCounters(mode='only') {
        const expected=await page.evaluate(mode=>{
            const all=[...window.counterInputs].reverse();
            const reference=all.find(p=>!IsMegaPrimalUltraForm(p)).rat;
            const baseline=GetComparisonMon(all);
            if(baseline!==reference)throw new Error('Best must use the non-Mega reference before XL filtering.');
            const groups=new Map();
            const filtered=all.filter(p=>mode==='only' ? p._catchXL?.eligible===true
                : mode==='mixed' ? !IsMegaPrimalUltraForm(p)||p._catchXL?.eligible===true : true);
            for(const p of filtered) {
                const key=GetUniqueIdentifier(p,false,false);
                if(!groups.has(key))groups.set(key,[]);
                groups.get(key).push(p);
            }
            const visible=[...groups.values()].slice(0,10).flatMap(group=>group.slice(0,3)
                .filter((p,i)=>i===0||p.rat/baseline>=.7));
            return {percentages:visible.map(p=>Number((100*p.rat/baseline).toFixed(0))),
                badges:visible.filter(p=>p._catchXL?.eligible===true).length,
                ordinary:visible.filter(p=>!IsMegaPrimalUltraForm(p)).length,
                hasNonXLTransforms:all.some(p=>IsMegaPrimalUltraForm(p)&&p._catchXL?.eligible!==true)};
        },mode);
        const actual=await page.locator('#counters-grid .counters-rat-row td:first-child b')
            .evaluateAll(elements=>elements.map(el=>Number(el.textContent)));
        assert.deepEqual(actual,expected.percentages,'XL filtering must preserve native metric ordering and the full-pool baseline.');
        if(mode==='only')assert(actual.some(p=>p<95),'Compatible options below the former strength threshold must remain visible.');
        if(mode==='mixed'){assert(expected.ordinary>0,'The mixed filter must keep regular counters.');assert(expected.hasNonXLTransforms);}
        assert.equal(await page.locator('#counters-grid .xl-badge').count(),expected.badges);
        return actual;
    }
    const allCounters=await checkXLCounters('all');
    await setCounterFilter('#counters-hide-non-xl',true);
    await checkXLCounters('mixed');
    for(const width of [320,390,900]){await page.setViewportSize({width,height:844});await fits();}
    await setCounterFilter('#counters-hide-non-xl',false);
    assert.deepEqual(await checkXLCounters('all'),allCounters,'Clearing the filter must restore the original counters.');
    await setCounterFilter('#counters-hide-non-xl',true);
    await setCounterFilter('#counters-xl-only',true);
    const bothFilters=await checkXLCounters();
    await setCounterFilter('#counters-hide-non-xl',false);
    assert.deepEqual(await checkXLCounters(),bothFilters,'XL-only must take precedence when both filters are selected.');
    // The leaderboard threshold has no effect here, and DPS remains the selected metric.
    const beforeDPS=await page.evaluate(()=>{const n=window.counterRenders;SetMetric('DPS');return n;});
    await page.waitForFunction(n=>window.counterRenders>n&&!document.querySelector('#counters-loading'),beforeDPS,{timeout:120000});
    const dpsCounters=await checkXLCounters();
    await page.evaluate(async()=>{SetXLStrongThreshold(90);ResetPokedexCounters();await LoadPokedexCounters();});
    assert.deepEqual(await checkXLCounters(),dpsCounters);
    assert.equal(await page.evaluate(()=>settings_metric),'DPS');
    assert.match(await page.locator('#counters-catch-note').innerText(),/Catch:/);await fits();
    // The same Best option is used in typed Attackers and Counters rankings.
    let megaAbove100=false;
    for(const versus of [false,true]) {
        const baseline=await page.evaluate(async versus=>{
            await LoadStrongestAndUpdateURL('Psychic',versus);
            const reference=str_pokemons.find(p=>!IsMegaPrimalUltraForm(p));
            return {reference:reference.pct,megaAbove100:str_pokemons.some(p=>IsMegaPrimalUltraForm(p)&&p.pct>100),
                correct:str_pokemons.every(p=>Math.abs(p.pct-100*p.rat/reference.rat)<1e-9)};
        },versus);
        assert.equal(baseline.reference,100);assert(baseline.correct);
        megaAbove100 ||= baseline.megaAbove100;
    }
    assert(megaAbove100,'Mega percentages must be allowed to exceed the best non-Mega reference.');
    assert.match(await page.locator('#cmp-top').innerText(),/Best non-Mega/);
    await page.evaluate(()=>{SetXLStrongThreshold(95);settings_metric='eDPS';});
    await page.evaluate(()=>{SetIncludeUnreleased(true);return LoadDataAuditAndUpdateURL('800 Ultra');});
    await page.locator('#audit-quality').selectOption('xl');
    const ultra=page.locator('.audit-entry[data-key="800/Ultra"]');
    await ultra.locator('summary').click();await ultra.locator('.audit-copy').waitFor();
    assert.match(await ultra.innerText(),/Dragon \/ Psychic/);assert.match(await ultra.innerText(),/User-approved assumption/);
    assert.match(await ultra.innerText(),/Unconfirmed encounter/);
    await ultra.locator('.audit-copy').click();await ultra.locator('.audit-copy-status').filter({hasText:'Copied'}).waitFor();
    const copied=await page.evaluate(()=>navigator.clipboard.readText());
    assert.match(copied,/Catch XL boost profile:.*Dragon.*Psychic.*projected/);
    assert.match(copied,/Raid catch mapping:.*unknown/);
    assert(await page.evaluate(()=>!GetPokemonAuditInfo(800,'Ultra',BuildPokemonAuditContext()).attackerIncluded));
    await page.setViewportSize({width:320,height:740});await fits();
    await page.locator('#audit-quality').selectOption('catch-unknown');
    assert(await page.locator('.audit-entry').count()>0);
    await page.evaluate(()=>LoadRaidLeaderboardAndUpdateURL());await ready(true);
    // Level changes alter XL eligibility without rewriting the battle-point formula.
    const levelState=await page.evaluate(async()=>{
        SetXLStrongThreshold(95);raidLeaderboardState.xlThreshold=95;
        const before=raidLeaderboardResult.rows.map(r=>[r.key,r.points,r.score]);
        for(const row of raidLeaderboardMatrix.attackers)for(const m of row.matchups)
            m.xl=GetCatchXLMatch(row.xlProfile,raidLeaderboardMatrix.bosses[m.bossIndex].catch,1,true);
        RefreshRaidLeaderboardScores();
        return {before,after:raidLeaderboardResult.rows.map(r=>[r.key,r.points,r.score]),
            qualifying:raidLeaderboardResult.rows.filter(r=>r.xlCoverage>0).length};
    });
    assert.deepEqual(levelState.after,levelState.before);assert.equal(levelState.qualifying,0);
    await page.reload();
    await page.waitForFunction(()=>document.querySelector('#raid-xl-threshold'),null,{timeout:120000});
    await page.evaluate(()=>LoadFAQAndUpdateURL());
    assert.deepEqual(errors,[]);
    console.log('Catch mappings, weighted XL coverage, filters, thresholds, counter badges, Ultra audit/copy and mobile:',JSON.stringify(verified));
} finally {await browser.close();}
