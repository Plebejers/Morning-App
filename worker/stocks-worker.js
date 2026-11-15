// Cloudflare Worker: tiny proxy so the app can read Yahoo Finance data.
// Routes: /chart?s=AAPL&r=1d|5d|1y|5y, /news?s=AAPL and /search?q=apple
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json'
};
export default {
  async fetch(req) {
    const u = new URL(req.url);
    const s = (u.searchParams.get('s') || '').trim().slice(0, 15);
    const q = (u.searchParams.get('q') || '').trim().slice(0, 60);
    let target;
    if (u.pathname === '/search') {
      if (!/^[A-Za-z0-9.&' \-]+$/.test(q)) return new Response('{"error":"bad query"}', { status: 400, headers: CORS });
      target = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=6&newsCount=0`;
    } else if (!/^[A-Za-z0-9.\-^=]+$/.test(s)) return new Response('{"error":"bad ticker"}', { status: 400, headers: CORS });
    else if (u.pathname === '/chart') {
      const RG = { '1d': '15m', '5d': '60m', '1mo': '1d', '1y': '1d', '5y': '1wk' };
      const r = RG[u.searchParams.get('r')] ? u.searchParams.get('r') : '1d';
      target = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?range=${r}&interval=${RG[r]}`;
    }
    else if (u.pathname === '/news') target = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(s)}&quotesCount=0&newsCount=20`;
    else return new Response('{"error":"not found"}', { status: 404, headers: CORS });
    const r = await fetch(target, { headers: { 'User-Agent': UA }, cf: { cacheTtl: 120, cacheEverything: true } });
    return new Response(await r.text(), { status: r.status, headers: CORS });
  }
};
