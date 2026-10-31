import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const base = process.env.FORK_URL;
if (!base) throw new Error('FORK_URL is required.');
const options = {headless:true};
if (process.env.PLAYWRIGHT_PROXY) {
    const proxy = new URL(process.env.PLAYWRIGHT_PROXY);
    options.proxy = {server:proxy.protocol + '//' + proxy.host, bypass:'<-loopback>,127.0.0.1,localhost'};
}
const browser = await chromium.launch(options);
try {
    const page = await browser.newPage({viewport:{width:1100,height:900}, locale:'en-US',
        ignoreHTTPSErrors:process.env.PLAYWRIGHT_IGNORE_HTTPS_ERRORS === '1'});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const start = new URL(base); start.search = '?bosses';
    await page.goto(start.toString(), {waitUntil:'domcontentloaded'});
    await page.locator('.boss-tier-group').last().waitFor({timeout:120000});
    assert.equal(await page.title(), 'Boss List - DialgaDex');
    assert.deepEqual(await page.locator('#boss-list-groups thead th').allTextContents(), ['Released','Unreleased']);
    const categoryLabels = await page.locator('.boss-category').allTextContents();
    assert.deepEqual(categoryLabels.filter(label => !['Paradox','Other'].includes(label)),
        ['Super Mega','Legendary Mega','Legendary','Sub-Legendary','Mythical','Mega']);
    const report = await page.evaluate(() => {
        const groups = [...document.querySelectorAll('.boss-tier-group')];
        const rendered = groups.flatMap(group => [...group.querySelectorAll('.boss-cell')].flatMap(cell =>
            [...cell.querySelectorAll('.boss-entry')].map(link => ({key:link.dataset.key,
                hp:Number(group.dataset.hp), availability:cell.dataset.availability}))));
        const expected = GetBossListGroups().flatMap(group => ['released','unreleased'].flatMap(availability =>
            group[availability].map(pokemon => ({key:PokemonDataKey(pokemon),hp:group.hp,availability}))));
        if (JSON.stringify(rendered) !== JSON.stringify(expected)) throw new Error('Rendered roster differs from the calculation pools.');
        const pool = new Set(GetRaidBosses(null,null,false).concat(GetRaidBosses(null,null,true)).map(PokemonDataKey));
        if (pool.size !== rendered.length || rendered.some(row => !pool.has(row.key))) throw new Error('Bosses missing or duplicated.');
        if (groups.some(group => group.querySelectorAll('.boss-cell').length !== 2)) throw new Error('Each category needs two columns.');
        const released = GetRaidBosses(null,null,false);
        for (const id of [791,792,894,895,905]) {
            const boss = released.find(p => p.id === id && (id !== 905 || p.form === 'Incarnate'));
            if (!boss || boss.raid_tier !== 5 || GetRaidStats(boss).hp !== 15000) throw new Error('Missing current five-star profile: ' + id);
        }
        const preview = settings_speculative;
        for (const usePreview of [false,true]) {
            settings_speculative = usePreview; PatchSpeculative(usePreview);
            const chandelure = GetRaidBosses(null,null,false).find(p => p.id === 609 && p.form === 'Mega');
            if (!chandelure?.released || chandelure.raid_tier !== 8 || GetRaidStats(chandelure).hp !== 25000)
                throw new Error('Mega Chandelure is missing its released Super Mega profile.');
            if (!HasSuperMaxUnlocked(chandelure) || GetAttackerLevel(chandelure,50,false) !== 52)
                throw new Error('Released Mega Chandelure must qualify for Super Max and its native level boost.');
            const plus = GetPlusMoveProjectionInfo(chandelure,false);
            if (plus?.status !== 'source' || plus.move.power !== 145 || plus.move.name !== 'Ominous Wind+')
                throw new Error('Mega Chandelure must use its published Ominous Wind+ without forecasts.');
            const audit = GetPokemonAuditInfo(609,'Mega',BuildPokemonAuditContext());
            if (!audit.currentReleased || !audit.attackerIncluded || !audit.bossIncluded || audit.evidence !== 'verified')
                throw new Error('Mega Chandelure audit disagrees with released calculation eligibility.');
            for (const [id,form] of [[15,'Mega'],[26,'Mega'],[26,'MegaY'],[71,'Mega'],[121,'Mega'],
                    [149,'Mega'],[227,'Mega'],[229,'Mega'],[310,'Mega'],[687,'Mega'],[870,'Mega']]) {
                const pokemon = GetRaidBosses().find(p=>p.id===id&&p.form===form);
                if (!pokemon || pokemon.raid_tier !== 4 || GetRaidStats(pokemon).hp !== 9000)
                    throw new Error('Missing regular Mega raid profile: '+id+'/'+form);
                if (!HasSuperMaxUnlocked(pokemon) || GetAttackerLevel(pokemon,50,false) !== 52)
                    throw new Error('Moving a boss to regular Mega raids removed Super Max: '+id+'/'+form);
                if (GetPlusMoveProjectionInfo(pokemon,false)?.status !== 'source')
                    throw new Error('A regular Mega lost its published plus move: '+id+'/'+form);
            }
            for (const id of [652,655,658]) {
                const pokemon = GetCalculationPokemon(false).find(p=>p.id===id&&p.form==='Mega');
                if (!pokemon?.released || !HasSuperMaxUnlocked(pokemon) || GetAttackerLevel(pokemon,50,false) !== 52)
                    throw new Error('A research Mega must remain a released Super Max attacker: '+id);
                if (GetRaidBosses().some(p=>p.id===id&&p.form==='Mega')
                        || !GetRaidBosses(null,null,true).some(p=>p.id===id&&p.form==='Mega'))
                    throw new Error('A research Mega raid debut must stay in the future boss pool: '+id);
                const info = GetPokemonAuditInfo(id,'Mega',BuildPokemonAuditContext());
                if (!info.attackerIncluded || info.bossIncluded || info.currentRaidReleased)
                    throw new Error('Research Mega audit disagrees with separate attacker and boss release status: '+id);
            }
        }
        if (settings_speculative !== preview) { settings_speculative = preview; PatchSpeculative(preview); }
        const before = JSON.stringify(rendered);
        SetIncludeUnreleased(true); RenderBossList();
        const after = [...document.querySelectorAll('.boss-tier-group')].flatMap(group =>
            [...group.querySelectorAll('.boss-cell')].flatMap(cell => [...cell.querySelectorAll('.boss-entry')]
                .map(link => ({key:link.dataset.key,hp:Number(group.dataset.hp),availability:cell.dataset.availability}))));
        if (JSON.stringify(after) !== before) throw new Error('The global Unreleased setting hid a column.');
        SetIncludeUnreleased(false);
        return {released:rendered.filter(row=>row.availability==='released').length,
            unreleased:rendered.filter(row=>row.availability==='unreleased').length};
    });
    for (const key of ['894/Normal','895/Normal','905/Incarnate'])
        assert.equal(await page.locator(`.boss-tier-group[data-hp="15000"] .boss-cell[data-availability="released"] .boss-entry[data-key="${key}"]`).count(), 1);
    for (const id of [791,792])
        assert.equal(await page.locator(`.boss-tier-group[data-category="legendary"] .boss-cell[data-availability="released"] .boss-entry[data-id="${id}"]`).count(), 1);
    for (const key of ['15/Mega','26/Mega','26/MegaY','71/Mega','121/Mega','149/Mega','227/Mega','229/Mega','310/Mega','687/Mega','870/Mega'])
        assert.equal(await page.locator(`.boss-tier-group[data-category="mega"] .boss-cell[data-availability="released"] .boss-entry[data-key="${key}"]`).count(),1);
    for (const id of [652,655,658]) {
        assert.equal(await page.locator(`.boss-cell[data-availability="released"] .boss-entry[data-key="${id}/Mega"]`).count(),0);
        assert.equal(await page.locator(`.boss-cell[data-availability="unreleased"] .boss-entry[data-key="${id}/Mega"]`).count(),1);
    }
    assert.equal(await page.locator('.boss-entry[data-key="800/Ultra"],.boss-entry[data-key="890/Eternamax"]').count(), 0);
    assert(!await page.locator('.boss-name .raid-species').evaluateAll(names=>names.some(name=>name.textContent.startsWith('Shadow '))),
        'Shadow attacker availability must not rename an ordinary raid boss.');
    await page.evaluate(async()=>{const image=new Image();image.src=ICONS_URL;await image.decode();});
    for (const width of [1100,900,600,390,320]) {
        await page.setViewportSize({width,height:900});
        const layout = await page.evaluate(() => ({overflow:document.documentElement.scrollWidth > innerWidth + 1,
            columns:[...document.querySelectorAll('.boss-tier-rosters')].every(row => {
                const [a,b] = [...row.children].map(cell => cell.getBoundingClientRect());
                return a.width > 0 && Math.abs(a.width-b.width) < 1 && a.right <= b.left + 1 && b.right <= innerWidth;
            }),
            clipped:[...document.querySelectorAll('.boss-name')].filter(name => name.scrollWidth > name.clientWidth + 1).map(name=>name.textContent)}));
        assert.equal(layout.overflow, false, `Page overflow at ${width}px.`);
        assert(layout.columns, `Released and Unreleased columns must stay side by side at ${width}px.`);
        assert.deepEqual(layout.clipped, [], `Boss names clipped at ${width}px.`);
        if (process.env.BOSS_LIST_SCREENSHOT && [1100,390].includes(width))
            await page.screenshot({path:process.env.BOSS_LIST_SCREENSHOT.replace(/\.png$/,`-${width}.png`)});
    }
    await page.setViewportSize({width:1100,height:900});
    await page.locator('.boss-entry[data-key="905/Incarnate"]').click();
    await page.waitForFunction(() => document.querySelector('#pokedex-page')?.checkVisibility());
    assert.equal(new URL(page.url()).searchParams.get('p'), '905');
    assert.equal(new URL(page.url()).searchParams.get('f'), 'Incarnate');
    await page.goBack();
    await page.waitForFunction(() => document.querySelector('#boss-list')?.checkVisibility());
    assert.equal(await page.locator('#boss-list-groups thead th').count(), 2, 'Repeated renders must retain the headers.');
    await page.reload();
    await page.locator('.boss-tier-group').last().waitFor();
    assert.equal(await page.locator('.boss-entry').count(), report.released + report.unreleased);
    await page.locator('#boss-leaderboard-back').click();
    await page.waitForFunction(() => document.querySelector('#raid-leaderboard')?.checkVisibility());
    await page.locator('#raid-boss-list').click();
    await page.waitForFunction(() => document.querySelector('#boss-list')?.checkVisibility());
    assert(new URL(page.url()).searchParams.has('bosses'));
    assert.equal(await page.evaluate(() => raidLeaderboardWorker), null, 'Opening the boss list must cancel pending ranking work.');
    await page.locator('#header-left').click();
    await page.waitForFunction(() => document.querySelector('#raid-leaderboard')?.checkVisibility());
    await page.locator('#menu-icon').hover();
    await page.locator('#boss-list-link').click();
    await page.waitForFunction(() => document.querySelector('#boss-list')?.checkVisibility());
    assert.equal(await page.title(), 'Boss List - DialgaDex');
    assert.deepEqual(errors, []);
    console.log('Boss List species categories, current five-star profiles, links, history, reload and responsive two-column layout:', report);
} finally { await browser.close(); }
