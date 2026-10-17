// Calendar days are measured in Europe/Rome, including daylight saving time.
export function italianDay(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const field = name => parts.find(p => p.type === name).value;
  return `${field('year')}-${field('month')}-${field('day')}`;
}
export function dayNumber(day) {return Math.floor((Date.parse(day+'T00:00:00Z')-Date.parse('2026-10-06T00:00:00Z'))/86400000);}
export function targetForDay(day, targets) {const n=dayNumber(day); return targets[((n % targets.length)+targets.length)%targets.length];}
export function normalise(word) {return word.trim().toLocaleLowerCase('it').normalize('NFC');}
// Cosine similarity is calculated on quantised word vectors. Equal scores are
// ordered by vocabulary index to produce stable ranks. The solution is always 1.
export function rankVocabulary(vectors, dimensions, target) {
  const size=vectors.length/dimensions, scores=new Float64Array(size), base=target*dimensions;
  for(let i=0;i<size;i++) {
    let dot=0,norm=0;
    for(let j=0;j<dimensions;j++){const v=vectors[i*dimensions+j];dot+=v*vectors[base+j];norm+=v*v;}
    scores[i]=norm ? dot/Math.sqrt(norm) : -Infinity;
  }
  const ordered=Array.from({length:size},(_,i)=>i);
  ordered.sort((a,b)=> a===target ? -1 : b===target ? 1 : scores[b]-scores[a] || a-b);
  const ranks=new Uint32Array(size);ordered.forEach((id,i)=>ranks[id]=i+1);
  return {ranks,ordered};
}
export function rowStyle(rank,size) {
  const heat=Math.max(0,1-Math.log(rank)/Math.log(size));
  // Follow the legend from violet through blue and turquoise to lime.
  // Pale, saturated fills keep the dark word and rank readable.
  const hue=265-heat*170;
  return {
    colour:`linear-gradient(100deg,hsl(${hue} 90% ${84-heat*8}%),hsl(${hue} 90% ${74-heat*8}%))`,
    width:`${Math.max(8,heat*100)}%`
  };
}
export function nextMidnight(now=new Date()) {
  const today=italianDay(now);let low=now.getTime(),high=low+27*3600000;
  while(high-low>1000){const mid=Math.floor((low+high)/2);if(italianDay(new Date(mid))===today) low=mid;else high=mid;}
  return high;
}

// Decode an explicitly little-endian rank table, validating before enabling play.
export function decodeRankings(buffer, size, target) {
  if (buffer.byteLength !== size * 4) throw new Error('Dati incompleti');
  const view = new DataView(buffer), ranks = new Uint32Array(size);
  const ordered = new Uint32Array(size), seen = new Uint8Array(size);
  for (let id = 0; id < size; id++) {
    const rank = view.getUint32(id * 4, true);
    if (rank < 1 || rank > size || seen[rank - 1]) throw new Error('Classifica non valida');
    ranks[id] = rank; ordered[rank - 1] = id; seen[rank - 1] = 1;
  }
  if (ranks[target] !== 1) throw new Error('Soluzione non valida');
  return {ranks, ordered};
}
