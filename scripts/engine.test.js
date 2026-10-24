import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {italianDay,dayNumber,targetForDay,rankVocabulary,normalise,nextMidnight,decodeRankings,buildLexicon,resolveGuess,canonicalGuesses,hintRank,shareText,statsText,summariseGame,backfillHistory,computeStats} from '../dist/engine.js';

const data = JSON.parse(fs.readFileSync(new URL('../dist/data/vocabulary.json', import.meta.url)));
const lexicon = buildLexicon(data);
const id = word => {const i = lexicon.lookup.get(word); assert.ok(i !== undefined, word); return i;};
const table = target => {
  const bytes = fs.readFileSync(new URL(`../dist/data/ranks/${data.dataset}/${target}.bin`, import.meta.url));
  return decodeRankings(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), data.words.length, data.playable, target);
};
const playableIds = () => {
  const out = new Set(data.words.map((_, i) => i));
  for (const m of [lexicon.aliases, lexicon.superlatives, lexicon.misspellings, lexicon.names]) for (const k of m.keys()) out.delete(k);
  return out;
};

test('Italian midnight and daylight saving transitions', () => {
  assert.equal(italianDay(new Date('2026-10-06T21:59:59Z')), '2026-10-06');
  assert.equal(italianDay(new Date('2026-10-06T22:00:00Z')), '2026-10-07');
  assert.equal(italianDay(new Date('2026-12-06T23:00:00Z')), '2026-12-07');
  for (const stamp of ['2026-03-28T23:30:00Z', '2026-10-24T22:30:00Z']) {
    const now = new Date(stamp), boundary = nextMidnight(now);
    assert.notEqual(italianDay(new Date(boundary)), italianDay(now));
    assert.equal(italianDay(new Date(boundary - 1100)), italianDay(now));
  }
});

test('Daily schedule is deterministic and wraps for past dates', () => {
  assert.equal(dayNumber('2026-10-06'), 0);
  assert.equal(targetForDay('2026-10-07', [3, 4, 5]), 4);
  assert.equal(targetForDay('2026-10-05', [3, 4, 5]), 5);
});

test('Calendar keeps its length and every word already played', () => {
  assert.equal(data.targets.length, data.sourceTargets.length);
  assert.equal(new Set(data.targets).size, data.targets.length);
  // Days up to and including 2026-10-20 keep their solution.
  for (let n = 0; n <= dayNumber('2026-10-20'); n++) assert.equal(data.targets[n], data.sourceTargets[n]);
  const changed = data.targets.filter((t, i) => t !== data.sourceTargets[i]).length;
  assert.ok(changed <= 5, `${changed} calendar entries changed`);
});

test('Semantic ranks use cosine similarity, not spelling', () => {
  const {ranks} = rankVocabulary(new Int8Array([100, 0, 99, 1, 0, 100, -100, 0]), 2, 0);
  assert.deepEqual([...ranks], [1, 2, 3, 4]);
  const subset = rankVocabulary(new Int8Array([100, 0, 99, 1, 0, 100, -100, 0]), 2, 0, [0, 2, 3]);
  assert.deepEqual([...subset.ranks], [1, 0, 2, 3]);
  assert.equal(normalise('  CAFFÈ  '), 'caffè');
});

test('Gender and number forms share one entry', () => {
  for (const [form, lemma] of [['bella', 'bello'], ['belle', 'bello'], ['belli', 'bello'], ['gatte', 'gatto'], ['gatta', 'gatto'],
    ['gatti', 'gatto'], ['ragazza', 'ragazzo'], ['amiche', 'amico'], ['case', 'casa'], ['attrice', 'attore'], ['studentessa', 'studente'],
    ['grandi', 'grande'], ['uova', 'uovo'], ['pomodorini', 'pomodorino'], ['trovate', 'trovato']]) {
    const r = resolveGuess(form, lexicon, data.words);
    assert.equal(r.kind, 'ok', form);
    assert.equal(data.words[r.id], lemma, form);
  }
  // Different words that only look like gender pairs stay apart.
  for (const word of ['prende', 'serve', 'porta', 'porto', 'casa', 'caso', 'politica', 'musica', 'partita', 'fisica', 'moda', 'modo', 'pianta', 'volta', 'torta', 'soldi', 'occhiali', 'forbici', 'dei', 'tenere', 'leggere']) {
    const r = resolveGuess(word, lexicon, data.words);
    assert.equal(r.kind, 'ok', word);
    assert.equal(data.words[r.id], word, word);
  }
});

