import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

function fixture(preview = true) {
    const context = vm.createContext({performance, setTimeout, structuredClone});
    for (const name of ['dataload', 'settings', 'pokemon_enums', 'data-rules', 'pokemon_utils', 'boss-list'])
        vm.runInContext(read('../scripts/' + name + '.js'), context);
    context.manifest = JSON.parse(read('../data/audit-overrides.json'));
    vm.runInContext(`
        const make = (id, form, raid_tier, released) => ({id, name:'Test', form, raid_tier, released,
            types:['Normal'], fm:['Tackle'], cm:['Body Slam'],
            stats:{baseAttack:100, baseDefense:100, baseStamina:100}});
        jb_source_pkm = [make(6,'Mega',8,true), make(9,'Mega',8,false),
            make(380,'Mega',6,true), make(150,'Mega',6,false),
            make(894,'Normal',7,true), make(895,'Normal',7,true),
            make(905,'Incarnate',7,true), make(905,'Normal',7,true),
            make(647,'Resolute',5,false), make(3,'Mega',4,true), make(65,'Mega',4,false),
            {...make(800,'Ultra',6,false),cm:['Struggle']}, make(890,'Eternamax',5,true),
            make(1,'Normal',1,true)];
        jb_pkm = ApplyPokemonAuditOverrides(structuredClone(jb_source_pkm), manifest);
        jb_audit_manifest = manifest;
        jb_fm = [{name:'Tackle', duration:500}];
        jb_cm = [{name:'Body Slam', duration:1000}, {name:'Struggle', duration:1000}];
        jb_spec = [{id:65, form:'Mega', released:true}, make(718,'Mega',9,true),
            {id:905,form:'Incarnate',raid_tier:7}];
        settings_speculative = ${preview};
        if (settings_speculative) PatchSpeculative(true);
    `, context);
    const evaluate = expression => vm.runInContext(expression, context);
    const json = expression => JSON.parse(evaluate('JSON.stringify(' + expression + ')'));
    return {evaluate, json};
}

test('former Elite bosses use the five-star profile in current and preview data without changing raw records', () => {
    const {evaluate, json} = fixture();
    for (const future of [false, true]) for (const [id, form] of [[894,'Normal'], [895,'Normal'], [905,'Incarnate']]) {
        assert.equal(json(`GetCalculationPokemon(${future}).find(p=>p.id===${id}&&p.form==='${form}').raid_tier`), 5);
        assert.equal(json(`GetRaidStats(GetCalculationPokemon(${future}).find(p=>p.id===${id}&&p.form==='${form}')).hp`), 15000);
        assert.equal(json(`jb_source_pkm.find(p=>p.id===${id}&&p.form==='${form}').raid_tier`), 7);
    }
    assert.equal(json('jb_pkm.find(p=>p.id===905&&p.form==="Normal").raid_tier'), 5);
    evaluate('jb_pkm.find(p=>p.id===895).raid_tier=6;ApplyPokemonAuditOverrides(jb_pkm,manifest)');
    assert.equal(json('jb_pkm.find(p=>p.id===895).raid_tier'), 6, 'Only stale Elite tags should be corrected.');
});

test('Boss List categories partition the ranking pool once and retain current release status under preview', () => {
    const {evaluate, json} = fixture();
    assert.deepEqual(json('GetBossListGroups().map(g=>g.key)'),
        ['super-mega','legendary-mega','legendary','sub-legendary','mythical','mega']);
    const released = json('GetBossListGroups().flatMap(g=>g.released.map(PokemonDataKey))');
    const unreleased = json('GetBossListGroups().flatMap(g=>g.unreleased.map(PokemonDataKey))');
    assert(released.includes('905/Incarnate'));
    assert(unreleased.includes('65/Mega') && unreleased.includes('718/Mega'));
    assert(!released.includes('65/Mega') && !released.includes('718/Mega'));
    assert.deepEqual([...released].sort(), json('GetRaidBosses(null,null,false).map(PokemonDataKey).sort()'));
    const union = [...new Set(json('GetRaidBosses(null,null,false).concat(GetRaidBosses(null,null,true)).map(PokemonDataKey)'))].sort();
    assert.deepEqual([...released, ...unreleased].sort(), union);
    assert.equal(new Set([...released, ...unreleased]).size, released.length + unreleased.length);
    const before = json('GetBossListGroups()');
    evaluate('settings_include_unreleased=true');
    assert.deepEqual(json('GetBossListGroups()'), before, 'Both columns are independent of the leaderboard toggle.');
});

