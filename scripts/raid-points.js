/* Raid investment scoring. GPL-3.0, like the surrounding DialgaDex project. */

function RaidPointValue(ratio, floor = 80) {
    if (!Number.isFinite(ratio)) return 0;
    const threshold = [70, 80, 90].includes(Number(floor)) ? Number(floor) / 100 : 0.8;
    return 5 * Math.max(0, Math.min(1, (ratio - threshold) / (1 - threshold)));
}

function ScoreRaidMatrix(matrix, options = {}) {
    const floor = [70, 80, 90].includes(Number(options.floor)) ? Number(options.floor) : 80;
    const weighting = options.weighting === 'forms' ? 'forms' : 'species';
    const speciesCounts = new Map();
    for (const boss of matrix.bosses)
        speciesCounts.set(boss.id, (speciesCounts.get(boss.id) || 0) + 1);
    const weights = matrix.bosses.map(boss => weighting === 'forms' ? 1 : 1 / speciesCounts.get(boss.id));
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
            const points = RaidPointValue(matchup.ratio, floor);
            return {...matchup, points, weightedPoints: points * weights[matchup.bossIndex]};
        });
        const points = matchups.reduce((sum, matchup) => sum + matchup.weightedPoints, 0);
        if (points <= 1e-10) continue;
        const entry = {
            ...attacker, matchups,
            points,
            first: matchups.filter(matchup => matchup.ratio >= 1 - 1e-9).length,
            near: matchups.filter(matchup => matchup.ratio >= 0.95 - 1e-9).length,
            lead: Math.max(0, ...matchups.map(matchup => matchup.lead || 0)),
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
        }))};
    }).sort(compare);
    const best = rows[0]?.points || 1;
    for (const row of rows) row.score = 100 * row.points / best;
    return {rows, floor, weighting, bossCount: matrix.bosses.length, speciesCount: speciesCounts.size,
        totalWeight: weights.reduce((sum, weight) => sum + weight, 0), bestPoints: best};
}
