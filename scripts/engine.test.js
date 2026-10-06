import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {italianDay,dayNumber,targetForDay,rankVocabulary,normalise,nextMidnight} from '../dist/engine.js';
test('Italian midnight and daylight saving transitions',()=>{
 assert.equal(italianDay(new Date('2026-10-06T21:59:59Z')),'2026-10-06');
 assert.equal(italianDay(new Date('2026-10-06T22:00:00Z')),'2026-10-07');
 assert.equal(italianDay(new Date('2026-12-06T23:00:00Z')),'2026-12-07');
 for(const stamp of ['2026-03-28T23:30:00Z','2026-10-24T22:30:00Z']){
  const now=new Date(stamp),boundary=nextMidnight(now);
  assert.notEqual(italianDay(new Date(boundary)),italianDay(now));
  assert.equal(italianDay(new Date(boundary-1100)),italianDay(now));
 }
});
test('Daily schedule is deterministic and wraps for past dates',()=>{
 assert.equal(dayNumber('2026-10-06'),0);
 assert.equal(targetForDay('2026-10-07',[3,4,5]),4);
 assert.equal(targetForDay('2026-10-05',[3,4,5]),5);
});
test('Semantic ranks use cosine similarity, not spelling',()=>{
 const {ranks}=rankVocabulary(new Int8Array([100,0,99,1,0,100,-100,0]),2,0);
 assert.deepEqual([...ranks],[1,2,3,4]);
 assert.equal(normalise('  CAFFÈ  '),'caffè');
});
test('Packaged vocabulary and ranking are consistent',()=>{
 const data=JSON.parse(fs.readFileSync(new URL('../dist/data/vocabulary.json',import.meta.url)));
 const bytes=fs.readFileSync(new URL('../dist/data/vectors.bin',import.meta.url));
 assert.equal(bytes.length,data.words.length*data.dimensions);
 assert.equal(new Set(data.words).size,data.words.length);
 assert.ok(data.targets.length>=365);
 assert.equal(new Set(data.targets).size,data.targets.length);
 assert.ok(data.targets.every(id=>Number.isInteger(id)&&id>=0&&id<data.words.length));
 const {ranks}=rankVocabulary(new Int8Array(bytes),data.dimensions,data.targets[0]);
 assert.equal(ranks[data.targets[0]],1);
 assert.equal(new Set(ranks).size,data.words.length);
});