test('Superlatives, misspellings and foreign words are not playable', () => {
  for (const [word, base] of [['bellissimo', 'bello'], ['bellissime', 'bello'], ['grandissima', 'grande'], ['ottimo', 'buono'], ['pessima', 'cattivo']]) {
    const r = resolveGuess(word, lexicon, data.words);
    assert.equal(r.kind, 'superlative', word);
    assert.equal(r.base, base, word);
  }
  for (const word of ['massimo', 'minimo', 'ultimo', 'prossimo']) assert.equal(resolveGuess(word, lexicon, data.words).kind, 'ok', word);
  assert.equal(resolveGuess('purtoppo', lexicon, data.words).suggestion, 'purtroppo');
  assert.equal(resolveGuess('estat', lexicon, data.words).suggestion, 'estate');
  assert.equal(resolveGuess('with', lexicon, data.words).kind, 'misspelling');
  assert.equal(resolveGuess('computer', lexicon, data.words).kind, 'ok');
  assert.equal(resolveGuess('due parole', lexicon, data.words).kind, 'invalid');
  assert.equal(resolveGuess('zzzzqq', lexicon, data.words).kind, 'unknown');
});

test('Proper nouns, brands and acronyms are not playable', () => {
  for (const word of ['unicredit', 'bankitalia', 'roma', 'milano', 'facebook', 'salvini', 'iphone']) {
    assert.equal(resolveGuess(word, lexicon, data.words).kind, 'name', word);
  }
  for (const word of ['banca', 'bancario', 'credito', 'computer', 'internet', 'tiramisù', 'euro']) {
    assert.equal(resolveGuess(word, lexicon, data.words).kind, 'ok', word);
  }
  const {ordered} = table(id('banca'));
  const near = [...ordered.slice(0, 50)].map(i => data.words[i]);
  for (const word of ['unicredit', 'bankitalia', 'intesa']) assert.ok(!near.includes(word), word);
});

test('Typing conveniences: elision, missing accents, apostrophe accents', () => {
  assert.equal(data.words[resolveGuess("l'acqua", lexicon, data.words).id], 'acqua');
  assert.equal(data.words[resolveGuess('Dell’Estate', lexicon, data.words).id], 'estate');
  assert.equal(data.words[resolveGuess('citta', lexicon, data.words).id], 'città');
  assert.equal(data.words[resolveGuess("perche'", lexicon, data.words).id], 'perché');
});

test('Packaged vectors and metadata are consistent', () => {
  const bytes = fs.readFileSync(new URL('../dist/data/vectors.bin', import.meta.url));
  assert.equal(data.version, 3);
  assert.equal(bytes.length, data.words.length * data.dimensions);
  assert.equal(new Set(data.words).size, data.words.length);
  assert.ok(data.targets.length >= 365);
  assert.equal(playableIds().size, data.playable);
  for (const t of data.targets) assert.ok(playableIds().has(t), data.words[t]);
  for (const [, c] of lexicon.aliases) assert.ok(!lexicon.aliases.has(c) && !lexicon.superlatives.has(c), 'aliases point to entries');
});

test('Every daily table is a valid ordering of the playable entries', () => {
  const playable = playableIds();
  for (const target of data.targets) {
    const {ordered} = table(target);
    assert.equal(ordered.length, playable.size);
    assert.ok(playable.has(ordered.at(-1)));
  }
});

test('Precomputed tables match live cosine ranks', () => {
  const vectors = new Int8Array(fs.readFileSync(new URL('../dist/data/vectors.bin', import.meta.url)));
  const target = data.targets[0];
  assert.deepEqual(table(target).ranks, rankVocabulary(vectors, data.dimensions, target, playableIds()).ranks);
  assert.throws(() => decodeRankings(new ArrayBuffer(4), 2, 2, 0));
  assert.throws(() => decodeRankings(new Uint32Array([0, 0]).buffer, 2, 2, 0));
  assert.throws(() => decodeRankings(new Uint32Array([1, 0]).buffer, 2, 2, 0));
});

test('Neighbour lists are not cluttered by inflections or superlatives', () => {
  const target = id('gelato');
  const vectors = new Int8Array(fs.readFileSync(new URL('../dist/data/vectors.bin', import.meta.url)));
  const {ordered} = rankVocabulary(vectors, data.dimensions, target, playableIds());
  const top = [...ordered.slice(0, 200)].map(i => data.words[i]);
  for (const word of top) assert.ok(!/issim[oaie]$/.test(word), word);
  assert.ok(!top.includes('gelati'));
});

test('Semantic sanity checks', () => {
  const bytes = fs.readFileSync(new URL('../dist/data/vectors.bin', import.meta.url));
  const vector = w => new Int8Array(bytes.subarray(id(w) * data.dimensions, (id(w) + 1) * data.dimensions));
  const cosine = (a, b) => {const x = vector(a), y = vector(b); let d = 0, nx = 0, ny = 0; for (let j = 0; j < x.length; j++) {d += x[j]*y[j]; nx += x[j]*x[j]; ny += y[j]*y[j];} return d / Math.sqrt(nx * ny);};
  for (const [a, b] of [['santifica', 'santità'], ['santifica', 'castità'], ['santo', 'pio']]) assert.notDeepEqual(vector(a), vector(b));
  for (const [a, related, unrelated] of [['cane', 'gatto', 'tastiera'], ['mare', 'spiaggia', 'martello'], ['santo', 'santità', 'tastiera']]) {
    assert.ok(cosine(a, related) > cosine(a, unrelated), `${a} should be closer to ${related} than ${unrelated}`);
  }
});

