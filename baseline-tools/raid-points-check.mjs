import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';

const scoring = vm.createContext({});
vm.runInContext(readFileSync(new URL('../scripts/raid-points.js', import.meta.url), 'utf8'), scoring);
const {RaidPointValue, RaidAttackerPointValue, ScoreRaidMatrix} = scoring;
const attacker = (key, id, matchups, extra = {}) => ({key, id, form: 'Normal', shadow: false, level: 50, matchups, ...extra});
const matchup = (bossIndex, ratio, lead = 0) => ({bossIndex, ratio, lead});

test('Attacker points count only wins and near-best matchups, using the same threshold tolerance as the coverage columns',()=>{
    for(const [ratio,expected] of [[.8,0],[.949,0],[.95-2e-9,0],[.95,1],[.999,1],[1-2e-9,1],[1,2],[1.7,2]])
        assert.equal(RaidAttackerPointValue(ratio),expected);
    for(const ratio of [NaN,Infinity,-Infinity])assert.equal(RaidAttackerPointValue(ratio),0);
    assert.equal(RaidAttackerPointValue(.95-1e-10),1);
    assert.equal(RaidAttackerPointValue(1-1e-10),2);
});

test('Attacker totals retain boss-group weights, tied wins and leader-at-100 scaling while excluding sub-95-only builds',()=>{
    const matrix={bosses:[{id:649,form:'Normal'},{id:649,form:'Burn'},{id:150,form:'Normal'}],attackers:[
        attacker('mixed',1,[matchup(0,1),matchup(1,.95),matchup(2,.94)]),
        attacker('winner',2,[matchup(2,1)]),
        attacker('weak',3,[matchup(0,.94),matchup(1,.94),matchup(2,.94)]),
    ]};
    const result=ScoreRaidMatrix(matrix,{scoring:'elite',floor:70});
    assert.equal(result.scoring,'elite');assert.equal(result.floor,95);
    const mixed=result.rows.find(r=>r.key==='mixed');
    assert.equal(mixed.points,1.5);assert.equal(mixed.score,75);
    assert.equal(mixed.first,.5);assert.equal(mixed.near,1);
    assert.equal(result.rows[0].key,'winner');assert.equal(result.rows[0].score,100);
    assert(!result.rows.some(r=>r.key==='weak'));
    assert.equal(result.totalWeight,2);
    assert.deepEqual(ScoreRaidMatrix(matrix,{scoring:'elite',floor:90}).rows,result.rows);
});

test('Mega XL points go only to the highest eligible transformed option, including winners below 70%',()=>{
    const xl=(bossIndex,ratio,eligible=true)=>({...matchup(bossIndex,ratio),xl:{eligible}});
    const matrix={bosses:[{id:649,form:'Normal'},{id:649,form:'Burn'},{id:150}],attackers:[
        attacker('a',1,[xl(0,1.2),xl(1,.8),xl(2,.5)],{transformed:true,form:'Mega'}),
        attacker('b',2,[xl(0,1.1),xl(1,.9),xl(2,.4)],{transformed:true,form:'Primal'}),
        attacker('ordinary',3,[xl(0,4),xl(1,4),xl(2,4)]),
        attacker('non-xl',4,[xl(0,3,false),xl(1,3,false),xl(2,3,false)],{transformed:true}),
        attacker('unknown',5,[xl(0,5,null)],{transformed:true}),
    ]};
    const result=ScoreRaidMatrix(matrix,{scoring:'mega-xl'});
    const a=result.rows.find(r=>r.key==='a'),b=result.rows.find(r=>r.key==='b');
    assert.equal(result.scoring,'mega-xl');assert.equal(result.rows.length,2);
    assert.equal(a.near,.5);assert.equal(a.positive,1.5);assert(Math.abs(a.points-105/19)<1e-10);assert.equal(a.score,100);
    assert.equal(b.near,0);assert.equal(b.positive,.5);assert(Math.abs(b.points-9/19)<1e-10);
    assert(Math.abs(b.score-100*3/35)<1e-10);
    assert.equal(b.matchups.find(m=>m.bossIndex===0).points,0,'Even a strong runner-up earns nothing.');
    assert(Math.abs(a.matchups.find(m=>m.bossIndex===2).points-10/19)<1e-10);
    assert.equal(result.rows.reduce((sum,r)=>sum+r.positive,0),result.totalWeight);
    assert.equal(matrix.attackers[0].matchups[0].points,undefined,'Do not mutate the battle matrix.');
});

