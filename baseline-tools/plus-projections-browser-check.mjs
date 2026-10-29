import assert from 'node:assert/strict';
import {chromium, devices} from 'playwright';

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
    const start=new URL(base);start.search='?faq';
    await page.goto(start.toString(),{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>typeof jb_pkm!=='undefined'&&jb_pkm?.length>1000&&loading_val===LOADING_MAX_VAL
        &&typeof fallbackMap!=='undefined'&&fallbackMap?.pokedata,null,{timeout:120000});
    const checks=await page.evaluate(async()=>{
        const check=(condition,message)=>{if(!condition)throw new Error(message);};
        const original=JSON.stringify([jb_pkm,jb_cm]);
        const sourceMoves=JSON.stringify(jb_cm);
        const future=GetCalculationPokemon(true);
        check(original===JSON.stringify([jb_pkm,jb_cm]),'Pure future read mutated active data.');
        const projected=future.filter(p=>p._plusProjections);
        const predicted=projected.filter(p=>GetPlusMoveProjectionInfo(p,true).powerKind==='estimated');
        check(projected.length>50&&predicted.length>50,'Missing forecast assignments.');
        const get=id=>future.find(p=>p.id===id&&p.form==='Mega');
        const pinsir=get(127),bax=get(998),sableye=get(302),aero=get(142),abomasnow=get(460);
        check(GetPlusMoveProjectionInfo(pinsir,true).move.power===150,'Pinsir prediction differs from the recovered model.');
        check(GetPlusMoveProjectionInfo(bax,true).move.power===140&&bax.stats.baseStamina===244,'Baxcalibur prediction mismatch.');
        check(GetPlusMoveProjectionInfo(sableye,true).move.power===160,'Published Night Shade+ lost priority.');
        check(GetPlusMoveProjectionInfo(aero,true).move.projection_hypothesis,'Aerodactyl hypothesis label missing.');
        const weather=GetPlusMoveProjectionInfo(abomasnow,true).move;
        check(weather.type==='Ice'&&TranslatedMoveName(weather.id,weather.type).endsWith('+'),'Weather Ball+ lost its Ice type.');
        for(const id of [800,801])check(!future.some(p=>p.id===id&&p._plusProjections),'Placeholder received a forecast.');
        check(!IsPokemonCalculationEligible(future.find(p=>p.id===800&&p.form==='Ultra'),true),'Ultra placeholder entered calculations.');
        const search={...GetDefaultSearchParams(),type:'Any',unreleased:true,real_damage:true};
        const enemy=GetEnemyParams(jb_pkm.find(p=>p.id===248&&p.form==='Mega'));
        const actual=(await GetStrongestVersus(enemy,search)).find(p=>p.id===127&&p.form==='Mega'&&!p.shadow);
        // Independent manual native move definition checks the full forecast -> eDPS path.
        const manual={...jb_cm.find(m=>m.name==='Aerial Ace'),name:'QA manual Aerial Ace+',power:150,energy_delta:-100,mega_temp:true};
        jb_cm.push(manual);
        try {
            const expected=GetStrongestAgainstSpecificEnemy({...pinsir,temp_cm:[manual.name]},false,52,enemy,search).at(-1);
            check(actual&&Math.abs(actual.rat-expected.rat)<1e-8,'Forecast eDPS differs from the manual native calculation.');
        } finally {jb_cm.pop();}
        const predictedMove=GetPlusMoveProjectionInfo(bax,true).move;
        for(const [level,mult] of [[1,1],[2,Math.fround(1.1)],[3,Math.fround(1.2)],[4,Math.fround(1.3)]]) {
            settings_supermega_level=level;
            check(ProcessPower(predictedMove)===140*mult,'Mega level power was applied incorrectly.');
        }
        for(let i=0;i<3;i++) {
            SetIncludeUnreleased(true);
            check(jb_cm.filter(m=>m._plus_projection).length===projected.length,'Duplicate active forecast definitions.');
            check(!GetCalculationPokemon(false).some(p=>p._plusProjections),'Forecast leaked into current calculation scope.');
            SetIncludeUnreleased(false);
            check(JSON.stringify(jb_cm)===sourceMoves,'Source moves changed after switching off.');
            check(JSON.stringify([jb_pkm,jb_cm])===original,'Source learnsets changed after switching off.');
        }
        SetIncludeUnreleased(true);PatchSpeculative(false);settings_speculative=false;
        check(jb_pkm.find(p=>p.id===127&&p.form==='Mega')._plusProjections,'Existing form forecast requires Data Preview.');
        check(!jb_pkm.some(p=>p.id===998&&p.form==='Mega'),'Preview-only Baxcalibur remained.');
        settings_speculative=true;PatchSpeculative(true);
        BuildMoveUserMap(true);
        check(top_move_users.get(GetPlusMoveProjectionInfo(jb_pkm.find(p=>p.id===127&&p.form==='Mega'),true).move.name)
            ?.some(p=>p.id===127),'Forecast user absent from move table.');
        SetIncludeUnreleased(false);
        return {addedAssignments:projected.length,estimatedPowers:predicted.length,publishedPower:sableye.temp_cm.length,
            nativeEdps:actual.rat,sourcePlusMoves:jb_cm.filter(m=>m.mega_temp).length};
    });
    await page.evaluate(()=>LoadDataAuditAndUpdateURL('127'));
    await page.locator('#audit-quality').selectOption('plus');
    let pinsir=page.locator('.audit-entry[data-key="127/Mega"]');
    await pinsir.locator('summary').click();
    await pinsir.locator('.audit-copy').waitFor();
    assert.match(await pinsir.innerText(),/not used in current-only rankings/);
    await page.locator('#audit-unreleased').check();
    pinsir=page.locator('.audit-entry[data-key="127/Mega"]');
    await pinsir.locator('summary').click();await pinsir.locator('.audit-copy').waitFor();
    assert.match(await pinsir.innerText(),/Enabled by Unreleased/);
    assert.match(await pinsir.innerText(),/150 base \(estimated\); 195 at Mega level 4/);
    await pinsir.locator('.audit-copy').click();
    await pinsir.locator('.audit-copy-status').filter({hasText:'Copied'}).waitFor();
    assert.match(await page.evaluate(()=>navigator.clipboard.readText()),/base Attack 305/);
    for(const width of [320,390,900]) {
        await page.setViewportSize({width,height:844});
        assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Forecast audit overflows.');
    }
    await pinsir.locator('.audit-actions a').click();
    await page.locator('#pokedex-move-table .plus-projected').first().waitFor();
    await page.locator('#pokedex-move-table .type-text').filter({has:page.locator('.plus-projected')}).first().click();
    await page.locator('#move-projection-note').waitFor();
    assert.equal(await page.locator('#any-search-box').inputValue(),'Aerial Ace+');
    assert.equal(await page.locator('#move-edit-power').inputValue(),'150');
    assert.equal(await page.locator('#move-edit-energy').inputValue(),'-100');
    assert.equal(await page.locator('#move-edit-duration').inputValue(),'2.5');
    assert.match(await page.locator('#move-projection-note').innerText(),/scaling applies separately/);
    await page.setViewportSize({width:320,height:740});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Move editor overflows a narrow phone.');
    await page.evaluate(()=>document.querySelector('#move-edit').close());
    await page.evaluate(()=>LoadMovesAndUpdateURL('Flying','Charged'));
    await page.locator('#move-data-table .plus-projected').first().waitFor();
    assert(!/\[forecast:/.test(await page.locator('#move-data-table').innerText()),'Internal names leaked into UI.');
    await page.evaluate(()=>LoadStrongestAndUpdateURL('Flying',false));
    await page.locator('#footnote-projected-plus').waitFor({state:'visible'});
    await page.evaluate(()=>{SetIncludeUnreleased(false);return LoadStrongestAndUpdateURL('Flying',false);});
    await page.locator('#footnote-projected-plus').waitFor({state:'hidden'});
    assert.equal(await page.evaluate(()=>jb_cm.filter(m=>m._plus_projection).length),0);
    assert.deepEqual(errors,[]);
    console.log('Projected +moves, native power/eDPS, isolation, preview, labels, clipboard and mobile:',JSON.stringify(checks));
} finally {await browser.close();}
