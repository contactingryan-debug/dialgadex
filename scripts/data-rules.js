/* Shared data eligibility and corrections. GPL-3.0. No DOM dependencies. */

function PokemonDataKey(pokemon) {
    return `${pokemon.id}/${pokemon.form || 'Normal'}`;
}

/** Ultra means an Ultra transformation, not the Ultra Beast species class. */
function IsMegaPrimalUltraForm(pokemon) {
    return /^(Mega(?:Y|Z)?|Primal|Ultra)$/i.test(pokemon?.form || '')
        || /^(Mega |Primal |Ultra Necrozma$)/i.test(pokemon?.name || '');
}

function GetAttackerLevelBoost(pokemon, includeUnreleased = false) {
    if (settings_supermega_level !== 4 || !pokemon) return 0;
    const currentBoost = [8, 9].includes(pokemon.raid_tier);
    const projectedBoost = includeUnreleased && IsMegaPrimalUltraForm(pokemon);
    return currentBoost || projectedBoost ? 2 : 0;
}

function UsesProjectedAttackerLevel(pokemon, includeUnreleased = false) {
    return !!GetAttackerLevelBoost(pokemon, includeUnreleased) && ![8, 9].includes(pokemon.raid_tier);
}

/** Accept a base level; explicit calculator levels are already effective levels. */
function GetAttackerLevel(pokemon, baseLevel, includeUnreleased = false) {
    const selected = pokemon && !pokemon.class && settings_xl_budget ? 50 : Number(baseLevel);
    return selected + GetAttackerLevelBoost(pokemon, includeUnreleased);
}

function PokemonAuditRuleMatches(rule, pokemon) {
    return rule.id === pokemon.id && (rule.form === pokemon.form || rule.forms?.includes(pokemon.form));
}

function PokemonAuditConditionMatches(value, expected) {
    if (expected === null) return value == null;
    if (typeof expected === 'object' && !Array.isArray(expected))
        return value != null && Object.entries(expected).every(([key, item]) => PokemonAuditConditionMatches(value[key], item));
    return value === expected;
}

function FindChargedMove(name) {
    return (typeof GetProjectedPlusMove === 'function' && GetProjectedPlusMove(name))
        || jb_cm.find(move => move.name === name);
}

function MarkPokemonMovePlaceholder(pokemon, previewOnly = false) {
    const charged = [...(pokemon.cm || []), ...(pokemon.elite_cm || [])];
    if ((!pokemon.released || previewOnly) && charged.length && charged.every(move => move === 'Struggle'))
        pokemon._movesPending = true;
    return pokemon;
}

/** Apply narrow, documented corrections before preview patches, preserving raw source data. */
function ApplyPokemonAuditOverrides(pokemon, manifest = {}) {
    for (const entry of pokemon) {
        MarkPokemonMovePlaceholder(entry);
        for (const rule of manifest.corrections || []) {
            if (!PokemonAuditRuleMatches(rule, entry)) continue;
            if (rule.when && !PokemonAuditConditionMatches(entry, rule.when)) continue;
            const applied = [];
            for (const [key, value] of Object.entries(rule.values || {})) {
                if (JSON.stringify(entry[key]) !== JSON.stringify(value)) {
                    entry[key] = structuredClone(value);
                    applied.push(key);
                }
            }
            if (applied.length) entry._auditCorrections = [...(entry._auditCorrections || []), {key: rule.key, fields: applied}];
        }
        for (const rule of manifest.restrictions || []) {
            if (PokemonAuditRuleMatches(rule, entry)) entry._raidRestriction = rule.reason;
        }
    }
    return pokemon;
}

/** Zero-power fast moves can be genuine learnsets. Only incomplete data is excluded. */
function GetPokemonDataQuality(pokemon) {
    if (!pokemon) return {usable: false, code: 'missing-record'};
    if (!['baseAttack', 'baseDefense', 'baseStamina'].every(key =>
            Number.isFinite(pokemon.stats?.[key]) && pokemon.stats[key] > 0))
        return {usable: false, code: 'missing-stats'};
    const fast = [...(pokemon.fm || []), ...(pokemon.elite_fm || []), ...(pokemon.fm_add || [])]
        .filter(move => !(pokemon.fm_rem || []).includes(move));
    const charged = [...(pokemon.cm || []), ...(pokemon.elite_cm || []), ...(pokemon.cm_add || []), ...(pokemon.temp_cm || [])]
        .filter(move => !(pokemon.cm_rem || []).includes(move));
    if ((!pokemon.released || pokemon._movesPending) && charged.length && charged.every(move => move === 'Struggle'))
        return {usable: false, code: 'placeholder-moves'};
    if (!fast.some(name => jb_fm.some(move => move.name === name && Number.isFinite(move.duration) && move.duration > 0))
            || !charged.some(name => jb_cm.some(move => move.name === name && Number.isFinite(move.duration) && move.duration > 0)))
        return {usable: false, code: 'missing-moves'};
    return {usable: true, code: 'usable'};
}

function IsPokemonCalculationEligible(pokemon, includeUnreleased = false) {
    return !!pokemon && !pokemon._raidRestriction && (includeUnreleased || !!pokemon.released)
        && GetPokemonDataQuality(pokemon).usable;
}
