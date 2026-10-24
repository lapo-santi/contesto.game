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
    names: new Map((data.names || []).map(id => [id, -1])), // roma, unicredit, iphone
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
    id = found.find(x => !lexicon.misspellings.has(x) && !lexicon.superlatives.has(x) && !lexicon.names.has(x)) ?? found[0];
  }
  if (id === undefined) return {kind: 'unknown', word};
  if (lexicon.superlatives.has(id)) {
    const base = lexicon.superlatives.get(id);
    return {kind: 'superlative', word, base: base >= 0 ? words[base] : null};
  }
  if (lexicon.names.has(id)) return {kind: 'name', word};
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

export function shareText({day, edition, count, hints, gaveUp, ranks, url, streak = 0}) {
  const counts = [0, 0, 0];
  for (const r of ranks) counts[r <= 300 ? 0 : r <= 1500 ? 1 : 2]++;
  const bar = (emoji, n, label) => n ? `${emoji.repeat(Math.max(1, Math.round(n / Math.max(...counts, 1) * 8)))} ${n} ${label}` : '';
  const lines = [`contesto.it #${edition} · ${day}`,
    gaveUp ? `Mi sono arreso dopo ${count} ${count === 1 ? 'tentativo' : 'tentativi'}.` : `Trovata in ${count} ${count === 1 ? 'tentativo' : 'tentativi'}${hints ? ` e ${hints} ${hints === 1 ? 'aiuto' : 'aiuti'}` : ''}!`,
    bar('🟩', counts[0], 'caldi'), bar('🟨', counts[1], 'tiepidi'), bar('🟥', counts[2], 'freddi'),
    streak > 1 ? `🔥 Serie di ${streak} giorni` : '', url];
  return lines.filter(Boolean).join('\n');
}

export function statsText(stats, url) {
  return [`contesto.it · le mie statistiche`,
    `${stats.played} ${stats.played === 1 ? 'partita' : 'partite'} · ${stats.winRate}% vinte`,
    `🔥 Serie attuale ${stats.current} · record ${stats.max}`,
    stats.average !== null ? `Media ${stats.average} tentativi · migliore ${stats.best}` : '', url].filter(Boolean).join('\n');
}

export function nextMidnight(now = new Date()) {
  const today = italianDay(now); let low = now.getTime(), high = low + 27*3600000;
  while (high - low > 1000) {const mid = Math.floor((low + high) / 2); if (italianDay(new Date(mid)) === today) low = mid; else high = mid;}
  return high;
}

// ---- Player history ---------------------------------------------------------
// One entry per Italian day: {e: edition, a: attempts, h: hints, r: 'won'|'lost'|'open', p: [[rank, hint], ...]}.
export const HISTORY_KEY = 'contesto-history';
export const PATH_LIMIT = 400;

export function summariseGame(state, ranks) {
  const path = state.guesses.map(g => [ranks[g.id], g.hint ? 1 : 0]);
  const attempts = state.guesses.filter(g => !g.hint).length;
  const won = path.some(([r]) => r === 1);
  const before = path.filter(([r]) => r > 1).map(([r]) => r);
  return {a: attempts, h: state.hints || 0, r: won ? 'won' : state.gaveUp ? 'lost' : 'open',
    b: before.length ? Math.min(...before) : null, p: path.slice(0, PATH_LIMIT)};
}

// Games saved before the history existed: a day counts as won when a guess is the solution.
export function backfillHistory(history, saved, targets, aliases) {
  const out = {...history};
  for (const [d, raw] of Object.entries(saved)) {
    if (out[d] || !raw || !Array.isArray(raw.guesses) || !/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    const target = targetForDay(d, targets);
    const ids = raw.guesses.map(g => aliases.get(g.id) ?? g.id);
    if (!ids.length) continue;
    const won = ids.includes(target);
    out[d] = {e: dayNumber(d) + 1, a: raw.guesses.filter(g => !g.hint).length, h: Number(raw.hints) || 0,
      r: won ? 'won' : raw.gaveUp ? 'lost' : 'open', b: null, p: null};
  }
  return out;
}

const addDays = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
export const BUCKETS = [[1, 10], [11, 20], [21, 35], [36, 50], [51, 100], [101, 200], [201, Infinity]];
export const bucketLabel = ([lo, hi]) => hi === Infinity ? `${lo}+` : `${lo}–${hi}`;

export function computeStats(history, today, days = 28) {
  const entries = Object.entries(history).filter(([d]) => d <= today).sort(([a], [b]) => a < b ? -1 : 1);
  const finished = entries.filter(([d, g]) => g.r !== 'open' || d < today);
  const wins = finished.filter(([, g]) => g.r === 'won');
  // Streak: consecutive days won, ending today (or yesterday while today is still open).
  const wonOn = new Set(wins.map(([d]) => d));
  let current = 0, cursor = wonOn.has(today) ? today : addDays(today, -1);
  while (wonOn.has(cursor)) {current++; cursor = addDays(cursor, -1);}
  let max = 0, run = 0, prev = null;
  for (const [d] of wins) {run = prev && addDays(prev, 1) === d ? run + 1 : 1; max = Math.max(max, run); prev = d;}
  const distribution = BUCKETS.map(([lo, hi]) => wins.filter(([, g]) => g.a >= lo && g.a <= hi).length);
  const recent = [];
  for (let i = days - 1; i >= 0; i--) {const d = addDays(today, -i); recent.push({day: d, game: history[d] || null});}
  const total = wins.reduce((s, [, g]) => s + g.a, 0);
  return {played: finished.length, won: wins.length, lost: finished.length - wins.length,
    winRate: finished.length ? Math.round(100 * wins.length / finished.length) : 0,
    current, max: Math.max(max, current), average: wins.length ? Math.round(total / wins.length) : null,
    best: wins.length ? Math.min(...wins.map(([, g]) => g.a)) : null, distribution, recent};
}
