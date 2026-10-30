/* Raid investment scoring. GPL-3.0, like the surrounding DialgaDex project. */

function RaidPointValue(ratio, floor = 80) {
    if (!Number.isFinite(ratio)) return 0;
    const threshold = [70, 80, 90].includes(Number(floor)) ? Number(floor) / 100 : 0.8;
    return 5 * Math.max(0, Math.min(1, (ratio - threshold) / (1 - threshold)));
}

/** Attacker scoring: one credit for near-best coverage and one more for a win. */
function RaidAttackerPointValue(ratio) {
    if (!Number.isFinite(ratio)) return 0;
    if (ratio >= 1 - 1e-9) return 2;
    return ratio >= 0.95 - 1e-9 ? 1 : 0;
}

/** A form keeps one allocation across regular, Shadow, and Super raid formats. */
function GetRaidGroupKey(boss, weighting = 'groups') {
    if (weighting === 'species') return `species:${boss.id}`;
    if (weighting === 'groups' && [386, 493, 649, 773].includes(boss.id)
            && !/^(Mega|Primal|Ultra)/i.test(boss.form || '')) return `species:${boss.id}`;
    return `form:${boss.id}/${boss.form || 'Normal'}`;
}

function GetRaidBossWeights(bosses, weighting = 'groups') {
    const groups = new Map();
    for (const boss of bosses) {
        const key = GetRaidGroupKey(boss, weighting);
        if (!groups.has(key)) groups.set(key, new Map());
        const forms = groups.get(key), form = `${boss.id}/${boss.form || 'Normal'}`;
        forms.set(form, (forms.get(form) || 0) + 1);
    }
    const weights = bosses.map(boss => {
        const forms = groups.get(GetRaidGroupKey(boss, weighting));
        return 1 / forms.size / forms.get(`${boss.id}/${boss.form || 'Normal'}`);
    });
    return {weights, groupCount: groups.size};
}

/** Award one XL-boosting transformed build per boss, using native eDPS order. */
function ScoreRaidMegaXLMatrix(matrix, options = {}) {
    const weighting = ['forms', 'species'].includes(options.weighting) ? options.weighting : 'groups';
    const {weights, groupCount} = GetRaidBossWeights(matrix.bosses, weighting);
    const superMaxOnly = !!options.superMaxOnly && !matrix.settings?.includeUnreleased;
    const builds = matrix.attackers.filter(attacker => attacker.transformed
        && (!superMaxOnly || attacker.superMaxUnlocked === true)).map(attacker => {
        const byBoss = new Map();
        for (const matchup of attacker.matchups) {
            if (!matrix.bosses[matchup.bossIndex] || !Number.isFinite(matchup.ratio)
                    || matchup.ratio <= 0 || matchup.xl?.eligible !== true) continue;
            const previous = byBoss.get(matchup.bossIndex);
            if (!previous || matchup.ratio > previous.ratio) byBoss.set(matchup.bossIndex, matchup);
        }
        return {...attacker, matchups:[...byBoss.values()]};
    });
    const winners = new Map();
    for (const build of builds) for (const matchup of build.matchups) {
        const previous = winners.get(matchup.bossIndex);
        if (!previous || matchup.ratio > previous.ratio
                || (matchup.ratio === previous.ratio && build.key.localeCompare(previous.key) < 0))
            winners.set(matchup.bossIndex, {key:build.key, ratio:matchup.ratio});
    }
    const entries = builds.map(build => {
        const matchups = build.matchups.map(matchup => {
            const won = winners.get(matchup.bossIndex)?.key === build.key;
            const points = won ? (matchup.ratio >= .95 - 1e-9 ? 10 : 1) : 0;
            return {...matchup, won, points, weightedPoints:points * weights[matchup.bossIndex]};
        });
        const wins = matchups.filter(matchup => matchup.won);
        const points = wins.reduce((sum, matchup) => sum + matchup.weightedPoints, 0);
        const coverage = threshold => wins.filter(matchup => matchup.ratio >= threshold - 1e-9)
            .reduce((sum, matchup) => sum + weights[matchup.bossIndex], 0);
        return {...build, matchups, points, first:coverage(1), near:coverage(.95),
            positive:wins.reduce((sum, matchup) => sum + weights[matchup.bossIndex], 0),
            lead:Math.max(0, ...wins.map(matchup => matchup.lead || 0)),
            xlProjected:wins.filter(matchup => matchup.xl.projected).length};
    });
    // Winning Hidden Power builds remain separate; their boss wins are never combined.
    const variants = new Map();
    for (const row of entries) {
        const identity = JSON.stringify([row.id, row.form, !!row.shadow, row.level]);
        if (!variants.has(identity)) variants.set(identity, []);
        variants.get(identity).push(row);
    }
    for (const group of variants.values()) for (const row of group)
        row.variants = group.map(variant => ({key:variant.key, hiddenPowerType:variant.hiddenPowerType,
            points:variant.points, near:variant.near, positive:variant.positive}));
    const rows = entries.filter(row => row.points > 0)
        .sort((a, b) => b.points - a.points || b.near - a.near || b.positive - a.positive || a.key.localeCompare(b.key));
    const best = rows[0]?.points || 0;
    for (const row of rows) row.score = 100 * (row.points / best);
    return {rows, scoring:'mega-xl', weighting, superMaxOnly, weights, groupCount, bossCount:matrix.bosses.length,
        speciesCount:new Set(matrix.bosses.map(boss => boss.id)).size,
        totalWeight:weights.reduce((sum, weight) => sum + weight, 0), bestPoints:best};
}

