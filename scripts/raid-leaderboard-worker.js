/* Reuse the native calculator in isolation so navigation and settings remain responsive. */
let jb_pkm, jb_fm, jb_cm, jb_max_id;
importScripts('pokemon_enums.js?v=664952cd50b0', 'settings.js?v=63f6908f18cb', 'data-rules.js?v=489b486b3f8a', 'pokemon_utils.js?v=1745f81d1ee5', 'calc.js?v=e78987b30605');

function IsRaidLeaderboardMega(pokemon) {
    return IsMegaPrimalUltraForm(pokemon);
}

function RaidLeaderboardBuilds(pokemon, shadow, level) {
    const moves = GetPokemonMoves(pokemon, 'All');
    if (moves.length !== 6) return [];
    const fastMoves = moves[0].concat(moves[2]);
    const hiddenTypes = [...new Set(fastMoves.filter(move => move.startsWith('Hidden Power '))
        .map(move => jb_fm.find(entry => entry.name === move)?.type)
        .filter(type => POKEMON_TYPES.has(type)))];
    const make = (pkm, hiddenPowerType = null) => ({pkm, shadow, level, hiddenPowerType,
        key: JSON.stringify([pkm.id, pkm.form, shadow, level, hiddenPowerType])});
    if (!hiddenTypes.length) return [make(pokemon)];
    return hiddenTypes.map(type => {
        const keep = move => !move.startsWith('Hidden Power') || move === 'Hidden Power ' + type;
        const fixed = {...pokemon, fm: moves[0].filter(keep), elite_fm: moves[2].filter(keep)};
        delete fixed.fm_add;
        delete fixed.fm_rem;
        return make(fixed, type);
    });
}

self.onmessage = async event => {
    try {
        const snapshot = event.data;
        jb_pkm = snapshot.pokemon;
        jb_fm = snapshot.fastMoves;
        jb_cm = snapshot.chargedMoves;
        jb_max_id = Math.max(...jb_pkm.map(pokemon => pokemon.id));
        settings_metric = 'eDPS';
        settings_default_level = snapshot.settings.levels;
        settings_xl_budget = snapshot.settings.xlBudget;
        settings_team_size_normal = snapshot.settings.team;
        settings_team_size_mega = snapshot.settings.team;
        settings_relobbytime = snapshot.settings.relobby;
        settings_party_size = snapshot.settings.party;
        settings_newdps = snapshot.settings.newDps;
        settings_pve_turns = snapshot.settings.pveTurns;
        settings_supermega_level = snapshot.settings.megaLevel;
        estimated_y_numerator = snapshot.settings.estimatedY;
        const search = {...GetDefaultSearchParams(), type: 'Any', mega: false, suboptimal: false,
            real_damage: true, unreleased: !!snapshot.settings.includeUnreleased};
        const candidates = [];
        await SearchAll(search, async (pokemon, shadow, level) => {
            if (!IsRaidLeaderboardMega(pokemon)) candidates.push(...RaidLeaderboardBuilds(pokemon, shadow, level));
        });
        const bosses = GetRaidBosses(null, null, search.unreleased);
        const benchmarks = [];
        const attackers = candidates.map(candidate => ({
            key: candidate.key, id: candidate.pkm.id, name: candidate.pkm.name, form: candidate.pkm.form,
            shadow: candidate.shadow, level: candidate.level, legendary: !!candidate.pkm.class,
            hiddenPowerType: candidate.hiddenPowerType, matchups: [],
        }));
        const identity = candidate => JSON.stringify([candidate.pkm.id, candidate.pkm.form, candidate.shadow, candidate.level]);
        const identities = candidates.map(identity);
        for (let bossIndex = 0; bossIndex < bosses.length; bossIndex++) {
            const boss = bosses[bossIndex];
            const enemy = GetEnemyParams(boss);
            const counters = [];
            for (let index = 0; index < candidates.length; index++) {
                const candidate = candidates[index];
                const moveset = GetStrongestAgainstSpecificEnemy(candidate.pkm, candidate.shadow,
                    candidate.level, enemy, search).at(-1);
                if (moveset && Number.isFinite(moveset.rat) && moveset.rat > 0) counters.push({index, moveset});
            }
            counters.sort((a, b) => b.moveset.rat - a.moveset.rat || a.index - b.index);
            const best = counters[0]?.moveset.rat;
            if (!best) throw new Error('No valid counters for boss ' + boss.id + '/' + boss.form);
            benchmarks.push(best);
            for (const {index, moveset} of counters) {
                const ratio = moveset.rat / best;
                // All supported scoring floors can be recomputed from this compact matrix.
                if (ratio < 0.7 - 1e-9) continue;
                const runnerUp = ratio >= 1 - 1e-9
                    ? counters.find(counter => identities[counter.index] !== identities[index]) : null;
                attackers[index].matchups.push({bossIndex, ratio, edps: moveset.rat,
                    lead: runnerUp ? Math.max(0, 100 * (moveset.rat / runnerUp.moveset.rat - 1)) : 0,
                    fm: moveset.fm, fmType: moveset.fm_type, fmElite: moveset.fm_is_elite,
                    cm: moveset.cm, cmType: moveset.cm_type, cmElite: moveset.cm_is_elite});
            }
            self.postMessage({type: 'progress', completed: bossIndex + 1, total: bosses.length});
            await tryYieldToMain();
        }
        self.postMessage({type: 'complete', matrix: {
            bosses: bosses.map((boss, index) => ({id: boss.id, name: boss.name, form: boss.form,
                types: boss.types, raid_tier: boss.raid_tier, bestEdps: benchmarks[index]})),
            attackers: attackers.filter(attacker => attacker.matchups.length), settings: snapshot.settings,
        }});
    } catch (error) {
        self.postMessage({type: 'error', message: error.message});
    }
};
