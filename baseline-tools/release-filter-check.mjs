import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const releaseReview = JSON.parse(readFileSync(new URL('../data/audit-overrides.json', import.meta.url), 'utf8'))
    .releaseReviews.find(review => review.id === 609 && review.form === 'Mega');

function fixture(preview = true) {
    const context = vm.createContext({performance,setTimeout,structuredClone});
    for (const file of ['dataload.js','settings.js','pokemon_enums.js','data-rules.js','pokemon_utils.js'])
        vm.runInContext(readFileSync(new URL('../scripts/'+file,import.meta.url),'utf8'),context);
    vm.runInContext(`
        jb_pkm = [
            {id:1,name:'Bulbasaur',form:'Normal',released:true,shadow:true,raid_tier:5,types:['Grass'],stats:{baseAttack:100}},
            {id:2,name:'Ivysaur',form:'Normal',released:false,shadow:false,raid_tier:5,types:['Grass'],stats:{baseAttack:150}},
            {id:3,name:'Venusaur',form:'Normal',released:true,shadow:false,types:['Grass'],stats:{baseAttack:200}}
        ];
        jb_max_id = 4;
        jb_fm = [{name:'Tackle',duration:500}]; jb_cm = [{name:'Body Slam',duration:1500}];
        for (const p of jb_pkm) {p.fm=['Tackle'];p.cm=['Body Slam'];p.stats.baseDefense=100;p.stats.baseStamina=100;}
        jb_spec = [
            {id:1,name:'Bulbasaur',form:'Normal',types:['Fire'],stats:{baseAttack:999}},
            {id:2,name:'Ivysaur',form:'Normal',released:true},
            {id:4,name:'Charmander',form:'Normal',released:true,shadow:false,raid_tier:5,types:['Fire'],stats:{baseAttack:180}}
        ];
        Object.assign(jb_spec[2],{fm:['Tackle'],cm:['Body Slam'],stats:{baseAttack:180,baseDefense:100,baseStamina:100}});
        Object.assign(jb_spec[0].stats,{baseDefense:100,baseStamina:100});
        settings_speculative = ${preview};
        if (settings_speculative) PatchSpeculative(true);
    `,context);
    const evaluate = expression => vm.runInContext(expression,context);
    const json = expression => JSON.parse(evaluate('JSON.stringify('+expression+')'));
    return {evaluate,json};
}

test('current-only attacker and boss pools use the same source release flags', async()=>{
    const {evaluate,json}=fixture();
    const attackers=await evaluate(`(async()=>{
        const ids=[];
        await SearchAll({...GetDefaultSearchParams(),mega:false},p=>{ids.push(p.id);});
        return JSON.stringify(ids);
    })()`);
    assert.deepEqual(JSON.parse(attackers),[1,1,3]);
    assert.deepEqual(json('GetRaidBosses().map(p=>p.id)'),[1]);
    assert.deepEqual(json('GetRaidBosses("Grass").map(p=>p.id)'),[1]);
    assert.deepEqual(json('GetRaidBosses("Fire").map(p=>p.id)'),[]);
});

test('including unreleased expands both pools while retaining raid eligibility', async()=>{
    const {evaluate,json}=fixture();
    const attackers=await evaluate(`(async()=>{
        const ids=[];
        await SearchAll({...GetDefaultSearchParams(),mega:false,unreleased:true},p=>{ids.push(p.id);});
        return JSON.stringify(ids);
    })()`);
    assert.deepEqual(JSON.parse(attackers),[1,1,2,3,4]);
    assert.deepEqual(json('GetRaidBosses(null,null,true).map(p=>p.id)'),[1,2,4]);
    assert.deepEqual(json('GetRaidBosses("Fire",null,true).map(p=>p.id)'),[1,4]);
    assert(!json('GetRaidBosses(null,null,true).some(p=>p.id===3)'));
});

test('current-only data restores announced stats and never mutates the preview',()=>{
    const {evaluate,json}=fixture();
    const before=json('jb_pkm');
    assert.equal(json('GetCalculationPokemon(false).find(p=>p.id===1).stats.baseAttack'),100);
    assert.equal(json('GetCalculationPokemon(true).find(p=>p.id===1).stats.baseAttack'),999);
    assert.equal(json('GetCalculationPokemon(false).find(p=>p.id===2).released'),false);
    assert.equal(json('GetCalculationPokemon(false).some(p=>p.id===4)'),false);
    evaluate('GetCalculationPokemon(false)[0].stats.baseAttack=321');
    assert.deepEqual(json('jb_pkm'),before);
    assert.equal(evaluate('settings_speculative'),true);
});

