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
    const tab = (key, target = page) => target.locator('#boss-tab-' + key);
    const panel = (key, target = page) => target.locator('#boss-tier-' + key);
    async function selected(key, target = page) {
        await panel(key, target).waitFor({timeout:120000});
        assert.equal(await target.getByRole('tabpanel').count(),1);
        assert.equal(await tab(key, target).getAttribute('aria-selected'),'true');
        assert.equal(await tab(key, target).getAttribute('tabindex'),'0');
        assert.equal(await target.locator('.boss-egg-tab[tabindex="-1"]').count(),3);
    }
    const start = new URL(base); start.search = '?bosses';
    await page.goto(start.toString(), {waitUntil:'domcontentloaded'});
    await selected('super-mega');
    assert.equal(await page.title(), 'Raid Bosses - PalkiaDex');
    assert.equal(await page.locator('#boss-list .raid-page-links, #boss-list .card-header').count(),0);
    assert.equal(await page.locator('#boss-list').getByRole('heading',{level:1,name:'Raid Bosses'}).count(),1);
    assert.deepEqual(await page.getByRole('tab').evaluateAll(tabs => tabs.map(tab => [
        tab.getAttribute('aria-label'), tab.textContent.trim(),
        Number(document.getElementById(tab.getAttribute('aria-controls')).dataset.hp),
        tab.querySelector('.boss-egg').getAttribute('src'),
    ])), [
        ['Super Mega','',25000,'imgs/raids/super-mega-egg.png'],
        ['Legendary Mega','',22500,'imgs/raids/dark-mega-egg.png'],
        ['Five-Star Raids','',15000,'imgs/raids/legendary-egg.png'],
        ['Mega','',9000,'imgs/raids/mega-egg.png'],
    ]);
    await page.locator('.boss-egg').evaluateAll(images => Promise.all(images.map(image => image.decode())));
    const report = await page.evaluate(() => {
        const readRoster = () => [...document.querySelectorAll('.boss-tier-group')].flatMap(tier =>
            [...tier.querySelectorAll('.boss-release-roster')].flatMap(roster =>
                [...roster.querySelectorAll('.boss-entry')].map(link => ({key:link.dataset.key,
                    hp:Number(tier.dataset.hp), availability:roster.dataset.availability}))));
        const rendered = readRoster();
        const groups = GetBossListGroups();
        const expected = groups.flatMap(group => ['released','unreleased'].flatMap(availability =>
            group[availability].map(pokemon => ({key:PokemonDataKey(pokemon),hp:group.hp,availability}))));
        if (JSON.stringify(rendered) !== JSON.stringify(expected)) throw new Error('Rendered roster differs from the calculation pools.');
        const pool = new Set(GetRaidBosses(null,null,false).concat(GetRaidBosses(null,null,true)).map(PokemonDataKey));
        if (pool.size !== rendered.length || rendered.some(row => !pool.has(row.key))) throw new Error('Bosses missing or duplicated.');
        for (const tier of document.querySelectorAll('.boss-tier-group')) {
            const count = tier.querySelectorAll('.boss-entry').length;
            if (tier.querySelector('.boss-tier-heading .boss-total-count').textContent !== count + ' total')
                throw new Error('Tier totals must include all subsection rosters.');
        }
        for (const group of groups) for (const availability of ['released','unreleased']) {
            const roster = document.querySelector(`[data-category="${group.key}"].boss-tier-rosters > [data-availability="${availability}"]`);
            if (!!roster !== !!group[availability].length)
                throw new Error('Only populated availability groups should appear.');
            if (roster) {
                const label = document.getElementById(roster.getAttribute('aria-labelledby'));
                if (!label?.textContent.endsWith(BossListText(availability)))
                    throw new Error('Each roster needs a readable availability label.');
            }
        }
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
        SetIncludeUnreleased(true); RenderBossList();
        if (JSON.stringify(readRoster()) !== JSON.stringify(rendered))
            throw new Error('The global Unreleased setting changed the roster.');
        SetIncludeUnreleased(false);
        return {released:rendered.filter(row=>row.availability==='released').length,
            unreleased:rendered.filter(row=>row.availability==='unreleased').length};
    });
    for (const key of ['894/Normal','895/Normal','905/Incarnate'])
        assert.equal(await page.locator(`.boss-tier-group[data-hp="15000"] .boss-release-roster[data-availability="released"] .boss-entry[data-key="${key}"]`).count(), 1);
    for (const id of [791,792])
        assert.equal(await page.locator(`.boss-tier-rosters[data-category="legendary"] .boss-release-roster[data-availability="released"] .boss-entry[data-id="${id}"]`).count(), 1);
    for (const key of ['15/Mega','26/Mega','26/MegaY','71/Mega','121/Mega','149/Mega','227/Mega','229/Mega','310/Mega','687/Mega','870/Mega'])
        assert.equal(await page.locator(`.boss-tier-group[data-category="mega"] .boss-release-roster[data-availability="released"] .boss-entry[data-key="${key}"]`).count(),1);
    for (const id of [652,655,658]) {
        assert.equal(await page.locator(`.boss-release-roster[data-availability="released"] .boss-entry[data-key="${id}/Mega"]`).count(),0);
        assert.equal(await page.locator(`.boss-release-roster[data-availability="unreleased"] .boss-entry[data-key="${id}/Mega"]`).count(),1);
    }
    assert.equal(await page.locator('.boss-entry[data-key="800/Ultra"],.boss-entry[data-key="890/Eternamax"]').count(), 0);
    assert(!await page.locator('.boss-name .raid-species').evaluateAll(names=>names.some(name=>name.textContent.startsWith('Shadow '))),
        'Shadow attacker availability must not rename an ordinary raid boss.');
    await page.evaluate(async()=>{const image=new Image();image.src=ICONS_URL;await image.decode();});
    const popup=page.locator('#boss-name-popup');
    const image=popup.locator('.boss-popup-image');
    assert.equal(await image.count(),0,'Previews should load when a boss is selected.');
    const featured=panel('super-mega').locator('[data-availability="released"]');
    const inlineImages=featured.locator('.boss-inline-image');
    assert.equal(await inlineImages.count(),await featured.locator('.boss-entry').count());
    assert.equal(await page.locator('.boss-inline-image').count(),await inlineImages.count());
    const mewtwoX=featured.locator('.boss-entry[data-key="150/Mega"]');
    const inlineMewtwo=mewtwoX.locator('.boss-inline-image');
    await inlineMewtwo.waitFor({timeout:25000});
    assert.match(await inlineMewtwo.getAttribute('src'),/\/graphics\/ani\/mewtwo-megax\.gif$/);
    assert.equal(await mewtwoX.locator('.boss-sprite').isVisible(),false);
    await mewtwoX.hover();
    await popup.waitFor({state:'visible'});
    assert.equal(await popup.textContent(),'Mewtwo (X)');
    assert.equal(await image.count(),0,'Hovering an inline preview should only show its name.');
    await page.mouse.move(0,0);
    await popup.waitFor({state:'hidden'});
    await tab('legendary-mega').click();
    await selected('legendary-mega');
    assert.equal(await panel('legendary-mega').locator('.boss-hp').textContent(),'22,500 HP');
    assert.equal(new URL(page.url()).searchParams.get('tier'),'legendary-mega');
    await tab('legendary-mega').focus();
    await page.keyboard.press('ArrowRight');
    await selected('five-star');
    assert(await tab('five-star').evaluate(tab=>tab===document.activeElement));
    assert.deepEqual(await panel('five-star').locator('.boss-subsection-heading h3').allTextContents(),
        ['Legendary','Sub-Legendary','Mythical']);
    await page.keyboard.press('End');
    await selected('mega');
    await page.keyboard.press('Home');
    await selected('super-mega');
    await page.goBack();
    await selected('mega');
    await page.goForward();
    await selected('super-mega');
    await tab('five-star').click();
    await selected('five-star');
    await page.locator('.boss-entry[data-key="150/Normal"]').hover();
    await image.waitFor({state:'visible',timeout:20000});
    assert.match(await image.getAttribute('src'),/\/graphics\/ani\/mewtwo\.gif$/);
    const mewtwoImage=await image.boundingBox();
    const mewtwoName=await popup.locator('.boss-name').boundingBox();
    const bodyCenter=mewtwoImage.x + mewtwoImage.width * .28;
    const nameCenter=mewtwoName.x + mewtwoName.width / 2;
    assert(Math.abs(bodyCenter-nameCenter)<1,'Mewtwo’s body should line up with its name.');
    await page.mouse.move(0,0);
    await popup.waitFor({state:'hidden'});

    await tab('mega').click();
    await selected('mega');
    await page.locator('.boss-entry[data-key="6/Mega"]').hover();
    await image.waitFor({state:'visible',timeout:20000});
    assert.match(await image.getAttribute('src'),/\/graphics\/ani\/charizard-megax\.gif$/);
    const imageBox=await image.boundingBox();
    const nameBox=await popup.locator('.boss-name').boundingBox();
    assert(imageBox.y+imageBox.height<=nameBox.y,'The animation should sit above the name.');
    await page.mouse.move(0,0);
    await popup.waitFor({state:'hidden'});
    assert.equal(await image.count(),0);

    const missingAnimation='**/graphics/ani/charizard-megay.gif';
    await page.route(missingAnimation,route=>route.fulfill({status:404}));
    await page.locator('.boss-entry[data-key="6/MegaY"]').hover();
    await image.waitFor({state:'visible',timeout:20000});
    assert.match(await image.getAttribute('src'),/\/graphics\/pogo-256\/charizard-megay\.png$/);
    await page.mouse.move(0,0);
    await popup.waitFor({state:'hidden'});
    await page.unroute(missingAnimation);

    await tab('super-mega').click();
    for (const width of [1100,900,600,390,320]) {
        await page.setViewportSize({width,height:900});
        const layout = await page.evaluate(() => ({overflow:document.documentElement.scrollWidth > innerWidth + 1,
            tabsFit:[...document.querySelectorAll('.boss-egg-tab')].map(tab=>tab.getBoundingClientRect())
                .every((rect,i,rects)=>rect.top===rects[0].top&&rect.left>=0&&rect.right<=innerWidth
                    &&rect.width>=44&&rect.height>=44),
            fullWidth:[...document.querySelectorAll('.boss-tier-group:not([hidden]) .boss-tier-rosters')].every(group => {
                const bounds = group.getBoundingClientRect();
                const [first, second] = [...group.children].map(roster => roster.getBoundingClientRect());
                return [...group.children].every(roster => {
                    const rect = roster.getBoundingClientRect();
                    return Math.abs(rect.width - bounds.width) < 1 && Math.abs(rect.left - bounds.left) < 1;
                }) && (!second || first.bottom <= second.top + 1);
            }),
            namesHidden:[...document.querySelectorAll('.boss-entry > .boss-name')]
                .every(name=>getComputedStyle(name).display==='none'),
            accessible:[...document.querySelectorAll('.boss-entry')].every(link=>link.getAttribute('aria-label')),
            sharedRows:[...document.querySelectorAll('.boss-tier-group:not([hidden]) .boss-roster')].filter(roster=>roster.children.length>1)
                .every(roster=>{const [a,b]=[...roster.querySelectorAll('.boss-entry')].map(link=>link.getBoundingClientRect());
                    return Math.abs(a.top-b.top)<1&&b.left>a.left;}),
            wraps:[...document.querySelectorAll('.boss-roster')].every(roster=>{
                const bounds=roster.getBoundingClientRect();
                return [...roster.querySelectorAll('.boss-entry')].every(link=>{
                    const rect=link.getBoundingClientRect();
                    return rect.left>=bounds.left-1 && rect.right<=bounds.right+1;
                });
            })}));
        assert.equal(layout.overflow, false, `Page overflow at ${width}px.`);
        assert(layout.tabsFit, `The egg tabs must fit in one row at ${width}px.`);
        assert(layout.fullWidth, `Availability groups must stack and use the full width at ${width}px.`);
        assert(layout.namesHidden&&layout.accessible,`Names should be hidden visually and remain accessible at ${width}px.`);
        assert(layout.sharedRows&&layout.wraps,`Sprites should share rows and wrap at ${width}px.`);
        const floette=page.locator('.boss-entry[data-key="670/Mega"]');
        await floette.hover();
        await popup.waitFor({state:'visible'});
        assert.equal(await popup.textContent(),'Floette (Eternal Flower)');
        const box=await popup.boundingBox();
        assert(box.x>=0&&box.x+box.width<=width&&box.y>=0&&box.y+box.height<=900,'Name popup must stay inside the viewport.');
        await page.mouse.move(0,0);
        await popup.waitFor({state:'hidden'});
        if (process.env.BOSS_LIST_SCREENSHOT && [1100,390].includes(width))
            await page.screenshot({path:process.env.BOSS_LIST_SCREENSHOT.replace(/\.png$/,`-${width}.png`)});
    }
    await page.setViewportSize({width:1100,height:900});
    await tab('five-star').click();
    await page.locator('.boss-entry[data-key="905/Incarnate"]').focus();
    await page.keyboard.press('Tab');
    await page.locator('#boss-name-popup').waitFor({state:'visible'});
    assert.equal(await page.locator('#boss-name-popup').textContent(),
        await page.evaluate(()=>document.activeElement.getAttribute('aria-label')));
    await page.keyboard.press('Escape');
    await page.locator('#boss-name-popup').waitFor({state:'hidden'});
    await page.locator('.boss-entry[data-key="905/Incarnate"]').click();
    await page.waitForFunction(() => document.querySelector('#pokedex-page')?.checkVisibility());
    assert.equal(new URL(page.url()).searchParams.get('p'), '905');
    assert.equal(new URL(page.url()).searchParams.get('f'), 'Incarnate');
    await page.goBack();
    await selected('five-star');
    await page.locator('.boss-entry[data-key="905/Incarnate"]').focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('#pokedex-page')?.checkVisibility());
    assert.equal(new URL(page.url()).searchParams.get('f'),'Incarnate');
    await page.goBack();
    await selected('five-star');
    await page.reload({waitUntil:'domcontentloaded'});
    await selected('five-star');
    assert.equal(new URL(page.url()).searchParams.get('tier'),'five-star');
    assert.equal(await page.locator('.boss-entry').count(), report.released + report.unreleased);
    await page.locator('#header-left').click();
    await page.waitForFunction(() => document.querySelector('#raid-leaderboard')?.checkVisibility());
    assert.equal(await page.locator('#raid-boss-list').textContent(), 'Raid Bosses →');
    await page.locator('#raid-boss-list').click();
    await selected('super-mega');
    assert(new URL(page.url()).searchParams.has('bosses'));
    assert.equal(await page.evaluate(() => raidLeaderboardWorker), null, 'Opening the boss list must cancel pending ranking work.');
    await page.locator('#header-left').click();
    await page.waitForFunction(() => document.querySelector('#raid-leaderboard')?.checkVisibility());
    await page.locator('#menu-icon').hover();
    await page.locator('#boss-list-link').click();
    await page.waitForFunction(() => document.querySelector('#boss-list')?.checkVisibility());
    assert.equal(await page.title(), 'Raid Bosses - PalkiaDex');
    const touch=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true,
        locale:'es-ES',ignoreHTTPSErrors:process.env.PLAYWRIGHT_IGNORE_HTTPS_ERRORS==='1'});
    touch.on('pageerror',error=>errors.push(error.message));
    const deepLink = new URL(start);
    deepLink.search = '?bosses&tier=mega&lang=es';
    await touch.goto(deepLink.toString(),{waitUntil:'domcontentloaded'});
    await selected('mega',touch);
    assert.equal(await touch.locator('.boss-inline-image').count(),0);
    await tab('five-star',touch).tap();
    await selected('five-star',touch);
    assert.equal(await panel('five-star',touch).locator('.boss-hp').textContent(),'15.000 PS');
    await touch.reload({waitUntil:'domcontentloaded'});
    await selected('five-star',touch);
    await touch.goBack();
    await selected('mega',touch);
    await touch.goForward();
    await selected('five-star',touch);
    const touchBoss=touch.locator('.boss-entry[data-key="905/Incarnate"]');
    await touchBoss.waitFor({timeout:120000});
    await touchBoss.tap();
    await touch.locator('#boss-name-popup').waitFor({state:'visible'});
    assert.equal(await touch.locator('#boss-name-popup').textContent(),'Enamorus');
    assert(new URL(touch.url()).searchParams.has('bosses'),'The first tap previews the name.');
    await tab('super-mega',touch).tap();
    await touch.locator('#boss-name-popup').waitFor({state:'hidden'});
    await selected('super-mega',touch);
    await tab('five-star',touch).tap();
    await selected('five-star',touch);
    await touchBoss.tap();
    await touch.locator('#boss-name-popup').waitFor({state:'visible'});
    await touchBoss.tap();
    await touch.waitForFunction(()=>document.querySelector('#pokedex-page')?.checkVisibility());
    assert.equal(new URL(touch.url()).searchParams.get('p'),'905');
    assert.equal(new URL(touch.url()).searchParams.get('f'),'Incarnate');
    await touch.close();
    assert.deepEqual(errors, []);
    console.log('Raid Bosses tiers, full-width release groups, compact sprites, name previews and navigation:', report);
} finally { await browser.close(); }
