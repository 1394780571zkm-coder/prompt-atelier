const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const promptRules = require('../ui/rules.js');

test('typed foreign prompts automatically translate after a pause and follow the latest edit',async () => {
  const timers = new Map();
  const calls = [];
  const fields = new Map();
  let nextTimer = 0;
  const file = path.join(__dirname,'../ui/app.js');
  const source = fs.readFileSync(file,'utf8');
  const context = vm.createContext({promptRules,console,
    window:{desktop:{translatePrompt:body => { calls.push(body); return Promise.resolve('中文：'+body); }}},
    document:{querySelector:selector => {
      if (!fields.has(selector)) fields.set(selector,{hidden:false,textContent:'',disabled:false});
      return fields.get(selector);
    }},
    setTimeout:callback => { timers.set(++nextTimer,callback); return nextTimer; },
    clearTimeout:id => timers.delete(id)
  });
  vm.runInContext(source.slice(0,source.lastIndexOf('start().catch')),context,{filename:file});
  const type = value => {
    context.typedBody = value;
    vm.runInContext('state.draft = {...blank(),body:typedBody}; renderTranslation(typedBody); scheduleDraftTranslation(typedBody);',context);
  };
  const pause = async () => {
    const scheduled = [...timers.values()];
    timers.clear();
    for (const callback of scheduled) callback();
    await new Promise(resolve => setImmediate(resolve));
  };
  type('1 girl,');
  assert.deepEqual(calls,[]);
  await pause();
  assert.deepEqual(calls,['1 girl,']);
  assert.equal(fields.get('#translation-text').hidden,false);
  assert.equal(fields.get('#translation-text').textContent,'中文：1 girl,');
  type('1 girl, forest');
  type('1 girl, watercolor');
  await pause();
  assert.deepEqual(calls,['1 girl,','1 girl, watercolor']);
  type('纯中文提示词');
  await pause();
  assert.equal(calls.length,2);
  assert.equal(fields.get('#draft-translation').hidden,true);
});
