import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const context=vm.createContext({});
for(const path of ['../lib/jenks.js','../scripts/raid-leaderboard.js'])
    vm.runInContext(readFileSync(new URL(path,import.meta.url),'utf8'),context);
const tiers=context.GetRaidLeaderboardTiers;
const rows=scores=>scores.map((score,i)=>({key:String(i),score}));
const entries=map=>Array.from(map,([key,tier])=>[key,tier]).sort((a,b)=>a[0].localeCompare(b[0]));

test('Jenks raid tiers handle empty, single-score and tied pools',()=>{
    assert.equal(tiers([]).size,0);
    assert.deepEqual(entries(tiers(rows([100]))),[['0','S']]);
    assert.deepEqual(entries(tiers(rows([100,100,100]))),[['0','S'],['1','S'],['2','S']]);
    const tied=tiers(rows([100,95,95,90]));
    assert.equal(tied.get('0'),'S');assert.equal(tied.get('1'),tied.get('2'));
    assert.notEqual(tied.get('0'),tied.get('1'));
});

test('six distinct scores use the native S, A, B, C, D and F palette in score order',()=>{
    assert.deepEqual(entries(tiers(rows([100,90,80,30,20,10]))),
        [['0','S'],['1','A'],['2','B'],['3','C'],['4','D'],['5','F']]);
});

test('tier assignment is independent of row order and does not mutate scoring data',()=>{
    const input=rows([32,100,7,90,32,40,2,70,3,20]);
    const before=structuredClone(input);
    assert.deepEqual(entries(tiers(input)),entries(tiers([...input].reverse())));
    assert.deepEqual(input,before);
});

test('floating-point ties share a tier and invalid scores are ignored',()=>{
    const result=tiers(rows([100,100+1e-11,50,0,NaN,Infinity,-1]));
    assert.equal(result.get('0'),result.get('1'));
    assert.equal(result.size,4);assert(result.has('3'));
});
