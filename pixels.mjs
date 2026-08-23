// Pixel audit: after 300 steps does render() emit a genuinely varied image?
import fs from 'node:fs'; import vm from 'node:vm';
const src = fs.readFileSync('./pieces.concat.js','utf8');
let lastImage = null, drawOps = 0;
function ctx(){ const g={addColorStop(){}}; const impl={
  createImageData:(w,h)=>({width:w,height:h,data:new Uint8ClampedArray(w*h*4)}),
  putImageData:(img)=>{ lastImage = img; drawOps++; },
  fillRect:()=>{drawOps++;}, drawImage:()=>{drawOps++;}, beginPath(){}, arc(){}, fill:()=>{drawOps++;},
  moveTo(){}, lineTo(){}, stroke:()=>{drawOps++;}, save(){}, restore(){}, translate(){}, scale(){},
  setTransform(){}, clearRect(){}, createRadialGradient:()=>g, createLinearGradient:()=>g,
  getImageData:(x,y,w,h)=>({data:new Uint8ClampedArray(w*h*4)}), measureText:()=>({width:0}), rect(){}, clip(){} };
  const store={}; return new Proxy({},{get:(t,p)=>p in impl?impl[p]:(p in store?store[p]:()=>{}),set:(t,p,v)=>{store[p]=v;return true}}); }
const mkCanvas=()=>({width:300,height:150,clientWidth:640,clientHeight:400,style:{},
  getContext:()=>ctx(),addEventListener(){},getBoundingClientRect:()=>({left:0,top:0,width:640,height:400})});
globalThis.requestAnimationFrame=()=>1; globalThis.cancelAnimationFrame=()=>{};
globalThis.devicePixelRatio=1.5;
globalThis.document={createElement:t=>t==='canvas'?mkCanvas():{style:{},getContext:()=>ctx()}};
globalThis.window=globalThis; vm.runInThisContext(src);
for(const slug of Object.keys(window.PIECES)){
  lastImage=null; drawOps=0;
  const api=window.PIECES[slug](mkCanvas(), 2574436003);
  api.resize(); api.perturb(0.5,0.5);
  for(let i=0;i<300;i++) api.step();
  api.render();
  let msg;
  if(lastImage){
    const d=lastImage.data, colors=new Set(); let lit=0;
    for(let i=0;i<d.length;i+=4){
      const key=(d[i]>>3)<<10 | (d[i+1]>>3)<<5 | (d[i+2]>>3);
      colors.add(key);
      if(d[i]+d[i+1]+d[i+2] > 40) lit++;
    }
    const litPct=(100*lit/(d.length/4)).toFixed(1);
    msg = `${colors.size} distinct colors, ${litPct}% lit pixels`;
    if(colors.size<8) msg += '  ⚠ SUSPICIOUSLY FLAT';
  } else {
    msg = `${drawOps} path/fill draw ops (vector piece)`;
    if(drawOps<10) msg += '  ⚠ BARELY DREW';
  }
  console.log(`  ${slug.padEnd(11)} ${msg}`);
  api.destroy();
}