test('unreleased mode works with Data Preview disabled',()=>{
    const {json}=fixture(false);
    assert.deepEqual(json('GetRaidBosses().map(p=>p.id)'),[1]);
    assert.deepEqual(json('GetRaidBosses(null,null,true).map(p=>p.id)'),[1,2]);
    assert.equal(json('GetCalculationPokemon(true).find(p=>p.id===1).stats.baseAttack'),100);
});

test('worker-side source data needs no preview undo records',()=>{
    const {evaluate,json}=fixture(false);
    evaluate('jb_unpatch=undefined;settings_speculative=true');
    assert.deepEqual(json('GetRaidBosses().map(p=>p.id)'),[1]);
    assert.deepEqual(json('GetRaidBosses(null,null,true).map(p=>p.id)'),[1,2]);
});

function releaseFixture(preview = false) {
    const result = fixture(false);
    result.evaluate(`
        jb_source_pkm = structuredClone(jb_pkm);
        jb_audit_manifest = {releaseReviews:[${JSON.stringify(releaseReview)}]};
        jb_spec = [{...structuredClone(jb_pkm[0]),id:609,name:'Mega Chandelure',form:'Mega',
            released:true,shadow:false,raid_tier:8,types:['Ghost','Fire'],
            stats:{baseAttack:335,baseDefense:227,baseStamina:155},temp_cm:['Ominous Wind+'],
            eff_date:'2026-11-06'},
            {...structuredClone(jb_pkm[0]),id:807,name:'Mega Zeraora',form:'Mega',released:true}];
        jb_cm.push({name:'Ominous Wind+',duration:2500,power:145,energy_delta:-100,mega_temp:true});
        jb_max_id=807;
        ApplyVerifiedPokemonReleases(jb_pkm,jb_spec,jb_audit_manifest);
        settings_speculative=${preview};
        if(settings_speculative) PatchSpeculative(true);
    `);
    return result;
}

test('verified releases enter current attacker and Super Mega boss pools independently of preview', async()=>{
    for (const preview of [false,true]) {
        const {evaluate,json}=releaseFixture(preview);
        const current=json('GetCalculationPokemon(false).find(p=>p.id===609)');
        assert.equal(current.released,true);
        assert.equal(current.raid_tier,8);
        assert.deepEqual(current.temp_cm,['Ominous Wind+']);
        assert.equal(json('GetRaidStats(GetRaidBosses().find(p=>p.id===609)).hp'),25000);
        assert.equal(json('GetAttackerLevel(GetCalculationPokemon(false).find(p=>p.id===609),50,false)'),52);
        const attackers=JSON.parse(await evaluate(`(async()=>{const keys=[];
            await SearchAll({...GetDefaultSearchParams(),mega:true},p=>keys.push(PokemonDataKey(p)));
            return JSON.stringify(keys)})()`));
        assert(attackers.includes('609/Mega'));
        assert(!attackers.includes('807/Mega'));
        assert.equal(json('jb_source_pkm.some(p=>p.id===609)'),false);
        evaluate('PatchSpeculative(false);settings_speculative=false;PatchSpeculative(true);settings_speculative=true');
        assert.deepEqual(json('GetCalculationPokemon(false).find(p=>p.id===609)'),current);
        assert.equal(json('GetCalculationPokemon(false).filter(p=>p.id===609).length'),1);
    }
});

test('release bridges prefer released main data and require an explicit verified review and released record',()=>{
    const {evaluate,json}=releaseFixture();
    evaluate(`mainRecord={...structuredClone(jb_pkm.find(p=>p.id===609)),raid_tier:9,
        temp_cm:['New source move'],stats:{baseAttack:340,baseDefense:230,baseStamina:155}};
        delete mainRecord._verifiedRelease;delete mainRecord._auditCorrections;
        roster=[structuredClone(mainRecord)];
        ApplyVerifiedPokemonReleases(roster,jb_spec,jb_audit_manifest)`);
    assert.deepEqual(json('roster'),json('[mainRecord]'));
    for(const status of ['announced',undefined]) {
        evaluate(`roster=[];ApplyVerifiedPokemonReleases(roster,jb_spec,
            {releaseReviews:[{...jb_audit_manifest.releaseReviews[0],raidStatus:${JSON.stringify(status)}}]})`);
        assert.deepEqual(json('roster'),[]);
    }
    evaluate(`roster=[];ApplyVerifiedPokemonReleases(roster,[],jb_audit_manifest);
        ApplyVerifiedPokemonReleases(roster,[{...jb_spec[0],released:false}],jb_audit_manifest)`);
    assert.deepEqual(json('roster'),[]);
    evaluate(`roster=[{...structuredClone(jb_spec[0]),released:false,raid_tier:4}];
        ApplyVerifiedPokemonReleases(roster,jb_spec,jb_audit_manifest)`);
    assert.equal(json('roster.length'),1);
    assert.equal(json('roster[0].released'),true);
    assert.equal(json('roster[0].raid_tier'),8);
});
