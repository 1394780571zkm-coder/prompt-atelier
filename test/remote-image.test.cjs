const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {createRequire} = require('node:module');
const file = require.resolve('../remote-image.cjs');
const localRequire = createRequire(file);
function downloader() {
  const context = vm.createContext({module:{exports:{}},Buffer,URL,AbortSignal,process,
    require:id => id === 'node:dns/promises' ? {lookup:async()=>[{address:'1.1.1.1'}]} : localRequire(id)});
  vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file});
  return context.module.exports.downloadImage;
}
const url='https://cdn.discordapp.com/attachments/123/456/image.png?ex=abc&is=def&hm=signature';
test('Discord downloads keep signed query, use desktop transport and retry a broken TLS connection',async()=>{
  let calls=0;
  const bytes=await downloader()(url,undefined,async(target,options)=>{
    assert.equal(target,url);
    assert.equal(options.redirect,'manual');
    assert.equal(options.credentials,'omit');
    if(++calls===1) throw new Error('net::ERR_CONNECTION_RESET');
    return new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'image/png'}});
  });
  assert.equal(calls,2);
  assert.deepEqual([...bytes],[1,2,3]);
});
test('desktop image transport rejects private redirects before requesting them',async()=>{
  let calls=0;
  await assert.rejects(downloader()(url,undefined,async()=>{
    calls++;
    return new Response(null,{status:302,headers:{location:'http://127.0.0.1/secret'}});
  }),/公开访问/);
  assert.equal(calls,1);
});
test('failed desktop downloads explain connection failures and expired Discord links in Chinese',async()=>{
  await assert.rejects(downloader()(url,undefined,async()=>{throw new Error('net::ERR_CONNECTION_CLOSED');}),/连接中断/);
  let calls=0;
  await assert.rejects(downloader()(url,undefined,async()=>{calls++;return new Response(null,{status:403});}),/Discord 图片链接已失效/);
  assert.equal(calls,1);
});

test('Midjourney short links validate and download the redirected image',async()=>{
  const visited=[];
  const bytes=await downloader()('https://s.mj.run/example',undefined,async(target)=>{
    visited.push(target);
    return visited.length===1
      ? new Response(null,{status:307,headers:{location:'https://cdn.midjourney.com/image.png'}})
      : new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'image/png'}});
  });
  assert.deepEqual(visited,['https://s.mj.run/example','https://cdn.midjourney.com/image.png']);
  assert.equal(bytes.length,3);
});

test('Midjourney forbidden images give a relevant recovery message',async()=>{
  await assert.rejects(downloader()('https://cdn.midjourney.com/image.png',undefined,async()=>new Response(null,{status:403})),/Midjourney.*403/);
});

test('MJ short URLs reuse a dragged original before requesting its protected CDN',async()=>{
  const original='https://cdn.midjourney.com/u/user/original.jpg';
  const visited=[];
  const bytes=await downloader()('https://s.mj.run/example',undefined,async(target)=>{
    visited.push(target);
    if(target===original) throw new Error('Protected CDN should not be requested');
    return new Response(null,{status:307,headers:{location:original}});
  },target=>target===original ? Buffer.from([1,2,3]) : null);
  assert.deepEqual(visited,['https://s.mj.run/example']);
  assert.deepEqual([...bytes],[1,2,3]);
});

test('uncached redirect destinations still download normally',async()=>{
  let calls=0;
  const bytes=await downloader()('https://s.mj.run/example',undefined,async()=>++calls===1
    ? new Response(null,{status:302,headers:{location:'https://cdn.midjourney.com/new.png'}})
    : new Response(new Uint8Array([4,5,6]),{headers:{'content-type':'image/png'}}),()=>null);
  assert.equal(calls,2);
  assert.deepEqual([...bytes],[4,5,6]);
});

test('Midjourney browser challenges are identified without claiming the image expired',async()=>{
  await assert.rejects(downloader()('https://cdn.midjourney.com/image.png',undefined,async()=>
    new Response(null,{status:403,headers:{'cf-mitigated':'challenge','content-type':'text/html'}})),/浏览器验证/);
});

