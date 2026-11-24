const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const {createRequire} = require('node:module');
const {pathToFileURL} = require('node:url');

const root = path.resolve(__dirname,'..');
const mainPath = path.join(root,'main.cjs');
const mainRequire = createRequire(mainPath);
const source = fs.readFileSync(mainPath,'utf8')+'\nsetup();';
const blank = (body='',categoryId='') => ({id:'',title:'',body,categoryId,params:[],images:{ref:[],style:[],result:[]},hints:{},person:[]});

function openStore(directory,extras={}) {
  const handlers = new Map();
  const electron = {
    app:{requestSingleInstanceLock:() => true,whenReady:() => ({then:() => ({catch:() => {}})}),on:() => {}},
    protocol:{registerSchemesAsPrivileged:() => {},handle:() => {}},
    ipcMain:{handle:(name,callback) => handlers.set(name,callback),on:() => {}},...extras
  };
  const context = vm.createContext({
    require:id => id === 'electron' ? electron : mainRequire(id),
    __dirname:directory,process:{env:{PROMPT_ATELIER_DATA:path.join(directory,'data')}},
    console,Buffer,URL,Response,Blob
  });
  vm.runInContext(source,context,{filename:mainPath});
  return (name,...args) => {
    const event = {senderFrame:{parent:null,url:pathToFileURL(path.join(directory,'ui','index.html')).href}};
    return handlers.get(name)(event,...args);
  };
}

test('clipboard image imports are cached and scoped, while empty and oversized images are rejected',async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(),'atelier-paste-test-'));
  t.after(() => fs.rmSync(directory,{recursive:true,force:true}));
  const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aI9sAAAAASUVORK5CYII=','base64');
  let empty=false,large=false;
  const invoke=openStore(directory,{clipboard:{read:async()=>empty ? [] : [{types:['image/png'],getType:async()=>new Blob([bytes])}],readText:async()=>'复制的提示词'},nativeImage:{createFromBuffer:()=>({isEmpty:()=>false,getSize:()=>({width:large?10000:1,height:large?10000:1}),toPNG:()=>bytes})}});
  const category=invoke('create-category','粘贴图片测试').category;
  const image=await invoke('paste-image',category.id);
  assert.ok(image.file.endsWith('.png'));
  assert.equal(image.name,'粘贴图片.png');
  assert.equal(image.url,'');
  assert.ok(fs.existsSync(path.join(directory,'data','images',image.file)));
  assert.ok(invoke('snapshot').gallery[0].categoryFolderIds.includes(category.id));
  empty=true;
  await assert.rejects(invoke('paste-image',category.id),/剪贴板中没有图片/);
  empty=false;large=true;
  await assert.rejects(invoke('paste-image',category.id),/尺寸过大/);
  assert.equal(await invoke('read-prompt-clipboard'),'复制的提示词');
  assert.equal(invoke('snapshot').gallery.length,1);
});

test('draft word switches survive category changes and restart while history uses only enabled words',t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(),'atelier-word-test-'));
  t.after(() => fs.rmSync(directory,{recursive:true,force:true}));
  let invoke = openStore(directory);
  const draft = {...blank('森林，水彩'),bodyTokens:{source:'森林，白色衬衫，水彩',disabled:[1]}};
  invoke('draft',draft,null);
  const category = invoke('create-category','测试词块').category;
  invoke('switch-category',category.id);
  invoke('switch-category',null);
  assert.equal(invoke('snapshot').draft.bodyTokens.source,draft.bodyTokens.source);
  invoke = openStore(directory);
  assert.deepEqual([...invoke('snapshot').draft.bodyTokens.disabled],[1]);
  const saved = invoke('save',invoke('snapshot').draft);
  assert.equal(saved.entry.body,'森林，水彩');
  assert.equal(saved.entry.prompt,'森林，水彩');
  assert.equal(saved.draft.bodyTokens.source,draft.bodyTokens.source);
});

test('categories preserve separate drafts, legacy records and shared gallery folders across restarts',t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(),'atelier-category-test-'));
  t.after(() => fs.rmSync(directory,{recursive:true,force:true}));
  const dataDir = path.join(directory,'data');
  fs.mkdirSync(dataDir);
  fs.writeFileSync(path.join(dataDir,'library.json'),JSON.stringify({
    settings:{autoClassify:false},draft:blank('旧草稿'),
    entries:[{...blank('旧提示词'),id:'legacy',status:'local'}]
  }));
  let invoke = openStore(directory);
  assert.equal(invoke('snapshot').entries[0].categoryId,'');
  const a = invoke('create-category','角色设定').category;
  const b = invoke('create-category','建筑参考').category;
  assert.equal(invoke('snapshot').galleryGroups.find(group => group.id === a.id).name,a.name);
  assert.throws(() => invoke('create-category','角色设定'),/未使用/);
  invoke('draft',blank('旧草稿'),null);
  invoke('switch-category',a.id);
  assert.equal(invoke('snapshot').draft,null);
  const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aI9sAAAAASUVORK5CYII=','base64');
  const image = invoke('image',bytes,'共用图片.png','','',a.id);
  const first = {...blank('白狐，黑色长发，水彩',a.id),title:'角色',images:{ref:[],style:[],result:[image]}};
  const saved = invoke('save',first).entry;
  assert.equal(saved.categoryId,a.id);
  invoke('switch-category',b.id);
  invoke('draft',blank('城堡草稿',b.id),b.id);
  invoke('save-variant',{...blank('城堡，砖墙',b.id),images:{ref:[image],style:[],result:[]}});
  assert.equal(invoke('snapshot').gallery.length,1);
  assert.deepEqual([...invoke('snapshot').gallery[0].categoryFolderIds].sort(),[a.id,b.id].sort());
  invoke('switch-category',a.id);
  assert.equal(invoke('snapshot').draft.id,saved.id);
  // A delayed autosave must return to its original draft slot.
  invoke('draft',blank('城堡更新草稿',b.id),b.id);
  assert.equal(invoke('snapshot').draft.title,'角色');
  invoke = openStore(directory);
  assert.equal(invoke('snapshot').activeCategoryId,a.id);
  assert.equal(invoke('snapshot').draft.title,'角色');
  assert.deepEqual([...invoke('snapshot').gallery[0].categoryFolderIds].sort(),[a.id,b.id].sort());
  invoke('switch-category',b.id);
  assert.equal(invoke('snapshot').draft.body,'城堡更新草稿');
  invoke('switch-category',null);
  assert.equal(invoke('snapshot').draft.body,'旧草稿');
  assert.equal(invoke('snapshot').entries.length,3);
  invoke('delete-gallery-image',image.file);
  assert.equal(invoke('snapshot').gallery.length,0);
  assert.ok(invoke('snapshot').entries.every(entry => Object.values(entry.images).every(images => images.length === 0)));
  invoke('switch-category',a.id);
  assert.equal(invoke('snapshot').draft.images.result.length,0);
});
