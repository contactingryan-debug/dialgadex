import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const manifest=JSON.parse(read('../data/catch-xl-profiles.json'));
const strings=JSON.parse(read('../locales/en.json'));
const mon=(id,form,types,released=true)=>({id,form,types,released,name:'Pokémon '+id,
    stats:{baseAttack:200,baseDefense:200,baseStamina:200},fm:['Tackle'],cm:['Body Slam'],raid_tier:5});
const roster=[
    mon(6,'Normal',['Fire','Flying']),mon(6,'Mega',['Fire','Dragon']),mon(6,'MegaY',['Fire','Flying']),
    mon(94,'Mega',['Ghost','Poison']),mon(130,'Normal',['Water','Flying']),mon(130,'Mega',['Water','Dark']),
    mon(142,'Mega',['Rock','Flying']),mon(208,'Mega',['Steel','Ground']),mon(254,'Mega',['Grass','Dragon']),
    mon(282,'Mega',['Psychic','Fairy']),mon(382,'Normal',['Water']),mon(382,'Mega',['Water']),
    mon(383,'Normal',['Ground']),mon(383,'Mega',['Ground','Fire']),mon(384,'Mega',['Dragon','Flying']),
    mon(487,'Origin',['Ghost','Dragon']),mon(646,'Normal',['Dragon','Ice']),mon(646,'Black',['Dragon','Ice']),
    mon(720,'Confined',['Psychic','Ghost']),mon(720,'Unbound',['Psychic','Dark']),
    mon(800,'Normal',['Psychic']),mon(800,'Dawn_wings',['Psychic','Ghost']),mon(800,'Dusk_mane',['Psychic','Steel']),
    {...mon(800,'Ultra',['Psychic','Dragon'],false),fm:['Splash'],cm:['Struggle']},
    mon(888,'Hero',['Fairy']),mon(888,'Crowned_sword',['Fairy','Steel']),
    mon(889,'Hero',['Fighting']),mon(889,'Crowned_shield',['Fighting','Steel']),
    mon(670,'Mega',['Fairy'],false),mon(493,'Fire',['Fire'],false),mon(890,'Eternamax',['Poison','Dragon'],false),
];

function fixture() {
    const context=vm.createContext({performance,setTimeout,structuredClone,URL,URLSearchParams,
        location:{href:'https://example.test/?audit'},roster:structuredClone(roster),manifest,strings,
        FormatTranslation(key,params={}) {let s=key.split('.').reduce((o,k)=>o?.[k],strings)||key;
            for(const [k,v] of Object.entries(params))s=s.replaceAll('{'+k+'}',v);return s;},
        GetTranslation:(key,fallback)=>fallback||key,TranslatedSpeciesName:(id,name)=>name||String(id)});
    for(const name of ['dataload','settings','pokemon_enums','data-rules','catch-xl','pokemon_utils','rankings','raid-points','data-audit'])
        vm.runInContext(read('../scripts/'+name+'.js'),context);
    vm.runInContext(`jb_pkm=roster;jb_source_pkm=structuredClone(roster);jb_catch_profiles=manifest;
        jb_spec=[];jb_audit_manifest={};jb_max_id=890;settings_speculative=false;
        jb_fm=[{name:'Tackle',duration:500},{name:'Splash',duration:1500}];
        jb_cm=[{name:'Body Slam',duration:1500},{name:'Struggle',duration:2000}];
        settings_include_unreleased=true;GetIncludeUnreleased=()=>true;currentLocale='en';
        const get=(id,form)=>jb_pkm.find(p=>p.id===id&&p.form===form);
        const catchOf=(id,form)=>GetRaidCatchEncounter(get(id,form),jb_pkm);
        const boost=(id,form='Mega')=>GetCatchXLBoostProfile(get(id,form));
        const match=(id,bossId,bossForm,level=4)=>GetCatchXLMatch(boost(id),catchOf(bossId,bossForm),level,true);`,context);
    const evaluate=code=>vm.runInContext(code,context);
    return {evaluate,json:code=>JSON.parse(evaluate('JSON.stringify('+code+')'))};
}

