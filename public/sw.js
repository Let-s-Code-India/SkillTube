const CACHE="skilltube-shell-v1";
const SHELL=["/","/offline.html","/css/tokens.css","/css/base.css","/css/layout.css","/css/components.css","/logo.svg"];
self.addEventListener("install",(event)=>event.waitUntil(caches.open(CACHE).then((cache)=>cache.addAll(SHELL))));
self.addEventListener("activate",(event)=>event.waitUntil(caches.keys().then((keys)=>Promise.all(keys.filter((key)=>key!==CACHE).map((key)=>caches.delete(key))))));
self.addEventListener("fetch",(event)=>{
  if(event.request.method!=="GET")return;
  const url=new URL(event.request.url);
  if(url.origin!==location.origin)return;
  event.respondWith(fetch(event.request).catch(()=>caches.match(event.request).then((match)=>match||caches.match("/offline.html"))));
});
