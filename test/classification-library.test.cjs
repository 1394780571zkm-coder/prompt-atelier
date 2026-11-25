const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const promptRules = require('../ui/rules.js');

function editor() {
  const file = path.join(__dirname,'../ui/app.js');
  const source = fs.readFileSync(file,'utf8');
  const context = vm.createContext({promptRules,structuredClone,console,window:{desktop:{}},
    document:{createElement:tag => ({tag,children:[],append(...children) { this.children.push(...children); }})}});
  vm.runInContext(source.slice(0,source.lastIndexOf('start().catch'))+`
    state.snapshot = {activeCategoryId:null,promptCategories:[],entries:[],settings:{hasKey:true}};
    state.draft = blank();
    materializePrompt = () => {};
    changed = () => {};
    globalThis.testEditor = {state,libraryData,packGrid,saveStatus};
  `,context,{filename:file});
  return context.testEditor;
}

function entry() {
  return {id:'saved',title:'',categoryId:'',body:'精灵射手，泡泡马特风格，皮克斯风格，迪士尼风格',
    params:[],images:{ref:[],style:[],result:[]},hints:{},person:[],status:'ai',
    analysis:promptRules.reorganizeAnalysis({tags:{subject:['精灵射手']},style:['泡泡马特风格','皮克斯风格','迪士尼风格'],name:'动画风格'})};
}

test('saved analysis exposes element terms and a reusable deduplicated style pack in its folder',() => {
  const {state,libraryData,packGrid} = editor();
  const saved = entry();
  state.snapshot.entries = [saved,{...structuredClone(saved),id:'second'}];
  const {terms,packs} = libraryData();
  assert.equal(terms.medium.size,3);
  assert.equal(packs.length,1);
  assert.equal(packs[0].count,2);
  assert.deepEqual([...packs[0].style],saved.analysis.style);
  packGrid(packs).children[0].onclick();
  assert.equal(state.draft.body,saved.analysis.style.join(', '));
  assert.ok(!state.draft.body.includes('精灵射手'));
  state.snapshot.activeCategoryId = 'another-folder';
  assert.equal(libraryData().packs.length,0);
  state.snapshot.activeCategoryId = '';
  assert.equal(libraryData().packs.length,1);
});

test('save status distinguishes folder, extraction, pending changes and actual library counts',() => {
  const {state,saveStatus} = editor();
  const saved = entry();
  const text = saveStatus(saved,saved);
  assert.match(text,/已保存到历史记录/);
  assert.match(text,/所属文件夹：未指定/);
  assert.match(text,/DeepSeek 提取完成/);
  assert.match(text,/词库已收录 4 个词条（2 类）/);
  assert.match(text,/风格包 1 个（3 项风格）/);
  assert.doesNotMatch(text,/已分类|未分类/);
  const dirty = saveStatus({...saved,body:'修改后的正文'},saved);
  assert.match(dirty,/有修改待保存/);
  assert.doesNotMatch(dirty,/提取完成|词库已收录/);
  assert.match(saveStatus({...saved,status:'pending'},{...saved,status:'pending'}),/正在提取词条与风格包/);
  assert.match(saveStatus({...saved,status:'error'},{...saved,status:'error'}),/提取失败，可重试/);
  assert.match(saveStatus({...saved,analysis:{tags:{},style:[]}},{...saved,analysis:{tags:{},style:[]}}),/无可复用风格包/);
  assert.match(saveStatus(saved),/尚未保存到历史记录/);
  state.saving = true;
  assert.equal(saveStatus(saved,saved),'正在保存到历史记录…');
});
