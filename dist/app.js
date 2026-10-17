import {italianDay,dayNumber,targetForDay,normalise,decodeRankings,rowStyle,nextMidnight} from './engine.js';
const $=id=>document.getElementById(id);
let data,lookup,rankings,day,state,ready=false,storageWorks=true;
const emptyState=$('guesses').innerHTML;
function message(text){$('status').textContent=text;}
function save(){try{localStorage.setItem('contesto-v1-'+day,JSON.stringify(state));}catch{storageWorks=false;}}
function load(){try{const raw=JSON.parse(localStorage.getItem('contesto-v1-'+day));if(raw&&Array.isArray(raw.guesses)){return {guesses:raw.guesses.filter(g=>Number.isInteger(g.id)&&g.id>=0&&g.id<data.words.length).map(g=>({id:g.id,hint:!!g.hint})),hints:Math.max(0,Number(raw.hints)||0)};}}catch{storageWorks=false;}return {guesses:[],hints:0};}
async function startDay(){
  ready=false;
  $('word').disabled=true; $('submit').disabled=true; $('hint').disabled=true;
  message('Caricamento della parola del giorno…');
  const nextDay=italianDay(), target=targetForDay(nextDay,data.targets);
  try {
    const response=await fetch(`./data/ranks/${data.dataset}/${target}.bin`);
    if(!response.ok)throw new Error('Classifica non disponibile');
    const nextRankings=decodeRankings(await response.arrayBuffer(),data.words.length,target);
    day=nextDay; rankings=nextRankings; state=load();
    $('guesses').innerHTML=emptyState; $('last').replaceChildren();
    $('date').textContent=new Intl.DateTimeFormat('it-IT',{dateStyle:'long',timeZone:'Europe/Rome'}).format(new Date(day+'T12:00:00Z'));
    $('edition').textContent='#'+(dayNumber(day)+1);
    ready=true; render();
  } catch(error) {
    message('Non riesco a caricare la parola del giorno. Ricarica la pagina per riprovare.');
    console.error(error);
  }
}
function row(guess){const rank=rankings.ranks[guess.id],style=rowStyle(rank,data.words.length);const el=document.createElement('div');el.className='row';el.style.setProperty('--width',style.width);el.style.setProperty('--colour',style.colour);const fill=document.createElement('span');fill.className='fill';const name=document.createElement('span');name.className='name';name.textContent=data.words[guess.id];const badge=document.createElement('span');badge.className='badge';badge.textContent=guess.hint?'aiuto':rank===1?'trovata':'';const value=document.createElement('span');value.className='rank';value.textContent=new Intl.NumberFormat('it-IT').format(rank);el.append(fill,name,badge,value);return el;}
function render(){const won=state.guesses.some(g=>rankings.ranks[g.id]===1),count=state.guesses.filter(g=>!g.hint).length;$('count').textContent=count;$('last').replaceChildren();if(state.guesses.length){$('last').append(row(state.guesses.at(-1)));$('guesses').replaceChildren(...[...state.guesses].sort((a,b)=>rankings.ranks[a.id]-rankings.ranks[b.id]).map(row));}
$('word').disabled=won||!ready;$('submit').disabled=won||!ready;$('hint').disabled=won||!ready;$('share').hidden=!won;
if(won)message(`Parola trovata! ${count} tentativi${state.hints?` e ${state.hints} aiuti`:''}. A domani.`);
else if(!storageWorks)message('Il browser non consente il salvataggio: tieni aperta questa pagina.');
else message(state.hints?`${state.hints} aiuti usati. Continua a seguire il significato.`:'Più il numero è basso, più sei vicino.');}
function ensureDay(){if(day!==italianDay()){void startDay();return true;}return false;}
$('guess-form').addEventListener('submit',event=>{event.preventDefault();if(!ready)return;if(ensureDay())return;const word=normalise($('word').value);if(!/^[a-zàèéìòóù]+$/u.test(word)){message('Scrivi una sola parola italiana, senza spazi o numeri.');return;}const id=lookup.get(word);if(id===undefined){message('Questa parola non è nel vocabolario. Prova un sinonimo o il singolare.');return;}if(state.guesses.some(g=>g.id===id)){message(`“${word}” è già tra i tuoi tentativi.`);return;}state.guesses.push({id,hint:false});save();$('word').value='';render();$('word').focus();});
$('hint').addEventListener('click',()=>{if(!ready)return;if(ensureDay())return;const best=Math.min(data.words.length,...state.guesses.map(g=>rankings.ranks[g.id]));if(best<=2){message('Sei vicinissimo: prova a trovare la soluzione senza altri aiuti.');return;}const used=new Set(state.guesses.map(g=>g.id));let rank=Math.max(2,Math.floor(best/2));while(rank>1&&used.has(rankings.ordered[rank-1]))rank--;if(rank<=1){message('Hai già tutte le parole più vicine: manca solo la soluzione!');return;}state.guesses.push({id:rankings.ordered[rank-1],hint:true});state.hints++;save();render();});
$('share').addEventListener('click',async()=>{const count=state.guesses.filter(g=>!g.hint).length;const text=`contesto.it · ${day}\nParola trovata in ${count} tentativi${state.hints?` e ${state.hints} aiuti`:''}!\n🟪 🟦 🟩 🟩\n${location.href.split('?')[0]}`;try{await navigator.clipboard.writeText(text);message('Risultato copiato: puoi condividerlo senza svelare la parola.');}catch{message(text);}});
$('help').addEventListener('click',()=>$('instructions').showModal());$('close').addEventListener('click',()=>$('instructions').close());
function tick(){const now=new Date();if(ready)ensureDay();const seconds=Math.max(0,Math.floor((nextMidnight(now)-now.getTime())/1000));$('countdown').textContent=`Prossima parola tra ${String(Math.floor(seconds/3600)).padStart(2,'0')}:${String(Math.floor(seconds/60)%60).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;}
try {
  const meta=await fetch('./data/vocabulary.json');
  if(!meta.ok)throw new Error('Vocabolario non disponibile');
  data=await meta.json();
  if(data.version!==2 || !/^[a-f0-9]{16}$/.test(data.dataset))throw new Error('Versione dati non valida');
  lookup=new Map(data.words.map((w,i)=>[w,i]));
  await startDay(); tick(); setInterval(tick,1000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick();});
} catch(error) {
  message('Non riesco a caricare il vocabolario. Ricarica la pagina per riprovare.');
  console.error(error);
}