test('species categories preserve the supplied distinctions and apply to every form without changing eligibility', () => {
    const {evaluate,json} = fixture();
    const cases = [
        [150,'Normal','legendary'], [483,'Origin','legendary'], [800,'Dawn_wings','legendary'],
        [888,'Crowned_sword','legendary'], [1007,'Normal','legendary'], [1008,'Normal','legendary'],
        [380,'Normal','sub-legendary'], [486,'Normal','sub-legendary'], [773,'Fire','sub-legendary'],
        [793,'Normal','sub-legendary'], [807,'Normal','mythical'], [905,'Therian','sub-legendary'],
        [151,'Normal','mythical'], [386,'Defense','mythical'], [493,'Dragon','mythical'],
        [649,'Shock','mythical'], [720,'Unbound','mythical'], [893,'Normal','mythical'],
        [1009,'Normal','paradox'], [1010,'Normal','paradox'], [1020,'Normal','paradox'],
        [1021,'Normal','paradox'], [1022,'Normal','paradox'], [1023,'Normal','paradox'],
    ];
    for (const [id,form,expected] of cases)
        assert.equal(json(`GetBossListSpeciesGroup({id:${id},form:'${form}'})`), expected, `${id}/${form}`);
    // Mega/Primal/Super profiles take precedence over a species' classification.
    assert.equal(json('GetBossListCategory(jb_pkm.find(p=>p.id===380))'), 'legendary-mega');
    assert.equal(json('GetBossListCategory(jb_pkm.find(p=>p.id===150))'), 'legendary-mega');
    const before = json('GetRaidBosses(null,null,true)');
    evaluate('GetBossListGroups()');
    assert.deepEqual(json('GetRaidBosses(null,null,true)'), before);
    assert(!json('GetBossListGroups().flatMap(g=>g.released.concat(g.unreleased)).some(p=>p.id===151)'));
});

test('an unclassified future five-star species remains listed visibly instead of being mislabeled or dropped', () => {
    const {evaluate,json} = fixture(false);
    evaluate('jb_pkm.push({...structuredClone(jb_pkm.find(p=>p.id===895)),id:25,form:"Normal",released:false})');
    assert.equal(json('GetBossListGroups().find(g=>g.key==="other").unreleased[0].id'), 25);
    assert.equal(json('GetBossListGroups().find(g=>g.key==="other").released.length'), 0);
});

test('the optional Paradox section appears only for eligible forms and leaves Koraidon/Miraidon Legendary', () => {
    const {evaluate,json} = fixture(false);
    assert(!json('GetBossListGroups().some(g=>g.key==="paradox")'));
    evaluate('jb_pkm.push({...structuredClone(jb_pkm.find(p=>p.id===895)),id:1009,form:"Normal",released:false})');
    assert.deepEqual(json('GetBossListGroups().find(g=>g.key==="paradox").unreleased.map(p=>p.id)'), [1009]);
    evaluate('jb_pkm.find(p=>p.id===1009).cm=["Struggle"]');
    assert(!json('GetBossListGroups().some(g=>g.key==="paradox")'));
    for (const id of [1007,1008]) assert.equal(json(`GetBossListSpeciesGroup({id:${id}})`), 'legendary');
});

test('Boss List honors preview settings and excludes placeholders, unsupported aliases, low tiers and Max-only forms', () => {
    for (const preview of [false,true]) {
        const {json} = fixture(preview);
        const keys = json('GetBossListGroups().flatMap(g=>g.released.concat(g.unreleased).map(PokemonDataKey))');
        for (const key of ['800/Ultra','890/Eternamax','905/Normal','1/Normal']) assert(!keys.includes(key), key);
        assert.equal(keys.includes('718/Mega'), preview);
        assert(json('GetBossListGroups().every(g=>g.released.concat(g.unreleased).every(p=>GetRaidStats(p).hp===g.hp))'));
    }
});
