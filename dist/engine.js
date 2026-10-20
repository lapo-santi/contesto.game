// Calendar days are measured in Europe/Rome, including daylight saving time.
export function italianDay(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const field = name => parts.find(p => p.type === name).value;
  return `${field('year')}-${field('month')}-${field('day')}`;
}
export function dayNumber(day) {return Math.floor((Date.parse(day+'T00:00:00Z')-Date.parse('2026-10-06T00:00:00Z'))/86400000);}
export function targetForDay(day, targets) {const n=dayNumber(day); return targets[((n % targets.length)+targets.length)%targets.length];}
export function normalise(word) {
  return word.trim().toLocaleLowerCase('it').normalize('NFC')
    .replace(/[’`´]/g, "'")
    .replace(/([aeiou])'$/u, '$1'); // perche' -> perche, then matched as perché
}

// Cosine similarity on quantised vectors. Only playable entries are ranked;
// equal scores are ordered by vocabulary index. The solution is always 1.
export function rankVocabulary(vectors, dimensions, target, playable) {
  const size = vectors.length / dimensions, base = target * dimensions;
  const ids = playable ? [...playable] : Array.from({length:size}, (_, i) => i);
  const scores = new Map();
  for (const i of ids) {
    let dot = 0, norm = 0;
    for (let j = 0; j < dimensions; j++) {const v = vectors[i*dimensions+j]; dot += v*vectors[base+j]; norm += v*v;}
    scores.set(i, norm ? dot/Math.sqrt(norm) : -Infinity);
  }
  ids.sort((a, b) => a === target ? -1 : b === target ? 1 : scores.get(b) - scores.get(a) || a - b);
  const ranks = new Uint32Array(size); ids.forEach((id, i) => ranks[id] = i + 1);
  return {ranks, ordered: Uint32Array.from(ids)};
}

// A daily table lists playable word IDs from closest to farthest (uint32, little-endian).
export function decodeRankings(buffer, size, playable, target) {
  if (buffer.byteLength !== playable * 4) throw new Error('Dati incompleti');
  const view = new DataView(buffer), ranks = new Uint32Array(size), ordered = new Uint32Array(playable);
  for (let rank = 1; rank <= playable; rank++) {
    const id = view.getUint32((rank - 1) * 4, true);
    if (id >= size || ranks[id]) throw new Error('Classifica non valida');
    ranks[id] = rank; ordered[rank - 1] = id;
  }
  if (ranks[target] !== 1) throw new Error('Soluzione non valida');
  return {ranks, ordered};
}

const pairs = flat => {const map = new Map(); for (let i = 0; i < (flat?.length || 0); i += 2) map.set(flat[i], flat[i+1]); return map;};
export function buildLexicon(data) {
  return {
    lookup: new Map(data.words.map((w, i) => [w, i])),
    aliases: pairs(data.aliases),          // bella -> bello, gatte -> gatto
    superlatives: pairs(data.superlatives), // bellissimo -> bello
    misspellings: pairs(data.misspellings), // purtoppo -> purtroppo, with -> -1
  };
}

// Map a typed word to a playable entry, or explain why it cannot be played.
export function resolveGuess(raw, lexicon, words) {
  let word = normalise(raw);
  // Elided articles and prepositions: l'acqua, dell'estate, un'amica.
  word = word.replace(/^(l|un|dell|nell|sull|all|dall|quell|bell|sant)'(?=[a-zàèéìòóù])/u, '');
  if (!/^[a-zàèéìòóù]+$/u.test(word)) return {kind: 'invalid', word};
  let id = lexicon.lookup.get(word);
  if (id === undefined) {
    // A missing final accent: perche -> perché, citta -> città.
    const accents = {a:['à'], e:['è','é'], i:['ì'], o:['ò'], u:['ù']}[word.at(-1)] || [];
    const found = accents.map(a => lexicon.lookup.get(word.slice(0, -1) + a)).filter(x => x !== undefined);
    id = found.find(x => !lexicon.misspellings.has(x) && !lexicon.superlatives.has(x)) ?? found[0];
  }
  if (id === undefined) return {kind: 'unknown', word};
  if (lexicon.superlatives.has(id)) {
    const base = lexicon.superlatives.get(id);
    return {kind: 'superlative', word, base: base >= 0 ? words[base] : null};
  }
  if (lexicon.misspellings.has(id)) {
    const s = lexicon.misspellings.get(id);
    return {kind: 'misspelling', word, suggestion: s >= 0 ? words[lexicon.aliases.get(s) ?? s] : null};
  }
  const canonical = lexicon.aliases.get(id) ?? id;
  return {kind: 'ok', id: canonical, word, form: canonical === id && words[id] === word ? null : word};
}

// Saved guesses from older editions may name a form that is now an alias.
export function canonicalGuesses(guesses, lexicon, ranks) {
  const seen = new Set(), out = [];
  for (const g of guesses) {
    const id = lexicon.aliases.get(g.id) ?? g.id;
    if (!ranks[id] || seen.has(id)) continue;
    seen.add(id); out.push({id, hint: !!g.hint});
  }
  return out;
}

export const BANDS = [
  {max: 50, label: 'bollente', emoji: '🟩'},
  {max: 300, label: 'caldo', emoji: '🟩'},
  {max: 1500, label: 'tiepido', emoji: '🟨'},
  {max: Infinity, label: 'freddo', emoji: '🟥'},
];
export const band = rank => BANDS.find(b => rank <= b.max);

export function rowStyle(rank, size) {
  const heat = Math.max(0, 1 - Math.log(rank) / Math.log(size));
  // Follow the legend from violet through blue and turquoise to lime.
  const hue = 265 - heat * 170;
  return {
    colour: `linear-gradient(100deg,hsl(${hue} 90% ${84-heat*8}%),hsl(${hue} 90% ${74-heat*8}%))`,
    width: `${Math.max(8, heat * 100)}%`,
  };
}

// The next hint: halfway to the best guess, never further than 300.
export function hintRank(best, used, ordered) {
  if (best <= 2) return null;
  let rank = Math.max(2, Math.min(300, Math.floor(best / 2)));
  while (rank > 1 && used.has(ordered[rank - 1])) rank--;
  return rank > 1 ? rank : null;
}

export function shareText({day, edition, count, hints, gaveUp, ranks, url}) {
  const counts = [0, 0, 0];
  for (const r of ranks) counts[r <= 300 ? 0 : r <= 1500 ? 1 : 2]++;
  const bar = (emoji, n) => n ? `${emoji.repeat(Math.max(1, Math.round(n / Math.max(...counts, 1) * 8)))} ${n}` : '';
  const lines = [`contesto.it #${edition} · ${day}`,
    gaveUp ? `Mi sono arreso dopo ${count} tentativi.` : `Trovata in ${count} tentativi${hints ? ` e ${hints} ${hints === 1 ? 'aiuto' : 'aiuti'}` : ''}!`,
    bar('🟩', counts[0]), bar('🟨', counts[1]), bar('🟥', counts[2]), url];
  return lines.filter(Boolean).join('\n');
}

export function nextMidnight(now = new Date()) {
  const today = italianDay(now); let low = now.getTime(), high = low + 27*3600000;
  while (high - low > 1000) {const mid = Math.floor((low + high) / 2); if (italianDay(new Date(mid)) === today) low = mid; else high = mid;}
  return high;
}
