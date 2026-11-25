const {Readable} = require('node:stream');

// Electron fetch cancels manual redirects. net.request exposes the redirect
// destination so the downloader can validate it before making the next request.
function fetchDesktopImage(net,session,url,{signal,headers}) {
  return new Promise((resolve,reject) => {
    const verifiedSite = /^https:\/\/(?:cdn\.midjourney\.com|s\.mj\.run)\//i.test(url);
    const request = net.request({url,session,redirect:'manual',credentials:verifiedSite?'include':'omit',useSessionCookies:verifiedSite});
    const abort = () => { reject(signal.reason); request.abort(); };
    const cleanup = () => signal.removeEventListener('abort',abort);
    request.on('error',error => { cleanup(); reject(error); });
    request.on('close',cleanup);
    request.on('redirect',(status,_method,location) => {
      cleanup();
      resolve({status,headers:new Map([['location',location]]),body:null});
      request.abort();
    });
    request.on('response',response => {
      resolve({status:response.statusCode,headers:new Map(Object.entries(response.headers).map(([key,value]) => [key,Array.isArray(value)?value.join(', '):value])),body:Readable.toWeb(response)});
    });
    if (signal.aborted) return abort();
    signal.addEventListener('abort',abort,{once:true});
    for (const [key,value] of Object.entries(headers)) request.setHeader(key,value);
    request.end();
  });
}

module.exports = {fetchDesktopImage};
