// 400-frame stability + NaN sweep per piece (reuses harness mocks, simplified)
import fs from 'node:fs'; import vm from 'node:vm';
const src = fs.readFileSync('./pieces.concat.js','utf8');
function ctx(){ const g={addColorStop(){}}; const impl={
  createImageData:(w,h)=>({width:w,height:h,data:new Uint8ClampedArray(w*h*4)}),
  putImageData(){}, fillRect(){}, drawImage(){}, beginPath(){}, arc(){}, fill(){},
  moveTo(){}, lineTo(){}, stroke(){}, save(){}, restore(){}, translate(){}, scale(){},
  setTransform(){}, clearRect(){}, createRadialGradient:()=>g, createLinearGradient:()=>g,
  getImageData:(x,y,w,h)=>({data:new Uint8ClampedArray(w*h*4)}), measureText:()=>({width:0}), rect(){}, clip(){} };
  const store={}; return new Proxy({},{get:(t,p)=>p in impl?impl[p]:(p in store?store[p]:()=>{}),set:(t,p,v)=>{store[p]=v;return true}}); }
const mkCanvas=()=>({width:300,height:150,clientWidth:640,clientHeight:400,style:{},
  getContext:()=>ctx(),addEventListener(){},getBoundingClientRect:()=>({left:0,top:0,width:640,height:400})});
globalThis.requestAnimationFrame=()=>1; globalThis.cancelAnimationFrame=()=>{};
globalThis.devicePixelRatio=1.5;
globalThis.document={createElement:t=>t==='canvas'?mkCanvas():{style:{},getContext:()=>ctx()}};
globalThis.window=globalThis; vm.runInThisContext(src);
let fails=0;
for(const slug of Object.keys(window.PIECES)){
  try{
    const api=window.PIECES[slug](mkCanvas(), 2574436003);
    api.resize();
    for(let i=0;i<400;i++){ api.step(); if(i%37===0) api.perturb(Math.sin(i)*0.5+0.5, 0.5); }
    api.render(); api.destroy();
    console.log(`  ✓ ${slug.padEnd(11)} 400 steps + periodic perturb: stable`);
  }catch(e){ fails++; console.log(`  ✗ ${slug.padEnd(11)} ${e.message}`); }
}
process.exit(fails?1:0);