test('Super Max requires a released level-4 form and a known full XL profile',()=>{
    const {json}=fixture();
    for(const raid_tier of [8,9])assert.equal(json('HasSuperMaxUnlocked({...get(6,"Mega"),raid_tier:'+raid_tier+'})'),true);
    for(const patch of [{raid_tier:5},{raid_tier:8,released:false},{raid_tier:8,types:[]},{raid_tier:8,_catchXLProjected:true}])
        assert.equal(json('HasSuperMaxUnlocked({...get(6,"Mega"),...'+JSON.stringify(patch)+'})'),false);
    assert.equal(json('HasSuperMaxUnlocked({...get(6,"Normal"),raid_tier:8})'),false);
    assert.equal(json('HasSuperMaxUnlocked({...get(800,"Ultra"),released:true,raid_tier:9})'),false);
});

test('a regular Mega raid can retain full current XL boosting and Super Max eligibility',()=>{
    const {json}=fixture();
    assert.equal(json('HasSuperMaxUnlocked({...get(6,"Mega"),raid_tier:4,super_max_released:true})'),true);
    assert.equal(json('HasSuperMaxUnlocked({...get(6,"Mega"),raid_tier:8,super_max_released:false})'),false);
    assert.equal(json('HasSuperMaxUnlocked({...get(6,"Mega"),raid_tier:8,super_max_released:true,raid_released:false})'),true);
    assert.equal(json('HasSuperMaxUnlocked({...get(6,"Mega"),raid_tier:4,super_max_released:true,released:false})'),false);
});

test('a verified announced-feed release qualifies for current XL boosting and Super Max without a main-feed record',()=>{
    const {evaluate,json}=fixture();
    evaluate(`releasedMega={...structuredClone(get(6,'Mega')),id:609,name:'Mega Chandelure',
        types:['Ghost','Fire'],raid_tier:8,_verifiedRelease:'mega-chandelure-release'};
        jb_pkm.push(releasedMega)`);
    assert.equal(json('jb_source_pkm.some(p=>p.id===609)'),false);
    assert.equal(json('IsCatchXLProjection(releasedMega)'),false);
    assert.equal(json('GetCatchXLBoostProfile(releasedMega).status'),'rule');
    assert.equal(json('HasSuperMaxUnlocked(releasedMega)'),true);
    assert.equal(json('GetCatchXLMatch(GetCatchXLBoostProfile(releasedMega),{types:["Ghost"],status:"known"},4,false).eligible'),true);
    assert.equal(json('HasSuperMaxUnlocked({...releasedMega,released:false})'),false);
    assert.equal(json('IsCatchXLProjection({...releasedMega,_verifiedRelease:undefined})'),true);
});

test('Mega catches use the base encounter typing instead of the fought form',()=>{
    const {json}=fixture();
    assert.deepEqual(json('catchOf(6,"Mega").types'),['Fire','Flying']);
    assert.equal(json('match(254,6,"Mega").eligible'),false); // Dragon is not a Charizard catch type.
    assert.deepEqual(json('match(142,6,"Mega").matchedTypes'),['Flying']);
    assert.deepEqual(json('catchOf(130,"Mega").types'),['Water','Flying']);
    assert.equal(json('GetCatchXLMatch({types:["Dark"],minLevel:2},catchOf(130,"Mega"),4,true).eligible'),false);
});

test('fusion and Crowned encounters use their audited catch forms',()=>{
    const {json}=fixture();
    for(const form of ['Dawn_wings','Dusk_mane']) {
        assert.equal(json(`catchOf(800,${JSON.stringify(form)}).form`),'Normal');
        assert.deepEqual(json(`catchOf(800,${JSON.stringify(form)}).types`),['Psychic']);
        assert.equal(json(`match(94,800,${JSON.stringify(form)}).eligible`),false);
        assert.deepEqual(json(`match(384,800,${JSON.stringify(form)}).matchedTypes`),['Psychic']);
    }
    assert.equal(json('catchOf(646,"Black").form'),'Normal');
    assert.equal(json('catchOf(888,"Crowned_sword").form'),'Hero');
    assert.deepEqual(json('catchOf(888,"Crowned_sword").types'),['Fairy']);
    assert.deepEqual(json('catchOf(889,"Crowned_shield").types'),['Fighting']);
    assert.equal(json('match(208,888,"Crowned_sword").eligible'),false); // No Steel catch bonus.
    assert.equal(json('match(282,888,"Crowned_sword").eligible'),true);
});

