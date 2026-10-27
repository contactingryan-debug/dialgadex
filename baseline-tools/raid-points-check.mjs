import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';

const scoring = vm.createContext({});
vm.runInContext(readFileSync(new URL('../scripts/raid-points.js', import.meta.url), 'utf8'), scoring);
const {RaidPointValue, ScoreRaidMatrix} = scoring;
const attacker = (key, id, matchups, extra = {}) => ({key, id, form: 'Normal', shadow: false, level: 50, matchups, ...extra});
const matchup = (bossIndex, ratio, lead = 0) => ({bossIndex, ratio, lead});

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
    const matrix = {bosses: [{id:1}, {id:1}, {id:2}], attackers: [
        attacker('a', 10, [matchup(0,1), matchup(1,1)]),
        attacker('b', 20, [matchup(2,1)]),
    ]};
    const species = ScoreRaidMatrix(matrix);
    assert.equal(species.totalWeight, 2);
    assert.equal(species.rows[0].points, 5);
    assert.equal(species.rows[1].points, 5);
    assert.equal(species.rows[0].score, 100);
    const forms = ScoreRaidMatrix(matrix, {weighting:'forms'});
    assert.equal(forms.rows[0].points, 10);
    assert.equal(forms.rows[1].score, 50);
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