test('Super Max narrows the competing pool, promotes its best XL options, and normalizes its leader to 100',()=>{
    const xl=(bossIndex,ratio)=>({...matchup(bossIndex,ratio),xl:{eligible:true}});
    const matrix={settings:{includeUnreleased:false},bosses:[{id:1},{id:2}],attackers:[
        attacker('ordinary-mega',6,[xl(0,1.3),xl(1,1.2)],{transformed:true,superMaxUnlocked:false}),
        attacker('super-max',150,[xl(0,1.1),xl(1,.8)],{transformed:true,superMaxUnlocked:true}),
        attacker('not-a-mega',888,[xl(0,2),xl(1,2)],{superMaxUnlocked:true}),
    ]};
    const all=ScoreRaidMatrix(matrix,{scoring:'mega-xl'});
    assert.equal(all.rows[0].key,'ordinary-mega');assert.equal(all.rows[0].points,20);assert.equal(all.rows[0].score,100);
    const filtered=ScoreRaidMatrix(matrix,{scoring:'mega-xl',superMaxOnly:true});
    assert.equal(filtered.superMaxOnly,true);assert.equal(filtered.rows.length,1);
    assert.equal(filtered.rows[0].key,'super-max');assert(Math.abs(filtered.rows[0].points-206/19)<1e-10);assert.equal(filtered.rows[0].score,100);
    assert.deepEqual(filtered.weights,all.weights);assert(Math.abs(filtered.bestPoints-206/19)<1e-10);
    assert.equal(matrix.attackers[1].matchups[0].points,undefined);
    const future={...matrix,settings:{includeUnreleased:true}};
    assert.deepEqual(ScoreRaidMatrix(future,{scoring:'mega-xl',superMaxOnly:true}),
        ScoreRaidMatrix(future,{scoring:'mega-xl'}),'Unreleased assumes Super Max for every transformation.');
    const empty=ScoreRaidMatrix({...matrix,attackers:matrix.attackers.slice(0,1)},{scoring:'mega-xl',superMaxOnly:true});
    assert.equal(empty.rows.length,0);assert.equal(empty.bestPoints,0);
});

test('Mega XL weak wins earn proportional points; the 95% bonus boundary and invalid inputs stay explicit',()=>{
    const cases=[[.5,10/19],[.8,16/19],[.9,18/19],[.94,94/95],[.949,949/950],
        [.95-2e-9,1-2e-9/.95],[.95-1e-10,10],[.95,10],[1.5,10],[.00001,1/95000],
        [0,0],[-1,0],[NaN,0],[Infinity,0]];
    const ratios=cases.map(([ratio])=>ratio);
    const result=ScoreRaidMatrix({bosses:ratios.map((_,id)=>({id})),attackers:[
        attacker('mega',1,ratios.map((ratio,bossIndex)=>({...matchup(bossIndex,ratio),xl:{eligible:true}})),{transformed:true}),
    ]},{scoring:'mega-xl'});
    const row=result.rows[0];
    assert.equal(row.near,3);assert.equal(row.positive,10);assert.equal(row.score,100);
    for(const [bossIndex,[,expected]] of cases.entries())
        assert(Math.abs((row.matchups.find(m=>m.bossIndex===bossIndex)?.points||0)-expected)<1e-10);
    assert(Math.abs(row.points-cases.reduce((sum,[,points])=>sum+points,0))<1e-10);
    assert.equal(ScoreRaidMatrix({bosses:[{id:1}],attackers:[]},{scoring:'mega-xl'}).rows.length,0);
});

test('Mega XL ties award one stable build and shared raid formats retain one total weight',()=>{
    const bosses=[{id:150,form:'Mega'},{id:150,form:'Mega',raidFormat:'super'}];
    const rows=[attacker('b',2,[0,1].map(bossIndex=>({...matchup(bossIndex,1),xl:{eligible:true}})),{transformed:true}),
        attacker('a',1,[{...matchup(0,.9),xl:{eligible:true}},...[0,1].map(bossIndex=>({...matchup(bossIndex,1),xl:{eligible:true}}))],{transformed:true})];
    const first=ScoreRaidMatrix({bosses,attackers:rows},{scoring:'mega-xl'});
    const second=ScoreRaidMatrix({bosses,attackers:[...rows].reverse()},{scoring:'mega-xl'});
    assert.deepEqual(first,second);assert.equal(first.rows.length,1);assert.equal(first.rows[0].key,'a');
    assert.equal(first.rows[0].matchups.length,2);assert.equal(first.rows[0].points,10);
    assert.equal(first.rows[0].positive,1);assert.equal(first.rows[0].near,1);
});