test('normal alternate forms stay intact and missing mappings remain unknown',()=>{
    const {json}=fixture();
    assert.equal(json('catchOf(487,"Origin").form'),'Origin');
    assert.equal(json('catchOf(720,"Unbound").form'),'Unbound');
    assert.equal(json('match(94,720,"Unbound").eligible'),false);
    assert.equal(json('catchOf(670,"Mega").status'),'unknown');
    assert.equal(json('GetCatchXLMatch(boost(384),catchOf(670,"Mega"),4,true).eligible'),null);
    assert.equal(json('GetRaidCatchEncounter({id:9,form:"Mega",types:["Water"]},[]).status'),'unknown');
    assert.equal(json('catchOf(890,"Eternamax").status'),'none');
});

test('special profiles include weather catch types and respect the High-level unlock',()=>{
    const {json}=fixture();
    assert.deepEqual(json('boost(382).types'),['Water','Electric','Bug']);
    assert.deepEqual(json('boost(383).types'),['Fire','Grass','Ground']);
    assert.deepEqual(json('boost(384).types'),['Dragon','Flying','Psychic']);
    assert.deepEqual(json('catchOf(383,"Mega").types'),['Ground']);
    assert.equal(json('match(6,383,"Mega").eligible'),false); // Groudon loses Fire before capture.
    assert.equal(json('match(282,800,"Dawn_wings",1).reason'),'level-required');
    for(const level of [2,3,4])assert.equal(json(`match(282,800,"Dawn_wings",${level}).eligible`),true);
});

test('Ultra Dragon/Psychic is an explicit projection that never repairs placeholder moves',()=>{
    const {evaluate,json}=fixture();
    const profile=json('boost(800,"Ultra")');
    assert.deepEqual(profile.types,['Dragon','Psychic']);assert.equal(profile.status,'projected');
    assert.equal(profile.minLevel,null);assert.match(profile.note,/User-approved assumption/);
    assert.equal(json('GetCatchXLMatch(boost(800,"Ultra"),catchOf(800,"Normal"),4,false).eligible'),false);
    assert.equal(json('GetCatchXLMatch(boost(800,"Ultra"),catchOf(800,"Normal"),4,true).projected'),true);
    assert.equal(json('IsPokemonCalculationEligible(get(800,"Ultra"),true)'),false);
    assert.equal(json('catchOf(800,"Ultra").status'),'unknown');
    evaluate('audit=GetPokemonAuditInfo(800,"Ultra",BuildPokemonAuditContext())');
    const copied=evaluate('PokemonAuditCopyText(audit,BuildPokemonAuditContext())');
    assert.match(copied,/Catch XL boost profile:.*Dragon.*Psychic.*projected/);
    assert.match(copied,/Raid catch mapping:.*unknown/);
    assert.equal(json('audit.attackerIncluded'),false);
});

test('unreleased encounters carry projections and strong tests include performance above 100%',()=>{
    const {json}=fixture();
    assert.equal(json('catchOf(493,"Fire").status'),'projected');
    assert.equal(json('GetCatchXLMatch(boost(6),catchOf(493,"Fire"),4,false).reason'),'projection-off');
    assert.equal(json('IsStrongCatchXL({eligible:true},.95,95)'),true);
    assert.equal(json('IsStrongCatchXL({eligible:true},1.8,100)'),true);
    assert.equal(json('IsStrongCatchXL({eligible:null},1.8,95)'),false);
    assert.equal(json('IsStrongCatchXL({eligible:true},.94,95)'),false);
});

