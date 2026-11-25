const {test} = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const {Readable} = require('node:stream');
const {createImageVerifier} = require('../image-verification.cjs');

function environment(onVerified) {
  const windows=[];
  const cookies=new EventEmitter();
  let verified=false;
  class BrowserWindow extends EventEmitter {
    constructor(options) { super(); this.options=options; this.webContents=new EventEmitter(); this.webContents.setWindowOpenHandler=()=>{}; windows.push(this); }
    loadURL(url) { this.url=url; return Promise.resolve(); }
    focus() { this.focused=true; }
    isDestroyed() { return !!this.destroyed; }
    destroy() { this.destroyed=true; this.emit('closed'); }
  }
  const net={request:()=>{
    const request=new EventEmitter();
    request.setHeader=()=>{};
    request.abort=()=>request.emit('close');
    request.end=()=>{
      const response=Readable.from([Buffer.from('image')]);
      response.statusCode=verified?200:403;
      response.headers={'content-type':verified?'image/png':'text/html'};
      request.emit('response',response);
      response.on('close',()=>request.emit('close'));
    };
    return request;
  }};
  return {windows,cookies,setVerified:()=>{verified=true;},verify:createImageVerifier({BrowserWindow,net,session:{cookies},onVerified})};
}

test('concurrent protected images share one visible window and resume after user verification',async()=>{
  const env=environment();
  const first=env.verify('https://cdn.midjourney.com/first.png');
  const second=env.verify('https://cdn.midjourney.com/second.png');
  assert.equal(env.windows.length,1);
  assert.equal(env.windows[0].options.show,true);
  assert.equal(env.windows[0].options.webPreferences.sandbox,true);
  assert.equal(env.windows[0].options.webPreferences.nodeIntegration,false);
  assert.equal(env.windows[0].focused,true);
  env.setVerified();
  env.cookies.emit('changed',{}, {name:'cf_clearance',domain:'.midjourney.com'},'explicit',false);
  await Promise.all([first,second]);
  assert.equal(env.windows[0].destroyed,true);
  assert.equal(env.cookies.listenerCount('changed'),0);
});

test('closing verification cancels waiting downloads and permits a later retry',async()=>{
  const env=environment();
  const cancelled=assert.rejects(env.verify('https://cdn.midjourney.com/first.png'),/已取消/);
  env.windows[0].destroy();
  await cancelled;
  const retry=env.verify('https://cdn.midjourney.com/first.png');
  assert.equal(env.windows.length,2);
  env.setVerified();
  env.windows[1].webContents.emit('did-finish-load');
  await retry;
});

test('verification rejects unsupported sites without opening a window',async()=>{
  const env=environment();
  await assert.rejects(env.verify('https://example.org/image.png'),/不支持/);
  assert.equal(env.windows.length,0);
});

test('successful verification releases waiting downloads and notifies the editor once',async()=>{
  let notifications=0;
  const env=environment(()=>{notifications++;});
  const task=env.verify('https://cdn.midjourney.com/first.png');
  const waiter=env.verify.waitForPending('https://s.mj.run/other');
  assert.equal(waiter,task);
  assert.equal(env.verify.waitForPending('https://example.org/image.png'),undefined);
  assert.equal(env.verify.version(),0);
  env.setVerified();
  env.windows[0].webContents.emit('did-finish-load');
  await Promise.all([task,waiter]);
  assert.equal(env.verify.version(),1);
  assert.equal(notifications,1);
  assert.equal(env.verify.waitForPending('https://s.mj.run/other'),undefined);
});