test('Mega XL winning Hidden Power builds keep separate scores and never combine their wins',()=>{
    const result=ScoreRaidMatrix({bosses:[{id:1},{id:2}],attackers:[
        attacker('fire',121,[{...matchup(0,1),xl:{eligible:true}}],{form:'Mega',transformed:true,hiddenPowerType:'Fire'}),
        attacker('ice',121,[{...matchup(1,1),xl:{eligible:true}}],{form:'Mega',transformed:true,hiddenPowerType:'Ice'}),
    ]},{scoring:'mega-xl'});
    assert.equal(result.rows.length,2);assert(result.rows.every(r=>r.points===10&&r.positive===1&&r.variants.length===2));
});

test('Attacker scoring deduplicates a boss and selects one fixed Hidden Power build under the new point rules',()=>{
    const result=ScoreRaidMatrix({bosses:[{id:1},{id:2}],attackers:[
        attacker('grass',486,[matchup(0,.96),matchup(0,1)],{hiddenPowerType:'Grass'}),
        attacker('fire',486,[matchup(0,.95),matchup(1,.95)],{hiddenPowerType:'Fire'}),
        attacker('tied',150,[matchup(0,1)]),
        attacker('xl-only',25,[{...matchup(1,.92),xl:{eligible:true}}]),
    ]},{scoring:'elite',xlThreshold:90});
    const fixed=result.rows.find(r=>r.id===486);
    assert.equal(fixed.hiddenPowerType,'Grass');assert.equal(fixed.points,2);
    assert.equal(fixed.matchups.length,1);assert.equal(fixed.variants.length,2);
    assert.equal(result.rows.find(r=>r.key==='tied').points,2);
    assert(!result.rows.some(r=>r.key==='xl-only'));
});

test('points reflect performance gaps continuously, with bounded invalid inputs', () => {
    for (const [ratio, expected] of [[1,5], [.95,3.75], [.9,2.5], [.85,1.25], [.8,0], [.6,0], [2,5]])
        assert(Math.abs(RaidPointValue(ratio) - expected) < 1e-10);
    assert.equal(RaidPointValue(NaN), 0);
    assert.equal(RaidPointValue(Infinity), 0);
    assert(RaidPointValue(.998) > 4.9);
    assert(RaidPointValue(.81) < .3);
    assert.equal(RaidPointValue(.9, 90), 0);
    assert(RaidPointValue(.8, 70) > 0);
});

test('species weight is split across forms; an equal-form view preserves full weight', () => {
    const matrix = {bosses: [{id:1,form:'A'}, {id:1,form:'B'}, {id:2}], attackers: [
        attacker('a', 10, [matchup(0,1), matchup(1,1)]),
        attacker('b', 20, [matchup(2,1)]),
    ]};
    const species = ScoreRaidMatrix(matrix, {weighting:'species'});
    assert.equal(species.totalWeight, 2);
    assert.equal(species.rows[0].points, 5);
    assert.equal(species.rows[1].points, 5);
    assert.equal(species.rows[0].score, 100);
    const forms = ScoreRaidMatrix(matrix, {weighting:'forms'});
    assert.equal(forms.rows[0].points, 10);
    assert.equal(forms.rows[1].score, 50);
});

test('raid groups combine Genesect, Deoxys, Arceus, and Silvally but preserve major forms', () => {
    const bosses = [
        ...[386,493,649,773].flatMap(id => ['A','B','C'].map(form => ({id,form}))),
        {id:150,form:'Normal'}, {id:150,form:'A'}, {id:150,form:'Mega'}, {id:150,form:'MegaY'},
        {id:483,form:'Altered'}, {id:483,form:'Origin'},
        {id:800,form:'Normal'}, {id:800,form:'Dusk_mane'}, {id:800,form:'Dawn_wings'},
    ];
    const result = ScoreRaidMatrix({bosses, attackers:[attacker('all',10,bosses.map((_,i)=>matchup(i,1)))]});
    assert.equal(result.weighting, 'groups');
    assert.equal(result.groupCount,13);
    assert(Math.abs(result.totalWeight-13)<1e-10);
    assert(result.weights.slice(0,12).every(weight=>Math.abs(weight-1/3)<1e-10));
    assert(result.weights.slice(12).every(weight=>weight===1));
    assert(Math.abs(result.rows[0].points-65)<1e-10);
});

