import assert from 'node:assert/strict';
import {chromium, devices} from 'playwright';

const base=process.env.FORK_URL;
if(!base)throw new Error('FORK_URL is required.');
const options={headless:true};
if(process.env.PLAYWRIGHT_PROXY){const proxy=new URL(process.env.PLAYWRIGHT_PROXY);
    options.proxy={server:proxy.protocol+'//'+proxy.host,bypass:'<-loopback>,127.0.0.1,localhost'};}
const browser=await chromium.launch(options);
try{
    const page=await browser.newPage({...devices['iPhone 13'],locale:'en-US',permissions:['clipboard-read','clipboard-write'],
        ignoreHTTPSErrors:process.env.PLAYWRIGHT_IGNORE_HTTPS_ERRORS==='1'});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    const start=new URL(base);start.search='?faq';
    await page.goto(start.toString(),{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>typeof jb_pkm!=='undefined'&&jb_pkm?.length>1000&&loading_val===LOADING_MAX_VAL
        &&typeof fallbackMap!=='undefined'&&fallbackMap?.pokedata,null,{timeout:120000});
    const parity=await page.evaluate(async()=>{
        const collect=async(unreleased)=>{const rows=[];
            await SearchAll({...GetDefaultSearchParams(),unreleased},(p,shadow,level)=>{
                if(!shadow)rows.push({id:p.id,form:p.form,level,transformed:IsMegaPrimalUltraForm(p)});
            });return rows;};
        settings_default_level=[50];settings_xl_budget=false;settings_supermega_level=4;
        const current=await collect(false),future=await collect(true);
        const projected=future.filter(p=>p.transformed);
        if(!projected.length||projected.some(p=>p.level!==52))throw new Error('Not every projected transformation is L52.');
        if(future.some(p=>!p.transformed&&p.level!==50))throw new Error('A regular form received the projected boost.');
        const ordinary=current.find(p=>p.id===80&&p.form==='Mega');
        const primal=current.find(p=>p.id===382&&p.form==='Mega');
        if(ordinary?.level!==50||primal?.level!==50)throw new Error('Current-only ordinary/Primal levels changed.');
        const superMega=current.find(p=>p.id===150&&p.form==='Mega');
        if(superMega?.level!==52||future.find(p=>p.id===150&&p.form==='Mega')?.level!==52)
            throw new Error('An existing native boost was removed or applied twice.');
        if(future.some(p=>p.id===800&&p.form==='Ultra'))throw new Error('Placeholder Ultra entered rankings.');
        const ultra=jb_pkm.find(p=>p.id===800&&p.form==='Ultra');
        const original={fm:ultra.fm,cm:ultra.cm};
        let checked=0;
        try{
            // Hypothetical valid moves test the Ultra path without altering production data.
            ultra.fm=['Shadow Claw'];ultra.cm=['Outrage'];
            const enemy=GetEnemyParams(jb_pkm.find(p=>p.id===248&&p.form==='Mega'));
            const search={...GetDefaultSearchParams(),type:'Any',unreleased:true,real_damage:true};
            const counters=await GetStrongestVersus(enemy,search);
            for(const [id,form,level] of [[80,'Mega',52],[382,'Mega',52],[383,'Mega',52],[384,'Mega',52],
                [150,'Mega',52],[800,'Ultra',52],[798,'Normal',50]]){
                const p=jb_pkm.find(p=>p.id===id&&p.form===form);
                const actual=counters.find(p=>p.id===id&&p.form===form&&!p.shadow);
                const expected=GetStrongestAgainstSpecificEnemy(p,false,level,enemy,search).at(-1);
                if(!actual||actual.level!==level||!expected||Math.abs(actual.rat-expected.rat)>1e-8
                    ||actual.fm!==expected.fm||actual.cm!==expected.cm)throw new Error('Level/native eDPS mismatch: '+id+'/'+form);
                const stats=GetPokemonStats(p,level),lower=GetPokemonStats(p,level-2);
                if(level===52&&['atk','def','hp'].some(key=>!(stats[key]>lower[key])))throw new Error('A stat did not receive the native CPM.');
                checked++;
            }
            const nonMega=[];
            await SearchAll({...GetDefaultSearchParams(),mega:false,unreleased:true},p=>nonMega.push(p));
            if(nonMega.some(p=>IsMegaPrimalUltraForm(p)))throw new Error('Transformation in the non-Mega pool.');
            if(!nonMega.some(p=>p.id===798))throw new Error('Ultra Beast was treated as an Ultra transformation.');
        }finally{Object.assign(ultra,original);}
        PatchSpeculative(false);settings_speculative=false;
        const noPreview=await collect(true);
        if(noPreview.find(p=>p.id===80&&p.form==='Mega')?.level!==52)throw new Error('Projection wrongly requires Data Preview.');
        if(noPreview.some(p=>p.id===998&&p.form==='Mega'))throw new Error('Preview-only form remained with preview off.');
        PatchSpeculative(true);settings_speculative=true;
        SetIncludeUnreleased(true);
        return {currentTransformations:current.filter(p=>p.transformed).length,
            futureTransformations:projected.length,nativeMovesetsChecked:checked,
            ultraBeastLevel:future.find(p=>p.id===798&&p.form==='Normal')?.level};
    });
    await page.evaluate(()=>LoadStrongestAndUpdateURL('Dragon',false));
    await page.locator('#footnote-projected-levels').waitFor({state:'visible'});
    assert.match(await page.locator('#footnote-projected-levels').innerText(),/Mega, Primal, and Ultra/);
    assert(await page.locator('sup.lvl').filter({hasText:'+2'}).count()>0);
    await page.evaluate(()=>SetSuperMegaLevel(3));
    await page.locator('#footnote-projected-levels').waitFor({state:'hidden'});
    await page.evaluate(()=>SetSuperMegaLevel(4));
    await page.locator('#footnote-projected-levels').waitFor({state:'visible'});
    await page.evaluate(()=>LoadDataAuditAndUpdateURL('80'));
    const slowbro=page.locator('.audit-entry[data-key="80/Mega"]');
    await slowbro.locator('summary').click();await slowbro.locator('.audit-copy').waitFor();
    assert.match(await slowbro.innerText(),/Projection:.*Ultra/);
    await slowbro.locator('.audit-copy').click();
    await slowbro.locator('.audit-copy-status').filter({hasText:'Copied'}).waitFor();
    assert.match(await page.evaluate(()=>navigator.clipboard.readText()),/Default attacker levels: L52; projected \+2 levels/);
    await slowbro.locator('.audit-actions a').click();
    await page.waitForFunction(()=>document.querySelector('#input-lvl')?.value==='52');
    assert.match(await page.locator('.audit-pokemon-details > summary').innerText(),/Projected/);
    await page.reload();
    await page.waitForFunction(()=>document.querySelector('#input-lvl')?.value==='52');
    await page.locator('.audit-pokemon-details > summary').click();
    await page.setViewportSize({width:320,height:740});
    const size=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth}));
    assert(size.scroll<=size.width+1,'Projection details must fit a narrow phone.');
    assert.deepEqual(errors,[]);
    console.log('Projected levels, native stats/eDPS, filters, notes, clipboard and explicit-level reload:',JSON.stringify(parity));
}finally{await browser.close();}
