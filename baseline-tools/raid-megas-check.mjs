import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const inputs = JSON.parse(read('./fixtures/audit-inputs.json'));
const plusInputs = JSON.parse(read('./fixtures/plus-inputs.json'));

function fixture({future=false, megas=false, validUltra=false}={}) {
    const context=vm.createContext({performance,setTimeout,structuredClone,inputs:structuredClone(inputs),
        plusInputs:structuredClone(plusInputs),manifest:JSON.parse(read('../data/audit-overrides.json')),
        predictions:JSON.parse(read('../data/plus-move-projections.json'))});
    for(const name of ['dataload','settings','pokemon_enums','data-rules','plus-projections','pokemon_utils','calc','raid-points','raid-leaderboard'])
        vm.runInContext(read('../scripts/'+name+'.js'),context);
    vm.runInContext(`
        jb_pkm=structuredClone(inputs.pokemon);jb_spec=structuredClone(inputs.announced);
        jb_pkm.push(...structuredClone(plusInputs.pokemon.filter(p=>p.id===382)));
        // Synthetic Fire target exercises the Primal Water attacker.
        jb_pkm.push({id:6,form:'Normal',name:'Synthetic Fire target',types:['Fire'],released:true,raid_tier:5,
            stats:{baseAttack:200,baseDefense:200,baseStamina:200},fm:['Dragon Tail'],cm:['Outrage']});
        jb_fm=[...new Map([...inputs.fastMoves,...plusInputs.fastMoves].map(m=>[m.name,m])).values()];
        jb_cm=[...new Map([...inputs.chargedMoves,...plusInputs.chargedMoves].map(m=>[m.name,m])).values()];
        jb_audit_manifest=manifest;jb_plus_predictions=predictions;
        jb_pkm=ApplyPokemonAuditOverrides(jb_pkm,manifest);
        settings_speculative=true;settings_include_unreleased=false;
        settings_default_level=[50];settings_team_size_normal=6;settings_team_size_mega=1;
        settings_supermega_level=4;PatchSpeculative(true);
        GetIncludeUnreleased=()=>${future};SetRaidLeaderboardIncludeMegas(${megas});
        ${validUltra ? `Object.assign(jb_pkm.find(p=>p.id===800&&p.form==='Ultra'),
            {fm:['Shadow Claw'],cm:['Shadow Ball'],stats:{baseAttack:359,baseDefense:209,baseStamina:213}});` : ''}
    `,context);
    const evaluate=code=>vm.runInContext(code,context);
    return {evaluate,json:code=>JSON.parse(evaluate('JSON.stringify('+code+')'))};
}

async function runWorker(snapshot) {
    const messages=[];
    const context=vm.createContext({performance,setTimeout,structuredClone,self:{postMessage:m=>messages.push(structuredClone(m))}});
    context.importScripts=(...names)=>{for(const name of names)
        vm.runInContext(read('../scripts/'+name.split('?')[0]),context);};
    vm.runInContext(read('../scripts/raid-leaderboard-worker.js').replace('message: error.message','message: error.stack'),context);
    await context.self.onmessage({data:structuredClone(snapshot)});
    const result=messages.at(-1);
    assert.equal(result.type,'complete',result.message);
    return {matrix:result.matrix,evaluate:code=>vm.runInContext(code,context)};
}

test('snapshot carries transformation settings and every detached forecast definition without mutating source data',()=>{
    const {evaluate,json}=fixture({future:true,megas:true});
    const before=json('[jb_pkm,jb_cm]');
    const snapshot=json('GetRaidLeaderboardSnapshot()');
    assert.equal(snapshot.settings.includeMegas,true);assert.equal(snapshot.settings.megaTeam,1);
    assert(snapshot.chargedMoves.some(m=>m._plus_projection));
    for(const p of snapshot.pokemon)for(const name of p.temp_cm||[])
        assert(snapshot.chargedMoves.some(m=>m.name===name));
    assert.deepEqual(json('[jb_pkm,jb_cm]'),before);
    evaluate('GetIncludeUnreleased=()=>false');
    assert(!json('GetRaidLeaderboardSnapshot().chargedMoves.some(m=>m._plus_projection)'));
});

test('worker keeps non-Mega benchmarks, scores and counts identical when transformations are included',async()=>{
    const {evaluate,json}=fixture();
    const before=await runWorker(json('GetRaidLeaderboardSnapshot()'));
    evaluate('SetRaidLeaderboardIncludeMegas(true)');
    const after=await runWorker(json('GetRaidLeaderboardSnapshot()'));
    assert.deepEqual(after.matrix.bosses,before.matrix.bosses);
    assert(!before.matrix.attackers.some(p=>p.transformed));
    assert(after.matrix.attackers.some(p=>p.transformed&&p.id===150));
    assert(after.matrix.attackers.some(p=>p.transformed&&p.id===382));
    for(const p of before.matrix.attackers)assert.deepEqual(after.matrix.attackers.find(a=>a.key===p.key),p);
    const baseline=JSON.parse(await evaluate('JSON.stringify(ScoreRaidMatrix('+JSON.stringify(before.matrix)+'))'));
    const expanded=JSON.parse(await evaluate('JSON.stringify(ScoreRaidMatrix('+JSON.stringify(after.matrix)+'))'));
    for(const row of baseline.rows)assert.deepEqual(expanded.rows.find(p=>p.key===row.key),row);
    assert.equal(after.evaluate('settings_team_size_mega'),1);
    assert.equal(after.evaluate('settings_team_size_normal'),6);
});

test('future transformations use native projected levels and plus moves once; invalid and boss-only forms stay excluded',async()=>{
    const {json}=fixture({future:true,megas:true,validUltra:true});
    const {matrix,evaluate}=await runWorker(json('GetRaidLeaderboardSnapshot()'));
    assert(matrix.attackers.some(p=>p.id===800&&p.form==='Ultra'));
    assert(!matrix.attackers.some(p=>p.id===801&&p.form==='Mega'));
    assert(!matrix.attackers.some(p=>p.id===890&&p.form==='Eternamax'));
    assert(matrix.attackers.filter(p=>p.transformed).every(p=>p.level===52));
    assert(matrix.attackers.some(p=>p.matchups.some(m=>m.cm.includes('[forecast:'))));
    for(const row of matrix.attackers.filter(p=>p.transformed))for(const recorded of row.matchups) {
        const boss=matrix.bosses[recorded.bossIndex];
        const native=JSON.parse(evaluate(`JSON.stringify(GetStrongestAgainstSpecificEnemy(
            jb_pkm.find(p=>p.id===${row.id}&&p.form===${JSON.stringify(row.form)}),false,${row.level},
            GetEnemyParams(jb_pkm.find(p=>p.id===${boss.id}&&p.form===${JSON.stringify(boss.form)})),
            {...GetDefaultSearchParams(),type:'Any',mega:true,unreleased:true,real_damage:true}).at(-1))`));
        assert.equal(recorded.edps,native.rat);assert.equal(recorded.cm,native.cm);
    }
    const ordinary=await runWorker(json('({...GetRaidLeaderboardSnapshot(),settings:{...GetRaidLeaderboardSnapshot().settings,includeMegas:false}})'));
    assert.deepEqual(matrix.bosses,ordinary.matrix.bosses);
    for(const row of ordinary.matrix.attackers)assert.deepEqual(matrix.attackers.find(p=>p.key===row.key),row);
});
