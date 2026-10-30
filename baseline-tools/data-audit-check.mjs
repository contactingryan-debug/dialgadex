import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const inputs = JSON.parse(read('./fixtures/audit-inputs.json'));
const manifest = JSON.parse(read('../data/audit-overrides.json'));
const strings = JSON.parse(read('../locales/en.json'));

function fixture({future = false, preview = true} = {}) {
    const context = vm.createContext({performance, setTimeout, structuredClone, URL, URLSearchParams,
        location: {href:'https://example.test/dialgadex/?audit'},
        FormatTranslation(key, params = {}) {
            let value = key.split('.').reduce((obj, key) => obj?.[key], strings) || key;
            for (const [key, replacement] of Object.entries(params)) value = value.replaceAll('{'+key+'}', replacement);
            return value;
        }});
    for (const name of ['dataload','settings','pokemon_enums','data-rules','pokemon_utils','raid-points','data-audit'])
        vm.runInContext(read('../scripts/'+name+'.js'), context);
    context.inputs = structuredClone(inputs);
    context.manifest = structuredClone(manifest);
    vm.runInContext(`
        jb_source_pkm = structuredClone(inputs.pokemon);
        jb_pkm = ApplyPokemonAuditOverrides(structuredClone(inputs.pokemon), manifest);
        jb_spec = structuredClone(inputs.announced);
        jb_audit_manifest = manifest;
        jb_fm = inputs.fastMoves; jb_cm = inputs.chargedMoves; jb_max_id = 998;
        settings_speculative = ${preview}; settings_include_unreleased = ${future};
        GetIncludeUnreleased = () => settings_include_unreleased;
        currentLocale = 'en';
        if (settings_speculative) PatchSpeculative(true);
    `,context);
    const evaluate = expression => vm.runInContext(expression,context);
    const json = expression => JSON.parse(evaluate('JSON.stringify('+expression+')'));
    return {evaluate,json};
}

test('documented corrections preserve raw flags and remain reversible with preview toggles', () => {
    const {evaluate,json} = fixture();
    assert.equal(json('jb_source_pkm.find(p=>p.id===150&&p.form==="A").raid_tier ?? null'), null);
    assert.equal(json('GetCalculationPokemon(false).find(p=>p.id===150&&p.form==="A").raid_tier'), 5);
    for (const form of ['Meteor','Green']) {
        assert.equal(json(`jb_source_pkm.find(p=>p.id===774&&p.form==="${form}").released`),false);
        assert.equal(json(`GetCalculationPokemon(false).find(p=>p.id===774&&p.form==="${form}").released`),true);
    }
    const current = json('GetCalculationPokemon(false)');
    evaluate('PatchSpeculative(false);settings_speculative=false;PatchSpeculative(true);settings_speculative=true');
    assert.deepEqual(json('GetCalculationPokemon(false)'),current);
});

test('Solgaleo and Lunala retain sourced five-star corrections in both pools and through preview toggles', () => {
    const {evaluate,json} = fixture();
    evaluate(`for (const id of [791,792]) {
        const raw={...structuredClone(jb_source_pkm.find(p=>p.id===150&&p.form==='Normal')),
            id,name:id===791?'Solgaleo':'Lunala',form:'Normal',released:true,shadow:false,
            types:['Psychic',id===791?'Steel':'Ghost']};
        delete raw.raid_tier;
        jb_source_pkm.push(raw);
        jb_pkm.push(ApplyPokemonAuditOverrides([structuredClone(raw)],manifest)[0]);
    }`);
    for (const future of [false,true]) for (const id of [791,792]) {
        const boss=json(`GetRaidBosses(null,null,${future}).find(p=>p.id===${id})`);
        assert.equal(boss.raid_tier,5);
        assert.equal(boss.released,true);
        assert.equal(json(`GetRaidStats(GetRaidBosses(null,null,${future}).find(p=>p.id===${id})).hp`),15000);
    }
    for (const id of [791,792]) {
        const info=json(`GetPokemonAuditInfo(${id},'Normal',BuildPokemonAuditContext())`);
        assert.equal(info.bossIncluded,true);
        assert.equal(info.evidence,'verified');
        assert.equal(info.weight,1);
        assert.equal(info.source.raid_tier,undefined);
        assert(info.corrections.some(rule=>rule.sources.includes('https://pokemongo.com/news/road-of-legends-2026')));
    }
    evaluate('PatchSpeculative(false);settings_speculative=false;PatchSpeculative(true);settings_speculative=true');
    for (const id of [791,792]) {
        assert.equal(json(`GetCalculationPokemon(false).find(p=>p.id===${id}).raid_tier`),5);
        assert.equal(json(`jb_source_pkm.find(p=>p.id===${id}).raid_tier ?? null`),null);
    }
    evaluate('jb_pkm.find(p=>p.id===791).raid_tier=6;ApplyPokemonAuditOverrides(jb_pkm,manifest)');
    assert.equal(json('jb_pkm.find(p=>p.id===791).raid_tier'),6,'Do not override an explicit upstream raid profile.');
});

