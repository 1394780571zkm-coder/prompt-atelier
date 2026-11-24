const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const promptRules = require('../ui/rules.js');
const file = path.join(__dirname,'../ui/app.js');
const script = fs.readFileSync(file,'utf8');
const context = vm.createContext({promptRules,window:{desktop:{}},document:{},console});
vm.runInContext(script.slice(0,script.lastIndexOf('start().catch'))+'\nglobalThis.importPrompt = applyPrompt;',context,{filename:file});
const importPrompt = (...args) => JSON.parse(JSON.stringify(context.importPrompt(...args)));
const draft = () => ({body:'原正文',title:'',params:[['ar','2:3'],['sref','123 https://example.org/style.png']],person:[],hints:{},images:{
  ref:[{file:'ref.png',url:'https://example.org/ref.png',weight:'2'}],
  style:[{file:'style.png',url:'https://example.org/style.png'},{file:'preview.png',previewOnly:true}],
  result:[{file:'result.png'}]
}});

test('importing sref adds new references while preserving selected images and existing style values',() => {
  const original = draft();
  for (const replace of [false,true]) {
    const imported = importPrompt(original,'新正文 --sref https://example.org/new.png --ar 16:9',replace);
    assert.deepEqual(imported.images.ref,original.images.ref);
    assert.deepEqual(imported.images.style.slice(0,2),original.images.style);
    assert.equal(imported.images.style[2].url,'https://example.org/new.png');
    const sref = new Map(imported.params).get('sref');
    assert.ok(sref.includes('123') && sref.includes('https://example.org/style.png') && sref.includes('https://example.org/new.png'));
    assert.equal(imported.images.result.length,replace ? 0 : 1);
    const repeated = importPrompt(imported,'新正文 --sref https://example.org/new.png');
    assert.equal(repeated.images.style.length,3);
    assert.deepEqual(original,draft());
  }
});

test('live typing updates body fragments and retains muted words in the editable source',() => {
  const current = {...draft(),body:'森林，水彩',bodyTokens:{source:'森林，白衬衣，水彩',disabled:[1]}};
  const updated = importPrompt(current,'森林，白衬衣，油画，暖光');
  assert.equal(updated.body,'森林，油画，暖光');
  assert.equal(updated.bodyTokens.source,'森林，白衬衣，油画，暖光');
  assert.deepEqual(updated.bodyTokens.disabled,[1]);
  assert.deepEqual(updated.images,current.images);
});
