import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

function fixture() {
    const context = vm.createContext({performance,setTimeout,structuredClone});
    for (const name of ['dataload','settings','pokemon_enums','data-rules','pokemon_utils','pokedex'])
        vm.runInContext(readFileSync(new URL('../scripts/'+name+'.js',import.meta.url),'utf8'),context);
    // Synthetic complete Ultra moves test the level rule, not real release status.
    vm.runInContext(`
        const forms = new Map([[80,['Normal','Mega']], [150,['Normal','Mega','MegaY','Other']],
            [382,['Normal','Primal']], [793,['Normal']], [800,['Normal','Ultra']]]);
        GetPokemonForms = id => forms.get(id) || ['Normal'];
        jb_pkm = [...forms].flatMap(([id,forms])=>forms.map(form=>({id,form,
            name:form==='Primal'?'Primal Kyogre':form==='Mega'?'Mega Pokémon':'Pokémon',
            types:['Psychic'],released:true,shadow:false,
            class:id===80?undefined:id===793?'POKEMON_CLASS_ULTRA_BEAST':'POKEMON_CLASS_LEGENDARY',
            raid_tier:form==='MegaY'?9:5,
            stats:{baseAttack:200,baseDefense:180,baseStamina:200},fm:['Tackle'],cm:['Body Slam']})));
        jb_fm=[{name:'Tackle',duration:500},{name:'Splash',duration:1500}];
        jb_cm=[{name:'Body Slam',duration:1500},{name:'Struggle',duration:2000}];
        jb_max_id=800;settings_speculative=false;settings_supermega_level=4;
        GetIncludeUnreleased=()=>settings_include_unreleased;
    `,context);
    const evaluate = expression => vm.runInContext(expression,context);
    const json = expression => JSON.parse(evaluate('JSON.stringify('+expression+')'));
    return {evaluate,json};
}

test('Mega, Primal, and Ultra identities are independent of raid tags and the Ultra Beast class', () => {
    const {json}=fixture();
    for(const form of ['Mega','MegaY','MegaZ','Primal','Ultra'])
        assert.equal(json(`IsMegaPrimalUltraForm({form:${JSON.stringify(form)}})`),true);
    assert.equal(json('IsMegaPrimalUltraForm({form:"Normal",name:"Primal Kyogre"})'),true);
    assert.equal(json('IsMegaPrimalUltraForm({form:"Normal",class:"POKEMON_CLASS_ULTRA_BEAST",name:"Nihilego"})'),false);
    assert.equal(json('IsMegaPrimalUltraForm({form:"Dawn_wings",name:"Necrozma"})'),false);
    assert.equal(json('IsMegaPrimalUltraForm({form:"Crowned_sword",name:"Zacian"})'),false);
});

test('projected +2 requires unreleased mode and level 4; native boosts never double', () => {
    const {evaluate,json}=fixture();
    for(const form of ['Mega','Primal','Ultra']) {
        assert.equal(json(`GetAttackerLevel({form:${JSON.stringify(form)},raid_tier:5},50,false)`),50);
        assert.equal(json(`GetAttackerLevel({form:${JSON.stringify(form)},raid_tier:5},50,true)`),52);
    }
    assert.equal(json('GetAttackerLevel({form:"MegaY",raid_tier:9},50,false)'),52);
    assert.equal(json('GetAttackerLevel({form:"MegaY",raid_tier:9},50,true)'),52);
    for(const level of [1,2,3]) {
        evaluate('settings_supermega_level='+level);
        assert.equal(json('GetAttackerLevel({form:"Ultra",raid_tier:5},50,true)'),50);
        assert.equal(json('GetAttackerLevel({form:"MegaY",raid_tier:9},50,true)'),50);
    }
});

test('multiple base levels remain independent across regular and transformed forms', async () => {
    const {evaluate}=fixture();
    evaluate('settings_default_level=[40,50]');
    const rows=JSON.parse(await evaluate(`(async()=>{const rows=[];
        await SearchAll({...GetDefaultSearchParams(),unreleased:true},(p,shadow,level)=>rows.push([p.id,p.form,level]));
        return JSON.stringify(rows)})()`));
    for(const [id,form,level] of rows) {
        assert((['Mega','MegaY','Primal','Ultra'].includes(form)?[42,52]:[40,50]).includes(level));
        if(id===150&&form==='Other')assert([40,50].includes(level));
        if(id===150&&form==='Mega')assert([42,52].includes(level));
        if(id===800&&form==='Ultra')assert([42,52].includes(level));
        if(id===793)assert([40,50].includes(level));
    }
    assert.deepEqual(rows.filter(([id,form])=>id===150&&form==='Other').map(r=>r[2]),[40,50]);
    assert.deepEqual(rows.filter(([id,form])=>id===800&&form==='Ultra').map(r=>r[2]),[42,52]);
    const filtered=JSON.parse(await evaluate(`(async()=>{const rows=[];
        await SearchAll({...GetDefaultSearchParams(),unreleased:true,mega:false},p=>rows.push([p.id,p.form]));
        return JSON.stringify(rows)})()`));
    assert(filtered.every(([,form])=>!['Mega','MegaY','Primal','Ultra'].includes(form)));
    assert(filtered.some(([id])=>id===793));
});

test('native CPM changes Attack, Defense, and Stamina; boss stats do not receive attacker levels', () => {
    const {evaluate,json}=fixture();
    evaluate('mon=jb_pkm.find(p=>p.id===800&&p.form==="Ultra")');
    const bossBefore=json('GetRaidStats(mon)');
    const lower=json('GetPokemonStats(mon,50)'), boosted=json('GetPokemonStats(mon,GetAttackerLevel(mon,50,true))');
    for(const stat of ['atk','def','hp'])assert(boosted[stat]>lower[stat]);
    const cpm52=json('GetCPMForLevel(52)');
    assert.equal(boosted.atk,(200+15)*cpm52);
    assert.equal(boosted.def,(180+15)*cpm52);
    assert.equal(boosted.hp,(200+15)*cpm52);
    assert.deepEqual(json('GetRaidStats(mon)'),bossBefore);
});

test('Pokédex defaults use the same projection, while explicit levels stay effective levels', () => {
    const {evaluate,json}=fixture();
    evaluate('settings_include_unreleased=true');
    for(const [id,form] of [[80,'Mega'],[382,'Primal'],[800,'Ultra'],[150,'MegaY']])
        assert.equal(json(`GetPokeDexMon(${id},${JSON.stringify(form)}).level`),52);
    assert.equal(json('GetPokeDexMon(800,"Ultra",52).level'),52);
    assert.equal(json('GetPokeDexMon(800,"Ultra",51).level'),51);
    assert.equal(json('GetPokeDexMon(793,"Normal").level'),50);
    evaluate('settings_include_unreleased=false');
    assert.equal(json('GetPokeDexMon(80,"Mega").level'),50);
    assert.equal(json('GetPokeDexMon(150,"MegaY").level'),52);
});

test('a projected level never bypasses placeholder exclusion', async () => {
    const {evaluate,json}=fixture();
    evaluate('mon=jb_pkm.find(p=>p.id===800&&p.form==="Ultra");mon.fm=["Splash"];mon.cm=["Struggle"];mon.released=false');
    assert.equal(json('GetAttackerLevel(mon,50,true)'),52);
    const included=JSON.parse(await evaluate(`(async()=>{const rows=[];
        await SearchAll({...GetDefaultSearchParams(),unreleased:true},p=>rows.push(PokemonDataKey(p)));
        return JSON.stringify(rows)})()`));
    assert(!included.includes('800/Ultra'));
});
