import fs from 'node:fs';
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const start=new Date(Date.now()-400*864e5).toISOString().slice(0,10);
const urls=[
 'https://production.dataviz.cnn.io/index/fearandgreed/graphdata/'+start,
 'https://production.dataviz.cnn.io/index/fearandgreed/graphdata'
];
let j=null;
for(const u of urls){
  try{
    const r=await fetch(u,{headers:{'User-Agent':UA,'Accept':'application/json,text/plain,*/*','Origin':'https://www.cnn.com','Referer':'https://www.cnn.com/markets/fear-and-greed'}});
    if(!r.ok)throw new Error(r.status);
    j=await r.json();
    if(!j.fear_and_greed)throw new Error('no data');
    break;
  }catch(e){console.error('fng',u,String(e));j=null;}
}
if(!j){console.error('fng: unavailable, keeping previous file');process.exit(0);}
const f=j.fear_and_greed,H=(j.fear_and_greed_historical&&j.fear_and_greed_historical.data)||[];
const r1=v=>v==null?null:Math.round(v);
const cutoff=Date.now()-366*864e5;
const byDay=new Map();
for(const p of H){if(p.x>=cutoff&&p.y!=null)byDay.set(new Date(p.x).toISOString().slice(0,10),[p.x,Math.round(p.y*10)/10]);}
const h=[...byDay.values()].sort((a,b)=>a[0]-b[0]);
const out={t:new Date().toISOString(),score:r1(f.score),rating:f.rating,pc:r1(f.previous_close),w:r1(f.previous_1_week),m:r1(f.previous_1_month),y:r1(f.previous_1_year),h};
if(out.score==null||h.length<10){console.error('fng: bad shape');process.exit(0);}
fs.writeFileSync('fng.json',JSON.stringify(out));
console.log('fng ok',out.score,out.rating,h.length);
