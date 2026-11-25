const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const promptRules = require('../ui/rules.js');

test('one verification resumes failed images and late failures without retrying unrelated sites',async()=>{
  const file=path.join(__dirname,'../ui/app.js');
  const source=fs.readFileSync(file,'utf8');
  const calls=new Map();
  let rejectLate;
  const late=new Promise((_resolve,reject)=>{rejectLate=reject;});
  const context=vm.createContext({promptRules,console,window:{desktop:{remoteImage:async url=>{
    calls.set(url,(calls.get(url)||0)+1);
    if(url.endsWith('late.png') && calls.get(url)===1) return late;
    if(url.endsWith('failed.png') && calls.get(url)===1) throw new Error('连接中断');
    if(url.startsWith('https://example.org')) throw new Error('HTTP 404');
    return {file:url.split('/').at(-1)};
  }}},document:{}});
  vm.runInContext(source.slice(0,source.lastIndexOf('start().catch'))+`
    state.draft=blank();
    state.draft.images.style=['done','failed','late'].map(name=>({url:'https://cdn.midjourney.com/'+name+'.png',file:''}));
    state.draft.images.ref=[{url:'https://example.org/missing.png',file:''}];
    changed=()=>{};
    refreshGallery=async()=>{};
    renderAssets=()=>{};
    hydrateDraftImages();
  `,context,{filename:file});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(vm.runInContext('failedImages.size',context),2);
  vm.runInContext('resumeVerifiedImages()',context);
  rejectLate(new Error('stale connection failure'));
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(state.draft.images.style.map(image=>image.file))',context)),['done.png','failed.png','late.png']);
  assert.equal(calls.get('https://cdn.midjourney.com/done.png'),1);
  assert.equal(calls.get('https://cdn.midjourney.com/failed.png'),2);
  assert.equal(calls.get('https://cdn.midjourney.com/late.png'),2);
  assert.equal(calls.get('https://example.org/missing.png'),1);
  assert.equal(vm.runInContext('failedImages.size',context),1);
});