test('normal, Shadow, and Super formats share a form allocation without biasing other forms', () => {
    const bosses=[{id:649,form:'Normal'},{id:649,form:'Normal',raidFormat:'shadow'},
        {id:649,form:'Burn'},{id:150,form:'Mega'},{id:150,form:'Mega',raidFormat:'super'},
        {id:150,form:'Normal'},{id:150,form:'Normal',raidFormat:'shadow'},{id:150,form:'A'}];
    const result=ScoreRaidMatrix({bosses,attackers:[attacker('all',10,bosses.map((_,i)=>matchup(i,1)))]});
    assert.deepEqual(Array.from(result.weights),[.25,.25,.5,.5,.5,.5,.5,1]);
    assert.equal(result.groupCount,4);
    assert.equal(result.totalWeight,4);
    assert.equal(result.rows[0].points,20);
    const forms=ScoreRaidMatrix({bosses,attackers:[]},{weighting:'forms'});
    assert.equal(forms.totalWeight,5);
});

test('group points average form results rather than choosing a group’s best matchup', () => {
    const result=ScoreRaidMatrix({bosses:[{id:649,form:'Normal'},{id:649,form:'Burn'}],
        attackers:[attacker('a',1,[matchup(0,1),matchup(1,.8)]),attacker('b',2,[matchup(0,.95),matchup(1,.95)])]});
    assert.equal(result.rows.find(row=>row.id===1).points,2.5);
    assert(Math.abs(result.rows[0].points-3.75)<1e-10);
    assert.equal(result.rows[0].id,2);
});

test('one boss contributes once per build, including ties and near-best boundaries', () => {
    const matrix = {bosses:[{id:1}, {id:2}], attackers:[
        attacker('a', 10, [matchup(0,.9), matchup(0,1,12), matchup(1,.95)]),
        attacker('b', 20, [matchup(0,1)]),
    ]};
    const result = ScoreRaidMatrix(matrix);
    const a = result.rows.find(row => row.id === 10);
    assert.equal(a.matchups.length, 2);
    assert.equal(a.first, 1);
    assert.equal(a.near, 2);
    assert.equal(a.lead, 12);
    assert.equal(result.rows.find(row => row.id === 20).first, 1);
    assert(Math.abs(a.points - 8.75) < 1e-10);
});

test('fixed Hidden Power builds cannot combine their best matchups', () => {
    const matrix = {bosses:[{id:1}, {id:2}], attackers:[
        attacker('grass',486,[matchup(0,1)],{hiddenPowerType:'Grass'}),
        attacker('fire',486,[matchup(1,1)],{hiddenPowerType:'Fire'}),
        attacker('other',800,[matchup(0,.95),matchup(1,.95)]),
        attacker('shadow',486,[matchup(0,.9)],{shadow:true}),
    ]};
    const rows = ScoreRaidMatrix(matrix).rows;
    const fixed = rows.find(row => row.id === 486 && !row.shadow);
    assert.equal(fixed.points, 5);
    assert.equal(fixed.first, 1);
    assert.equal(fixed.variants.length, 2);
    assert.equal(rows[0].id, 800);
    assert.equal(rows.filter(row => row.id === 486).length, 2);
});

test('adding transformations keeps ordinary scores fixed and permits scores above 100 with the same boss cap', () => {
    const bosses=[{id:1},{id:2}];
    const ordinary=[attacker('a',10,[matchup(0,1),matchup(1,.8)]),
        attacker('b',20,[matchup(0,.95),matchup(1,.95)])];
    const before=ScoreRaidMatrix({bosses,attackers:ordinary});
    const after=ScoreRaidMatrix({bosses,attackers:[...ordinary,
        attacker('mega',30,[matchup(0,1.5),matchup(1,1.4)],{form:'Mega',transformed:true})]});
    for(const row of before.rows)assert.deepEqual(after.rows.find(r=>r.key===row.key),row);
    const mega=after.rows.find(r=>r.transformed);
    assert.equal(mega.points,10);assert(mega.score>100);
    assert.equal(mega.first,2);assert.equal(mega.near,2);
    assert.equal(after.bestPoints,before.bestPoints);
});
