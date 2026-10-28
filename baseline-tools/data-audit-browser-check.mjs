import assert from 'node:assert/strict';
import {chromium, devices} from 'playwright';

const base = process.env.FORK_URL;
if (!base) throw new Error('FORK_URL is required.');
const options = {headless:true};
if (process.env.PLAYWRIGHT_PROXY) {
    const proxy = new URL(process.env.PLAYWRIGHT_PROXY);
    options.proxy = {server:proxy.protocol+'//'+proxy.host,bypass:'<-loopback>,127.0.0.1,localhost'};
}
const browser = await chromium.launch(options);
try {
    const page = await browser.newPage({...devices['iPhone 13'],locale:'en-US',
        permissions:['clipboard-read','clipboard-write'],
        ignoreHTTPSErrors:process.env.PLAYWRIGHT_IGNORE_HTTPS_ERRORS==='1'});
    const errors=[];
    page.on('pageerror', error=>errors.push(error.message));
    const start=new URL(base); start.search='?audit&q=150';
    await page.goto(start.toString(),{waitUntil:'domcontentloaded'});
    await page.locator('.audit-entry[data-key="150/A"]').waitFor({timeout:120000});
    assert.equal(await page.title(),'Pokémon Data Audit - DialgaDex');
    const armored=page.locator('.audit-entry[data-key="150/A"]');
    await armored.locator('summary').click();
    await armored.locator('.audit-copy').waitFor();
    assert.match(await armored.innerText(),/Verified raid history/);
    assert.match(await armored.innerText(),/Local correction applied: raid_tier/);
    await armored.locator('.audit-copy').click();
    await armored.locator('.audit-copy-status').filter({hasText:'Copied'}).waitFor();
    assert.equal(await armored.locator('.audit-copy-status').innerText(),'Copied');
    const copied=await page.evaluate(()=>navigator.clipboard.readText());
    assert.match(copied,/Pokémon: #150/);
    assert.match(copied,/Raid tag: 5; upstream tag: none; evidence: verified/);
    assert.match(copied,/weight in selected pool: 1/);
    assert.match(copied,/\?p=150&f=A/);
    async function fits() {
        const size=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
        assert(size.scroll<=size.width+1,`Audit overflow: ${JSON.stringify(size)}`);
    }
    await fits();
    await page.setViewportSize({width:320,height:740}); await fits();
    await page.setViewportSize({width:900,height:900}); await fits();
    await page.setViewportSize({width:390,height:844});
    await page.locator('#audit-search').fill('Ultra');
    const ultra=page.locator('.audit-entry[data-key="800/Ultra"]');
    await ultra.locator('summary').click();
    await ultra.locator('.audit-copy').waitFor();
    assert.match(await ultra.innerText(),/Placeholder moves/);
    assert.match(await ultra.innerText(),/337 \/ 196 \/ 200/);
    assert.match(await ultra.innerText(),/359 \/ 209 \/ 213/);
    await ultra.locator('.audit-actions a').click();
    await page.waitForFunction(()=>document.querySelector('#pokemon-data-details')?.checkVisibility());
    await page.locator('.audit-pokemon-details > summary').click();
    assert.equal(await page.locator('#counters').isVisible(),false);
    assert.equal(await page.locator('#pokedex-move-table').isVisible(),false);
    await page.locator('#pokemon-data-details .audit-copy').click();
    await page.locator('#pokemon-data-details .audit-copy-status').filter({hasText:'Copied'}).waitFor();
    assert.match(await page.evaluate(()=>navigator.clipboard.readText()),/Placeholder moves/);
    await fits();
    await page.goBack();
    await ultra.waitFor();
    await page.locator('#audit-search').fill('');
    await page.locator('#audit-quality').selectOption('incomplete');
    assert(await page.locator('.audit-entry').count()>0);
    await page.locator('#audit-quality').selectOption('unsupported');
    assert(await page.locator('.audit-entry').count()>0);
    assert(await page.evaluate(()=>[...document.querySelectorAll('.audit-entry')].every(el=>{
        const [id,form]=el.dataset.key.split('/');return !GetPokemonForms(Number(id)).includes(form);
    })));
    await page.locator('#audit-quality').selectOption('all');
    await page.locator('#audit-search').fill('774');
    const meteor=page.locator('.audit-entry[data-key="774/Meteor"]');
    await meteor.locator('summary').click();
    await meteor.locator('.audit-copy').waitFor();
    assert.match(await meteor.innerText(),/Local correction applied: released/);
    const green=page.locator('.audit-entry[data-key="774/Green"]');
    await green.locator('summary').click();
    await green.locator('.audit-copy').waitFor();
    assert.match(await green.innerText(),/Form unavailable in raid battles/);
    await page.locator('#audit-unreleased').check();
    const pool=await page.evaluate(()=>{
        const bosses=GetRaidBosses(),future=GetRaidBosses(null,null,true);
        const weights=GetRaidBossWeights(future);
        for(const id of [386,493,649,773]) {
            const sum=future.reduce((sum,p,i)=>sum+(p.id===id?weights.weights[i]:0),0);
            if(Math.abs(sum-1)>1e-10) throw new Error('Invalid group weight for '+id);
        }
        if(future.some(p=>!GetPokemonDataQuality(p).usable))throw new Error('Incomplete boss in future pool');
        return {currentBosses:bosses.length,currentGroups:GetRaidBossWeights(bosses).groupCount,
            futureBosses:future.length,futureGroups:weights.groupCount};
    });
    assert(new URL(page.url()).searchParams.has('unreleased'));
    // The global switch must update the route before reloading this page.
    await page.evaluate(()=>$("#filter-settings input[value='unreleased']").prop('checked',false).trigger('change'));
    await page.waitForFunction(()=>!GetIncludeUnreleased()&&!document.querySelector('#audit-unreleased').checked);
    assert(!new URL(page.url()).searchParams.has('unreleased'));
    await page.locator('#audit-search').fill('718 Mega');
    await page.reload();
    const zygarde=page.locator('.audit-entry[data-key="718/Mega"]');
    await zygarde.locator('summary').click();
    await zygarde.locator('.audit-copy').waitFor();
    assert.match(await zygarde.innerText(),/Projected stats; final GO values unconfirmed/);
    assert.match(await zygarde.innerText(),/403 \/ 181 \/ 415/);
    if(process.env.DATA_AUDIT_SCREENSHOT)await page.screenshot({path:process.env.DATA_AUDIT_SCREENSHOT,fullPage:true});
    await fits();
    await page.evaluate(()=>LoadDataAuditAndUpdateURL('890'));
    if(!await page.locator('#audit-unreleased').isChecked())await page.locator('#audit-unreleased').check();
    const eternamax=page.locator('.audit-entry[data-key="890/Eternamax"]');
    await eternamax.locator('summary').click();await eternamax.locator('.audit-copy').waitFor();
    assert.match(await eternamax.innerText(),/Max Battle boss only; not a usable raid form/);
    assert.match(await eternamax.innerText(),/Regular Eternatus remains usable/);
    await eternamax.locator('.audit-copy').click();
    await eternamax.locator('.audit-copy-status').filter({hasText:'Copied'}).waitFor();
    assert.match(await page.evaluate(()=>navigator.clipboard.readText()),/Max Battle boss only/);
    const allowed=await page.evaluate(async()=>{
        const rows=[];await SearchAll({...GetDefaultSearchParams(),unreleased:true},p=>rows.push(PokemonDataKey(p)));
        return {regular:rows.includes('890/Normal'),eternamax:rows.includes('890/Eternamax')};
    });
    assert.deepEqual(allowed,{regular:true,eternamax:false});
    await eternamax.locator('.audit-actions a').click();
    await page.locator('#pokedex-move-note').waitFor();
    assert.match(await page.locator('#pokedex-move-note').innerText(),/Max Battle boss only/);
    assert.equal(await page.locator('#pokedex-move-table').isVisible(),false);
    assert.equal(await page.locator('#counters').isVisible(),false);
    await page.setViewportSize({width:320,height:740});await fits();
    assert.deepEqual(errors,[]);
    console.log('Audit data, clipboard, filters, projections, exclusions, navigation and mobile fit:',JSON.stringify(pool));
} finally { await browser.close(); }
