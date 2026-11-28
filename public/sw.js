const CACHE="skilltube-shell-v2";
const SHELL=["/","/offline.html","/js/theme-boot.js","/css/tokens.css","/css/themes.css","/css/base.css","/css/layout.css","/css/components.css","/css/pages.css","/css/charts.css","/css/motion.css","/logo.svg"];
self.addEventListener("install",(event)=>event.waitUntil(caches.open(CACHE).then((cache)=>cache.addAll(SHELL))));
self.addEventListener("activate",(event)=>event.waitUntil(caches.keys().then((keys)=>Promise.all(keys.filter((key)=>key!==CACHE).map((key)=>caches.delete(key))))));
self.addEventListener("fetch",(event)=>{
  if(event.request.method!=="GET")return;
  const url=new URL(event.request.url);
  if(url.origin!==location.origin)return;
  event.respondWith(fetch(event.request).catch(()=>caches.match(event.request).then((match)=>match||caches.match("/offline.html"))));
});
