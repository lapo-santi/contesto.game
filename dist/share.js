// Shareable images (1080×1350, 4:5) drawn on a canvas. They never show the solution.
import {BUCKETS, bucketLabel} from './engine.js?v=5';

export const W = 1080, H = 1350;
const C = {bg: '#f6f7f2', ink: '#263e35', soft: '#65785f', mute: '#8b9789', line: '#dde4d9', panel: '#ffffff', brand: '#6546db',
  hot: '#59c35a', warm: '#e8b931', cold: '#a7a0e6', lost: '#e07a6a', empty: '#e7ebe3'};
const SANS = '"DM Sans", system-ui, sans-serif', HEAD = 'Manrope, "DM Sans", system-ui, sans-serif';
const fmt = n => new Intl.NumberFormat('it-IT').format(n);

export async function fontsReady() {
  try {await Promise.all(['800 60px Manrope', '700 30px "DM Sans"', '500 30px "DM Sans"'].map(f => document.fonts.load(f)));} catch {}
}

function rounded(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function text(ctx, s, x, y, {font = `500 30px ${SANS}`, color = C.ink, align = 'left', base = 'alphabetic'} = {}) {
  ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = base; ctx.fillText(s, x, y);
  return ctx.measureText(s).width;
}
function spaced(ctx, s, x, y, opts) {return text(ctx, s.toUpperCase().split('').join(' '), x, y, {font: `700 22px ${SANS}`, color: C.mute, ...opts});}

function frame(ctx, subtitle, right) {
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  const w = text(ctx, 'contesto', 80, 132, {font: `800 60px ${HEAD}`});
  text(ctx, '.it', 80 + w, 132, {font: `800 60px ${HEAD}`, color: C.brand});
  text(ctx, right, W - 80, 132, {font: `600 30px ${SANS}`, color: C.soft, align: 'right'});
  spaced(ctx, subtitle, 80, 196);
  ctx.fillStyle = C.line; ctx.fillRect(80, 222, W - 160, 2);
}
function footer(ctx, left, url) {
  ctx.fillStyle = C.line; ctx.fillRect(80, H - 120, W - 160, 2);
  text(ctx, left, 80, H - 66, {font: `600 30px ${SANS}`, color: C.soft});
  text(ctx, url, W - 80, H - 66, {font: `600 28px ${SANS}`, color: C.mute, align: 'right'});
}
const heatOf = (rank, size) => Math.max(0, 1 - Math.log(rank) / Math.log(size));
const hue = heat => 265 - heat * 170;

// One bar per attempt, in the order played: the height shows how close it was.
export function drawGame(ctx, {edition, dateLabel, attempts, hints, result, path, best, size, streak, played, url}) {
  frame(ctx, result === 'won' ? 'Parola trovata' : result === 'lost' ? 'Mi sono arreso' : 'Partita in corso', `#${edition} · ${dateLabel}`);
  const big = text(ctx, fmt(attempts), 80, 470, {font: `800 230px ${HEAD}`});
  text(ctx, attempts === 1 ? 'tentativo' : 'tentativi', 80 + big + 26, 380, {font: `700 54px ${HEAD}`});
  text(ctx, hints ? `+ ${hints} ${hints === 1 ? 'aiuto' : 'aiuti'}` : 'senza aiuti', 80 + big + 28, 448, {font: `500 36px ${SANS}`, color: C.soft});

  // Path chart.
  const x0 = 80, x1 = W - 80, top = 590, bottom = 940, h = bottom - top;
  spaced(ctx, 'Il percorso', x0, 560);
  text(ctx, 'vicino', x1, 560, {font: `600 22px ${SANS}`, color: C.mute, align: 'right'});
  rounded(ctx, x0, top - 10, x1 - x0, h + 20, 18); ctx.fillStyle = C.panel; ctx.fill();
  const n = path.length, inner = x1 - x0 - 40, step = inner / Math.max(n, 1);
  const gap = step > 14 ? Math.min(10, step * 0.22) : step > 5 ? 1 : 0, bw = Math.max(1, Math.min(70, step - gap));
  const offset = x0 + 20 + (inner - (step * n)) / 2;
  path.forEach(([rank, hint], i) => {
    const heat = rank === 1 ? 1 : heatOf(rank, size), bh = Math.max(6, heat * (h - 30));
    const x = offset + i * step + (step - bw) / 2, y = bottom - bh;
    ctx.fillStyle = rank === 1 ? C.hot : `hsl(${hue(heat)} 85% ${70 - heat * 10}%)`;
    ctx.globalAlpha = hint ? 0.45 : 1;
    rounded(ctx, x, y, bw, bh, Math.min(8, bw / 2, bh / 2)); ctx.fill();
    ctx.globalAlpha = 1;
    if (rank === 1 && bw >= 3) text(ctx, '★', x + bw / 2, y - 10, {font: `700 ${Math.max(22, Math.min(44, bw))}px ${SANS}`, color: C.hot, align: 'center'});
  });
  text(ctx, '1° tentativo', x0 + 20, bottom + 50, {font: `600 24px ${SANS}`, color: C.mute});
  if (attempts > 1) text(ctx, `${attempts}°`, x1 - 20, bottom + 50, {font: `600 24px ${SANS}`, color: C.mute, align: 'right'});
  if (hints) text(ctx, 'barre chiare = aiuti', W / 2, bottom + 50, {font: `500 24px ${SANS}`, color: C.mute, align: 'center'});

  // How the attempts were spread.
  const counts = [0, 0, 0];
  for (const [r, hint] of path) if (!hint && r > 1) counts[r <= 300 ? 0 : r <= 1500 ? 1 : 2]++;
  const chips = [[C.hot, counts[0], 'caldi', 'sotto 300'], [C.warm, counts[1], 'tiepidi', '300–1.500'], [C.cold, counts[2], 'freddi', 'oltre 1.500']];
  const cw = (W - 160 - 40) / 3;
  chips.forEach(([color, count, label, range], i) => {
    const x = 80 + i * (cw + 20), y = 1040;
    rounded(ctx, x, y, cw, 110, 18); ctx.fillStyle = C.panel; ctx.fill();
    ctx.fillStyle = color; rounded(ctx, x + 24, y + 30, 22, 22, 6); ctx.fill();
    text(ctx, fmt(count), x + 62, y + 54, {font: `800 40px ${HEAD}`});
    text(ctx, label, x + 24, y + 92, {font: `600 24px ${SANS}`, color: C.soft});
    text(ctx, range, x + cw - 22, y + 92, {font: `500 20px ${SANS}`, color: C.mute, align: 'right'});
  });
  if (best) text(ctx, `Più vicina prima della soluzione: posizione ${fmt(best)}`, 80, 1196, {font: `500 28px ${SANS}`, color: C.soft});
  footer(ctx, streak > 1 ? `Serie di ${streak} giorni · ${played} partite` : `${played} ${played === 1 ? 'partita giocata' : 'partite giocate'}`, url);
}

// The player's record: totals, streaks, attempts distribution and the last four weeks.
export function drawStats(ctx, {stats, today, todayAttempts, dateLabel, url}) {
  frame(ctx, 'Le mie statistiche', dateLabel);
  const tiles = [[fmt(stats.played), 'partite'], [`${stats.winRate}%`, 'vinte'], [fmt(stats.current), 'serie attuale'], [fmt(stats.max), 'serie record']];
  const tw = (W - 160 - 3 * 20) / 4;
  tiles.forEach(([value, label], i) => {
    const x = 80 + i * (tw + 20);
    rounded(ctx, x, 256, tw, 160, 20); ctx.fillStyle = C.panel; ctx.fill();
    text(ctx, value, x + tw / 2, 344, {font: `800 64px ${HEAD}`, align: 'center'});
    text(ctx, label, x + tw / 2, 392, {font: `600 24px ${SANS}`, color: C.soft, align: 'center'});
  });
  text(ctx, stats.average !== null ? `Media ${fmt(stats.average)} tentativi · migliore ${fmt(stats.best)}` : 'Nessuna parola trovata finora', 80, 466, {font: `600 30px ${SANS}`, color: C.soft});

  // Distribution of attempts for won games.
  spaced(ctx, 'Tentativi per parola trovata', 80, 528);
  const maxCount = Math.max(1, ...stats.distribution), labelW = 120, barX = 80 + labelW, barMax = W - 80 - barX - 70;
  BUCKETS.forEach((b, i) => {
    const y = 546 + i * 46, count = stats.distribution[i];
    const current = todayAttempts && todayAttempts >= b[0] && todayAttempts <= b[1];
    text(ctx, bucketLabel(b), 80, y + 30, {font: `600 24px ${SANS}`, color: C.soft});
    const w = Math.max(count ? 40 : 6, count / maxCount * barMax);
    rounded(ctx, barX, y + 4, w, 36, 10); ctx.fillStyle = current ? C.brand : count ? C.hot : C.empty; ctx.fill();
    if (count) text(ctx, fmt(count), barX + w + 14, y + 31, {font: `700 26px ${SANS}`});
  });

  // Last 28 days, one square per day with the number of attempts.
  spaced(ctx, 'Ultime 4 settimane', 80, 906);
  const cols = 7, gap = 14, size = (W - 160 - (cols - 1) * gap) / cols, sh = 52;
  stats.recent.forEach(({day, game}, i) => {
    const x = 80 + (i % cols) * (size + gap), y = 924 + Math.floor(i / cols) * (sh + 10);
    const colour = !game ? C.empty : game.r === 'won' ? C.hot : game.r === 'lost' ? C.lost : C.warm;
    rounded(ctx, x, y, size, sh, 12); ctx.fillStyle = colour; ctx.fill();
    if (day === today) {ctx.strokeStyle = C.ink; ctx.lineWidth = 3; rounded(ctx, x + 1.5, y + 1.5, size - 3, sh - 3, 11); ctx.stroke();}
    const label = game ? fmt(game.a) : String(Number(day.slice(8)));
    text(ctx, label, x + size / 2, y + 35, {font: `${game ? 800 : 600} 24px ${game ? HEAD : SANS}`, color: game ? '#ffffff' : C.mute, align: 'center'});
  });
  const legend = [[C.hot, 'trovata'], [C.lost, 'arreso'], [C.warm, 'non finita'], [C.empty, 'non giocata']];
  let lx = 80;
  for (const [colour, label] of legend) {
    rounded(ctx, lx, H - 158, 22, 22, 6); ctx.fillStyle = colour; ctx.fill();
    lx += 32 + text(ctx, label, lx + 32, H - 139, {font: `500 22px ${SANS}`, color: C.mute}) + 28;
  }
  footer(ctx, 'Gioca anche tu: una parola al giorno', url);
}

export function render(draw, payload) {
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  draw(canvas.getContext('2d'), payload);
  return canvas;
}
