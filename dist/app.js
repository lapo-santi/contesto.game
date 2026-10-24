import {italianDay,dayNumber,targetForDay,buildLexicon,resolveGuess,canonicalGuesses,decodeRankings,rowStyle,band,hintRank,shareText,statsText,nextMidnight,
  HISTORY_KEY,summariseGame,backfillHistory,computeStats} from './engine.js?v=5';
import {render as renderImage, drawGame, drawStats, fontsReady} from './share.js?v=5';
const $ = id => document.getElementById(id);
const fmt = n => new Intl.NumberFormat('it-IT').format(n);
// Real positions for a word that is not in the calendar (checked by the tests).
export const EXAMPLE = [['delfino',24],['uccello',38],['animale',575],['ghiaccio',950],['mare',3101],['pinza',27024]];
let data, lexicon, rankings, day, state, history = {}, ready = false, storageWorks = true, confirmGiveUp = false;
const images = {game: null, stats: null};

function store(key, value) {try {localStorage.setItem(key, value); return true;} catch {storageWorks = false; return false;}}
function read(key) {try {return localStorage.getItem(key);} catch {storageWorks = false; return null;}}
function save() {
  store('contesto-v1-' + day, JSON.stringify(state));
  if (state.guesses.length) {
    history[day] = {e: dayNumber(day) + 1, ...summariseGame(state, rankings.ranks)};
    store(HISTORY_KEY, JSON.stringify(history));
  }
}
// The history keeps one small record per day, so a returning player can see and share their record.
function loadHistory() {
  try {history = JSON.parse(read(HISTORY_KEY)) || {};} catch {history = {};}
  const saved = {};
  try {
    for (let i = 0; i < (localStorage.length || 0); i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('contesto-v1-')) saved[key.slice(12)] = JSON.parse(localStorage.getItem(key));
    }
  } catch {}
  const before = Object.keys(history).length;
  history = backfillHistory(history, saved, data.targets, lexicon.aliases);
  if (Object.keys(history).length !== before) store(HISTORY_KEY, JSON.stringify(history));
}
const pageUrl = () => location.href.split(/[?#]/)[0];
const shortUrl = () => pageUrl().replace(/^https?:\/\//, '').replace(/\/$/, '');
const dateLabel = d => new Intl.DateTimeFormat('it-IT', {day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Rome'}).format(new Date(d + 'T12:00:00Z'));
const stats = () => computeStats(history, day);
function load() {
  try {
    const raw = JSON.parse(read('contesto-v1-' + day));
    if (raw && Array.isArray(raw.guesses)) {
      const valid = raw.guesses.filter(g => Number.isInteger(g.id) && g.id >= 0 && g.id < data.words.length);
      return {guesses: canonicalGuesses(valid, lexicon, rankings.ranks), hints: Math.max(0, Number(raw.hints) || 0), gaveUp: !!raw.gaveUp};
    }
  } catch {}
  return {guesses: [], hints: 0, gaveUp: false};
}

function message(text, suggestion) {
  const el = $('status');
  el.textContent = text;
  if (suggestion) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'suggest'; b.textContent = suggestion;
    b.addEventListener('click', () => {$('word').value = suggestion; submit();});
    el.append(' ', b);
  }
}

function row(id, {hint = false, size = data.playable, rank = rankings.ranks[id], word = data.words[id], latest = false} = {}) {
  const style = rowStyle(rank, size), el = document.createElement('div');
  el.className = 'row' + (latest ? ' latest' : '') + (rank === 1 ? ' solved' : '');
  el.style.setProperty('--width', style.width); el.style.setProperty('--colour', style.colour);
  const fill = document.createElement('span'); fill.className = 'fill';
  const name = document.createElement('span'); name.className = 'name'; name.textContent = word;
  const badge = document.createElement('span'); badge.className = 'badge';
  badge.textContent = hint ? 'aiuto' : rank === 1 ? 'trovata' : rank <= 300 ? band(rank).label : '';
  const value = document.createElement('span'); value.className = 'rank'; value.textContent = fmt(rank);
  el.append(fill, name, badge, value);
  return el;
}

function finished() {return state.gaveUp || state.guesses.some(g => rankings.ranks[g.id] === 1);}

function render() {
  const won = state.guesses.some(g => rankings.ranks[g.id] === 1), over = won || state.gaveUp;
  const count = state.guesses.filter(g => !g.hint).length, hasGuesses = state.guesses.length > 0;
  $('count').textContent = count;
  $('last').replaceChildren();
  const latest = state.guesses.at(-1);
  if (latest && !over) $('last').append(row(latest.id, {hint: latest.hint, latest: true}));
  $('guesses').replaceChildren(...[...state.guesses]
    .sort((a, b) => rankings.ranks[a.id] - rankings.ranks[b.id])
    .map(g => row(g.id, {hint: g.hint, latest: g === latest && !over})));
  $('list-heading').hidden = !hasGuesses;
  $('rules-inline').hidden = hasGuesses;
  for (const id of ['word', 'submit', 'hint', 'give-up']) $(id).disabled = over || !ready;
  if (over) $('word').value = '';
  $('give-up').hidden = over; $('hint').hidden = over;
  $('summary').hidden = !over;
  if (over) void updateGameImage();
  renderReveal(won, over);
  if (won) message(`Trovata in ${count} ${count === 1 ? 'tentativo' : 'tentativi'}${state.hints ? ` e ${state.hints} ${state.hints === 1 ? 'aiuto' : 'aiuti'}` : ''}. Torna domani per una nuova parola.`);
  else if (state.gaveUp) message('Ti sei arreso: ecco la parola di oggi. Torna domani per una nuova sfida.');
  else if (!storageWorks) message('Il browser non consente il salvataggio: tieni aperta questa pagina.');
  else if (!hasGuesses) message('Scrivi la prima parola che ti viene in mente.');
}

function renderReveal(won, over) {
  const box = $('reveal');
  box.hidden = !over;
  if (!over) {box.replaceChildren(); return;}
  const target = rankings.ordered[0];
  const title = document.createElement('div'); title.className = 'reveal-title';
  title.textContent = won ? 'La parola di oggi' : 'La parola era';
  const word = document.createElement('div'); word.className = 'reveal-word'; word.textContent = data.words[target];
  const sub = document.createElement('div'); sub.className = 'reveal-sub'; sub.textContent = 'Le parole più vicine:';
  const near = document.createElement('div'); near.className = 'reveal-near';
  for (let r = 2; r <= 11 && r <= rankings.ordered.length; r++) {
    const chip = document.createElement('span');
    chip.textContent = data.words[rankings.ordered[r - 1]];
    chip.title = 'Posizione ' + r;
    near.append(chip);
  }
  box.replaceChildren(title, word, sub, near);
}

async function startDay() {
  ready = false;
  for (const id of ['word', 'submit', 'hint', 'give-up']) $(id).disabled = true;
  message('Caricamento della parola del giorno…');
  const nextDay = italianDay(), target = targetForDay(nextDay, data.targets);
  try {
    const response = await fetch(`./data/ranks/${data.dataset}/${target}.bin`);
    if (!response.ok) throw new Error('Classifica non disponibile');
    rankings = decodeRankings(await response.arrayBuffer(), data.words.length, data.playable, target);
    day = nextDay; state = load(); confirmGiveUp = false;
    $('date').textContent = new Intl.DateTimeFormat('it-IT', {dateStyle: 'long', timeZone: 'Europe/Rome'}).format(new Date(day + 'T12:00:00Z'));
    $('edition').textContent = '#' + (dayNumber(day) + 1);
    ready = true; render();
    if (!finished() && matchMedia('(hover: hover)').matches && !$('instructions').open) $('word').focus();
  } catch (error) {
    message('Non riesco a caricare la parola del giorno. Ricarica la pagina per riprovare.');
    console.error(error);
  }
}
function ensureDay() {if (day !== italianDay()) {void startDay(); return true;} return false;}

function submit() {
  if (!ready || finished() || ensureDay()) return;
  const raw = $('word').value;
  if (!raw.trim()) return;
  const result = resolveGuess(raw, lexicon, data.words);
  if (result.kind === 'invalid') return message('Scrivi una sola parola, senza spazi, numeri o simboli.');
  if (result.kind === 'unknown') return message(`“${result.word}” non è nel vocabolario. Prova un sinonimo o una forma più comune.`);
  if (result.kind === 'name') return message(`Nomi propri, marchi e sigle non sono nel gioco: prova una parola comune.`);
  if (result.kind === 'superlative') return message('I superlativi non valgono. Prova:', result.base);
  if (result.kind === 'misspelling') return result.suggestion
    ? message(`“${result.word}” non è nel gioco. Forse intendevi:`, result.suggestion)
    : message(`“${result.word}” non sembra una parola italiana.`);
  const word = data.words[result.id];
  $('word').value = '';
  const existing = state.guesses.find(g => g.id === result.id);
  if (existing) {
    render();
    return message(result.form ? `“${result.form}” vale come “${word}”, che hai già provato (${fmt(rankings.ranks[result.id])}).` : `“${word}” è già tra i tuoi tentativi (${fmt(rankings.ranks[result.id])}).`);
  }
  state.guesses.push({id: result.id, hint: false}); save(); render();
  if (!finished()) {
    const rank = rankings.ranks[result.id];
    const note = result.form ? `“${result.form}” vale come “${word}”. ` : '';
    message(note + (rank <= 50 ? 'Bollente!' : rank <= 300 ? 'Fa caldo qui.' : rank <= 1500 ? 'Tiepido.' : 'Freddo: prova un altro campo di significato.'));
  }
  $('word').focus();
}

$('guess-form').addEventListener('submit', event => {event.preventDefault(); submit();});
$('hint').addEventListener('click', () => {
  if (!ready || finished() || ensureDay()) return;
  const best = Math.min(data.playable, ...state.guesses.map(g => rankings.ranks[g.id]));
  const rank = hintRank(best, new Set(state.guesses.map(g => g.id)), rankings.ordered);
  if (rank === null) return message('Sei vicinissimo: manca solo la soluzione!');
  const id = rankings.ordered[rank - 1];
  state.guesses.push({id, hint: true}); state.hints++; save(); render();
  message(`Aiuto: “${data.words[id]}” è in posizione ${fmt(rank)}.`);
});
$('give-up').addEventListener('click', () => {
  if (!ready || finished() || ensureDay()) return;
  if (!confirmGiveUp) {
    confirmGiveUp = true; $('give-up').textContent = 'Sicuro? Mostra la parola';
    setTimeout(() => {confirmGiveUp = false; $('give-up').textContent = 'Mi arrendo';}, 4000);
    return;
  }
  state.gaveUp = true; save(); render();
});
function gameText() {
  const counted = state.guesses.filter(g => !g.hint);
  return shareText({day, edition: dayNumber(day) + 1, count: counted.length, hints: state.hints, gaveUp: state.gaveUp,
    ranks: counted.map(g => rankings.ranks[g.id]), url: pageUrl(), streak: stats().current});
}
async function updateGameImage() {
  try {
    await fontsReady();
    const game = summariseGame(state, rankings.ranks), s = stats();
    images.game = renderImage(drawGame, {edition: dayNumber(day) + 1, dateLabel: dateLabel(day), attempts: game.a, hints: game.h, result: game.r,
      path: game.p, best: game.b, size: data.playable, streak: s.current, played: s.played, url: shortUrl()});
    $('summary-image').src = images.game.toDataURL('image/png');
    $('summary-image').alt = `Riepilogo: ${game.r === 'won' ? 'parola trovata' : 'resa'} in ${game.a} tentativi${game.h ? ` e ${game.h} aiuti` : ''}; un grafico mostra quanto ogni tentativo era vicino alla soluzione.`;
  } catch (error) {images.game = null; $('summary-image').hidden = true; console.warn(error);}
}
async function updateStatsImage() {
  const s = stats();
  $('stats-empty').hidden = s.played > 0 || !!history[day];
  try {
    await fontsReady();
    images.stats = renderImage(drawStats, {stats: s, today: day, todayAttempts: history[day]?.r === 'won' ? history[day].a : null, dateLabel: dateLabel(day), url: shortUrl()});
    $('stats-image').src = images.stats.toDataURL('image/png');
    $('stats-image').alt = `${s.played} partite, ${s.winRate}% vinte, serie attuale ${s.current}, record ${s.max}` + (s.average !== null ? `, media ${s.average} tentativi.` : '.');
  } catch (error) {images.stats = null; $('stats-image').hidden = true; console.warn(error);}
}

// Share the image where the device supports it; otherwise download it and copy the text.
async function share(canvas, filename, text, done) {
  try {
    const blob = canvas && await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const file = blob && new File([blob], filename, {type: 'image/png'});
    if (file && navigator.canShare?.({files: [file]})) {await navigator.share({files: [file], text}); return;}
    if (blob) {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob); link.download = filename; link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 5000);
    }
    await navigator.clipboard.writeText(text);
    done(blob ? 'Immagine scaricata e testo copiato: incollali dove vuoi.' : 'Testo copiato: puoi condividerlo senza svelare la parola.');
  } catch (error) {if (error?.name !== 'AbortError') done(text);}
}
async function copy(text, done) {
  try {await navigator.clipboard.writeText(text); done('Testo copiato.');} catch {done(text);}
}
const statsNote = text => {$('stats-empty').hidden = false; $('stats-empty').textContent = text;};
$('share').addEventListener('click', () => share(images.game, `contesto-${day}.png`, gameText(), message));
$('copy-game').addEventListener('click', () => copy(gameText(), message));
$('share-stats').addEventListener('click', () => share(images.stats, `contesto-statistiche-${day}.png`, statsText(stats(), pageUrl()), statsNote));
$('copy-stats').addEventListener('click', () => copy(statsText(stats(), pageUrl()), statsNote));
async function openStats() {
  if (!data) return;
  $('stats-empty').textContent = 'Non hai ancora completato nessuna partita su questo browser. Trova la parola di oggi e torna qui: la tua serie comincia adesso.';
  if (!$('stats').open) $('stats').showModal();
  await updateStatsImage();
}
$('stats-open').addEventListener('click', openStats);
$('stats-from-game').addEventListener('click', openStats);
$('stats-close').addEventListener('click', () => $('stats').close());
$('stats').addEventListener('click', event => {if (event.target === $('stats')) $('stats').close();});

function openRules() {if (!$('instructions').open) $('instructions').showModal();}
function closeRules() {$('instructions').close();}
$('help').addEventListener('click', openRules);
$('close').addEventListener('click', closeRules);
$('start').addEventListener('click', closeRules);
$('instructions').addEventListener('close', () => {store('contesto-rules-seen', '1'); if (ready && !finished()) $('word').focus();});
$('instructions').addEventListener('click', event => {if (event.target === $('instructions')) closeRules();});

function renderExamples() {
  const rows = EXAMPLE.map(([word, rank]) => row(null, {rank, word, size: 100000}));
  $('example-rows').replaceChildren(...rows);
  $('dialog-rows').replaceChildren(...EXAMPLE.slice(1, 5).map(([word, rank]) => row(null, {rank, word, size: 100000})));
}

function tick() {
  const now = new Date(); if (ready) ensureDay();
  const seconds = Math.max(0, Math.floor((nextMidnight(now) - now.getTime()) / 1000));
  $('countdown').textContent = `Prossima parola tra ${String(Math.floor(seconds/3600)).padStart(2,'0')}:${String(Math.floor(seconds/60)%60).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
}

renderExamples();
// First visit: show the rules before the first attempt.
if (!read('contesto-rules-seen') && typeof $('instructions').showModal === 'function') openRules();
try {
  const meta = await fetch('./data/vocabulary.json?v=5');
  if (!meta.ok) throw new Error('Vocabolario non disponibile');
  data = await meta.json();
  if (data.version !== 3 || !/^[a-f0-9]{16}$/.test(data.dataset)) throw new Error('Versione dati non valida');
  lexicon = buildLexicon(data);
  loadHistory();
  await startDay(); tick(); setInterval(tick, 1000);
  document.addEventListener('visibilitychange', () => {if (!document.hidden) tick();});
} catch (error) {
  message('Non riesco a caricare il vocabolario. Ricarica la pagina per riprovare.');
  console.error(error);
}
