/* Optional per-form +move projections. GPL-3.0. No DOM dependencies. */
const projectedPlusMoveCache = new Map();

function GetProjectedPlusMove(name) { return projectedPlusMoveCache.get(name); }
function GetProjectedPlusMoveById(id) {
    return [...projectedPlusMoveCache.values()].find(move => move.id === id);
}

function PredictPlusMovePower(attack, durationMs, model) {
    model ||= typeof jb_plus_predictions !== 'undefined' ? jb_plus_predictions?.model : null;
    if (!model || !Number.isFinite(attack) || !Number.isFinite(durationMs)) return NaN;
    const raw = model.intercept + model.attackCoefficient * attack
        + model.durationCoefficient * durationMs / 1000;
    return Math.round(raw / model.roundTo) * model.roundTo;
}

function GetPlusMoveRule(pokemon) {
    return typeof jb_plus_predictions !== 'undefined' && jb_plus_predictions?.assignments
        ?.find(rule => PokemonAuditRuleMatches(rule, pokemon));
}

function GetPlusMoveProjectionInfo(pokemon, includeUnreleased = false) {
    const rule = GetPlusMoveRule(pokemon);
    if (!rule) return null;
    if (!rule.move) return {rule, status: 'unassigned'};
    const source = jb_cm.find(move => !move._plus_projection && move.mega_temp
        && move.name.replace(/ Plus$/, '+') === rule.move && move.type === rule.type
        && move.power > 0 && move.duration > 0 && move.energy_delta < 0);
    const originalTemp = pokemon._plusProjections?.originalTemp || pokemon.temp_cm || [];
    if (source && originalTemp.includes(source.name)) return {rule, status: 'source', move: source, powerKind: 'source'};
    const parent = jb_cm.find(move => !move._plus_projection && move.name === rule.baseMove && move.type === rule.type);
    const duration = source?.duration || parent?.duration || rule.referenceDuration;
    const power = source?.power ?? rule.publishedPower ?? PredictPlusMovePower(pokemon.stats?.baseAttack, duration);
    if (!(duration > 0 && power > 0)) return {rule, status: 'incomplete'};
    const name = `${rule.move} [forecast:${PokemonDataKey(pokemon)}]`;
    const definition = {
        ...(source || parent), id: 1000000 + rule.registryRow, name, type: rule.type, power, duration,
        energy_delta: source?.energy_delta ?? -jb_plus_predictions.energy,
        mega_temp: true, _plus_projection: true, projection_label: rule.move,
        projection_base_id: parent?.id, projection_for: PokemonDataKey(pokemon),
        projection_power_kind: source ? 'source' : rule.publishedPower != null ? 'published' : 'estimated',
        projection_hypothesis: rule.hypothesis,
        projection_inputs: {attack: pokemon.stats?.baseAttack, durationMs: duration}
    };
    const move = projectedPlusMoveCache.get(name) || {};
    Object.assign(move, definition);
    projectedPlusMoveCache.set(name, move);
    // A forecast must not turn placeholder base learnsets into usable data.
    const usable = GetPokemonDataQuality({...pokemon, temp_cm: originalTemp}).usable;
    return {rule, move, powerKind: move.projection_power_kind,
        status: !usable ? 'incomplete' : includeUnreleased ? 'applied' : 'off'};
}

function StripPlusMoveProjections(roster) {
    for (const pokemon of roster) {
        const original = pokemon._plusProjections;
        if (!original) continue;
        if (original.hadTemp) pokemon.temp_cm = [...original.originalTemp];
        else delete pokemon.temp_cm;
        delete pokemon._plusProjections;
    }
    return roster;
}

function ApplyPlusMoveProjections(roster, register = false) {
    StripPlusMoveProjections(roster);
    if (typeof jb_plus_predictions === 'undefined' || !jb_plus_predictions) return roster;
    for (const pokemon of roster) {
        if (!IsMegaPrimalUltraForm(pokemon)) continue;
        const info = GetPlusMoveProjectionInfo(pokemon, true);
        if (info?.status !== 'applied') continue;
        pokemon._plusProjections = {hadTemp: Object.hasOwn(pokemon, 'temp_cm'), originalTemp: [...(pokemon.temp_cm || [])]};
        pokemon.temp_cm = [...new Set([...(pokemon.temp_cm || []), info.move.name])];
        if (register && !jb_cm.some(move => move.name === info.move.name)) jb_cm.push(info.move);
    }
    return roster;
}

function RefreshPlusMoveProjections(includeUnreleased) {
    if (typeof jb_pkm === 'undefined' || !Array.isArray(jb_pkm)
            || typeof jb_cm === 'undefined' || !Array.isArray(jb_cm)) return;
    StripPlusMoveProjections(jb_pkm);
    jb_cm = jb_cm.filter(move => !move._plus_projection);
    if (includeUnreleased) ApplyPlusMoveProjections(jb_pkm, true);
}

function PlusMoveProjectionSummary(move) {
    const rule = jb_plus_predictions.assignments.find(rule => PokemonDataKey(rule) === move.projection_for);
    const summary = FormatTranslation('plus-moves.summary', {
        pokemon: rule?.pokemon || move.projection_for,
        kind: GetTranslation('plus-moves.power-' + move.projection_power_kind),
        power: move.power, energy: Math.abs(move.energy_delta), seconds: move.duration / 1000
    });
    const inputs = move.projection_power_kind === 'estimated'
        ? ' ' + FormatTranslation('plus-moves.inputs', {attack: move.projection_inputs.attack, seconds: move.duration / 1000}) : '';
    return summary + inputs + (move.projection_hypothesis ? ' ' + GetTranslation('plus-moves.hypothesis') : '');
}
