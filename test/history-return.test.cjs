const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const promptRules = require('../ui/rules.js');

test('normal history exposes both destinations and returns an independent complete draft',() => {
  const file = path.join(__dirname,'../ui/app.js');
  const source = fs.readFileSync(file,'utf8');
  const context = vm.createContext({promptRules,structuredClone,console,window:{desktop:{}},
    document:{createElement:tag => ({tag,children:[],append(...children) { this.children.push(...children); },setAttribute() {}})}});
  vm.runInContext(source.slice(0,source.lastIndexOf('start().catch'))+`
    state.snapshot = {activeCategoryId:null,promptCategories:[],entries:[],settings:{hasKey:false}};
    state.draft = blank();
    thumbnails = () => null;
    replaceDraft = draft => { globalThis.returnedDraft = structuredClone(draft); };
    globalThis.openSplitter = draft => { globalThis.splitterDraft = draft; };
    globalThis.cardFor = historyCard;
  `,context,{filename:file});
  const entry = {id:'saved',categoryId:'',title:'历史',body:'森林，水彩',bodyTokens:{source:'森林，白衬衣，水彩',disabled:[1]},
    params:[['seed','42']],images:{ref:[{file:'ref.png'}],style:[{file:'style.png',url:'https://example.org/style.png'}],result:[{file:'result.png'}]},
    hints:{subject:['森林']},person:[],updated:new Date().toISOString(),status:'local'};
  const card = context.cardFor(entry);
  const buttons = [];
  const walk = element => {
    if (element?.tag === 'button') buttons.push(element);
    for (const child of element?.children || []) if (typeof child === 'object') walk(child);
  };
  walk(card);
  const find = label => buttons.find(button => button.children.includes(label));
  assert.ok(find('回到编写器'));
  assert.ok(find('送往拆分台'));
  find('回到编写器').onclick();
  const returned = context.returnedDraft;
  assert.deepEqual(returned.images,entry.images);
  assert.deepEqual(returned.bodyTokens,entry.bodyTokens);
  assert.equal(returned.id,entry.id);
  assert.equal(new Map(returned.params).get('seed'),'42');
  assert.equal(new Map(returned.params).get('sref'),'https://example.org/style.png');
  returned.images.ref.length = 0;
  assert.equal(entry.images.ref.length,1);
  find('送往拆分台').onclick();
  assert.deepEqual(context.splitterDraft.images,entry.images);
  context.splitterDraft.body = '改写';
  assert.equal(entry.body,'森林，水彩');
});
