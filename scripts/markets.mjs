import fs from 'node:fs';
const syms=['VEQT.TO','ES=F','NQ=F','YM=F','VUN.TO','VCN.TO','VIU.TO','VEE.TO'];
const out={t:new Date().toISOString()};
for(const s of syms){
  for(const host of ['query1','query2']){
    try{
      const r=await fetch(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?range=1d&interval=15m`,{headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36'}});
      if(!r.ok)throw new Error(r.status);
      const j=await r.json(),x=j.chart.result[0],m=x.meta;
      const c=(x.indicators.quote[0].close||[]).filter(v=>v!=null).map(v=>Math.round(v*100)/100);
      out[s]={p:m.regularMarketPrice,pc:m.chartPreviousClose,c};
      break;
    }catch(e){console.error(s,host,String(e));}
  }
}
out.vr={};
for(const [rg,iv] of [['5d','60m'],['1mo','1d'],['1y','1d'],['5y','1wk']]){
  try{
    const r=await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/VEQT.TO?range=${rg}&interval=${iv}`,{headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36'}});
    if(!r.ok)throw new Error(r.status);
    const x=(await r.json()).chart.result[0];
    out.vr[rg]=(x.indicators.quote[0].close||[]).filter(v=>v!=null).map(v=>Math.round(v*100)/100);
  }catch(e){console.error('range',rg,String(e));}
}
const feeds=[
 ['CNBC','https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664'],
 ['MarketWatch','https://feeds.content.dowjones.io/public/rss/mw_topstories'],
 ['The Globe and Mail','https://www.theglobeandmail.com/arc/outboundfeeds/rss/category/business/']
];
const dec=t=>t.replace(/<!\[CDATA\[|\]\]>/g,'').replace(/&amp;/g,'&').replace(/&#39;|&#x27;|&apos;/g,"'").replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim();
const dec2=t=>dec(t).replace(/&#x([0-9a-f]+);/gi,(m,h)=>String.fromCodePoint(parseInt(h,16))).replace(/&#(\d+);/g,(m,d)=>String.fromCodePoint(+d));
async function pull(feeds,per,max,bad){
  const lists=[];
  for(const [name,url] of feeds){
    try{
      const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36'}});
      if(!r.ok)throw new Error(r.status);
      const x=await r.text();
      const items=[...x.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m=>{
        const g=k=>{const q=m[1].match(new RegExp('<'+k+'[^>]*>([\\s\\S]*?)</'+k+'>'));return q?dec(q[1]):'';};
        return {t:dec2(g('title')),l:g('link'),p:name,ts:Date.parse(g('pubDate'))/1000||0};
      }).filter(n=>n.t&&n.l&&!bad.test(n.t));
      console.error(name,items.length);
      lists.push(items.slice(0,per));
    }catch(e){console.error('feed',name,String(e));}
  }
  const o=[];
  for(let i=0;i<per;i++)for(const l of lists)if(l[i])o.push(l[i]);
  return o.slice(0,max);
}
out.news=await pull(feeds,4,5,/\$\d|\b(he|she|his|her)\b.*\$|^\d+ |best .* to buy|should you buy|\?|^['"\u2018\u201c]/i);
out.gnews=await pull([
 ['CBC','https://www.cbc.ca/webfeed/rss/rss-topstories']
],6,5,/\?|^\d+ |live:|watch:|quiz/i);
if(Object.keys(out).length>1)fs.writeFileSync('markets.json',JSON.stringify(out));
else{console.error('no data');process.exit(1);}
