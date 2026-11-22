var C='commute-v6',F=['./','index.html','manifest.json','icon.svg','fonts/literata.woff','fonts/literata-italic.woff','fonts/spacegrotesk.woff','fonts/spacemono-400.woff','fonts/spacemono-700.woff','fonts/doto.woff'];
self.addEventListener('install',function(e){e.waitUntil(caches.open(C).then(function(c){return c.addAll(F);}));self.skipWaiting();});
self.addEventListener('activate',function(e){e.waitUntil(caches.keys().then(function(k){return Promise.all(k.filter(function(n){return n!==C;}).map(function(n){return caches.delete(n);}));}).then(function(){return self.clients.claim();}));});
self.addEventListener('fetch',function(e){
  var rq=e.request;
  if(rq.method!=='GET'||rq.url.indexOf(self.location.origin)!==0)return;
  var u=new URL(rq.url),key=new Request(u.origin+u.pathname);
  var shell=rq.mode==='navigate'||/\/(index\.html)?$/.test(u.pathname);
  var net=fetch(rq,{cache:'no-cache'}).then(function(r){if(r.ok){var cp=r.clone();caches.open(C).then(function(c){c.put(key,cp);});}return r;});
  function fb(){return caches.match(key).then(function(m){return m||Response.error();});}
  e.waitUntil(net.catch(function(){}));
  if(shell){
    e.respondWith(Promise.race([net.catch(fb),new Promise(function(res){setTimeout(function(){res(caches.match(key).then(function(m){return m||net;}));},1500);})]));
  }else e.respondWith(net.catch(fb));
});