test('a browser challenge waits for user verification then retries the download',async()=>{
  let verified=false,calls=0;
  const target='https://cdn.midjourney.com/original.png';
  const bytes=await downloader()(target,undefined,async()=>{
    calls++;
    return verified ? new Response(new Uint8Array([7,8,9]),{headers:{'content-type':'image/png'}})
      : new Response(null,{status:403,headers:{'cf-mitigated':'challenge'}});
  },undefined,async url=>{assert.equal(url,target);verified=true;});
  assert.equal(calls,2);
  assert.deepEqual([...bytes],[7,8,9]);
});

test('verification cancellation is reported without repeatedly reopening the browser',async()=>{
  let windows=0;
  await assert.rejects(downloader()('https://cdn.midjourney.com/original.png',undefined,async()=>
    new Response(null,{status:403,headers:{'cf-mitigated':'challenge'}}),undefined,async()=>{
    windows++;throw new Error('已取消图片网站验证');
  }),/已取消/);
  assert.equal(windows,1);
});

test('a persistent challenge opens verification only once per download',async()=>{
  let windows=0;
  await assert.rejects(downloader()('https://cdn.midjourney.com/original.png',undefined,async()=>
    new Response(null,{status:403,headers:{'cf-mitigated':'challenge'}}),undefined,async()=>{windows++;}),/浏览器验证/);
  assert.equal(windows,1);
});

test('verification does not consume the network retry needed by the other images',async()=>{
  let calls=0,windows=0;
  const bytes=await downloader()('https://cdn.midjourney.com/other.png',undefined,async()=>{
    calls++;
    if(calls===1) return new Response(null,{status:403,headers:{'cf-mitigated':'challenge'}});
    if(calls===2) throw new Error('net::ERR_CONNECTION_RESET');
    return new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'image/png'}});
  },undefined,async()=>{windows++;});
  assert.equal(windows,1);
  assert.equal(calls,3);
  assert.deepEqual([...bytes],[1,2,3]);
});

test('downloads wait for the shared human verification before starting network requests',async()=>{
  let complete;
  const waiting=new Promise(resolve=>{complete=resolve;});
  const verify=()=>waiting;
  verify.waitForPending=()=>waiting;
  let calls=0;
  const task=downloader()('https://s.mj.run/queued',undefined,async()=>{
    calls++;
    return new Response(new Uint8Array([4]),{headers:{'content-type':'image/png'}});
  },undefined,verify);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls,0);
  complete();
  assert.deepEqual([...(await task)],[4]);
  assert.equal(calls,1);
});

test('three concurrent images resume after one verification including a late stale challenge',async()=>{
  let version=0,windows=0,complete;
  const waiting=new Promise(resolve=>{complete=resolve;});
  let opened;
  const opening=new Promise(resolve=>{opened=resolve;});
  const verify=async()=>{windows++;opened();await waiting;};
  verify.version=()=>version;
  verify.waitForPending=()=>windows && !version ? waiting : undefined;
  const download=downloader();
  const calls=new Map();
  const fetchImage=async url=>{
    calls.set(url,(calls.get(url)||0)+1);
    if(url.endsWith('first.png') && !version)
      return new Response(null,{status:403,headers:{'cf-mitigated':'challenge'}});
    if(url.endsWith('second.png') && calls.get(url)===1) {
      await waiting; // Its original challenge arrives after the shared window closed.
      return new Response(null,{status:403,headers:{'cf-mitigated':'challenge'}});
    }
    return new Response(new Uint8Array([9]),{headers:{'content-type':'image/png'}});
  };
  const first=download('https://cdn.midjourney.com/first.png',undefined,fetchImage,undefined,verify);
  const second=download('https://cdn.midjourney.com/second.png',undefined,fetchImage,undefined,verify);
  await opening;
  const third=download('https://cdn.midjourney.com/third.png',undefined,fetchImage,undefined,verify);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls.has('https://cdn.midjourney.com/third.png'),false);
  version++;
  complete();
  const results=await Promise.all([first,second,third]);
  assert.equal(windows,1);
  assert.deepEqual(results.map(bytes=>[...bytes]),[[9],[9],[9]]);
});
