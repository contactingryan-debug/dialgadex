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

test('the four HP groups partition the ranking pool once and retain current release status under preview', () => {
    const {evaluate, json} = fixture();
    assert.deepEqual(json('GetBossListGroups().map(g=>g.hp)'), [25000,22500,15000,9000]);
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

test('Boss List honors preview settings and excludes placeholders, unsupported aliases, low tiers and Max-only forms', () => {
    for (const preview of [false,true]) {
        const {json} = fixture(preview);
        const keys = json('GetBossListGroups().flatMap(g=>g.released.concat(g.unreleased).map(PokemonDataKey))');
        for (const key of ['800/Ultra','890/Eternamax','905/Normal','1/Normal']) assert(!keys.includes(key), key);
        assert.equal(keys.includes('718/Mega'), preview);
        assert(json('GetBossListGroups().every(g=>g.released.concat(g.unreleased).every(p=>GetRaidStats(p).hp===g.hp))'));
    }
});