test('Hints and saved games', () => {
  const ordered = Uint32Array.from([9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
  assert.equal(hintRank(2, new Set(), ordered), null);
  assert.equal(hintRank(10, new Set(), ordered), 5);
  assert.equal(hintRank(10, new Set([5]), ordered), 4);
  assert.equal(hintRank(100000, new Set(), new Uint32Array(1000)), 300);
  const {ranks} = table(data.targets[0]);
  const saved = canonicalGuesses([{id: id('belle')}, {id: id('bello')}, {id: id('bellissimo')}, {id: id('gatte'), hint: true}], lexicon, ranks);
  assert.deepEqual(saved, [{id: id('bello'), hint: false}, {id: id('gatto'), hint: true}]);
  const text = shareText({day: '2026-10-21', edition: 16, count: 3, hints: 1, gaveUp: false, ranks: [1, 200, 5000], url: 'https://x/'});
  assert.match(text, /Trovata in 3 tentativi e 1 aiuto/);
  assert.match(text, /🟩+ 2/); assert.match(text, /🟥+ 1/);
});

test('Game summary keeps the real number of attempts and the path, never the words', () => {
  const ranks = new Uint32Array([0, 5000, 120, 1, 40]);
  const game = summariseGame({guesses: [{id: 1}, {id: 2}, {id: 4, hint: true}, {id: 3}], hints: 1, gaveUp: false}, ranks);
  assert.deepEqual(game, {a: 3, h: 1, r: 'won', b: 40, p: [[5000, 0], [120, 0], [40, 1], [1, 0]]});
  assert.equal(summariseGame({guesses: [{id: 1}], hints: 0, gaveUp: true}, ranks).r, 'lost');
  assert.equal(summariseGame({guesses: [{id: 1}], hints: 0, gaveUp: false}, ranks).r, 'open');
  assert.ok(Object.entries(game).every(([k, v]) => k === 'r' || typeof v !== 'string'), 'no words are stored');
});

test('Player history: streaks, win rate, distribution and the last four weeks', () => {
  const g = (a, r = 'won') => ({e: 1, a, h: 0, r, b: null, p: null});
  const history = {'2026-10-10': g(8), '2026-10-11': g(30), '2026-10-12': g(12), '2026-10-14': g(40, 'lost'),
    '2026-10-16': g(5), '2026-10-17': g(220), '2026-10-18': g(60), '2026-10-19': g(3, 'open')};
  const s = computeStats(history, '2026-10-19');
  assert.equal(s.played, 7);             // today's open game is not counted yet
  assert.equal(s.won, 6);
  assert.equal(s.winRate, 86);
  assert.equal(s.current, 3);            // 16, 17, 18 October
  assert.equal(s.max, 3);
  assert.equal(s.best, 5);
  assert.equal(s.average, Math.round((8 + 30 + 12 + 5 + 220 + 60) / 6));
  assert.deepEqual(s.distribution, [2, 1, 1, 0, 1, 0, 1]);
  assert.equal(s.recent.length, 28);
  assert.equal(s.recent.at(-1).day, '2026-10-19');
  assert.equal(computeStats({...history, '2026-10-19': g(9)}, '2026-10-19').current, 4);
  assert.equal(computeStats(history, '2026-10-21').current, 0);   // a missed day breaks the streak
  assert.match(statsText(s, 'https://x/'), /7 partite · 86% vinte/);
  assert.match(shareText({day: 'd', edition: 1, count: 2, hints: 0, gaveUp: false, ranks: [1, 40], url: 'u', streak: 4}), /Serie di 4 giorni/);
});

test('Games saved before the history are recovered from the daily saves', () => {
  const day = '2026-10-12', target = targetForDay(day, data.targets);
  const restored = backfillHistory({}, {[day]: {guesses: [{id: id('belle')}, {id: target}], hints: 0},
    '2026-10-13': {guesses: [{id: id('casa')}], hints: 0, gaveUp: true}, 'junk': {guesses: []}}, data.targets, lexicon.aliases);
  assert.equal(restored[day].r, 'won');
  assert.equal(restored[day].a, 2);
  assert.equal(restored[day].e, dayNumber(day) + 1);
  assert.equal(restored['2026-10-13'].r, 'lost');
  assert.equal(Object.keys(restored).length, 2);
  const kept = backfillHistory({[day]: {a: 99}}, {[day]: {guesses: [{id: target}]}}, data.targets, lexicon.aliases);
  assert.equal(kept[day].a, 99);
});