test('placeholder moves are excluded as attackers and bosses even with unreleased enabled', async () => {
    const {evaluate,json} = fixture({future:true});
    const attackers = JSON.parse(await evaluate(`(async()=>{
        const keys=[];await SearchAll({...GetDefaultSearchParams(),unreleased:true},p=>keys.push(PokemonDataKey(p)));
        return JSON.stringify(keys);
    })()`));
    assert(!attackers.includes('800/Ultra'));
    assert(!attackers.includes('801/Normal'));
    assert(!attackers.includes('801/Mega'));
    assert(!json('GetRaidBosses(null,null,true).some(p=>p.id===800&&p.form==="Ultra")'));
    assert(attackers.includes('718/Mega') && attackers.includes('998/Mega'));
});

test('genuine Splash learnsets remain usable while Minior core raid restrictions are respected', async () => {
    const {evaluate,json} = fixture({future:true});
    assert.equal(json('GetPokemonDataQuality(jb_pkm.find(p=>p.id===129)).usable'),true);
    assert.equal(json('GetPokemonDataQuality(jb_pkm.find(p=>p.id===774&&p.form==="Green")).usable'),true);
    assert.equal(json('IsPokemonCalculationEligible(jb_pkm.find(p=>p.id===774&&p.form==="Green"),true)'),false);
    const keys=JSON.parse(await evaluate(`(async()=>{const keys=[];await SearchAll({...GetDefaultSearchParams(),unreleased:true},p=>keys.push(PokemonDataKey(p)));return JSON.stringify(keys)})()`));
    assert(keys.includes('129/Normal') && keys.includes('774/Meteor'));
    assert(!keys.includes('774/Green') && !keys.includes('774/Red'));
});

test('a preview release flag cannot make a new placeholder learnset usable', () => {
    const {evaluate,json}=fixture({future:true,preview:false});
    evaluate('jb_spec.find(p=>p.id===801).released=true;PatchSpeculative(true);settings_speculative=true');
    assert.equal(json('GetPokemonDataQuality(jb_pkm.find(p=>p.id===801&&p.form==="Mega")).code'),'placeholder-moves');
    assert.equal(json('GetPokemonAuditInfo(801,"Mega",BuildPokemonAuditContext()).attackerIncluded'),false);
});

test('a released alternate form is not blocked by an unreleased base form', async () => {
    const {evaluate}=fixture({preview:false});
    evaluate('jb_pkm.find(p=>p.id===800&&p.form==="Normal").released=false');
    const keys=JSON.parse(await evaluate(`(async()=>{const keys=[];await SearchAll({...GetDefaultSearchParams(),unreleased:false},p=>keys.push(PokemonDataKey(p)));return JSON.stringify(keys)})()`));
    assert(keys.includes('800/Dawn_wings') && !keys.includes('800/Normal'));
});

test('Eternamax is inspectable but never a usable ordinary raid form, while regular Eternatus remains eligible', async () => {
    const {evaluate,json}=fixture({future:true});
    assert.equal(json('GetPokemonDataQuality(jb_pkm.find(p=>p.id===890&&p.form==="Eternamax")).usable'),true);
    for(const future of [false,true]) {
        const keys=JSON.parse(await evaluate(`(async()=>{const keys=[];
            await SearchAll({...GetDefaultSearchParams(),unreleased:${future},mega:false},p=>keys.push(PokemonDataKey(p)));
            return JSON.stringify(keys)})()`));
        assert(keys.includes('890/Normal'));assert(!keys.includes('890/Eternamax'));
    }
    const info=json('GetPokemonAuditInfo(890,"Eternamax",BuildPokemonAuditContext())');
    assert.equal(info.supported,true);assert.equal(info.attackerIncluded,false);
    assert.equal(info.leaderboardIncluded,false);assert.equal(info.bossIncluded,false);
    assert(info.reasons.includes('max-battle-only'));
    assert.equal(json('jb_source_pkm.find(p=>p.id===890&&p.form==="Eternamax")._raidRestriction ?? null'),null);
    const copy=evaluate('PokemonAuditCopyText(GetPokemonAuditInfo(890,"Eternamax",BuildPokemonAuditContext()),BuildPokemonAuditContext())');
    assert.match(copy,/Max Battle boss only/);assert.match(copy,/https:\/\/pokemongo.com\/gofestmaxfinale/);
    // Even an erroneous future release flag/raid tag must not make a Max boss a raid form.
    evaluate('Object.assign(jb_pkm.find(p=>p.id===890&&p.form==="Eternamax"),{released:true,raid_tier:5})');
    assert.equal(json('IsPokemonCalculationEligible(jb_pkm.find(p=>p.id===890&&p.form==="Eternamax"),true)'),false);
    assert(!json('GetRaidBosses(null,null,true).some(p=>p.id===890&&p.form==="Eternamax")'));
    evaluate('PatchSpeculative(false);settings_speculative=false;PatchSpeculative(true);settings_speculative=true');
    assert.equal(json('GetPokemonAuditInfo(890,"Normal",BuildPokemonAuditContext()).attackerIncluded'),true);
    assert.equal(json('GetPokemonAuditInfo(890,"Eternamax",BuildPokemonAuditContext()).attackerIncluded'),false);
});

