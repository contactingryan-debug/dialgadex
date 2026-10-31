import assert from 'node:assert/strict';
import {chromium,devices} from 'playwright';

const base=process.env.FORK_URL;
if(!base)throw new Error('FORK_URL is required.');
const options={headless:true};
if(process.env.PLAYWRIGHT_PROXY){const proxy=new URL(process.env.PLAYWRIGHT_PROXY);
    options.proxy={server:proxy.protocol+'//'+proxy.host,bypass:'<-loopback>,127.0.0.1,localhost'};}
const browser=await chromium.launch(options);
try {
    const page=await browser.newPage({...devices['iPhone 13'],locale:'en-US',
        ignoreHTTPSErrors:process.env.PLAYWRIGHT_IGNORE_HTTPS_ERRORS==='1'});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(()=>{
        // A session carrying the former automatic off setting receives the new default.
        sessionStorage.setItem('dialgadex-raid-super-max','false');
        window.megaWorkerStarts=0;
        const OriginalWorker=window.Worker;
        window.Worker=class extends OriginalWorker {constructor(...args){super(...args);window.megaWorkerStarts++;}};
    });
    const start=new URL(base);start.search='?leaderboard&megas';
    await page.goto(start.toString(),{waitUntil:'domcontentloaded'});
    async function ready(megas,future=false) {
        await page.waitForFunction(([megas,future])=>typeof raidLeaderboardResult!=='undefined'&&raidLeaderboardResult
            &&raidLeaderboardMatrix?.settings.includeMegas===megas
            &&raidLeaderboardMatrix?.settings.includeUnreleased===future,[megas,future],{timeout:240000});
        assert.equal(await page.locator('#raid-retry').isVisible(),false);
        assert.equal(await page.title(),megas ? 'Raid Mega Leaderboard - DialgaDex' : 'Raid Attacker Leaderboard - DialgaDex');
        const visible=await page.evaluate(()=>[...document.querySelectorAll('.raid-entry')].map((el,index)=>({
            transformed:raidLeaderboardResult.rows.find(r=>r.key===el.dataset.key)?.transformed,
            rank:Number(el.querySelector('.raid-rank').textContent),expectedRank:index+1,
        })));
        assert(visible.length>0);
        assert(visible.every(row=>row.transformed===megas&&row.rank===row.expectedRank),
            'Each leaderboard must contain only its own category and start ranking at one.');
        assert.equal(await page.locator('#raid-xl-only').count(),0);
        assert.equal(await page.locator('#raid-shadows-control').evaluate(el=>el.hidden),megas);
        assert.equal(await page.locator('#raid-super-max-control').evaluate(el=>el.hidden),!megas);
        assert.equal(await page.evaluate(()=>raidLeaderboardResult.scoring),megas?'mega-xl':'elite');
        const expected=await page.evaluate(()=>raidLeaderboardResult.rows.filter(r=>!!r.transformed===!!raidLeaderboardState.includeMegas
            &&(raidLeaderboardState.shadows||!r.shadow)
            &&(raidLeaderboardState.legendaries||!r.legendary)).length);
        assert.equal(visible.length,expected,'Show every scoring attacker.');
        assert.equal(await page.locator('.raid-tier').count(),visible.length);
        assert.equal(await page.locator('.raid-tier-letter').count(),await page.locator('.raid-tier-group').count());
        assert.equal(await page.evaluate(()=>raidLeaderboardResult.rows[0].score),100);
    }
    async function fits() {
        assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Leaderboard overflows.');
        const clipped=await page.locator('.raid-entry > summary .raid-score').evaluateAll(cells=>
            cells.filter(cell=>{
                const range=document.createRange();range.selectNodeContents(cell.querySelector('strong')||cell);
                const text=range.getBoundingClientRect(),box=cell.getBoundingClientRect();
                return text.left<box.left-1||text.right>box.right+1;
            }).map(cell=>cell.textContent));
        assert.deepEqual(clipped,[],'Weighted decimal values must fit their numeric cells.');
    }
    async function openFilters() {
        if(!await page.locator('#raid-filter-drawer').evaluate(el=>el.open))
            await page.locator('#raid-filter-trigger').click();
        assert.equal(await page.locator('#raid-shadows').isVisible(),false,'Shadow controls must remain hidden in the Mega view.');
    }
    await ready(true);
    assert.equal(await page.locator('#raid-super-max').isChecked(),true,'Super Max starts enabled.');
    assert(await page.evaluate(()=>raidLeaderboardResult.superMaxOnly
        &&raidLeaderboardResult.rows.every(r=>r.superMaxUnlocked)));
    await openFilters();await page.locator('#raid-super-max').uncheck();
    assert(new URL(page.url()).searchParams.has('no-super-max'));
    await page.locator('#raid-filter-trigger').click();
    assert.equal(await page.locator('#raid-megas').isChecked(),true);
    assert.equal(await page.locator('#raid-intro-text').count(),0);
    assert.equal(await page.locator('#raid-loading').isVisible(),false);
    assert(await page.locator('.raid-entry > summary .raid-form').count()<await page.locator('.raid-entry').count(),
        'Ordinary Mega forms must omit the redundant parenthesized label.');
    assert(await page.locator('.raid-entry > summary .raid-species').evaluateAll(elements=>
        elements.every(el=>!/^Mega |^Primal /.test(el.textContent))));
    assert(await page.locator('.raid-entry > summary .raid-form').evaluateAll(elements=>
        elements.every(el=>/^\((?:[XYZ]|Primal|Ultra|[A-Za-z ]+)(?:, [A-Za-z ]+)?\)$/.test(el.textContent)
            &&!el.textContent.includes('Mega'))));
    assert.deepEqual(await page.evaluate(()=>[
        [384,'Mega Rayquaza','Mega'],[6,'Mega Charizard X','Mega'],[6,'Mega Charizard Y','MegaY'],
        [382,'Primal Kyogre','Primal'],[800,'Necrozma','Ultra'],
    ].map(([id,name,form])=>RaidLeaderboardName({id,name,form},true).find('.raid-form').text())),
        ['','(X)','(Y)','(Primal)','(Ultra)']);
    assert.equal(await page.evaluate(()=>RaidLeaderboardName({id:384,name:'Mega Rayquaza',form:'Mega'})
        .find('.raid-form').text()),'(Mega)','Boss breakdowns must retain the fought Mega form.');
    for (const id of [382,383]) {
        const key=await page.evaluate(id=>raidLeaderboardResult.rows.find(r=>r.transformed&&r.id===id)?.key,id);
        if(!key)continue;
        assert.equal(await page.locator('.raid-entry').filter({has:page.locator('.raid-form')})
            .evaluateAll((elements,key)=>elements.find(el=>el.dataset.key===key).querySelector('summary .raid-form').textContent,key),'(Primal)');
    }
    await page.evaluate(async()=>{const sheet=new Image();sheet.src=ICONS_URL;await sheet.decode();});
    if(process.env.RAID_LEADERBOARD_SCREENSHOT)await page.screenshot({path:process.env.RAID_LEADERBOARD_SCREENSHOT.replace(/\.png$/,'-mega.png')});
    for(const width of [320,390,900]){await page.setViewportSize({width,height:844});await fits();}
    const currentAll=await page.evaluate(()=>({
        ordinary:raidLeaderboardMatrix.attackers.filter(r=>!r.transformed),bosses:raidLeaderboardMatrix.bosses,
        scores:raidLeaderboardResult.rows.map(r=>[r.key,r.points,r.score]),
        transforms:raidLeaderboardMatrix.attackers.filter(r=>r.transformed).length,
    }));
    assert(currentAll.transforms>20);
    async function nativeParity(future) {
        return page.evaluate(async future=>{
            const snapshot=GetRaidLeaderboardSnapshot(),originalPokemon=jb_pkm,originalCharged=jb_cm;
            let matchups=0;
            try {
                jb_pkm=snapshot.pokemon;jb_cm=snapshot.chargedMoves;
                const search={...GetDefaultSearchParams(),type:'Any',mega:false,unreleased:future,real_damage:true};
                for(const [id,form] of [[905,'Incarnate'],[248,'Mega'],[800,'Dawn_wings']]) {
                    const bossIndex=raidLeaderboardMatrix.bosses.findIndex(p=>p.id===id&&p.form===form);
                    const boss=jb_pkm.find(p=>p.id===id&&p.form===form),enemy=GetEnemyParams(boss);
                    const best=(await GetStrongestVersus(enemy,search)).at(-1);
                    if(Math.abs(best.rat-raidLeaderboardMatrix.bosses[bossIndex].bestEdps)>1e-8)
                        throw new Error('Non-Mega benchmark changed: '+id+'/'+form);
                    for(const row of raidLeaderboardMatrix.attackers.filter(r=>r.transformed)) {
                        const recorded=row.matchups.find(m=>m.bossIndex===bossIndex);
                        if(!recorded)continue;
                        let p=jb_pkm.find(p=>p.id===row.id&&p.form===row.form);
                        if(row.hiddenPowerType){
                            const moves=GetPokemonMoves(p,'All'),keep=m=>!m.startsWith('Hidden Power')||m==='Hidden Power '+row.hiddenPowerType;
                            p={...p,fm:moves[0].filter(keep),elite_fm:moves[2].filter(keep)};delete p.fm_add;delete p.fm_rem;
                        }
                        const expected=GetStrongestAgainstSpecificEnemy(p,false,row.level,enemy,{...search,mega:true}).at(-1);
                        if(Math.abs(expected.rat-recorded.edps)>1e-8||expected.cm!==recorded.cm
                                ||Math.abs(recorded.ratio-recorded.edps/best.rat)>1e-10)
                            throw new Error('Transformed native eDPS mismatch: '+row.key);
                        matchups++;
                    }
                }
            } finally {jb_pkm=originalPokemon;jb_cm=originalCharged;}
            return matchups;
        },future);
    }
    const currentParity=await nativeParity(false);
    assert(currentParity>10);
    await page.locator('#raid-mode-label').click();await ready(false);
    assert(!new URL(page.url()).searchParams.has('megas'));
    const currentOrdinary=await page.evaluate(()=>({rows:raidLeaderboardMatrix.attackers,bosses:raidLeaderboardMatrix.bosses}));
    assert.deepEqual(currentAll.ordinary,currentOrdinary.rows);
    assert.deepEqual(currentAll.bosses,currentOrdinary.bosses);
    await page.goBack();await ready(true);
    await page.goForward();await ready(false);
    const starts=await page.evaluate(()=>window.megaWorkerStarts);
    await page.locator('#raid-megas').focus();
    await page.locator('#raid-megas').press('Space');await ready(true);
    assert.deepEqual(await page.evaluate(()=>raidLeaderboardResult.rows.map(r=>[r.key,r.points,r.score])),currentAll.scores,
        'Changing the Attacker score must not alter the Mega scoring scale.');
    assert.equal(await page.evaluate(()=>window.megaWorkerStarts),starts,'Returning to the previous pool should use its cache.');
    assert.equal(await page.locator('#raid-score-heading').textContent(),'Score');
    assert.equal(await page.locator('.raid-first,.raid-near,.raid-positive').count(),0);
    await openFilters();
    assert.equal(await page.locator('#raid-super-max-label').textContent(),'Super Max');
    const filterStarts=await page.evaluate(()=>window.megaWorkerStarts);
    await page.locator('#raid-super-max').check();
    assert(new URL(page.url()).searchParams.has('super-max'));
    assert(await page.evaluate(()=>raidLeaderboardResult.superMaxOnly&&raidLeaderboardResult.rows.length>0
        &&raidLeaderboardResult.rows.every(r=>r.superMaxUnlocked)&&raidLeaderboardResult.rows[0].score===100));
    assert.equal(await page.evaluate(()=>window.megaWorkerStarts),filterStarts,'Super Max reuses the native battle matrix.');
    await page.locator('#raid-mode-label').click();await ready(false);
    assert.equal(await page.locator('#raid-super-max').isVisible(),false);
    assert.equal(await page.locator('#raid-xl-only').count(),0);
    assert(!new URL(page.url()).searchParams.has('xl'));
    assert.equal(await page.evaluate(()=>raidLeaderboardState.sort),'score');
    await page.locator('#raid-mode-label').click();await ready(true);
    assert.equal(await page.locator('#raid-super-max').isChecked(),true);
    await page.reload();await ready(true);
    assert.equal(await page.locator('#raid-super-max').isChecked(),true);
    await openFilters();await page.locator('#raid-super-max').uncheck();
    assert(new URL(page.url()).searchParams.has('no-super-max'));
    await page.reload();await ready(true);
    assert.equal(await page.locator('#raid-super-max').isChecked(),false,'An explicit off choice survives reload.');
    assert.deepEqual(await page.evaluate(()=>raidLeaderboardResult.rows.map(r=>[r.key,r.points,r.score])),currentAll.scores);
    await openFilters();await page.locator('#raid-super-max').check();
    await openFilters();
    await page.locator('#raid-unreleased').check();await ready(true,true);
    const futureSuperMax=await page.evaluate(()=>raidLeaderboardResult.rows.map(r=>[r.key,r.points,r.score]));
    assert.equal(await page.evaluate(()=>raidLeaderboardResult.superMaxOnly),false);
    await openFilters();await page.locator('#raid-super-max').uncheck();
    assert.deepEqual(await page.evaluate(()=>raidLeaderboardResult.rows.map(r=>[r.key,r.points,r.score])),futureSuperMax);
    await page.locator('#raid-super-max').check();
    const futureParity=await nativeParity(true);
    assert(futureParity>10);
    const projected=await page.evaluate(()=>{
        if(raidLeaderboardMatrix.attackers.some(p=>p.id===890&&p.form==='Eternamax'||p.id===800&&p.form==='Ultra'
                ||p.id===801&&p.form==='Mega'))throw new Error('Invalid transformed attacker in production pool.');
        if(raidLeaderboardMatrix.attackers.filter(p=>p.transformed).some(p=>p.level!==52))throw new Error('Projected level mismatch.');
        const row=raidLeaderboardResult.rows.find(r=>r.transformed&&r.matchups.some(m=>m.points>0&&FindChargedMove(m.cm)?._plus_projection));
        if(!row)throw new Error('No scoring forecast +move.');
        return {key:row.key,id:row.id,form:row.form,score:row.score,
            normalized:Math.abs(row.score-100*row.points/raidLeaderboardResult.bestPoints)<1e-9};
    });
    assert(projected.normalized);
    await page.locator('#raid-plus-note').waitFor();await page.locator('#raid-level-note').waitFor();
    const index=await page.locator('.raid-entry').evaluateAll((elements,key)=>elements.findIndex(e=>e.dataset.key===key),projected.key);
    const entry=page.locator('.raid-entry').nth(index);
    await entry.locator('summary').click();await entry.locator('.raid-breakdown .plus-projected').first().waitFor();
    assert.match(await entry.innerText(),/Attacker level: L52/);
    assert(!/\[forecast:/.test(await entry.innerText()),'Scoped internal move names must not be shown.');
    for(const width of [320,390,900]){await page.setViewportSize({width,height:844});await fits();}
    await entry.locator('.raid-matchup-moves .type-text').filter({has:page.locator('.plus-projected')}).first().click();
    await page.locator('#move-projection-note').waitFor();
    assert.match(await page.locator('#move-projection-note').innerText(),/scaling applies separately/);
    await page.evaluate(()=>document.querySelector('#move-edit').close());
    const stableScores=await page.evaluate(()=>raidLeaderboardResult.rows.map(r=>[r.key,r.score]));
    await openFilters();
    await page.locator('#raid-legendaries').uncheck();
    assert.deepEqual(await page.evaluate(()=>raidLeaderboardResult.rows.map(r=>[r.key,r.score])),stableScores);
    await page.locator('#menu-icon > .drawer-icon').click();
    await page.locator('#data-audit-link').click();
    await page.waitForFunction(()=>document.querySelector('#data-audit')?.checkVisibility());
    assert(await page.evaluate(()=>GetPokemonAuditInfo(127,'Mega',BuildPokemonAuditContext()).leaderboardIncluded));
    assert(!await page.evaluate(()=>GetPokemonAuditInfo(127,'Normal',BuildPokemonAuditContext()).leaderboardIncluded));
    await page.locator('#audit-leaderboard').click();await ready(true,true);
    assert(new URL(page.url()).searchParams.has('megas'));
    await page.reload();
    await page.waitForFunction(()=>document.querySelector('#raid-megas')?.checked&&document.querySelector('#raid-unreleased')?.checked,
        null,{timeout:120000});
    await page.evaluate(()=>LoadFAQAndUpdateURL());
    assert.equal(await page.evaluate(()=>raidLeaderboardWorker),null);
    assert.deepEqual(errors,[]);
    console.log('Mega leaderboard, fixed ordinary scores, native benchmarks/moves, forecasts, cache, URL, audit and mobile:',
        JSON.stringify({currentTransforms:currentAll.transforms,currentParity,futureParity,projected}));
} finally {await browser.close();}