test('Best uses a non-transformed reference while Shadows, fusions, Crowned forms and Ultra Beasts remain eligible',()=>{
    const {evaluate}=fixture();
    const transformed=['Mega','MegaY','MegaZ','Primal','Ultra'].map((form,i)=>({form,rat:200-i}));
    for(const pokemon of [
        {form:'Normal',shadow:true}, {form:'Dawn_wings',name:'Necrozma'},
        {form:'Crowned_sword',name:'Zacian'}, {form:'Normal',name:'Nihilego',class:'POKEMON_CLASS_ULTRA_BEAST'},
    ]) {
        const entries=[...transformed,{...pokemon,rat:100},{form:'Normal',rat:90}];
        assert.equal(evaluate(`GetComparisonMon(${JSON.stringify(entries)})`),100);
    }
    assert.equal(evaluate(`GetComparisonMon(${JSON.stringify(transformed)})`),0);
    assert.equal(evaluate('GetComparisonMon([])'),0);
});

test('preview promotions remain projected while verified local release corrections are respected',()=>{
    const {evaluate,json}=fixture();
    evaluate('jb_source_pkm.find(p=>p.id===6&&p.form==="Mega").released=false');
    assert.equal(json('boost(6).status'),'projected');
    assert.equal(json('catchOf(6,"Mega").status'),'projected');
    evaluate('get(6,"Mega")._auditCorrections=[{fields:["released"]}]');
    assert.equal(json('boost(6).status'),'rule');
    evaluate('get(6,"Mega")._catchXLProjected=true');
    assert.equal(json('boost(6).status'),'projected');
});

test('XL coverage uses existing group/format weights once and never changes combat points',()=>{
    const {evaluate,json}=fixture();
    evaluate(`matrix={bosses:[{id:649,form:'Normal'},{id:649,form:'Normal',raidFormat:'shadow'},{id:649,form:'Burn'}],
        attackers:[{key:'ordinary',id:1,form:'Normal',level:50,matchups:[0,1,2].map(bossIndex=>({bossIndex,ratio:1}))},
        {key:'mega',id:2,form:'Mega',level:50,transformed:true,matchups:[0,1,2].map(bossIndex=>({bossIndex,ratio:1.5,xl:{eligible:true,projected:bossIndex===2,matchedTypes:['Bug','Steel']}}))}]};
        result=ScoreRaidMatrix(matrix,{xlThreshold:95});`);
    const mega=json('result.rows.find(r=>r.transformed)');
    assert.equal(mega.xlCoverage,1);assert.equal(mega.xlCount,3);assert.equal(mega.xlProjected,1);
    assert.equal(mega.points,5);assert.equal(mega.score,100);
    const before=json('result.rows.map(r=>[r.key,r.points,r.score])');
    assert.deepEqual(json('ScoreRaidMatrix(matrix,{xlThreshold:100}).rows.map(r=>[r.key,r.points,r.score])'),before);
    evaluate('matrix.attackers[1].matchups[0].ratio=.92');
    assert(json('ScoreRaidMatrix(matrix,{xlThreshold:90}).rows.find(r=>r.transformed).xlCoverage')>
        json('ScoreRaidMatrix(matrix,{xlThreshold:95}).rows.find(r=>r.transformed).xlCoverage'));
});

test('fixed Hidden Power builds do not combine XL coverage across incompatible builds',()=>{
    const {json}=fixture();
    const rows=json(`ScoreRaidMatrix({bosses:[{id:1},{id:2}],attackers:[
        {key:'fire',id:25,form:'Mega',level:50,transformed:true,hiddenPowerType:'Fire',matchups:[{bossIndex:0,ratio:1,xl:{eligible:true}}]},
        {key:'ice',id:25,form:'Mega',level:50,transformed:true,hiddenPowerType:'Ice',matchups:[{bossIndex:1,ratio:1,xl:{eligible:true}}]}
    ]}).rows`);
    assert.equal(rows.length,1);assert.equal(rows[0].xlCoverage,1);assert.equal(rows[0].xlCount,1);
});
