/* Raid encounter and catch-XL rules. GPL-3.0. Calculation helpers are DOM-free. */
let xlStrongThreshold = 95;
try { const value = Number(sessionStorage.getItem('dialgadex-xl-threshold'));
    if ([90,95,100].includes(value)) xlStrongThreshold = value; } catch (_) {}

function GetXLStrongThreshold() { return xlStrongThreshold; }
function SetXLStrongThreshold(value) {
    xlStrongThreshold = [90,95,100].includes(Number(value)) ? Number(value) : 95;
    try { sessionStorage.setItem('dialgadex-xl-threshold', String(xlStrongThreshold)); } catch (_) {}
}
function GetCatchXLManifest() {
    return typeof jb_catch_profiles !== 'undefined' && jb_catch_profiles || {};
}
function IsCatchXLProjection(pokemon) {
    if (typeof pokemon._catchXLProjected === 'boolean') return pokemon._catchXLProjected;
    if (pokemon.released === false) return true;
    if (pokemon._verifiedRelease) return false;
    if (typeof jb_source_pkm !== 'undefined' && Array.isArray(jb_source_pkm)) {
        const source=jb_source_pkm.find(p=>PokemonDataKey(p)===PokemonDataKey(pokemon));
        if (!source) return true;
        if (source.released === false && !pokemon._auditCorrections?.some(c=>c.fields.includes('released'))) return true;
    }
    return false;
}

function GetRaidCatchEncounter(boss, roster, manifest = GetCatchXLManifest()) {
    roster ||= typeof jb_pkm !== 'undefined' && jb_pkm || [];
    const rule = manifest.encounters?.find(rule => PokemonAuditRuleMatches(rule,boss));
    if (rule && rule.targetForm == null) return {id:boss.id, form:null, types:[], status:rule.status,
        note:rule.note, sources:rule.sources || []};
    const transformed = IsMegaPrimalUltraForm(boss);
    // Unknown transformations must not silently inherit the boss's typing.
    if (!rule && boss.form === 'Ultra') return {id:boss.id,form:null,types:[],status:'unknown',sources:[]};
    const form = rule?.targetForm ?? (transformed ? GetPokemonForms(boss.id)[0] : boss.form);
    const target = !transformed && !rule ? boss : roster.find(p=>p.id===boss.id && p.form===form);
    const info = rule || manifest.rules?.[transformed ? 'megaBase' : 'sameForm'] || {};
    if (!target?.types?.length) return {id:boss.id,form,types:[],status:'unknown',note:info.note,sources:info.sources || []};
    return {id:target.id,form:target.form,name:target.name,types:[...target.types],
        status:IsCatchXLProjection(boss) ? 'projected' : rule?.status || 'rule',
        note:info.note,sources:info.sources || []};
}

function GetCatchXLBoostProfile(pokemon, manifest = GetCatchXLManifest()) {
    const rule = manifest.boostOverrides?.find(rule=>PokemonAuditRuleMatches(rule,pokemon));
    if (!rule && !IsMegaPrimalUltraForm(pokemon)) return {types:[],status:'none',sources:[]};
    if (!rule && pokemon.form === 'Ultra') return {types:[],status:'unknown',sources:[]};
    const info = rule || manifest.rules?.standardMega || {};
    const types = rule?.types || pokemon.types || [];
    return {types:[...new Set(types)],minLevel:rule ? rule.minLevel : info.minLevel ?? 2,
        status:IsCatchXLProjection(pokemon) || rule?.status === 'projected' ? 'projected' : types.length ? 'rule' : 'unknown',
        note:info.note,sources:info.sources || []};
}

/** Current Super Max availability, including a known matching-type XL profile. */
function HasSuperMaxUnlocked(pokemon) {
    if (!IsMegaPrimalUltraForm(pokemon) || !pokemon.released || !IsSuperMaxAvailable(pokemon)) return false;
    const profile = GetCatchXLBoostProfile(pokemon);
    return profile.types.length > 0 && !['unknown', 'none', 'projected'].includes(profile.status);
}

function GetCatchXLMatch(profile, encounter, level = 4, includeUnreleased = false) {
    if (!profile?.types?.length) return {eligible:profile?.status === 'unknown' ? null : false,
        reason:profile?.status === 'unknown' ? 'unknown-profile' : 'no-profile',matchedTypes:[]};
    if (!encounter?.types?.length) return {eligible:null,reason:'unknown-catch',matchedTypes:[]};
    const projected = profile.status === 'projected' || encounter.status === 'projected';
    const matchedTypes = profile.types.filter(type=>encounter.types.includes(type));
    if (!matchedTypes.length) return {eligible:false,reason:'no-match',matchedTypes,projected};
    if (projected && !includeUnreleased) return {eligible:false,reason:'projection-off',matchedTypes,projected:true};
    if (profile.minLevel != null && Number(level) < profile.minLevel)
        return {eligible:false,reason:'level-required',matchedTypes,minLevel:profile.minLevel,projected};
    return {eligible:true,reason:projected ? 'projected' : 'eligible',matchedTypes,projected};
}

function IsStrongCatchXL(match, ratio, threshold = GetXLStrongThreshold()) {
    return match?.eligible === true && Number.isFinite(ratio) && ratio >= threshold / 100 - 1e-9;
}

function XLText(key,params={}) { return FormatTranslation('catch-xl.'+key,params); }
function CatchXLTypeText(types) { return (types || []).map(type=>TranslatedTypeName(type)).join(' / '); }
function RaidCatchEncounterText(encounter) {
    if (!encounter?.types?.length) return XLText(encounter?.status === 'none' ? 'no-encounter' : 'unknown');
    const form = GetFormText(encounter.id,encounter.form);
    return TranslatedSpeciesName(encounter.id,encounter.name) + (form ? ' · '+form : '')
        + ' ('+CatchXLTypeText(encounter.types)+')' + (encounter.status === 'projected' ? ' (P)' : '');
}
function CatchXLMatchText(match) {
    const text=XLText(match?.reason || 'unknown-profile', {types:CatchXLTypeText(match?.matchedTypes),minLevel:match?.minLevel || 2});
    return text+(match?.projected && !['projected','projection-off'].includes(match.reason) ? ' (P)' : '');
}
function GetCatchXLBadge(match,compact=false) {
    if (!match || match.reason === 'no-profile' || match.reason === 'no-match') return null;
    const text = compact ? match.eligible ? match.projected ? 'XL P' : 'XL'
        : match.reason === 'level-required' ? 'XL L2+' : match.reason === 'projection-off' ? 'XL P' : 'XL ?'
        : CatchXLMatchText(match);
    return $('<span class="xl-badge"></span>').toggleClass('xl-projected',!!match.projected)
        .attr('title',CatchXLMatchText(match)+' '+XLText('active-note')).text(text);
}
