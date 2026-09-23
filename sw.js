const CACHE = 'mv-music-analyzer-v0.6';
const APP_SHELL = ['./','./index.html','./styles.css','./app.js','./manifest.webmanifest','./icon.svg','./music_analysis_schema_v6.json','./README_v0.6変更点.txt'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(APP_SHELL)));
  self.skipWaiting();
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  const cacheable = url.origin===self.location.origin ||
    url.hostname==='cdn.jsdelivr.net' ||
    url.hostname==='esm.sh';
  if(!cacheable)return;
  event.respondWith(
    caches.match(request).then(hit=>hit||fetch(request).then(resp=>{
      const copy=resp.clone();
      caches.open(CACHE).then(cache=>cache.put(request,copy)).catch(()=>{});
      return resp;
    }))
  );
});
