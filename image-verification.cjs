const {fetchDesktopImage} = require('./desktop-image.cjs');

function createImageVerifier({BrowserWindow,net,session,getParent,onVerified}) {
  const pending = new Map();
  let version = 0;
  const supports = url => /^https:\/\/(?:cdn\.midjourney\.com|s\.mj\.run)\//i.test(url);
  function verifyImage(url) {
    const target = new URL(url);
    if (target.protocol !== 'https:' || !['cdn.midjourney.com','s.mj.run'].includes(target.hostname))
      return Promise.reject(new Error('该图片网站不支持内置浏览器验证。'));
    // All MJ image requests share the same cookies and one verification window.
    const key = 'midjourney';
    if (pending.has(key)) { pending.get(key).window.focus(); return pending.get(key).promise; }
    const browser = new BrowserWindow({
      width:1000,height:760,show:true,parent:getParent?.(),
      title:'请手动完成图片网站验证，完成后将自动继续下载',
      autoHideMenuBar:true,
      webPreferences:{session,nodeIntegration:false,contextIsolation:true,sandbox:true}
    });
    let finish;
    const promise = new Promise((resolve,reject) => { finish = error => error ? reject(error) : resolve(); });
    pending.set(key,{window:browser,promise});
    let done = false,checking = false,checkAgain = false;
    const stop = error => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      session.cookies.removeListener('changed',cookieChanged);
      pending.delete(key);
      if (!error) version++;
      finish(error);
      if (!browser.isDestroyed()) browser.destroy();
      if (!error) onVerified?.();
    };
    const check = async () => {
      if (done) return;
      if (checking) { checkAgain = true; return; }
      checking = true;
      try {
        const response = await fetchDesktopImage(net,session,url,{
          signal:AbortSignal.timeout(20000),headers:{Accept:'image/*'}
        });
        if (response.body) await response.body.cancel();
        if (response.status === 200 && /^image\//i.test(response.headers.get('content-type') || '')) stop();
      } catch { /* Keep the real browser open for the user to verify or reload. */ }
      finally {
        checking = false;
        if (checkAgain && !done) { checkAgain = false; void check(); }
      }
    };
    const cookieChanged = (_event,cookie,_cause,removed) => {
      if (!removed && cookie.name === 'cf_clearance' && /(?:^|\.)midjourney\.com$/.test(cookie.domain)) void check();
    };
    const timer = setTimeout(() => stop(new Error('图片网站验证等待超时，请点击重试下载后重新验证。')),5*60*1000);
    session.cookies.on('changed',cookieChanged);
    browser.on('closed',() => stop(new Error('已取消图片网站验证，可点击重试下载再次打开。')));
    browser.on('page-title-updated',event => event.preventDefault());
    browser.webContents.setWindowOpenHandler(() => ({action:'deny'}));
    const restrictNavigation = (event,value) => {
      try {
        const destination = new URL(value);
        if (destination.protocol === 'https:' && /(?:^|\.)(?:midjourney\.com|mj\.run)$/.test(destination.hostname)) return;
      } catch {}
      event.preventDefault();
    };
    browser.webContents.on('will-navigate',restrictNavigation);
    browser.webContents.on('will-redirect',restrictNavigation);
    browser.webContents.on('did-finish-load',() => void check());
    browser.loadURL(url).catch(() => { /* Chromium's error page allows a manual reload. */ });
    return promise;
  }
  verifyImage.waitForPending = url => supports(url) ? pending.get('midjourney')?.promise : undefined;
  verifyImage.version = () => version;
  return verifyImage;
}

module.exports = {createImageVerifier};
