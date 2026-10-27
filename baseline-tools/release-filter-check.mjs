import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function fixture(preview = true) {
    const context = vm.createContext({performance,setTimeout,structuredClone});
    for (const file of ['dataload.js','settings.js','pokemon_enums.js','pokemon_utils.js'])
        vm.runInContext(readFileSync(new URL('../scripts/'+file,import.meta.url),'utf8'),context);
    vm.runInContext(`
        jb_pkm = [
            {id:1,name:'Bulbasaur',form:'Normal',released:true,shadow:true,raid_tier:5,types:['Grass'],stats:{baseAttack:100}},
            {id:2,name:'Ivysaur',form:'Normal',released:false,shadow:false,raid_tier:5,types:['Grass'],stats:{baseAttack:150}},
            {id:3,name:'Venusaur',form:'Normal',released:true,shadow:false,types:['Grass'],stats:{baseAttack:200}}
        ];
        jb_max_id = 4;
        jb_spec = [
            {id:1,name:'Bulbasaur',form:'Normal',types:['Fire'],stats:{baseAttack:999}},
            {id:2,name:'Ivysaur',form:'Normal',released:true},
            {id:4,name:'Charmander',form:'Normal',released:true,shadow:false,raid_tier:5,types:['Fire'],stats:{baseAttack:180}}
        ];
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
