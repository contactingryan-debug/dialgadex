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
    // Use a qualifying matchup from the real matrix to exercise the native counter list.
    await page.locator('.raid-breakdown .raid-boss-link').first().click();
    await page.locator('#counters-grid .counters-rat-row').first().waitFor({timeout:120000});
    await page.locator('#counters-xl-only').check();
    await page.waitForFunction(()=>!document.querySelector('#counters-loading'),null,{timeout:120000});
    assert(await page.locator('#counters-grid .xl-badge').count()>0);
    assert(await page.locator('#counters-grid .counters-rat-row td:first-child b').evaluateAll(elements=>
        elements.every(el=>Number(el.textContent)>=95)),'Strong + XL percentages must use the non-Mega eDPS reference.');
    assert(await page.evaluate(()=>[...document.querySelectorAll('#counters-grid .xl-badge')].every(el=>el.textContent.startsWith('XL'))));
    assert.match(await page.locator('#counters-catch-note').innerText(),/Catch:/);await fits();
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
