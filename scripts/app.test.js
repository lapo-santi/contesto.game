import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Exercise the actual app across midnight, including saved guesses and asset selection.
test('An open game keeps its ranks until midnight, then loads the complete model',async()=>{
 const data=JSON.parse(fs.readFileSync(new URL('../dist/data/vocabulary.json',import.meta.url)));
 const original={Date:globalThis.Date,document:globalThis.document,localStorage:globalThis.localStorage,fetch:globalThis.fetch,setInterval:globalThis.setInterval};
 const changeDay=data.rankingChange.effectiveFrom;
 const previousDate=new original.Date(`${changeDay}T12:00:00Z`);
 previousDate.setUTCDate(previousDate.getUTCDate()-1);
 const previousDay=previousDate.toISOString().slice(0,10);
 let now=previousDate.getTime();
 class Clock extends original.Date {
  constructor(...args){super(...(args.length?args:[now]));}
  static now(){return now;}
 }
 const element=()=>({
  innerHTML:'',textContent:'',value:'',disabled:true,hidden:false,
  listeners:{},children:[],style:{setProperty(){}},
  addEventListener(name,callback){this.listeners[name]=callback;},
  append(...nodes){this.children.push(...nodes);},
  replaceChildren(...nodes){this.children=nodes;},focus(){}
 });
 const elements=new Map();
 const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};
 const saved=new Map([[`contesto-v1-${previousDay}`,JSON.stringify({guesses:[{id:data.words.indexOf('santo'),hint:false}],hints:0})]]);
 // Today's existing guesses must survive the immediate scoring update too.
 saved.set(`contesto-v1-${changeDay}`,JSON.stringify({guesses:[{id:data.words.indexOf('santo'),hint:false}],hints:0}));
 const requests=[];
 let tick;
 try {
  globalThis.Date=Clock;
  globalThis.document={getElementById:get,createElement:element,addEventListener(){},hidden:false};
  globalThis.localStorage={getItem:key=>saved.get(key)??null,setItem:(key,value)=>saved.set(key,value)};
  globalThis.fetch=async path=>{
   requests.push(path);
   const bytes=fs.readFileSync(new URL(`../dist/${path.replace(/^\.\//,'')}`,import.meta.url));
   return {ok:true,json:async()=>JSON.parse(bytes),arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};
  };
  globalThis.setInterval=callback=>{tick=callback;return 0;};
  await import(`../dist/app.js?midnight-test`);
  assert.equal(get('word').disabled,false);
  assert.equal(get('count').textContent,1);
  assert.ok(requests.at(-1).includes(`/ranks/${data.rankingChange.previousDataset}/`));
  assert.ok(requests.every(path=>!path.endsWith('vectors.bin')));
  // The first action after midnight must not submit against yesterday's ranks.
  now=new original.Date(`${changeDay}T12:00:00Z`).getTime();
  get('word').value='santifica';
  get('guess-form').listeners.submit({preventDefault(){}});
  assert.equal(get('word').disabled,true);
  await new Promise(setImmediate);
  assert.equal(get('word').disabled,false);
  assert.equal(get('count').textContent,1);
  assert.equal(get('last').children[0].children.at(-1).textContent,'497');
  assert.ok(requests.at(-1).includes(`/ranks/${data.dataset}/`));
  assert.equal(JSON.parse(saved.get(`contesto-v1-${changeDay}`)).guesses.length,1);
  tick();
  get('guess-form').listeners.submit({preventDefault(){}});
  assert.equal(get('count').textContent,2);
  assert.equal(JSON.parse(saved.get(`contesto-v1-${changeDay}`)).guesses[1].id,data.words.indexOf('santifica'));
 } finally {
  for(const [key,value] of Object.entries(original)){
   if(value===undefined)delete globalThis[key];else globalThis[key]=value;
  }
 }
});