test('audit details distinguish projections, stored stats, hypothetical stats, and selected weights', () => {
    const {evaluate,json}=fixture({future:true});
    evaluate('auditContext=BuildPokemonAuditContext()');
    const ultra=json('GetPokemonAuditInfo(800,"Ultra",auditContext)');
    assert.equal(ultra.quality.code,'placeholder-moves');
    assert.equal(ultra.bossIncluded,false);
    assert.deepEqual(ultra.display.stats,manifest.statReviews.find(r=>r.id===800).expected);
    const copied=evaluate('PokemonAuditCopyText(GetPokemonAuditInfo(800,"Ultra",auditContext),auditContext)');
    assert.match(copied,/337 \/ 196 \/ 200/);
    assert.match(copied,/Separate hypothetical forecast: 359 \/ 209 \/ 213/);
    assert.match(copied,/Placeholder moves/);
    assert.match(copied,/https:\/\/example.test\/dialgadex\/\?p=800&f=Ultra/);
    for (const id of [718,998]) {
        const info=json(`GetPokemonAuditInfo(${id},"Mega",auditContext)`);
        assert.equal(info.projectedStats,true);
        assert.equal(info.statsChanged,false);
        assert.equal(info.weight,1);
    }
    const armored=json('GetPokemonAuditInfo(150,"A",auditContext)');
    assert.equal(armored.evidence,'verified');
    assert.equal(armored.weight,1);
    assert.equal(json('GetPokemonAuditInfo(150,"Normal",auditContext).weight'),1);
});

test('preview-only records remain inspectable while excluded from the current calculation pool', () => {
    const {evaluate,json}=fixture();
    evaluate('auditContext=BuildPokemonAuditContext()');
    const info=json('GetPokemonAuditInfo(998,"Mega",auditContext)');
    assert.equal(info.currentReleased,false);
    assert.equal(info.weight,0);
    assert.equal(info.attackerIncluded,false);
    assert(info.reasons.includes('preview-only'));
});

test('unsupported preview aliases never become boss opportunities', () => {
    const {evaluate,json}=fixture({future:true});
    evaluate('jb_pkm.push({...structuredClone(jb_pkm.find(p=>p.id===800&&p.form==="Normal")),form:"Unsupported_alias"})');
    assert.equal(json('GetRaidBosses(null,null,true).some(p=>p.form==="Unsupported_alias")'),false);
});

test('audit inclusion and copied details reflect explicit custom calculation edits', () => {
    const {evaluate,json}=fixture({future:true});
    evaluate('jb_pkm.find(p=>p.id===800&&p.form==="Ultra").cm_add=["Outrage"]');
    assert.equal(json('GetPokemonAuditInfo(800,"Ultra",BuildPokemonAuditContext()).attackerIncluded'),true);
    assert.match(evaluate('PokemonAuditCopyText(GetPokemonAuditInfo(800,"Ultra",BuildPokemonAuditContext()),BuildPokemonAuditContext())'),/Custom move edits:.*Outrage/);
    assert.equal(json('jb_source_pkm.find(p=>p.id===800&&p.form==="Ultra").cm_add ?? null'),null);
});

test('audit eligibility follows the exclusive Attacker and Mega leaderboard views',()=>{
    const {evaluate,json}=fixture();
    assert.equal(json('GetPokemonAuditInfo(150,"Mega",BuildPokemonAuditContext()).leaderboardIncluded'),false);
    assert.equal(json('GetPokemonAuditInfo(150,"Normal",BuildPokemonAuditContext()).leaderboardIncluded'),true);
    evaluate('GetRaidLeaderboardIncludeMegas=()=>true');
    assert.equal(json('GetPokemonAuditInfo(150,"Mega",BuildPokemonAuditContext()).leaderboardIncluded'),true);
    assert.equal(json('GetPokemonAuditInfo(150,"Normal",BuildPokemonAuditContext()).leaderboardIncluded'),false);
    assert.match(evaluate('PokemonAuditCopyText(GetPokemonAuditInfo(150,"Mega",BuildPokemonAuditContext()),BuildPokemonAuditContext())'),/Raid leaderboard: Included; view: Mega\/Primal\/Ultra only/);
    assert.match(evaluate('PokemonAuditCopyText(GetPokemonAuditInfo(150,"Normal",BuildPokemonAuditContext()),BuildPokemonAuditContext())'),/Select the Attacker leaderboard/);
    assert.equal(json('GetPokemonAuditInfo(800,"Ultra",BuildPokemonAuditContext()).leaderboardIncluded'),false);
});
