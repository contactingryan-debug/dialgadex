import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const inputs = JSON.parse(read('./fixtures/plus-inputs.json'));
const projections = JSON.parse(read('../data/plus-move-projections.json'));
const manifest = JSON.parse(read('../data/audit-overrides.json'));
const strings = JSON.parse(read('../locales/en.json'));

function fixture() {
    const context = vm.createContext({performance, setTimeout, structuredClone, URL, URLSearchParams,
        location: {href:'https://example.test/dialgadex/?audit'}, inputs: structuredClone(inputs),
        projections: structuredClone(projections), manifest: structuredClone(manifest), strings});
    for (const name of ['dataload','settings','pokemon_enums','data-rules','plus-projections','pokemon_utils','calc','translation','raid-points','data-audit'])
        vm.runInContext(read('../scripts/' + name + '.js'), context);
    vm.runInContext(`
        jb_source_pkm=structuredClone(inputs.pokemon);jb_pkm=structuredClone(inputs.pokemon);
        jb_spec=structuredClone(inputs.announced);jb_fm=inputs.fastMoves;jb_cm=inputs.chargedMoves;
        jb_audit_manifest=manifest;jb_plus_predictions=projections;jb_max_id=998;
        fallbackMap=strings;GetIncludeUnreleased=()=>settings_include_unreleased;
        settings_speculative=true;settings_include_unreleased=false;settings_supermega_level=4;
        ApplyPokemonAuditOverrides(jb_pkm,manifest);PatchSpeculative(true);
    `, context);
    const evaluate = code => vm.runInContext(code, context);
    const json = code => JSON.parse(evaluate('JSON.stringify(' + code + ')'));
    return {evaluate, json};
}

test('all 69 unknown canonical powers reproduce the recovered per-move model', () => {
    const {json} = fixture();
    const predicted = projections.assignments.filter(rule => rule.move && rule.publishedPower == null);
    assert.equal(predicted.length, 69);
    for (const rule of predicted)
        assert.equal(json(`PredictPlusMovePower(${rule.referenceAttack},${rule.referenceDuration})`), rule.referencePrediction, rule.pokemon);
});

test('future calculations add scoped moves without changing active source data', () => {
    const {evaluate,json}=fixture();
    const before=json('[jb_pkm,jb_cm]');
    evaluate('future=GetCalculationPokemon(true)');
    const pinsir=json('future.find(p=>p.id===127)');
    assert.equal(pinsir.temp_cm.length,1);
    assert.match(pinsir.temp_cm[0],/Aerial Ace\+ \[forecast:127\/Mega\]/);
    const move=json(`FindChargedMove(${JSON.stringify(pinsir.temp_cm[0])})`);
    assert.equal(move.power,150);assert.equal(move.energy_delta,-100);assert.equal(move.duration,2500);
    assert.deepEqual(json('[jb_pkm,jb_cm]'),before);
    assert(!json('GetCalculationPokemon(false).some(p=>p._plusProjections)'));
    assert(!json('jb_cm.some(m=>m._plus_projection)'));
    assert.equal(json(`TranslatedMoveName(${move.id},'Flying')`),'Aerial Ace+');
});

test('published and current source values take priority; Mega power applies once', () => {
    const {evaluate,json}=fixture();
    evaluate('future=GetCalculationPokemon(true)');
    const sableye=json('GetPlusMoveProjectionInfo(future.find(p=>p.id===302),true)');
    assert.equal(sableye.move.power,160);assert.equal(sableye.powerKind,'published');
    assert.notEqual(json(`PredictPlusMovePower(151,${sableye.move.duration})`),160);
    const bax=json('GetPlusMoveProjectionInfo(future.find(p=>p.id===998),true)');
    assert.equal(bax.move.power,140);
    assert.equal(json(`ProcessPower(FindChargedMove(${JSON.stringify(bax.move.name)}))`),140*Math.fround(1.3));
    const original=structuredClone(inputs.chargedMoves.find(move=>move.name==='Dynamic Punch+'));
    assert.deepEqual(json('FindChargedMove("Dynamic Punch+")'),original);
    assert.equal(json('GetPlusMoveProjectionInfo(future.find(p=>p.id===150&&p.form==="Mega"),true).status'),'source');
    evaluate(`jb_cm.push({id:99999,name:'Aerial Ace+',type:'Flying',mega_temp:true,power:210,energy_delta:-50,duration:3500})`);
    const newer=json('GetPlusMoveProjectionInfo(future.find(p=>p.id===127),true)');
    assert.equal(newer.move.power,210);assert.equal(newer.move.duration,3500);assert.equal(newer.move.energy_delta,-50);
    assert.equal(newer.powerKind,'source');
    assert.equal(json('jb_cm.find(m=>m.id===99999).power'),210);
});

