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
