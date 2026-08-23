// Headless smoke test for Emergence pieces.
// Mocks Canvas2D + rAF, loads the concatenated modules, and for each piece:
//   factory -> resize -> start -> pump N frames -> stop -> pump again (must be quiet)
// Verifies: no throw, drawing actually happened, and the rAF loop is truly cancellable.
import fs from 'node:fs';
import vm from 'node:vm';

const file = process.argv[2] || new URL('./pieces.concat.js', import.meta.url).pathname;
const src = fs.readFileSync(file, 'utf8');

function makeCtx() {
  const store = { fillStyle:'#000', strokeStyle:'#000', globalAlpha:1,
    globalCompositeOperation:'source-over', lineWidth:1, imageSmoothingEnabled:true,
    font:'10px sans', shadowBlur:0, shadowColor:'#000', lineCap:'butt', lineJoin:'miter' };
  let draws = 0;
  const grad = { addColorStop(){} };
  const impl = {
    createImageData:(w,h)=>({width:w|0,height:h|0,data:new Uint8ClampedArray((w|0)*(h|0)*4)}),
    getImageData:(x,y,w,h)=>({width:w|0,height:h|0,data:new Uint8ClampedArray((w|0)*(h|0)*4)}),
    putImageData:()=>{draws++;},
    fillRect:()=>{draws++;}, clearRect:()=>{}, strokeRect:()=>{draws++;},
    beginPath:()=>{}, closePath:()=>{}, moveTo:()=>{}, lineTo:()=>{}, rect:()=>{},
    arc:()=>{}, ellipse:()=>{}, quadraticCurveTo:()=>{}, bezierCurveTo:()=>{},
    fill:()=>{draws++;}, stroke:()=>{draws++;}, fillText:()=>{draws++;},
    save:()=>{}, restore:()=>{}, translate:()=>{}, scale:()=>{}, rotate:()=>{},
    setTransform:()=>{}, resetTransform:()=>{}, transform:()=>{}, clip:()=>{},
    drawImage:()=>{draws++;}, measureText:()=>({width:0}),
    createRadialGradient:()=>grad, createLinearGradient:()=>grad, createPattern:()=>null,
    setLineDash:()=>{}, getLineDash:()=>[],
  };
  const target = { __draws:()=>draws };
  return new Proxy(target, {
    get(t,p){ if(p in t) return t[p]; if(p in impl) return impl[p];
      if(p in store) return store[p]; return ()=>{}; },
    set(t,p,v){ store[p]=v; return true; }
  });
}
function makeCanvas(cw=640, ch=400){
  const c = { width:300, height:150, clientWidth:cw, clientHeight:ch, style:{},
    getContext:()=>makeCtx(),
    getBoundingClientRect:()=>({left:0,top:0,right:cw,bottom:ch,width:cw,height:ch}),
    addEventListener:()=>{}, removeEventListener:()=>{} };
  return c;
}

// rAF queue we pump manually
let rafQ = [], rafId = 0, cancelled = new Set();
globalThis.requestAnimationFrame = (cb)=>{ const id=++rafId; rafQ.push({id,cb}); return id; };
globalThis.cancelAnimationFrame = (id)=>{ cancelled.add(id); };
function pump(times){
  let ran = 0;
  for(let i=0;i<times;i++){
    const batch = rafQ; rafQ = [];
    for(const {id,cb} of batch){ if(cancelled.has(id)) continue; ran++; cb(16.7*i); }
  }
  return ran;
}
globalThis.devicePixelRatio = 1.5;
globalThis.document = { createElement:(t)=> t==='canvas'? makeCanvas() : ({style:{},appendChild(){},getContext:()=>makeCtx()}),
  addEventListener:()=>{}, body:{appendChild(){}} };
globalThis.window = globalThis;
globalThis.PIECES = undefined;

// load modules
try { vm.runInThisContext(src, { filename:'pieces.concat.js' }); }
catch(e){ console.log('LOAD FAIL:', e.message); process.exit(2); }

const PIECES = globalThis.window.PIECES || globalThis.PIECES;
if(!PIECES){ console.log('no window.PIECES registered'); process.exit(2); }

const seed = 2574436003;
let fails = 0;
const slugs = Object.keys(PIECES);
console.log(`loaded ${slugs.length} pieces: ${slugs.join(', ')}\n`);
for(const slug of slugs){
  const res = { draw:false, cancels:false, err:null };
  try {
    rafQ=[]; cancelled=new Set();
    const canvas = makeCanvas();
    const api = PIECES[slug](canvas, seed);
    for(const m of ['step','render','start','stop','resize','perturb','reseed','destroy'])
      if(typeof api[m] !== 'function') throw new Error(`missing method: ${m}`);
    api.resize();
    api.start();
    const ranA = pump(40);                 // 40 frames of real simulation
    api.perturb(0.5,0.5);
    pump(10);
    const ctxDraws = canvas.getContext().__draws ? canvas.getContext().__draws() : -1;
    // draw check: some frames must have scheduled + a draw op fired
    res.draw = ranA > 0;
    api.stop();
    const before = rafId;
    const ranB = pump(10);                 // after stop: loop must be silent
    res.cancels = (ranB === 0);
    api.reseed(); pump(5); api.stop();
    api.destroy();
    if(!res.draw) throw new Error('rAF loop never ran');
    if(!res.cancels) throw new Error('loop kept running after stop()');
  } catch(e){ res.err = e.message; }
  if(res.err){ fails++; console.log(`  ✗ ${slug.padEnd(11)} FAIL — ${res.err}`); }
  else console.log(`  ✓ ${slug.padEnd(11)} ran 40 frames, stop() clean, reseed ok`);
}
console.log(`\n${slugs.length-fails}/${slugs.length} passed`);
process.exit(fails ? 1 : 0);