test('repeated filter and Data Preview toggles restore learnsets and source definitions', () => {
    const {evaluate,json}=fixture();
    const before=json('[jb_pkm,jb_cm]');
    for(let i=0;i<3;i++) {
        evaluate('settings_include_unreleased=true;RefreshPlusMoveProjections(true);RefreshPlusMoveProjections(true)');
        assert.equal(json('jb_pkm.find(p=>p.id===127).temp_cm.length'),1);
        const current=json('GetCalculationPokemon(false)');
        assert(!current.some(p=>p._plusProjections));
        assert(!current.some(p=>p.id===998));
        evaluate('PatchSpeculative(false);settings_speculative=false');
        assert(!json('jb_pkm.some(p=>p.id===998)'));
        assert.equal(json('jb_pkm.find(p=>p.id===127).temp_cm.length'),1);
        evaluate('settings_speculative=true;PatchSpeculative(true);settings_include_unreleased=false;RefreshPlusMoveProjections(false)');
        assert.deepEqual(json('[jb_pkm,jb_cm]'),before);
    }
});

test('forecasts neither invent unassigned moves nor enable placeholder learnsets', () => {
    const {evaluate,json}=fixture();
    evaluate('future=GetCalculationPokemon(true)');
    for(const id of [382,718,800,801])assert(!json(`future.find(p=>p.id===${id}).temp_cm?.length || false`));
    assert.equal(json('IsPokemonCalculationEligible(future.find(p=>p.id===800),true)'),false);
    assert.equal(json('IsPokemonCalculationEligible(future.find(p=>p.id===801),true)'),false);
    // Even a hypothetical assignment cannot repair the base Splash/Struggle placeholder.
    evaluate(`Object.assign(jb_plus_predictions.assignments.find(r=>r.id===800),
        {move:'Outrage+',baseMove:'Outrage',type:'Dragon',referenceDuration:4000,registryRow:999})`);
    assert.equal(json('GetPlusMoveProjectionInfo(jb_pkm.find(p=>p.id===800),true).status'),'incomplete');
    assert(!json('GetCalculationPokemon(true).find(p=>p.id===800).temp_cm?.length || false'));
});

test('same named predictions remain form-specific and evidence is exposed', () => {
    const {evaluate,json}=fixture();
    evaluate(`const venusaur=structuredClone(jb_pkm.find(p=>p.id===3));
        venusaur.form='MegaY';venusaur.stats.baseAttack=400;jb_pkm.push(venusaur);
        jb_plus_predictions.assignments.push({...jb_plus_predictions.assignments.find(r=>r.id===3),form:'MegaY',registryRow:999});
        future=GetCalculationPokemon(true)`);
    const moves=json('future.filter(p=>p.id===3).map(p=>GetPlusMoveProjectionInfo(p,true).move)');
    assert.notEqual(moves[0].name,moves[1].name);assert.notEqual(moves[0].power,moves[1].power);
    const aero=json('GetPlusMoveProjectionInfo(future.find(p=>p.id===142),true)');
    assert.equal(aero.move.projection_hypothesis,true);
    assert.match(evaluate(`PlusMoveProjectionSummary(FindChargedMove(${JSON.stringify(aero.move.name)}))`),/unverified hypothesis/);
    evaluate('auditContext=BuildPokemonAuditContext()');
    const copy=evaluate('PokemonAuditCopyText(GetPokemonAuditInfo(127,"Mega",auditContext),auditContext)');
    assert.match(copy,/Aerial Ace\+/);assert.match(copy,/150 \(estimated\)/);assert.match(copy,/base Attack 305/);
    assert.match(copy,/not used in current-only rankings/);
});

test('Baxcalibur stamina is corrected before rounding only for the reviewed unreleased tuple', () => {
    const {evaluate,json}=fixture();
    assert.equal(json('jb_pkm.find(p=>p.id===998).stats.baseStamina'),244);
    for(const [released,stamina] of [[true,243],[false,250]]) {
        evaluate(`sample={id:998,form:'Mega',released:${released},stats:{baseAttack:331,baseDefense:221,baseStamina:${stamina}}};ApplyPokemonAuditOverrides([sample],manifest)`);
        assert.equal(json('sample.stats.baseStamina'),stamina);
    }
});
