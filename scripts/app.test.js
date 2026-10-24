import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildLexicon, rankVocabulary, targetForDay} from '../dist/engine.js';

const data = JSON.parse(fs.readFileSync(new URL('../dist/data/vocabulary.json', import.meta.url)));
const lexicon = buildLexicon(data);

test('The example in the rules uses real positions and is not a future solution', () => {
  const source = fs.readFileSync(new URL('../dist/app.js', import.meta.url), 'utf8');
  const example = JSON.parse(source.match(/EXAMPLE = (\[\[.*?\]\]);/)[1].replace(/'/g, '"'));
  const target = lexicon.lookup.get('pinguino');
  assert.ok(!data.targets.includes(target));
  const vectors = new Int8Array(fs.readFileSync(new URL('../dist/data/vectors.bin', import.meta.url)));
  const playable = new Set(data.words.map((_, i) => i));
  for (const m of [lexicon.aliases, lexicon.superlatives, lexicon.misspellings, lexicon.names]) for (const k of m.keys()) playable.delete(k);
  const {ranks} = rankVocabulary(vectors, data.dimensions, target, playable);
  for (const [word, rank] of example) assert.equal(ranks[lexicon.lookup.get(word)], rank, word);
});

// Exercise the actual app: first visit, guesses, word forms, hints, giving up and midnight.
test('Playing a day in the browser app', async () => {
  const original = {Date: globalThis.Date, document: globalThis.document, localStorage: globalThis.localStorage, fetch: globalThis.fetch,
    setInterval: globalThis.setInterval, setTimeout: globalThis.setTimeout, matchMedia: globalThis.matchMedia, location: globalThis.location, navigator: globalThis.navigator};
  let now = new original.Date('2026-10-21T10:00:00Z').getTime();
  class Clock extends original.Date {
    constructor(...args) {super(...(args.length ? args : [now]));}
    static now() {return now;}
  }
  const element = () => ({
    innerHTML: '', textContent: '', value: '', disabled: true, hidden: false, open: false, className: '', title: '', type: '',
    listeners: {}, children: [], style: {setProperty() {}},
    addEventListener(name, callback) {this.listeners[name] = callback;},
    append(...nodes) {this.children.push(...nodes);},
    replaceChildren(...nodes) {this.children = nodes;}, focus() {},
    showModal() {this.open = true;}, close() {this.open = false; this.listeners.close?.();},
  });
  const elements = new Map();
  const get = id => {if (!elements.has(id)) elements.set(id, element()); return elements.get(id);};
  const saved = new Map();
  const requests = [];
  let tick;
  const text = el => [el.textContent, ...el.children.map(c => typeof c === 'string' ? c : text(c))].join('');
  const guess = word => {get('word').value = word; get('guess-form').listeners.submit({preventDefault() {}});};
  const words = () => get('guesses').children.map(row => row.children[1].textContent);
  try {
    globalThis.Date = Clock;
    globalThis.document = {getElementById: get, createElement: element, addEventListener() {}, hidden: false};
    globalThis.localStorage = {getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value)};
    globalThis.matchMedia = () => ({matches: false});
    globalThis.location = {href: 'https://example.org/contesto/?x'};
    globalThis.setTimeout = () => 0;
    globalThis.fetch = async path => {
      requests.push(path);
      const bytes = fs.readFileSync(new URL(`../dist/${path.replace(/^\.\//, '').replace(/\?.*$/, '')}`, import.meta.url));
      return {ok: true, json: async () => JSON.parse(bytes), arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)};
    };
    globalThis.setInterval = callback => {tick = callback; return 0;};
    await import(`../dist/app.js?play-test`);

    // The rules are visible before the first attempt: the dialog and the inline guide.
    assert.equal(get('instructions').open, true);
    assert.equal(get('rules-inline').hidden, false);
    assert.equal(get('example-rows').children.length, 6);
    get('start').listeners.click();
    assert.equal(saved.get('contesto-rules-seen'), '1');
    assert.equal(get('word').disabled, false);
    assert.ok(requests.every(path => !path.endsWith('vectors.bin')));
    assert.ok(requests.at(-1).endsWith(`/${targetForDay('2026-10-21', data.targets)}.bin`));

    guess('belle');
    assert.equal(get('count').textContent, 1);
    assert.deepEqual(words(), ['bello']);
    assert.equal(get('rules-inline').hidden, true);
    assert.match(text(get('status')), /“belle” vale come “bello”/);
    guess('bella');
    assert.equal(get('count').textContent, 1);
    assert.match(text(get('status')), /già provato/);
    guess('bellissimo');
    assert.equal(get('count').textContent, 1);
    assert.match(text(get('status')), /superlativi/);
    guess('roma');
    assert.match(text(get('status')), /Nomi propri/);
    guess('qwrtzx');
    assert.match(text(get('status')), /non è nel vocabolario/);
    guess('gatte');
    assert.deepEqual(words().sort(), ['bello', 'gatto']);

    get('hint').listeners.click();
    assert.equal(get('guesses').children.length, 3);
    assert.equal(JSON.parse(saved.get('contesto-v1-2026-10-21')).hints, 1);

    get('give-up').listeners.click();
    assert.equal(get('reveal').hidden, true, 'giving up asks for confirmation');
    get('give-up').listeners.click();
    assert.equal(get('reveal').hidden, false);
    assert.equal(get('reveal').children[1].textContent, data.words[targetForDay('2026-10-21', data.targets)]);
    assert.equal(get('summary').hidden, false);
    const record = JSON.parse(saved.get('contesto-history'))['2026-10-21'];
    assert.equal(record.r, 'lost');
    assert.equal(record.a, 2);       // belle (= bello) and gatte (= gatto); the hint is separate
    assert.equal(record.h, 1);
    assert.equal(record.p.length, 3);
    assert.equal(get('word').disabled, true);

    // A new day starts at Italian midnight with an empty game.
    now = new original.Date('2026-10-21T22:00:01Z').getTime();
    tick();
    await new Promise(setImmediate);
    assert.equal(get('word').disabled, false);
    assert.equal(get('count').textContent, 0);
    assert.equal(get('reveal').hidden, true);
    assert.ok(requests.at(-1).endsWith(`/${targetForDay('2026-10-22', data.targets)}.bin`));
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete globalThis[key];
      else Object.defineProperty(globalThis, key, {value, writable: true, configurable: true});
    }
  }
});