/** Select elite for Attacker and mega-xl for the XL-winning Mega leaderboard. */
function ScoreRaidMatrix(matrix, options = {}) {
    if (options.scoring === 'mega-xl') return ScoreRaidMegaXLMatrix(matrix, options);
    const scoring = options.scoring === 'elite' ? 'elite' : 'linear';
    const floor = scoring === 'elite' ? 95 : [70, 80, 90].includes(Number(options.floor)) ? Number(options.floor) : 80;
    const weighting = ['forms', 'species'].includes(options.weighting) ? options.weighting : 'groups';
    const xlThreshold = [90,95,100].includes(Number(options.xlThreshold)) ? Number(options.xlThreshold) : 95;
    const speciesCounts = new Map();
    for (const boss of matrix.bosses)
        speciesCounts.set(boss.id, (speciesCounts.get(boss.id) || 0) + 1);
    const {weights, groupCount} = GetRaidBossWeights(matrix.bosses, weighting);
    const groups = new Map();
    for (const attacker of matrix.attackers) {
        // Protect against counting an alternative moveset twice for one boss.
        const byBoss = new Map();
        for (const matchup of attacker.matchups) {
            if (!Number.isFinite(matchup.ratio) || !matrix.bosses[matchup.bossIndex]) continue;
            const previous = byBoss.get(matchup.bossIndex);
            if (!previous || matchup.ratio > previous.ratio) byBoss.set(matchup.bossIndex, matchup);
        }
        const matchups = [...byBoss.values()].map(matchup => {
            const points = scoring === 'elite' ? RaidAttackerPointValue(matchup.ratio) : RaidPointValue(matchup.ratio, floor);
            return {...matchup, points, weightedPoints: points * weights[matchup.bossIndex]};
        });
        const points = matchups.reduce((sum, matchup) => sum + matchup.weightedPoints, 0);
        const strongXL = matchups.filter(matchup=>matchup.xl?.eligible === true && matchup.ratio >= xlThreshold/100 - 1e-9);
        const xlCoverage = strongXL.reduce((sum,matchup)=>sum+weights[matchup.bossIndex],0);
        if (points <= 1e-10 && (scoring === 'elite' || xlCoverage <= 1e-10)) continue;
        const entry = {
            ...attacker, matchups,
            points,
            first: matchups.filter(matchup => matchup.ratio >= 1 - 1e-9)
                .reduce((sum, matchup) => sum + weights[matchup.bossIndex], 0),
            near: matchups.filter(matchup => matchup.ratio >= 0.95 - 1e-9)
                .reduce((sum, matchup) => sum + weights[matchup.bossIndex], 0),
            lead: Math.max(0, ...matchups.map(matchup => matchup.lead || 0)),
            xlCoverage, xlCount:strongXL.length, xlProjected:strongXL.filter(matchup=>matchup.xl.projected).length,
        };
        const key = JSON.stringify([attacker.id, attacker.form, !!attacker.shadow, attacker.level]);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(entry);
    }
    const compare = (a, b) => b.points - a.points || b.first - a.first || a.key.localeCompare(b.key);
    const rows = [...groups.values()].map(variants => {
        variants.sort(compare);
        // A fixed Hidden Power build earns its own total; variants are never added together.
        return {...variants[0], variants: variants.map(variant => ({
            key: variant.key, hiddenPowerType: variant.hiddenPowerType, points: variant.points,
            first: variant.first, near: variant.near,
            xlCoverage:variant.xlCoverage,
        }))};
    }).sort(compare);
    // Use the best non-Mega total under the same point rule as this view.
    const best = rows.find(row => !row.transformed)?.points || 1;
    for (const row of rows) row.score = 100 * row.points / best;
    return {rows, scoring, floor, weighting, xlThreshold, weights, groupCount, bossCount: matrix.bosses.length, speciesCount: speciesCounts.size,
        totalWeight: weights.reduce((sum, weight) => sum + weight, 0), bestPoints: best};
}
