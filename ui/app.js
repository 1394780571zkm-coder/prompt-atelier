const $ = selector => document.querySelector(selector);
const {categories,parameters,personSubjects,elementBranches,elementPath,elementDescendants,publicUrl,parsePrompt,formatPrompt,removeImageReferences,styleKeys,styleReferenceTokens,styleReferenceUrl,styleReferenceValue,referenceImage,chineseElementTerm,termExampleEntries,imageUsageEntries} = globalThis.promptRules;
const api = window.desktop;
const {splitPromptBody,composeSplitterBody,bodyTokenState,draftBodyParts,validFragment} = globalThis.promptRules;
const labels = {editor:'提示词编写',splitter:'提示词拆分台',history:'历史记录',library:'提示词库',gallery:'图库',guide:'参数教程',settings:'设置'};
const roles = {ref:['垫图','提示词前缀'],style:['风格参考','--sref'],result:['生成结果','本地归档']};
const groupLabel = (key,groups=categories) => key === 'person' ? '人物' : groups.find(([group]) => group === key)?.[1].replace('人物 · ','') || key;
const overviewLabels = {environment:'场景概览',indoor:'室内空间',medium:'创作媒介'};
const tools = {elements:['画面元素','shapes'],styles:['风格包','swatch-book'],params:['后缀参数','sliders-horizontal']};
const state = {view:'editor',tab:'elements',group:'subject',snapshot:null,draft:null,categoryBusy:false,fileRole:'ref',saveTimer:0,toastTimer:0,saving:false,imports:0,removeKey:false,paramSearch:'',guideSearch:'',guideGroup:'全部',historyMode:false,historyEdits:new Map()};
let bodyInput = null;
const draftTokenClicks = new Map();
let renderedDraftTokenOwner = null;
const incomingImages = new Set();
let gallery = [];
let galleryGroup = null;
let galleryBusy = false;
const historySelection = new Set();
let historyDeleting = false;
let randomMode = false;
const randomDraft = new Map();
const pendingImages = new Map();
const failedImages = new Map();
const scopedImageKey = (scope,url) => (scope || '')+'\n'+url;
const blank = () => ({id:'',categoryId:state.snapshot?.activeCategoryId || '',title:'',body:'',params:[],images:{ref:[],style:[],result:[]},hints:{},person:[]});
const translations = new Map();
let translationJob = null;
let translationError = null;
let translationReady = false;
let queuedTranslation = '';
let draftTranslationTimer = 0;
let scheduledTranslationBody = '';
let associationAnchor = null;
let associationShowTimer = 0;
let associationHideTimer = 0;

function node(tag, props={}, ...children) {
  const el = document.createElement(tag);
  Object.assign(el,props);
  el.append(...children.filter(value => value !== null && value !== undefined));
  return el;
}

function icon(name) {
  return node('img',{className:'icon',src:'../node_modules/lucide-static/icons/'+name+'.svg',alt:'',draggable:false});
}

function button(text,action,classes='button',glyph='') {
  const el = node('button',{type:'button',className:classes,onclick:action});
  if (glyph) el.append(icon(glyph));
  if (text) el.append(text);
  return el;
}

function small(text) { return node('p',{className:'empty-inline',textContent:text}); }
function normalize(text) { return text.trim().toLocaleLowerCase().replace(/\s+/g,' '); }
function nameOf(entry) { return entry.title || entry.body.slice(0,52)+(entry.body.length>52?'…':''); }
function getEntry() { return state.snapshot.entries.find(entry => entry.id === state.draft.id); }
function categoryName(id) { return state.snapshot.promptCategories.find(category => category.id === id)?.name || '未分类'; }
function scopedEntries() {
  const {activeCategoryId,entries} = state.snapshot;
  return activeCategoryId === null ? entries : entries.filter(entry => entry.categoryId === activeCategoryId);
}
function errorMessage(error) { return String(error.message || error).replace(/^Error invoking remote method '[^']+': (Error: )?/,''); }

function toast(message,error=false) {
  const el = $('#toast');
  el.textContent = typeof message === 'string' ? message : errorMessage(message);
  el.hidden = false;
  el.classList.toggle('error',error);
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => { el.hidden = true; },error ? 6800 : 2700);
}

function refreshSnapshot(snapshot) {
  hideAssociationPreview();
  state.snapshot = snapshot;
  if (snapshot.gallery) gallery = snapshot.gallery;
  $('#history-count').textContent = scopedEntries().length;
  renderCategories();
  const apiStatus = $('#api-status');
  apiStatus.classList.toggle('ready',snapshot.settings.hasKey);
  apiStatus.replaceChildren(node('span',{className:'dot'}),snapshot.settings.hasKey ? 'DeepSeek 已配置' : '配置 DeepSeek');
  if (state.view === 'editor') {
    renderComposer();
    renderAssets();
    updatePreview();
  }
  if (state.view === 'history' && !state.historyEdits.size) renderHistory();
  if (state.view === 'library') renderLibrary();
  if (state.view === 'gallery') renderGallery();
}

function showView(view) {
  hideAssociationPreview();
  state.view = view;
  for (const element of document.querySelectorAll('.view')) element.hidden = element.id !== view;
  for (const element of document.querySelectorAll('.sidebar [data-view]')) {
    element.classList.toggle('active',element.dataset.view === view);
    if (element.dataset.view === view) element.setAttribute('aria-current','page');
    else element.removeAttribute('aria-current');
  }
  $('#page-label').textContent = labels[view];
  renderCategories();
  if (view === 'editor') renderDraft();
  if (view === 'history') renderHistory();
  if (view === 'library') renderLibrary();
  if (view === 'gallery') renderGallery();
  if (view === 'guide') renderGuide();
  if (view === 'settings') renderSettings();
  window.scrollTo(0,0);
}

function renderCategories() {
  const section = $('#prompt-categories');
  const anchor = ['editor','splitter','history','library'].includes(state.view) && $('#'+state.view+' > :first-child');
  section.hidden = !anchor;
  if (!anchor) return;
  if (anchor.nextElementSibling !== section) anchor.after(section);
  const {activeCategoryId,promptCategories} = state.snapshot;
  const options = [{id:null,name:'全部'},{id:'',name:'未分类'},...promptCategories];
  const switcher = $('#category-switcher');
  const signature = JSON.stringify([options,activeCategoryId,state.categoryBusy]);
  if (switcher.dataset.signature === signature) return;
  switcher.dataset.signature = signature;
  switcher.replaceChildren(...options.map(({id,name}) => {
    const selected = activeCategoryId === id;
    const control = button(name,() => void selectCategory(id),'chip'+(selected?' on':''));
    control.setAttribute('aria-pressed',String(selected));
    control.disabled = state.categoryBusy;
    return control;
  }));
  $('[data-action=new-category]').disabled = state.categoryBusy;
}

async function selectCategory(id,create=false) {
  if (state.categoryBusy || state.saving || state.imports || galleryBusy || historyDeleting) return toast('请等当前操作完成。',true);
  if (!create && id === state.snapshot.activeCategoryId) return;
  state.categoryBusy = true;
  $('#body').disabled = $('#title').disabled = true;
  renderCategories();
  updatePreview();
  try {
    commitBodyInput();
    await persistDraft({throwOnError:true});
    if (create) {
      const result = await api.createCategory(id);
      id = result.category.id;
      $('#modal').close();
    }
    const data = await api.switchCategory(id);
    state.snapshot = data;
    state.draft = withStyleLinks(data.draft || blank());
    bodyInput = null;
    state.group = 'subject';
    randomDraft.clear();
    historySelection.clear();
    globalThis.resetScopedSplitter?.();
    if (state.view === 'editor') renderDraft();
    hydrateDraftImages();
    refreshSnapshot(data);
    if (state.view === 'history' && state.historyEdits.size) renderHistory();
  } catch (error) { toast(error,true); }
  finally {
    state.categoryBusy = false;
    $('#body').disabled = $('#title').disabled = false;
    renderCategories();
    updatePreview();
  }
}

function categoryDialog() {
  const input = node('input',{className:'dialog-field',placeholder:'例如 角色设定、建筑参考',maxLength:40,required:true});
  input.setAttribute('aria-label','分类名称');
  openDialog('新建提示词分类',dialogForm(input,'创建并切换',name => {
    void selectCategory(name,true);
    return false;
  }));
}

const guideEntries = [
  {key:'ar',group:'构图',title:'画面比例',tag:'--ar',summary:'决定画布的宽高关系，也会改变模型分配主体与留白的方式。',use:'先按发布渠道选画幅：人物海报偏竖、风景与分镜偏横、商品与头像常用方形。',values:['1:1 方形','16:9 横向叙事','9:16 竖版人物','4:5 信息流'],example:'雨夜列车站台 --ar 16:9',visual:'ratio',tip:'复杂场景给横向比例更多展开空间；单人肖像先试 2:3、4:5 或 9:16。'},
  {key:'v',group:'模型',title:'模型版本',tag:'--v',summary:'切换不同代际的基础模型；版本变化会影响细节、提示词理解与复杂构图稳定性。',use:'同一提示词分别试新版与旧版，选择更适合项目的解释方式，再固定版本继续细调。',values:['--v 5.2 细节与光影','--v 6 / 6.1 复杂构图','--niji 5 / 6 动漫表达'],example:'高对比度超现实拼贴画 --v 6.1',visual:'model',tip:'不要把 --v 与 --niji 同时堆叠；动漫角色和日式漫画优先从 niji 开始。'},
  {key:'s',group:'风格',title:'风格化强度',tag:'--s',summary:'控制模型主动加入审美风格的力度。值低更听从具体描述，值高更有艺术化取舍。',use:'产品、结构、指定材质等需要可控性时降低；海报、概念图、氛围插画可逐步调高。',values:['50 描述优先','100 常用起点','250 风格更明显','750 强烈艺术化'],example:'植物标本插画，柔和侧光 --s 250',visual:'stylize',tip:'用 100 作为基线，按 50 → 250 → 750 递进测试，比直接猜一个极端值更可靠。'},
  {key:'c',group:'微调',title:'变化幅度',tag:'--c / --chaos',summary:'影响首轮网格的发散程度。数值越高，构图和意外性通常越大。',use:'需要稳定方案时保持低值；找灵感、想得到更多构图候选时提高数值。',values:['0 稳定基线','10 轻微变化','25 多一些可能','50–100 强发散'],example:'银色贝壳，粉绿镶嵌 --c 25',visual:'chaos',tip:'先在低 chaos 找到满意方向，再提高一点寻找变体，避免一次丢失原本可用的构图。'},
  {key:'q',group:'微调',title:'质量与速度',tag:'--q',summary:'在支持的模型中用于调节生成所用的计算量；高值通常更慢，也可能消耗更多额度。',use:'探索阶段优先较低档；确定构图和提示词后，再用模型支持的较高档出最终版。',values:['0.25 快速草图','0.5 快速预览','1 常用基线','2 细节检查'],example:'牡丹木刻版画，复杂线条 --q 1',visual:'quality',tip:'质量参数不是“越大越好”；先确认当前模型和平台实际支持的档位。'},
  {key:'seed',group:'微调',title:'随机种子',tag:'--seed',summary:'给生成设定随机起点，方便把“运气”固定下来做可重复的对照实验。',use:'选到喜欢的构图后记录 seed；保持 seed 不变，只改一个词或参数来观察差异。',values:['固定：便于对照','改词：检查语义影响','改参数：检查控制效果'],example:'青瓷猫头鹰水罐 --seed 12345',visual:'seed',tip:'相同种子不保证像素级完全一致，但通常有助于保留相近的布局和整体方向。'},
  {key:'no',group:'构图',title:'排除元素',tag:'--no',summary:'写明不希望出现的对象、颜色或视觉元素，降低它们出现的概率。',use:'把最影响成片的干扰项放进去，例如人物、文字、水印、车辆等。',values:['--no people','--no text, watermark','--no red'],example:'雾林清晨，阳光穿过树冠 --no people, cars',visual:'no',tip:'它是倾向控制而非绝对屏蔽；结果仍出现时，可同时强化你真正想要的主体描述。'},
  {key:'tile',group:'构图',title:'无缝平铺',tag:'--tile',summary:'让图像边缘适合重复拼接，常用于壁纸、织物、包装纹样和材质贴图。',use:'描述中明确图案单位、密度和颜色；生成后用四宫格平铺检查接缝。',values:['纹样','织物','壁纸','材质贴图'],example:'彩色水彩秋叶图案 --tile',visual:'tile',tip:'避免强调中心主体或单一边缘元素，这会让重复后显得突兀。'},
  {key:'iw',group:'参考图',title:'垫图权重',tag:'--iw',summary:'调节提示词前置图片对结果的影响。值高更贴近输入图的构图或视觉信息。',use:'上传垫图后，从 1 附近开始；需要保留构图时加大，想以文字为主时降低。',values:['低：文字主导','1：均衡起点','高：更贴近垫图'],example:'[图片链接] 花瓶静物，杂志摄影 --iw 1.5',visual:'weight',tip:'不同模型的支持范围不同；参考图本身越干净、主体越明确，权重越容易发挥作用。'},
  {key:'sref',group:'参考图',title:'风格参考与风格权重',tag:'--sref / --sw',summary:'用参考图传递色彩、质感和画风；--sw 决定这种风格影响的强弱。',use:'把内容写在正文、把视觉气质交给风格图。多张图可混合，但先从一张清晰样图开始。',values:['--sref 图片链接','--sref random','--sw 100 基线','--sw 500 更强'],example:'陶瓷狐狸雕塑 --sref 图片链接 --sw 250',visual:'styleRef',tip:'风格参考不等于复制主体。想保留某个人物，应使用角色参考而不是只用 sref。'},
  {key:'cref',group:'参考图',title:'角色参考与角色权重',tag:'--cref / --cw',summary:'帮助维持角色身份特征；cw 低时偏脸部，高时会更多带入发型、服饰等信息。',use:'优先使用单人、面部清楚、光线稳定的参考图；先固定人物，再改变场景与服装。',values:['--cref 图片链接','--cw 0 偏脸部','--cw 50 均衡','--cw 100 含服饰'],example:'咖啡馆里的男人，插画风 --cref 图片链接 --cw 50',visual:'character',tip:'真人照片和精细徽标等仍可能变形；不要把它当作精确复制工具。'}
];

function guideVisual(type) {
  const el = node('div',{className:'guide-visual '+type,'aria-hidden':'true'});
  if (type === 'ratio') el.append(node('i'),node('i'),node('i'));
  else if (type === 'stylize') el.append(...['描述','平衡','艺术'].map((text,index) => node('span',{style:'--level:'+(index + 1),textContent:text})));
  else if (type === 'chaos') el.append(...Array.from({length:12},(_,index) => node('i',{style:'--i:'+index})));
  else if (type === 'quality') el.append(...[25,50,75,100].map(level => node('span',{style:'--q:'+level,textContent:level+'%'})));
  else if (type === 'seed') el.append(node('strong',{textContent:'12345'}),node('strong',{textContent:'12345'}),node('strong',{textContent:'12345'}));
  else if (type === 'no') el.append(node('span',{textContent:'人物'}),node('b',{textContent:'×'}),node('span',{textContent:'文字'}));
  else if (type === 'tile') el.append(...Array.from({length:9},() => node('i')));
  else if (type === 'weight' || type === 'styleRef' || type === 'character') el.append(node('div',{className:'visual-source'}),node('div',{className:'visual-arrow',textContent:'→'}),node('div',{className:'visual-result'}));
  else el.append(node('span',{textContent:'模型 A  →  模型 B'}));
  return el;
}

function renderGuide() {
  const filters = $('#guide-filters');
  const groups = ['全部',...new Set(guideEntries.map(entry => entry.group))];
  filters.replaceChildren(...groups.map(group => button(group,() => { state.guideGroup = group; renderGuide(); },'chip'+(state.guideGroup === group?' on':''))));
  const query = normalize(state.guideSearch);
  const entries = guideEntries.filter(entry => (state.guideGroup === '全部' || entry.group === state.guideGroup) && (!query || normalize([entry.key,entry.title,entry.tag,entry.summary,entry.use,entry.tip,...entry.values].join(' ')).includes(query)));
  const list = $('#guide-list');
  list.replaceChildren(...(entries.length ? entries.map(entry => {
    const card = node('article',{className:'guide-card card'});
    const heading = node('div',{className:'guide-card-head'},node('div',{},node('span',{className:'guide-group',textContent:entry.group}),node('h2',{textContent:entry.title}),node('code',{textContent:entry.tag})),guideVisual(entry.visual));
    const action = button('带入示例',() => { const sample = parsePrompt(entry.example.replace(/^\[[^\]]+\]\s*/, '')); state.draft.body = sample.body; state.draft.params = [...new Map([...state.draft.params,...sample.params])]; showView('editor'); changed({full:true}); toast('已将示例带入草稿，可继续调整。'); },'button quiet','wand-sparkles');
    const values = node('div',{className:'guide-values'},...entry.values.map(value => node('span',{textContent:value})));
    card.append(heading,node('p',{className:'guide-summary',textContent:entry.summary}),node('div',{className:'guide-detail'},node('div',{},node('h3',{textContent:'怎么用'}),node('p',{textContent:entry.use})),node('div',{},node('h3',{textContent:'推荐尝试'}),values)),node('div',{className:'guide-example'},node('code',{textContent:entry.example}),action),node('p',{className:'guide-tip',textContent:'练习提示：'+entry.tip}));
    return card;
  }) : [node('div',{className:'empty-card card'},node('h2',{textContent:'没有找到匹配的教程'}),node('p',{textContent:'试试搜索“比例”、“人物”或“随机”。'}))]));
}

function renderDraft() {
  renderBody();
  if ($('#title').value !== state.draft.title) $('#title').value = state.draft.title;
  renderComposer();
  renderAssets();
  updatePreview();
}

function renderBody() {
  if (bodyInput !== null) return;
  const text = draftBodyParts(state.draft).map(part => part.text).join('');
  const field = $('#body');
  if (field.value !== text) {
    const {selectionStart,selectionEnd} = field;
    field.value = text;
    if (document.activeElement === field) field.setSelectionRange(selectionStart,selectionEnd);
  }
}

function renderDraftTokens(draft) {
  const parts = draftBodyParts(draft);
  const tokens = parts.filter(part => part.original);
  draft.bodyTokens = bodyTokenState(parts);
  if (bodyInput === null) state.draft.bodyTokens = draft.bodyTokens;
  $('#body').hidden = false;
  $('#draft-tokens').hidden = !tokens.length;
  const signature = JSON.stringify([parts,state.categoryBusy]);
  const host = $('#draft-tokens');
  if (host.dataset.signature === signature && renderedDraftTokenOwner === state.draft) return;
  host.dataset.signature = signature;
  renderedDraftTokenOwner = state.draft;
  const currentDraft = state.draft;
  const apply = (index,edit) => {
    if (state.draft !== currentDraft || state.categoryBusy) return;
    materializePrompt();
    const latest = draftBodyParts(state.draft);
    const word = latest.filter(part => part.original)[index];
    if (!word || word.text !== tokens[index]?.text) return;
    edit(word);
    const normalized = latest.flatMap(part => part.original ? splitPromptBody(part.text).map(item => item.original ? {...item,enabled:part.enabled} : item) : [part]);
    const raw = normalized.map(part => part.text).join('');
    if (raw.length > 24000) return toast('草稿全部词块不能超过 24000 字符。',true);
    state.draft.body = composeSplitterBody(normalized).trim();
    state.draft.bodyTokens = bodyTokenState(normalized);
    changed({full:true});
  };
  host.replaceChildren(...tokens.map((part,index) => {
    const chip = button('',null,'draft-token'+(part.enabled === false ? ' is-off' : ''));
    chip.append(node('span',{className:'draft-token-light',textContent:part.enabled === false ? '○' : '●'}),node('span',{textContent:part.text}));
    chip.setAttribute('aria-pressed',String(part.enabled !== false));
    chip.setAttribute('aria-label',part.text+'；单击开关，双击修改');
    chip.title = '单击点亮 / 点灭 · 双击或 F2 修改';
    chip.disabled = state.categoryBusy;
    const cancel = () => { clearTimeout(draftTokenClicks.get(index)); draftTokenClicks.delete(index); };
    const toggle = () => {
      cancel();
      apply(index,word => { word.enabled = word.enabled === false; });
      host.children[index]?.focus({preventScroll:true});
    };
    const edit = () => {
      cancel();
      if (state.draft !== currentDraft || state.categoryBusy) return;
      const field = node('textarea',{className:'dialog-field',value:part.text,rows:3,maxLength:24000});
      field.setAttribute('aria-label','编辑草稿词块');
      openDialog('修改草稿词块',node('div',{className:'splitter-suggestions'},field,
        button('应用修改',() => {
          const value = field.value.trim();
          // Retain Midjourney weights, while keeping links and suffix parameters separate.
          const unweighted = value.replace(/::[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?=\s|$)/g,'');
          if (value !== part.text && !validFragment(unweighted)) return toast('请填写正文词块，图片链接和后缀参数请在对应区域修改。',true);
          if (value.length-part.text.length+parts.map(item => item.text).join('').length > 24000) return toast('草稿不能超过 24000 字符。',true);
          apply(index,word => { word.text = value; word.original = value; });
          $('#modal').close();
        },'button forest')));
      field.focus();
      field.select();
    };
    chip.onclick = event => {
      cancel();
      if (event.detail === 0) toggle();
      else if (event.detail === 1) draftTokenClicks.set(index,setTimeout(toggle,300));
    };
    chip.ondblclick = edit;
    chip.onkeydown = event => { if (event.key === 'F2') { event.preventDefault(); edit(); } };
    return chip;
  }));
}

function withStyleLinks(draft) {
  const style = [...draft.images.style];
  const urls = new Set(style.map(image => image.url));
  for (const token of styleReferenceTokens(new Map(draft.params).get('sref'))) {
    const image = referenceImage(token,'风格参考链接');
    if (image.url && !urls.has(image.url) && style.length < 100) { style.push(image); urls.add(image.url); }
  }
  return {...draft,images:{...draft.images,style}};
}

function applyPrompt(draft,text,replace=false) {
  const parsed = parsePrompt(text);
  const parts = splitPromptBody(parsed.body);
  const previous = new Map();
  if (!replace) for (const part of draftBodyParts(draft)) if (part.original) {
    if (!previous.has(part.text)) previous.set(part.text,[]);
    previous.get(part.text).push(part.enabled !== false);
  }
  for (const part of parts) if (part.original) part.enabled = previous.get(part.text)?.shift() ?? true;
  const ref = [...draft.images.ref];
  const params = new Map([...(replace ? [] : draft.params),...parsed.params]);
  const incomingStyle = parsed.params.find(([key]) => key === 'sref');
  const existingStyle = styleReferenceValue(draft);
  if (incomingStyle) params.set('sref',[...new Set([...styleReferenceTokens(existingStyle),...styleReferenceTokens(incomingStyle[1])])].join(' '));
  else if (existingStyle) params.set('sref',existingStyle);
  for (const token of parsed.refs) {
    const image = referenceImage(token,'垫图链接');
    const existing = ref.findIndex(item => item.url === image.url);
    if (existing < 0 && ref.length < 100) ref.push(image);
    else if (existing >= 0 && image.weight) ref[existing] = {...ref[existing],weight:image.weight};
  }
  const style = [...draft.images.style];
  return withStyleLinks({...draft,body:composeSplitterBody(parts).trim(),bodyTokens:bodyTokenState(parts),params:[...params],images:{...draft.images,ref,style,result:replace ? [] : draft.images.result},person:replace ? [] : draft.person});
}

function effectiveDraft() {
  return bodyInput === null ? state.draft : applyPrompt(state.draft,bodyInput);
}

function persistDraft({throwOnError=false}={}) {
  clearTimeout(state.saveTimer);
  state.saveTimer = 0;
  return api.draft(effectiveDraft(),state.snapshot.activeCategoryId).then(() => { $('#draft-state').textContent = '草稿已保存到本地'; }).catch(error => {
    if (throwOnError) throw error;
    toast(error,true);
  });
}

function changed({full=false}={}) {
  $('#draft-state').textContent = '正在保存草稿…';
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(persistDraft,220);
  if (full) renderDraft();
  else updatePreview();
}

function commitBodyInput() {
  if (bodyInput === null) return;
  state.draft = effectiveDraft();
  bodyInput = null;
}

function materializePrompt() {
  if (bodyInput === null) return;
  commitBodyInput();
  renderBody();
  changed();
  hydrateDraftImages();
}

function updatePreview() {
  const d = effectiveDraft();
  renderDraftTokens(d);
  renderTranslation(d.body);
  scheduleDraftTranslation(d.body);
  const prompt = formatPrompt(d);
  const preview = $('#final-prompt');
  preview.textContent = prompt || '填写画面描述后，这里会组合成可复制的 Midjourney 提示词。';
  preview.classList.toggle('placeholder',!prompt);
  $('#char-count').textContent = d.body.length+' 字符';
  const prepared = $('#prepared-parts');
  const prefix = d.images.ref.filter(image => image.url && !image.previewOnly).map(image => image.url+(image.weight ? '::'+image.weight : '')).join(' ');
  const params = new Map(d.params);
  const sref = styleReferenceValue(d);
  if (sref) params.set('sref',sref);
  else params.delete('sref');
  const signature = JSON.stringify([prefix,[...params]]);
  prepared.hidden = false;
  if (prepared.dataset.signature !== signature) {
    prepared.dataset.signature = signature;
    prepared.replaceChildren(
      ...(prefix ? [node('div',{},node('span',{textContent:'垫图前缀'}),node('code',{textContent:prefix}))] : []),
      node('div',{},node('span',{textContent:'后缀参数'}),node('div',{className:'prepared-controls'},...Array.from(params,([key,value]) => {
        const [,label='自定义参数',...choices] = parameters.find(row => row[0] === key) || [];
        const control = button('',() => { void recordParameterUse(key); paramDialog(key,label,choices); },'chip prepared-param');
        control.append(node('code',{textContent:'--'+key+(value?' '+value:'')}));
        control.title = '调整 '+label+' · --'+key;
        const remove = button('',() => setParam(key,null),'prepared-remove','x');
        remove.title = '移除 --'+key;
        remove.setAttribute('aria-label',remove.title);
        return node('span',{className:'prepared-param-wrap'},control,remove);
      }),button('添加参数',() => {
        state.tab = 'params';
        renderComposer();
        $('#param-search')?.focus();
      },'chip','plus'))));
  }
  const missing = ['ref','style'].flatMap(role => d.images[role].filter(needsImageUrl).map(image => [role,image]));
  const warning = $('#url-warning');
  warning.hidden = !missing.length;
  const warningKey = JSON.stringify(missing.map(([role,image]) => [role,image.file,image.name]));
  if (warning.dataset.signature !== warningKey) {
    warning.dataset.signature = warningKey;
    warning.replaceChildren(node('p',{textContent:'这些参考图没有图片链接，复制时会跳过。'}),node('div',{className:'missing-links'},...missing.map(([role,image]) =>
      button(roles[role][0]+' · '+image.name,() => showMissingLink(role,image),'chip','link'))));
  }
  const entry = getEntry();
  const status = $('#save-status');
  const destination = categoryName(d.categoryId);
  status.textContent = entry ? '已归档 · '+(statusLabels[entry.status] || statusLabels.local)+' · '+destination : '保存到「'+destination+'」 · Ctrl + S';
  $('[data-action=save]').lastChild.textContent = entry ? '更新历史记录' : '保存到历史';
  $('[data-action=save]').disabled = !d.body || state.categoryBusy || state.saving || state.imports > 0;
  $('[data-action=copy]').disabled = !d.body;
  $('[data-action=classify-saved]').hidden = !entry || entry.body !== d.body || !state.snapshot.settings.hasKey || ['ai','pending'].includes(entry.status);
}

function renderTranslation(body) {
  const panel = $('#draft-translation');
  const letters = body.match(/\p{L}/gu) || [];
  const foreign = letters.filter(char => !/\p{Script=Han}/u.test(char)).length;
  panel.hidden = foreign === 0 || (foreign !== letters.length && foreign < Math.max(4,letters.length/5));
  if (panel.hidden) return;
  const status = $('#translation-status');
  const output = $('#translation-text');
  const result = translations.get(body);
  const running = translationJob?.body === body;
  status.textContent = running ? translationJob.status
    : translationError?.body === body ? translationError.message
    : translationJob ? '正在处理上一条译文…'
    : result ? ''
    : translationReady ? '输入暂停后自动翻译成中文。'
    : '输入暂停后自动翻译；首次使用会下载所需语言模型。';
  $('#translate-draft').disabled = Boolean(translationJob) || Boolean(result);
  $('#translate-draft').hidden = Boolean(result);
  output.hidden = !result;
  if (output.textContent !== (result || '')) output.textContent = result || '';
}

async function translateDraft() {
  clearTimeout(draftTranslationTimer);
  draftTranslationTimer = 0;
  const {body} = effectiveDraft();
  if ($('#draft-translation').hidden || translationJob || translations.has(body)) return;
  translationError = null;
  translationJob = {body,status:'正在加载本地翻译模型…'};
  renderTranslation(body);
  try {
    const result = await api.translatePrompt(body);
    translationReady = true;
    translations.set(body,result);
    if (translations.size > 30) translations.delete(translations.keys().next().value);
  } catch (error) { translationError = {body,message:errorMessage(error)}; }
  finally {
    translationJob = null;
    const current = effectiveDraft().body;
    renderTranslation(current);
    const queued = queuedTranslation;
    queuedTranslation = '';
    if (queued === current && queued !== body) scheduleDraftTranslation(current,0);
  }
}

function translateImportedDraft() {
  scheduleDraftTranslation(effectiveDraft().body,250);
}

function scheduleDraftTranslation(body,delay=650) {
  if (translationJob) queuedTranslation = translationJob.body === body ? '' : body;
  if ($('#draft-translation').hidden || !body.trim() || translations.has(body) || translationError?.body === body || state.categoryBusy) {
    clearTimeout(draftTranslationTimer);
    draftTranslationTimer = 0;
    return;
  }
  if (translationJob || scheduledTranslationBody === body && draftTranslationTimer) return;
  clearTimeout(draftTranslationTimer);
  scheduledTranslationBody = body;
  draftTranslationTimer = setTimeout(() => {
    draftTranslationTimer = 0;
    if (effectiveDraft().body === body && !state.categoryBusy) void translateDraft();
  },delay);
}

function translationProgress(progress) {
  if (!translationJob) return;
  if (progress.stage === 'loading') translationJob.status = '正在加载本地翻译模型…';
  if (progress.stage === 'download') translationJob.status = '正在准备模型 · '+(progress.file === 1 ? '编码器' : '解码器')+' '+progress.percent+'%';
  if (progress.stage === 'translating') {
    translationJob.status = '正在翻译…'+(progress.total > 1 ? ' '+progress.current+'/'+progress.total : '');
  }
  renderTranslation(effectiveDraft().body);
}

function newDraft() {
  if (state.categoryBusy || state.saving || state.imports) return toast('请等当前操作完成。',true);
  materializePrompt();
  const current = state.draft;
  const sref = styleReferenceValue(current);
  replaceDraft({...blank(),params:sref ? [['sref',sref]] : [],images:{ref:structuredClone(current.images.ref),style:structuredClone(current.images.style),result:[]}});
  $('#body').focus();
}

function replaceDraft(value) {
  if (state.categoryBusy) return;
  bodyInput = null;
  randomDraft.clear();
  state.draft = structuredClone(value);
  showView('editor');
  void persistDraft();
  hydrateDraftImages();
}

function useEntry(entry,reuse=false,addResult=false) {
  if (state.categoryBusy || state.saving || state.imports) return toast('请等当前操作完成。',true);
  replaceDraft({id:reuse?'':entry.id,categoryId:entry.categoryId,title:entry.title,body:entry.body,params:entry.params,images:{...entry.images,result:reuse?[]:entry.images.result},hints:entry.hints,person:entry.person});
  if (addResult) pickFiles('result');
}

function addTerms(terms,sourceGroup) {
  materializePrompt();
  const d = state.draft;
  const existing = new Set(d.body.split(/[,，;；。\n]+/).map(normalize));
  const added = terms.filter(term => !existing.has(normalize(term)));
  if (!added.length) return toast('这些词条已经在草稿里。');
  d.body = [d.body.trim().replace(/[,，;；]+$/,''),...added].filter(Boolean).join(', ');
  if (sourceGroup) d.hints[sourceGroup] = [...new Set([...(d.hints[sourceGroup] || []),...added])];
  changed({full:true});
  if (state.view !== 'editor') toast('已加入当前草稿');
}

function elementGroups() {
  const groups = new Map(categories.map(row => [row[0],row]));
  for (const entry of scopedEntries()) {
    for (const [key,label] of Object.entries(entry.analysis?.groups || {})) {
      if (!groups.has(key)) groups.set(key,[key,label,'shapes',[]]);
    }
  }
  return [...groups.values()];
}

function libraryData({chineseElements=false}={}) {
  const terms = Object.fromEntries(elementGroups().map(([key]) => [key,new Map()]));
  const packs = new Map();
  for (const entry of scopedEntries()) {
    for (const [group,items] of Object.entries(entry.analysis?.tags || {})) {
      if (!terms[group]) continue;
      const displayTerms = chineseElements ? items.map(term => chineseElementTerm(term) || term) : items;
      for (const [key,term] of new Map(displayTerms.map(item => [normalize(item),item]))) {
        const row = terms[group].get(key) || {term,count:0};
        row.count++;
        terms[group].set(key,row);
      }
    }
    const style = [...new Map((entry.analysis?.style || []).map(term => [normalize(term),term])).values()];
    if (style.length) {
      const key = style.map(normalize).sort().join('\u0001');
      const row = packs.get(key) || {name:entry.analysis.name || style[0],style,count:0};
      row.count++;
      packs.set(key,row);
    }
  }
  return {terms,packs:[...packs.values()].sort((a,b) => b.count-a.count)};
}

function groupRows(group,groups,terms) {
  const learned = [...terms[group].values()].sort((a,b) => b.count-a.count);
  const seeds = groups.find(([key]) => key === group)[3].filter(term => !terms[group].has(normalize(term)));
  return [...learned,...seeds];
}

function rollGroup(root,groups,terms) {
  const picks = elementDescendants(root).filter(group => terms[group]).flatMap(group => {
    let choices = groupRows(group,groups,terms).map(row => typeof row === 'string' ? row : row.term);
    if (group === 'subject') choices = [...new Set([...personSubjects,...choices.filter(term => /男人|女人|男性|女性|女孩|男孩|少女|少年|人物|青年|老人|博士|植物学家|\b(?:man|woman|girl|boy|person|lady|gentleman)\b/i.test(term))])];
    return choices.length ? [{group,term:choices[Math.floor(Math.random()*choices.length)]}] : [];
  });
  if (picks.length) randomDraft.set(root,picks);
  else toast('这个分类还没有可选词条。');
  renderComposer();
}

function renderRandomDraft(topGroups) {
  const panel = node('div',{className:'random-preview'},node('h3',{textContent:'待导入组合'}));
  if (!randomDraft.size) {
    panel.append(small('点击一个或多个画面元素大类，每个分支会随机抽取一项。'));
    return panel;
  }
  for (const [root,picks] of randomDraft) {
    panel.append(node('div',{className:'random-selection'},node('strong',{textContent:topGroups.find(([key]) => key === root)[1]}),
      node('div',{className:'chips'},...picks.map(pick => {
        const control = button(pick.term,() => {
          const remaining = picks.filter(item => item !== pick);
          if (remaining.length) randomDraft.set(root,remaining);
          else randomDraft.delete(root);
          renderComposer();
        },'chip on');
        control.append(icon('x'));
        control.title = '移除 '+pick.term;
        bindTermExamples(control,pick.term,pick.group);
        return control;
      }))));
  }
  panel.append(button('导入到草稿',() => {
    materializePrompt();
    const seen = new Set(state.draft.body.split(/[,，;；。\n]+/).map(normalize));
    const added = [];
    for (const {group,term} of [...randomDraft.values()].flat()) {
      if (seen.has(normalize(term))) continue;
      seen.add(normalize(term));
      added.push(term);
      state.draft.hints[group] = [...new Set([...(state.draft.hints[group] || []),term])];
    }
    randomDraft.clear();
    if (added.length) addTerms(added);
    else { renderComposer(); toast('这些词条已经在草稿里。'); }
  },'button forest','plus'));
  return panel;
}

function termChips(rows,group) {
  const box = node('div',{className:'chips'});
  for (const item of rows) {
    const {term,count} = typeof item === 'string' ? {term:item,count:0} : item;
    const chip = button(term,() => addTerms([term],group),'chip');
    if (count) {
      chip.append(node('small',{textContent:'×'+count}));
      chip.title = '出现于 '+count+' 条历史记录';
    }
    bindTermExamples(chip,term,group);
    box.append(chip);
  }
  return box;
}

function bindTermExamples(control,term,group) {
  if (elementPath(group)[0] === 'person') return;
  bindAssociationPreview(control,() => {
    const entries = termExampleEntries(scopedEntries(),group,term);
    if (!entries.length) return null;
    return associationContents(term+' · 历史图片',entries.map(entry => exampleRecord(entry)));
  });
}

function bindAssociationPreview(control,contents,above=false) {
  const show = immediate => {
    clearTimeout(associationShowTimer);
    clearTimeout(associationHideTimer);
    associationShowTimer = setTimeout(() => {
      if (!control.isConnected || $('#modal').open) return;
      const content = contents();
      if (!content) return hideAssociationPreview();
      const panel = $('#association-preview');
      associationAnchor?.removeAttribute('aria-controls');
      associationAnchor = control;
      control.setAttribute('aria-controls',panel.id);
      panel.replaceChildren(content);
      panel.hidden = false;
      positionAssociationPreview(control,above);
    },immediate ? 0 : 220);
  };
  control.addEventListener('mouseenter',() => show(false));
  control.addEventListener('focus',() => show(true));
  control.addEventListener('mouseleave',scheduleAssociationHide);
  control.addEventListener('blur',event => {
    if (!$('#association-preview').contains(event.relatedTarget)) scheduleAssociationHide();
  });
  control.addEventListener('click',hideAssociationPreview);
}

function scheduleAssociationHide() {
  clearTimeout(associationShowTimer);
  clearTimeout(associationHideTimer);
  associationHideTimer = setTimeout(hideAssociationPreview,220);
}

function hideAssociationPreview() {
  clearTimeout(associationShowTimer);
  clearTimeout(associationHideTimer);
  associationAnchor?.removeAttribute('aria-controls');
  associationAnchor = null;
  const panel = $('#association-preview');
  if (panel) panel.hidden = true;
}

function positionAssociationPreview(control,above) {
  const panel = $('#association-preview');
  const rect = control.getBoundingClientRect();
  const height = panel.offsetHeight;
  const width = panel.offsetWidth;
  const bottomSpace = window.innerHeight-rect.bottom-20;
  const topSpace = rect.top-20;
  const placeAbove = above ? topSpace >= height || topSpace > bottomSpace : bottomSpace < height && topSpace > bottomSpace;
  panel.style.left = Math.max(12,Math.min(rect.left,window.innerWidth-width-12))+'px';
  panel.style.top = Math.max(12,Math.min(placeAbove ? rect.top-height-8 : rect.bottom+8,window.innerHeight-height-12))+'px';
}

function associationContents(title,records) {
  const close = button('',hideAssociationPreview,'button quiet','x');
  close.setAttribute('aria-label','关闭关联预览');
  return node('div',{},node('div',{className:'association-heading'},
    node('h3',{textContent:title}),close),node('div',{className:'association-records'},...records));
}

function exampleRecord(entry,usage=null) {
  const heading = node('div',{className:'association-record-heading'},
    node('strong',{textContent:nameOf(entry)}),
    node('span',{className:'badge',textContent:categoryName(entry.categoryId)}));
  if (usage) heading.prepend(node('span',{className:'association-role',textContent:usage.roles.map(role =>
    role === 'style' && usage.stylePreviewOnly ? '风格样图' : roles[role][0]).join(' · ')}));
  const prompt = node('details',{className:'association-prompt'},
    node('summary',{textContent:usage ? '查看完整提示词' : '查看提示词与参数'}),
    node('pre',{textContent:entry.prompt || formatPrompt(entry)}),
    button('复制提示词',() => void copy(entry.prompt || formatPrompt(entry)),'button quiet','copy'));
  const images = node('div',{className:'association-image-row'},...['ref','style','result'].map(role => {
    const items = entry.images?.[role] || [];
    const pictures = node('div',{className:'association-pictures'},...items.map(image => {
      const picture = button('',() => imagePreview(image),'association-picture');
      picture.title = image.name+(image.previewOnly ? ' · 风格样图' : '');
      picture.setAttribute('aria-label','查看'+roles[role][0]+' · '+image.name);
      picture.append(pictureNode(image,{alt:image.name}));
      if (image.previewOnly) picture.append(node('span',{textContent:'样图'}));
      return picture;
    }));
    return node('section',{className:'association-image-column'},
      node('h4',{textContent:roles[role][0]+(items.length ? ' · '+items.length : '')}),
      items.length ? pictures : small('未保存'));
  }));
  return node('article',{className:'association-record'},heading,
    usage ? node('p',{className:'association-body',textContent:entry.body}) : null,images,prompt);
}

function galleryUsagePreview(image) {
  const usages = imageUsageEntries(state.snapshot.entries,image);
  return associationContents(image.name+' · 使用记录',usages.length
    ? usages.map(usage => exampleRecord(usage.entry,usage))
    : [small('这张图片还没有关联到已保存的提示词。')]);
}

function packGrid(packs) {
  return node('div',{className:'pack-grid'},...packs.map(pack => {
    const item = button('',() => addTerms(pack.style),'pack');
    item.title = '加入风格包到草稿';
    item.append(node('strong',{textContent:pack.name}),node('span',{textContent:pack.style.join(' · ')}));
    return item;
  }));
}

function renderComposer() {
  hideAssociationPreview();
  const tabs = $('#composer-tabs');
  if (!tabs.children.length) {
    for (const [id,[label,glyph]] of Object.entries(tools)) {
      const control = button(label,() => { state.tab = id; renderComposer(); },'',glyph);
      control.dataset.tab = id;
      tabs.append(control);
    }
  }
  for (const tab of tabs.children) {
    tab.classList.toggle('active',tab.dataset.tab === state.tab);
    tab.setAttribute('aria-pressed',String(tab.dataset.tab === state.tab));
  }
  const content = $('#composer-content');
  if (content.contains(document.activeElement) && document.activeElement.id === 'param-search') return renderParameterGrid();
  content.replaceChildren();
  if (state.tab === 'elements') {
    const groups = elementGroups();
    if (!groups.some(([key]) => key === state.group)) state.group = 'subject';
    const nested = new Set(Object.entries(elementBranches).flatMap(([root,branches]) => branches.filter(key => key !== root)));
    const topGroups = [['person','人物'],...groups.filter(([key]) => !nested.has(key))];
    const path = elementPath(state.group);
    const openRoot = path[0];
    const {terms} = libraryData({chineseElements:true});
    const mode = button('随机组合',() => {
      randomMode = !randomMode;
      if (!randomMode) randomDraft.clear();
      renderComposer();
    },'button '+(randomMode?'forest':'quiet'),'shuffle');
    mode.setAttribute('aria-pressed',String(randomMode));
    const switcher = node('div',{className:'group-switch'});
    for (const [key,label] of topGroups) {
      const active = randomMode ? randomDraft.has(key) : openRoot === key;
      const control = button(label,() => {
        if (randomMode) return rollGroup(key,groups,terms);
        state.group = key === 'person' ? 'subject' : key;
        renderComposer();
      },'group-tab'+(active?' active':''));
      control.setAttribute('aria-pressed',String(active));
      switcher.append(control);
    }
    content.append(node('div',{className:'element-controls'},switcher,mode));
    if (randomMode) content.append(renderRandomDraft(topGroups));
    else {
      for (const [level,parent] of path.entries()) {
        const branches = elementBranches[parent];
        if (!branches) continue;
        const children = parent === 'person' ? branches : [parent,...branches];
        content.append(node('div',{className:'person-tools'+(level?' nested-elements':'')},node('div',{className:'group-switch'},...children.map(key => {
          const active = key === parent ? state.group === parent : path.includes(key);
          const label = key === parent ? overviewLabels[key] || groupLabel(key,groups) : groupLabel(key,groups);
          return button(label,() => { state.group=key; renderComposer(); },'chip'+(active?' on':''));
        }))));
      }
      content.append(termChips(groupRows(state.group,groups,terms),state.group),button('添加自定义词条',() => termDialog(state.group),'button quiet','plus'));
    }
  }
  if (state.tab === 'styles') {
    const {packs} = libraryData();
    content.append(packs.length ? packGrid(packs) : small('保存含有画风、光线或色彩等描述的提示词后，风格包会在这里出现。'));
  }
  if (state.tab === 'params') {
    const search = node('input',{id:'param-search',type:'search',className:'dialog-field',placeholder:'搜索后缀参数，例如比例、sref',value:state.paramSearch});
    search.setAttribute('aria-label','搜索后缀参数');
    search.oninput = () => { state.paramSearch = search.value; renderParameterGrid(); };
    const top = node('div',{className:'filter-row'},search,button('自定义',() => paramDialog(),'button','plus'));
    content.append(top,node('div',{className:'parameter-grid',id:'parameter-grid'}));
    renderParameterGrid();
  }
}

function renderParameterGrid() {
  const grid = $('#parameter-grid');
  if (!grid) return;
  const draft = effectiveDraft();
  const params = new Map(draft.params);
  const sref = styleReferenceValue(draft);
  if (sref) params.set('sref',sref);
  const definitions = new Map(parameters.map(row => [row[0],row]));
  for (const key of params.keys()) if (!definitions.has(key)) definitions.set(key,[key,'自定义参数']);
  const query = normalize(state.paramSearch).replace(/^--/,'');
  const usage = state.snapshot.parameterUsage || {};
  grid.replaceChildren(...[...definitions.values()]
    .map((definition,index) => ({definition,index,count:usage[definition[0]] || 0}))
    .filter(({definition:[key,label]}) => !query || key.includes(query) || normalize(label).includes(query))
    .sort((a,b) => b.count-a.count || a.index-b.index)
    .map(({definition:[key,label,...choices]}) => {
    const active = params.has(key);
    const el = button('',() => {
      void recordParameterUse(key);
      if (choices[0] === true) setParam(key,active ? null : '');
      else paramDialog(key,label,choices);
    },'chip'+(active?' on':''));
    el.append(node('code',{textContent:'--'+key+(active && params.get(key)?' '+params.get(key):'')}),node('span',{textContent:label}));
    if (key === 'sref') el.classList.add('sref-parameter');
    el.setAttribute('aria-describedby','parameter-tooltip');
    el.onmouseenter = () => showParameterTooltip(el,key,label);
    el.onfocus = () => showParameterTooltip(el,key,label);
    el.onmouseleave = hideParameterTooltip;
    el.onblur = hideParameterTooltip;
    return el;
  }));
}

const parameterHelp = {
  ar:['画面比例','决定宽高比例，也会改变构图空间。横景适合环境与叙事，竖景更适合人物与海报。','常用：1:1、16:9、9:16、4:5。'],
  s:['风格化强度','数值越高，模型越主动加入艺术化取舍；数值低时更贴近具体文字描述。','从 100 起试，再按 50 → 250 → 750 递进。'],
  c:['变化幅度','控制首轮候选图的发散程度。低值更稳定，高值更容易出现意外构图。','需要可控时用 0–10；找灵感可从 25 往上试。'],
  v:['模型版本','指定基础模型版本。不同版本会改变细节、提示词理解和复杂构图的表现。','确定方向后固定版本，避免测试时混入模型差异。'],
  niji:['动漫模型','切换到偏日式动漫、漫画审美的模型，适合角色、线稿与鲜艳画面。','与 --v 二选一；动漫项目优先从 niji 开始。'],
  q:['质量','在支持的模型中调节计算量；高值通常更慢、消耗也可能更多。','探索阶段用低档，定稿再按当前模型支持范围提高。'],
  seed:['随机种子','固定随机起点，便于复现接近的构图，并做“只改一个变量”的对照。','相同 seed 不保证完全相同，但通常保留相近的方向。'],
  no:['排除元素','降低指定对象、颜色或元素出现的概率，例如人物、文字、水印。','不是绝对屏蔽；同时把想要的主体写得更明确。'],
  sref:['风格参考','使用图片或风格码借用配色、质感和氛围，不会直接复制参考图主体。','可放图片 URL、风格码或 random；搭配 --sw 调节强度。'],
  sw:['风格权重','控制 --sref 风格对结果的影响程度。值越高，风格图的视觉语言越明显。','先用 100 作为基线，再逐步提高。'],
  iw:['垫图权重','控制提示词前置图片与文字描述谁更占主导。值高时更贴近垫图的构图信息。','从 1 附近试起；不同模型可用范围不同。'],
  tile:['无缝平铺','生成可重复拼接的图块，适合壁纸、织物、包装纹样与材质贴图。','避免只在画面边缘出现独特主体，生成后检查拼接缝。'],
  cref:['角色参考','使用参考图帮助保持角色身份特征，单人、面部清楚的图片通常最稳定。','用于角色而非画风；可配合 --cw 调节带入范围。'],
  cw:['角色权重','控制角色参考带入的范围：低值偏脸部，高值会更多带入发型和服饰。','真人与精细图案仍可能变形，不是精确复制。'],
  raw:['Raw 模式','降低模型默认的审美加工，让提示词和参考图的控制更直接。','产品、摄影和需要严格控制的画面可优先尝试。'],
  draft:['草稿模式','用于快速探索方向的草图工作流，适合先看构图与提示词是否成立。','确定方向后，切回正式模式完成定稿。'],
  w:['怪异度','提高画面的反常、超现实或实验性倾向。','从小幅度增加，避免主题可读性突然下降。'],
  r:['重复生成','用同一条提示词多次生成，快速获得更多候选方案。','用于筛选构图，不等同于提高单张画质。']
};

function showParameterTooltip(target,key,label) {
  const [title,description,tip] = parameterHelp[key] || [label,'这是一个可加入提示词末尾的后缀参数；可按当前模型和创作目标调整。','点击即可查看可选值并添加到提示词。'];
  const tooltip = $('#parameter-tooltip');
  tooltip.replaceChildren(node('code',{textContent:'--'+key}),node('strong',{textContent:title}),node('p',{textContent:description}),node('small',{textContent:tip}));
  tooltip.hidden = false;
  const rect = target.getBoundingClientRect();
  const width = Math.min(310,window.innerWidth - 24);
  tooltip.style.width = width+'px';
  tooltip.style.left = Math.max(12,Math.min(rect.left,window.innerWidth - width - 12))+'px';
  const height = tooltip.offsetHeight;
  tooltip.style.top = (rect.bottom + height + 10 > window.innerHeight ? Math.max(12,rect.top - height - 8) : rect.bottom + 8)+'px';
}

function hideParameterTooltip() {
  const tooltip = $('#parameter-tooltip');
  if (tooltip) tooltip.hidden = true;
}

function recordParameterUse(key) {
  return api.recordParameterUse(key).then(snapshot => {
    state.snapshot = {...state.snapshot,parameterUsage:snapshot.parameterUsage};
    if (state.view === 'editor' && state.tab === 'params' && !$('#modal').open) renderParameterGrid();
  }).catch(error => toast(error,true));
}

function setParam(key,value) {
  materializePrompt();
  const map = new Map(state.draft.params);
  const groups = [['fast','relax','turbo'],['stealth','public'],['hd','sd'],['v','niji']];
  const group = groups.find(items => items.includes(key));
  if (value === null) map.delete(key);
  else {
    if (group) for (const other of group) if (other !== key) map.delete(other);
    map.set(key,value);
  }
  if (key === 'sref') {
    const next = new Set(styleReferenceTokens(value || '').map(styleReferenceUrl).filter(Boolean));
    state.draft.images.style = state.draft.images.style.filter(image => image.previewOnly || !image.url || next.has(image.url));
  }
  state.draft = withStyleLinks({...state.draft,params:[...map]});
  changed({full:true});
  hydrateDraftImages();
}

function openDialog(title,content,{imagePreview=false}={}) {
  hideAssociationPreview();
  const modal = $('#modal');
  const inner = $('#modal-content');
  modal.classList.toggle('image-dialog',imagePreview);
  modal.style.removeProperty('--preview-image-width');
  modal.style.removeProperty('--preview-image-ratio');
  inner.replaceChildren(node('div',{className:'dialog-head'},node('h2',{textContent:title}),button('关闭',() => modal.close(),'button quiet','x')),content);
  if (!modal.open) modal.showModal();
  inner.querySelector('input')?.focus();
}

function dialogForm(input,submitText,onSubmit,more=[]) {
  const form = node('form',{},input,...more);
  const submit = node('button',{type:'submit',className:'button forest',textContent:submitText});
  form.append(node('div',{className:'dialog-actions'},submit));
  form.onsubmit = event => {
    event.preventDefault();
    try {
      if (onSubmit(input.value.trim()) !== false) $('#modal').close();
    } catch (error) { toast(error,true); }
  };
  return form;
}

function termDialog(group) {
  const label = elementGroups().find(([key]) => key === group)[1];
  const input = node('input',{className:'dialog-field',placeholder:'输入要加入的词条',required:true,maxLength:300});
  openDialog(label,dialogForm(input,'加入草稿',value => { if (value) addTerms([value],group); }));
}

function paramDialog(key,label,choices=[]) {
  const draft = effectiveDraft();
  const active = new Map(draft.params);
  if (choices[0] === true) {
    const enabled = active.has(key);
    openDialog('--'+key+' · '+label,node('div',{className:'dialog-actions'},button(enabled?'关闭参数':'启用参数',() => {
      setParam(key,enabled ? null : '');
      $('#modal').close();
    },'button forest')));
    return;
  }
  if (key === 'sref' && styleReferenceValue(draft)) active.set('sref',styleReferenceValue(draft));
  const placeholder = key === 'sref' ? '也可以输入风格码或公开图片链接' : key ? '输入参数值' : '例如 --seed 123 或 --tile';
  const input = node('input',{className:'dialog-field',value:key ? active.get(key) || '' : '',maxLength:key === 'sref' ? 24000 : 4000,placeholder});
  const options = node('div',{className:'chips'},...choices.map(value => button(value,() => {
    setParam(key,value);
    $('#modal').close();
  },'chip')));
  if (key && active.has(key)) options.append(button('移除此参数',() => { setParam(key,null); $('#modal').close(); },'chip'));
  const form = dialogForm(input,'加入参数',value => {
    if (key) {
      if (!value || /(?:^|\s)--[a-z]/i.test(value)) throw new Error('请输入这一项参数的值。');
      setParam(key,value);
    } else {
      const parsed = parsePrompt(value);
      if (parsed.body || parsed.params.length !== 1) throw new Error('请输入一项有效参数，例如 --seed 123。');
      setParam(...parsed.params[0]);
    }
  },[options]);
  if (key === 'sref') {
    const drop = button('添加或拖入风格参考图片',() => imageDialog('style'),'drop','image-plus');
    drop.dataset.imageRole = 'style';
    input.setAttribute('aria-label','风格码或公开图片链接');
    openDialog('--sref · '+label,node('div',{},drop,form));
  } else openDialog(key?'--'+key+' · '+label:'自定义后缀参数',form);
}

function imageSrc(image) { return image.file ? 'atelier-image://'+image.file+'/' : ''; }

function imagePreview(image) {
  const modal = $('#modal');
  const picture = image.file ? node('img',{className:'dialog-image',alt:image.name}) : small('这张图片暂无本地预览。');
  const link = node('div',{className:'preview-link'},
    node('code',{textContent:image.url || '暂无公开图片链接'}),
    image.url ? button('复制链接',() => void copy(image.url,'已复制图片链接'),'button quiet','copy') : null);
  const source = image.source && image.source !== image.url
    ? button('复制来源网页',() => void copy(image.source,'已复制来源网页'),'button quiet','link') : null;
  const temporary = image.url && isTemporaryDiscordImage(image.url)
    ? small('Discord 临时图片链接到期后，本地副本仍可预览。') : null;
  const contents = node('div',{className:'image-preview'},link,
    source || temporary ? node('div',{className:'preview-link-notes'},temporary,source) : null,picture);
  openDialog(image.name,contents,{imagePreview:true});
  if (image.file) {
    picture.onload = () => {
      if (!modal.contains(picture)) return;
      modal.style.setProperty('--preview-image-width',picture.naturalWidth+'px');
      modal.style.setProperty('--preview-image-ratio',String(picture.naturalWidth / picture.naturalHeight));
    };
    picture.onerror = () => picture.replaceWith(small('图片暂时无法加载。'));
    picture.src = imageSrc(image);
  }
}

function pictureNode(image,options={}) {
  if (!image.file) return icon(pendingImages.has(scopedImageKey(state.draft.categoryId,image.url)) ? 'download' : 'image-off');
  const photo = node('img',{src:imageSrc(image),alt:image.name,loading:'lazy',...options});
  photo.onerror = () => photo.replaceWith(icon('image-off'));
  return photo;
}

function draggablePicture(image) {
  const photo = pictureNode(image,{draggable:true,title:'拖到 Discord 或 Midjourney 上传图片'});
  if (image.file) photo.ondragstart = event => {
    event.preventDefault();
    if (event.isTrusted) api.dragImageFile(image.file);
  };
  return photo;
}

function removeStyleLink(draft,url) {
  if (!url) return;
  const params = new Map(draft.params);
  const tokens = styleReferenceTokens(params.get('sref')).filter(token => styleReferenceUrl(token) !== url);
  if (tokens.length) params.set('sref',tokens.join(' '));
  else params.delete('sref');
  draft.params = [...params];
}

function needsImageUrl(image) { return image.file && !image.url && !image.previewOnly; }

function showMissingLink(role,image) {
  const input = node('input',{type:'url',className:'dialog-field',placeholder:'粘贴上传后的原图地址',required:true});
  input.setAttribute('aria-label','图片地址');
  const form = dialogForm(input,'补上链接',value => {
    const url = publicUrl(value);
    if (!url) throw new Error('请输入公开的 HTTP 或 HTTPS 图片地址。');
    importTransfer({files:[],items:[{url}]},role,image.file);
  });
  const preview = draggablePicture(image);
  const upload = (label,site) => button(label,() => void api.openImageUpload(site).catch(error => toast(error,true)),'button','external-link');
  const content = node('div',{className:'link-repair'},
    node('div',{className:'missing-image-preview'},preview),
    small('可直接把上方图片拖到网站上传。上传完成后，打开原图并拖回这个弹窗或对应图片位置，即可补齐链接。'),
    node('div',{className:'image-preview-actions'},upload('Discord 网页版','discord'),upload('Postimages','postimages'),upload('Cloudinary','cloudinary'),
      button('Midjourney',() => void api.openMidjourney().catch(error => toast(error,true)),'button','external-link'),
      button('定位本地文件',() => void api.revealImage(image.file).catch(error => toast(error,true)),'button quiet','folder-open')),
    small('Discord 的附件链接会过期。需要反复使用时，可以选 Postimages 或 Cloudinary。'),form);
  content.dataset.imageRole = role;
  content.dataset.linkTarget = image.file;
  openDialog((roles[role]?.[0] || '图库')+' · '+image.name,content);
}

function thumbnails(images,{role=null,editable=false}={}) {
  return node('div',{className:'thumbs'},...images.map(image => {
    const trigger = button('',() => imagePreview(image),'thumb-image');
    trigger.setAttribute('aria-label','查看 '+image.name);
    trigger.append(pictureNode(image));
    const key = scopedImageKey(state.draft.categoryId,image.url);
    const downloading = pendingImages.has(key) && !image.file;
    const failure = !image.file && failedImages.get(key);
    const label = downloading ? '正在下载…' : failure ? '下载失败' : image.label || (image.previewOnly?'风格样图':image.name);
    const missing = editable && role !== 'result' && needsImageUrl(image);
    const thumb = node('div',{className:'thumb'+(missing?' missing-url':'' )},trigger,node('span',{className:'thumb-label',textContent:label,title:failure || image.name}));
    if (missing) {
      thumb.dataset.imageRole = role;
      thumb.dataset.linkTarget = image.file;
      const link = button('没有图片链接',() => showMissingLink(role,image),'thumb-action','link');
      link.title = '点击添加图片链接（可选）';
      thumb.append(link);
    }
    if (editable) {
      const remove = button('',() => {
        materializePrompt();
        state.draft.images[role] = state.draft.images[role].filter(item => item.url && image.url ? item.url !== image.url : item.file !== image.file);
        if (role === 'style') removeStyleLink(state.draft,image.url);
        changed({full:true});
      },'thumb-x','x');
      remove.setAttribute('aria-label','移除 '+image.name);
      thumb.append(remove);
      if (role === 'style' && image.url) thumb.append(button(image.previewOnly?'用作参考':'仅作样图',() => {
        materializePrompt();
        const current = state.draft.images.style.find(item => item.url === image.url);
        if (!current) return;
        current.previewOnly = !current.previewOnly;
        if (current.previewOnly) removeStyleLink(state.draft,current.url);
        changed({full:true});
      },'thumb-action'));
      if (failure) thumb.append(button('重试下载',() => { failedImages.delete(key); hydrateDraftImages(); },'thumb-action'));
    }
    return thumb;
  }));
}

function renderAssets() {
  const root = $('#asset-groups');
  root.replaceChildren();
  for (const [role,[label,syntax]] of Object.entries(roles)) {
    const group = node('div',{className:'asset-group'});
    group.dataset.imageRole = role;
    const add = button('拖入图片或点击选择',() => imageDialog(role),'drop',role==='result'?'image-plus':'images');
    group.append(node('div',{className:'asset-title'},node('h3',{textContent:label}),node('code',{textContent:syntax})),add);
    const images = state.draft.images[role];
    if (images.length) group.append(thumbnails(images,{role,editable:true}));
    const incoming = [...incomingImages].filter(task => task.role === role);
    if (incoming.length) group.append(node('div',{className:'thumbs incoming-thumbs','aria-live':'polite'},...incoming.flatMap(task => task.previews.map(src =>
      node('div',{className:'thumb incoming-thumb'},node('div',{className:'thumb-image'},src ? node('img',{src,alt:''}) : icon('download')),
        node('span',{className:'thumb-label',textContent:task.label}))))));
    group.append(node('div',{className:'asset-line'},node('div',{className:'asset-add-actions'},button('添加图片',() => imageDialog(role),'link-button'),button('粘贴图片',() => pasteAssetImage(role),'link-button')),node('span',{className:'asset-note',textContent:images.length?images.length+' 张图片':'PNG · JPG · WebP · GIF'})));
    root.append(group);
  }
}

function pasteAssetImage(role) {
  const scope = state.draft.categoryId;
  enqueueImport(role,async () => ({images:[await api.pasteImage(scope)],failures:[]}));
}

function pickFiles(role) {
  state.fileRole = role;
  state.fileGroup = galleryGroup || '';
  $('#file-picker').click();
}

function isTemporaryDiscordImage(url) {
  return /^https?:\/\/(?:cdn\.discordapp\.com|media\.discordapp\.net)\/(?:ephemeral-attachments\/|attachments\/[^?#]*\?[^#]*\bex=)/i.test(url);
}

function refreshGallery() {
  return api.gallery().then(items => {
    gallery = items;
    if (state.view === 'gallery') renderGallery();
  });
}

function renderGallery() {
  hideAssociationPreview();
  const query = normalize($('#gallery-search').value);
  const groups = galleryGroups();
  $('#gallery-groups').replaceChildren(...[{id:null,name:'全部'},...groups].map(group => {
    const count = gallery.filter(item => matchesGalleryFolder(item,group.id)).length;
    const control = button(group.name+' '+count,() => { galleryGroup = group.id; renderGallery(); },'chip'+(galleryGroup === group.id?' on':''));
    control.setAttribute('aria-pressed',String(galleryGroup === group.id));
    return control;
  }));
  $('#gallery-drop').lastChild.textContent = '拖入图片或原图链接 · '+(groups.find(group => group.id === galleryGroup)?.name || '未分类');
  const items = gallery.filter(image => matchesGalleryFolder(image,galleryGroup) && normalize([image.name,image.url,image.source].join(' ')).includes(query));
  $('#gallery-count').textContent = items.length+' 张图片';
  const root = $('#gallery-content');
  const incoming = [...incomingImages].filter(task => task.role === 'gallery' && (galleryGroup === null || task.groupId === galleryGroup));
  const progress = incoming.length ? node('div',{className:'thumbs incoming-thumbs'},...incoming.flatMap(task => task.previews.map(src =>
    node('div',{className:'thumb incoming-thumb'},node('div',{className:'thumb-image'},src ? node('img',{src,alt:''}) : icon('download')),
      node('span',{className:'thumb-label',textContent:task.label}))))): null;
  if (!items.length) {
    root.replaceChildren(progress || empty(query?'没有找到图片':'这个分组还没有图片',query?'试试图片名称或来源网站。':'从浏览器拖入图片，或点击「添加图片」。','images'));
    return;
  }
  root.replaceChildren(node('div',{className:'gallery-grid'},...items.map(image => {
    const missing = needsImageUrl(image);
    const control = button('',() => missing ? showMissingLink('gallery',image) : imagePreview(image),'gallery-card card'+(missing?' missing-url':''));
    if (missing) {
      control.dataset.imageRole = 'gallery';
      control.dataset.linkTarget = image.file;
      control.setAttribute('aria-label','没有图片链接 · '+image.name+' · 点击添加');
    }
    control.append(draggablePicture(image),node('strong',{textContent:image.name,title:image.name}),node('span',{className:missing?'gallery-link-notice':'',textContent:missing?'没有图片链接':image.url ? new URL(image.url).hostname : '本地图片'}));
    bindAssociationPreview(control,() => galleryUsagePreview(image),true);
    const move = button('',() => moveGalleryDialog(image),'gallery-action','folder-symlink');
    move.title = '移动到分组';
    move.setAttribute('aria-label','移动 '+image.name+' 到分组');
    const remove = button('',event => void deleteGalleryImage(image,event.currentTarget),'gallery-action gallery-delete','trash-2');
    remove.title = '永久删除图片（不再确认）';
    remove.setAttribute('aria-label','永久删除 '+image.name);
    return node('article',{className:'gallery-tile'},control,node('div',{className:'gallery-actions'},move,remove));
  })));
  if (progress) root.prepend(progress);
}

function galleryGroups() { return [{id:'',name:'未分类'},...(state.snapshot.galleryGroups || [])]; }

function matchesGalleryFolder(image,id) {
  const folders = image.categoryFolderIds || [];
  return id === null || (id ? image.groupId === id || folders.includes(id) : !image.groupId && !folders.length);
}

function addGalleryGroup() {
  const input = node('input',{className:'dialog-field',placeholder:'输入分组名称',maxLength:40,required:true});
  openDialog('新建图库分组',dialogForm(input,'创建分组',value => {
    void api.createGalleryGroup(value).then(result => {
      galleryGroup = result.group.id;
      refreshSnapshot(result);
      $('#modal').close();
    }).catch(error => toast(error,true));
    return false;
  }));
}

function moveGalleryDialog(image) {
  const input = node('select',{className:'dialog-field'},...galleryGroups().map(group => node('option',{value:group.id,textContent:group.name})));
  const from = galleryGroup ?? (image.groupId || image.categoryFolderIds?.[0] || '');
  input.value = from;
  input.setAttribute('aria-label','目标分组');
  openDialog('移动图片 · '+image.name,dialogForm(input,'移动到分组',groupId => {
    void api.moveGalleryImages([image.url || image.file],groupId,from).then(refreshSnapshot).catch(error => toast(error,true));
  }));
}

async function deleteGalleryImage(image,control) {
  if (galleryBusy || state.saving || state.imports || pendingImages.size) return toast('请等图片导入或保存完成后再删除。',true);
  galleryBusy = true;
  control.disabled = true;
  try {
    materializePrompt();
    await persistDraft({throwOnError:true});
    const result = await api.deleteGalleryImage(image.file);
    state.draft = removeImageReferences(state.draft,result.file,result.urls);
    for (const active of state.historyEdits.values()) active.draft = removeImageReferences(active.draft,result.file,result.urls);
    refreshSnapshot(result);
    if (result.cleanupFailures.length) toast('已移除图库和记录引用。部分文件未能删除：'+result.cleanupFailures.join('、'),true);
    else toast('已永久删除图片及其 '+result.deletedFiles+' 份本地文件。');
  } catch (error) { toast(error,true); }
  finally { galleryBusy = false; control.disabled = false; }
}

function imageDialog(role) {
  materializePrompt();
  const isGallery = role === 'gallery';
  const container = node('div',{className:'image-picker'});
  container.dataset.imageRole = role;
  const drop = button('拖入网页图片或点击选择本地文件',() => { $('#modal').close(); pickFiles(role); },'drop','images');
  const urlInput = node('textarea',{className:'dialog-field',placeholder:'可粘贴原图链接，每行一个',rows:2});
  urlInput.setAttribute('aria-label','图片链接');
  const form = dialogForm(urlInput,'导入链接',value => {
    const urls = value.split(/\s+/).filter(Boolean).map(publicUrl);
    if (!urls.length || urls.some(url => !url)) throw new Error('请输入公开的 HTTP 或 HTTPS 图片链接，每行一个。');
    importTransfer({files:[],items:urls.map(url => ({url}))},role);
  });
  container.append(drop,form);
  if (!isGallery) {
    const selected = new Set();
    const search = node('input',{type:'search',className:'dialog-field',placeholder:'在图库中搜索图片'});
    search.setAttribute('aria-label','搜索图库图片');
    const folders = node('select',{className:'dialog-field'},node('option',{value:'*',textContent:'全部文件夹'}),
      ...galleryGroups().map(({id,name}) => node('option',{value:id,textContent:name})));
    folders.setAttribute('aria-label','图库文件夹');
    const grid = node('div',{className:'sref-gallery-grid'});
    const add = button('添加所选图片',() => {
      const images = gallery.filter(image => selected.has(image.url || image.file));
      enqueueImport(role,async () => ({images,failures:[]}));
      $('#modal').close();
    },'button forest','image-plus');
    add.disabled = true;
    const fill = () => {
      const query = normalize(search.value);
      const folder = folders.value === '*' ? null : folders.value;
      const matches = gallery.filter(image => matchesGalleryFolder(image,folder) && normalize([image.name,image.url,image.source].join(' ')).includes(query));
      grid.replaceChildren(...(matches.length ? matches.map(image => {
        const key = image.url || image.file;
        const control = button('',() => {
          if (selected.has(key)) selected.delete(key);
          else if (selected.size < 100) selected.add(key);
          else return toast('一次最多选择 100 张图片。',true);
          control.setAttribute('aria-pressed',String(selected.has(key)));
          add.disabled = !selected.size;
          add.lastChild.textContent = selected.size ? '添加所选图片（'+selected.size+'）' : '添加所选图片';
        },'sref-gallery-item');
        control.setAttribute('aria-pressed',String(selected.has(key)));
        control.append(pictureNode(image,{alt:''}),node('span',{textContent:image.name,title:image.name}));
        return control;
      }) : [small('没有匹配的图库图片。')]));
    };
    search.oninput = fill;
    folders.onchange = fill;
    container.append(node('section',{className:'sref-gallery'},node('div',{className:'gallery-picker-filters'},search,folders),grid,node('div',{className:'dialog-actions'},add)));
    fill();
    void refreshGallery().then(fill).catch(error => toast(error,true));
  }
  openDialog(isGallery?'添加到图库':'添加'+roles[role][0],container);
}

function droppedImages(transfer) {
  const files = [...transfer.files];
  const convert = text => text.split(/\r?\n/).filter(line => !line.trimStart().startsWith('#')).flatMap(line => line.trim().split(/\s+/)).map(publicUrl).filter(Boolean);
  const downloaded = transfer.getData('DownloadURL').match(/^[^:\r\n]+:[^:\r\n]*:(https?:\/\/[^\r\n]+)$/i)?.[1] || '';
  const urls = [...new Set([...convert(downloaded),...['text/uri-list','text/plain','text/x-moz-url'].flatMap(type => convert(transfer.getData(type)))])];
  const template = document.createElement('template');
  template.innerHTML = transfer.getData('text/html');
  const direct = url => /\.(png|jpe?g|webp|gif)$/i.test(new URL(url).pathname) || ['s.mj.run','cdn.midjourney.com','i.pinimg.com'].includes(new URL(url).hostname);
  const items = [...template.content.querySelectorAll('img[src], img[data-src], img[srcset]')].flatMap(image => {
    const anchor = publicUrl(image.closest('a[href]')?.getAttribute('href') || '');
    const srcset = (image.getAttribute('srcset') || '').split(',').map(candidate => candidate.trim().split(/\s+/)[0]);
    const url = [anchor && direct(anchor) ? anchor : '',image.getAttribute('src'),image.getAttribute('data-src'),...srcset].map(publicUrl).find(Boolean);
    return url ? [{url,source:(anchor !== url && anchor) || urls.find(item => item !== url && !direct(item)) || ''}] : [];
  });
  if (!items.length) items.push(...urls.filter(url => !files.length || direct(url)).map(url => ({url})));
  if (!items.length) items.push(...Array.from(template.content.querySelectorAll('a[href]'),link => publicUrl(link.getAttribute('href'))).filter(url => url && direct(url)).map(url => ({url})));
  return {files,items:[...new Map(items.map(item => [item.url,item])).values()],source:urls.find(url => !direct(url)) || ''};
}

async function readDroppedFile(file,source='',url='',scope='') {
  if (file.size > 20*1024*1024) throw new Error('单张图片大小须在 20 MB 以内。');
  return api.image(new Uint8Array(await file.arrayBuffer()),file.name,url,source,scope);
}

function importTransfer({files,items,source},role,linkTarget='',groupId=galleryGroup || '') {
  if (linkTarget && items.length !== 1) return toast('请拖入一张带原图地址的图片，或点击「补链接」。',true);
  const scope = role === 'gallery' ? '' : state.draft.categoryId;
  enqueueImport(role,async () => {
    const images = [], failures = [];
    const batch = items.slice(0,100);
    if (!linkTarget && batch.length === 1 && files.length === 1) {
      // A web drag can carry both the image bytes and its URL. Save those bytes directly.
      try { return {images:[await readDroppedFile(files[0],batch[0].source,batch[0].url,scope)],failures}; }
      catch { /* Some sites provide a drag placeholder. Fall back to the original address. */ }
    }
    // Small parallel batches preserve display order and keep concurrent connections bounded.
    for (let i = 0; i < batch.length; i += 4) {
      const results = await Promise.allSettled(batch.slice(i,i+4).map(item => api.remoteImage(item.url,item.source,scope)));
      for (const [index,result] of results.entries()) {
        const item = batch[i+index];
        if (result.status === 'fulfilled') images.push(result.value);
        else if (batch.length === 1 && files.length === 1) {
          try {
            images.push(await readDroppedFile(files[0],item.source,item.url,scope));
          } catch (error) { failures.push(errorMessage(error)); }
        } else failures.push(errorMessage(result.reason));
      }
    }
    if (!(batch.length && files.length === 1 && images.length)) {
      for (const file of files.slice(0,100)) {
        try { images.push(await readDroppedFile(file,source,'',scope)); }
        catch (error) { failures.push(errorMessage(error)); }
      }
    }
    if (items.length > 100 || files.length > 100) failures.push('一次最多导入 100 张图片。');
    return {images,failures};
  },linkTarget,{files,count:Math.min(6,Math.max(files.length,items.length)),label:linkTarget?'正在补链接…':files.length?'正在保存…':'正在下载…'},groupId);
}

function enqueueImport(role,load,linkTarget='',progress=null,groupId='') {
  if (state.categoryBusy || state.saving || galleryBusy) return toast('请等当前操作完成。',true);
  const previews = progress && !(role === 'gallery' && linkTarget) ? Array.from({length:progress.count},(_,index) => {
    const file = progress.files[index];
    return file && /^image\/(png|jpeg|webp|gif)$/.test(file.type) && file.size <= 20*1024*1024 ? URL.createObjectURL(file) : '';
  }) : [];
  const task = {role,groupId,previews,label:progress?.label};
  if (previews.length) {
    incomingImages.add(task);
    if (state.view === 'editor') renderAssets();
    if (state.view === 'gallery') renderGallery();
  } else if (linkTarget) toast('正在验证原图链接…');
  state.imports++;
  updatePreview();
  void (async () => {
    const {images,failures} = await load();
    if (role === 'gallery' && linkTarget && images[0]?.url) await api.linkGalleryImage(linkTarget,images[0].url);
    if (role === 'gallery' && !linkTarget && images.length) await api.moveGalleryImages(images.map(image => image.url || image.file),groupId);
    if (role !== 'gallery') {
      materializePrompt();
      const selected = state.draft.images[role];
      if (linkTarget) {
        const target = selected.find(item => item.file === linkTarget && needsImageUrl(item));
        const linked = images.find(image => image.url);
        if (target && linked) {
          const duplicate = selected.findIndex(item => item.url === linked.url);
          if (duplicate >= 0) selected.splice(duplicate,1);
          Object.assign(target,{url:linked.url,source:linked.source || target.source});
        } else if (linked) failures.push('这张参考图已变更，请重新选择。');
      } else for (const image of images) {
        const existing = selected.find(item => item.url && image.url ? item.url === image.url : item.file && item.file === image.file);
        if (existing) Object.assign(existing,{file:image.file || existing.file,url:image.url || existing.url,source:image.source || existing.source,previewOnly:false});
        else if (selected.length < 100) selected.push({...image});
        else { failures.push('每组最多添加 100 张图片。'); break; }
      }
      if (images.length) changed({full:true});
    }
    await refreshGallery();
    if (images.length || failures.length) toast((images.length ? '已处理 '+images.length+' 张图片。' : '') + [...new Set(failures)].join(' / '),Boolean(failures.length));
  })().catch(error => toast(error,true)).finally(() => {
    state.imports--;
    if (incomingImages.delete(task)) {
      for (const src of previews.filter(Boolean)) URL.revokeObjectURL(src);
      if (state.view === 'editor') renderAssets();
      if (state.view === 'gallery') renderGallery();
    }
    updatePreview();
  });
}

function hydrateDraftImages() {
  const {categoryId:scope} = state.draft;
  const keyFor = url => scopedImageKey(scope,url);
  const missing = Object.values(state.draft.images).flat().filter(image => image.url && !image.file && !failedImages.has(keyFor(image.url)));
  for (const {url} of missing) {
    const key = keyFor(url);
    if (pendingImages.has(key)) continue;
    const task = api.remoteImage(url,'',scope).then(image => {
      let updated = false;
      if (state.draft.categoryId === scope) {
        for (const attachments of Object.values(state.draft.images)) for (const item of attachments) {
          if (item.url === url && !item.file) { item.file = image.file; updated = true; }
        }
      }
      if (updated && !state.categoryBusy) changed();
      return refreshGallery();
    }).catch(error => failedImages.set(key,errorMessage(error))).finally(() => {
      pendingImages.delete(key);
      if (state.view === 'editor') renderAssets();
    });
    pendingImages.set(key,task);
  }
  // Leave existing click targets in place during blur. The next render can show the progress state.
}
const statusLabels = {pending:'分类中',ai:'DeepSeek 已分类',local:'本地分类',error:'分类待重试'};

function historyDraft(entry) {
  const draft = structuredClone(entry);
  const value = styleReferenceValue(draft);
  if (value) draft.params = [...new Map([...draft.params,['sref',value]])];
  return draft;
}

function historyDraftValue(draft) {
  const params = new Map(draft.params);
  const urls = new Set(styleReferenceTokens(params.get('sref')).map(styleReferenceUrl).filter(Boolean));
  const style = draft.images.style.filter(image => image.previewOnly || !image.url || urls.has(image.url));
  return applyPrompt({...draft,images:{...draft.images,style}},draft.body);
}

function historyParameterEditor(active) {
  const panel = node('div',{className:'history-parameter-editor'});
  const render = () => {
    const labels = new Map(parameters.map(([key,label]) => [key,label]));
    const rows = active.draft.params.map(([key,value],index) => {
      const input = node('input',{value,maxLength:key === 'sref' ? 24000 : 4000,placeholder:'留空作为开关'});
      input.setAttribute('aria-label','--'+key+' '+(labels.get(key) || '自定义参数'));
      input.oninput = () => { active.draft.params[index][1] = input.value; };
      const remove = button('',() => { active.draft.params.splice(index,1); render(); },'button quiet','x');
      remove.setAttribute('aria-label','移除 --'+key);
      return node('label',{},node('span',{textContent:(labels.get(key) || '自定义参数')+' · --'+key}),node('div',{},input,remove));
    });
    const add = node('input',{placeholder:'--参数名',maxLength:43});
    add.setAttribute('aria-label','新参数名称');
    const append = button('添加',() => {
      const [[key] = []] = parsePrompt('--'+add.value.trim().replace(/^--/,'')).params;
      if (!key || !/^(?:--)?[a-z][a-z0-9-]{0,40}$/i.test(add.value.trim())) return toast('请输入有效参数名，例如 --ar。',true);
      if (active.draft.params.some(([name]) => name === key)) return toast('该参数已经存在。');
      active.draft.params.push([key,'']);
      render();
      panel.querySelectorAll('label input')[active.draft.params.length-1]?.focus();
    },'button','plus');
    panel.replaceChildren(...rows,node('div',{className:'history-parameter-add'},add,append));
  };
  render();
  return panel;
}

async function finishHistoryEdit(entry,active,control) {
  const draft = historyDraftValue(active.draft);
  if (!draft.body) return toast('请先填写提示词正文。',true);
  if (draft.params.some(([,value]) => /(?:^|\s)--[a-z]/i.test(value))) return toast('请把每个后缀分别填入自己的参数栏。',true);
  control.disabled = true;
  try {
    if (active.mode === 'tweak') {
      await api.copy(formatPrompt(draft));
    } else {
      const pending = Object.values(draft.images).flat().filter(image => image.url && !image.file);
      for (let i = 0; i < pending.length; i += 4) {
        await Promise.allSettled(pending.slice(i,i+4).map(async image => { image.file = (await api.remoteImage(image.url,'',draft.categoryId)).file; }));
      }
      const result = await api.editEntry(draft);
      if (state.draft.id === entry.id && bodyInput === null && ['title','body','params','images','hints','person'].every(key => JSON.stringify(state.draft[key]) === JSON.stringify(entry[key]))) state.draft = result.draft;
      refreshSnapshot(result);
    }
    state.historyEdits.delete(entry.id);
    if (state.view === 'history') renderHistory();
    toast(active.mode === 'tweak'?'已复制微调后的提示词':'历史记录已更新');
  } catch (error) { toast(error,true); }
  finally { control.disabled = false; }
}

function entryStyles(entry) {
  const own = [...entry.images.style];
  const sref = new Map(entry.params).get('sref');
  for (const part of styleReferenceTokens(sref)) {
    const url = styleReferenceUrl(part);
    if (url && !own.some(image => image.url === url)) own.push({file:'',url,name:'风格参考链接',previewOnly:false});
  }
  const keys = styleKeys(entry.params);
  if (!keys.length) return own;
  if (!own.some(image => image.previewOnly)) {
    const other = scopedEntries().find(item => {
      const codes = styleKeys(item.params);
      return item.id !== entry.id && codes.length === keys.length && keys.every(key => codes.includes(key)) && item.images.style.some(image => image.previewOnly);
    });
    if (other) own.push(...other.images.style.filter(image => image.previewOnly));
    else if (entry.images.result.length) own.push({...entry.images.result[0],name:'用该提示词生成的样图',label:'出图样例',previewOnly:true});
  }
  return own;
}

function historyCard(entry) {
  const active = state.historyEdits.get(entry.id);
  const start = mode => { state.historyEdits.set(entry.id,{mode,draft:historyDraft(entry)}); renderHistory(); };
  const date = new Date(entry.updated).toLocaleString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
  const status = node('span',{className:'badge'+(entry.status==='error'?' error':''),textContent:statusLabels[entry.status] || statusLabels.local});
  const actions = node('div',{className:'history-actions right'});
  if (active) {
    const finish = button(active.mode === 'tweak'?'复制':'保存修改',() => void finishHistoryEdit(entry,active,finish),'button forest',active.mode === 'tweak'?'copy':'check');
    actions.append(finish);
    if (active.mode === 'edit') actions.append(button('编辑素材',() => {
      if (state.saving || state.imports) return toast('请等当前操作完成。',true);
      state.historyEdits.delete(entry.id);
      replaceDraft(historyDraftValue(active.draft));
    },'button','images'));
    actions.append(button('取消',() => { state.historyEdits.delete(entry.id); renderHistory(); },'button quiet'));
  } else if (state.historyMode) actions.append(
    button('微调',() => start('tweak'),'button','sliders-horizontal'),
    button('编辑',() => start('edit'),'button','square-pen'),
    button('复用',() => useEntry(entry,true),'button','rotate-ccw'),
    button('送往拆分台',() => globalThis.openSplitter(historyDraft(entry)),'button','scissors'));
  if (state.historyMode && !active && entry.status !== 'pending' && entry.status !== 'ai' && state.snapshot.settings.hasKey) {
    actions.append(button(entry.status==='error'?'重试分类':'用 DeepSeek 分类',async () => {
      try { refreshSnapshot(await api.classify(entry.id)); } catch (error) { toast(error,true); }
    },'button quiet','sparkles'));
  }
  const select = node('input',{type:'checkbox',className:'history-select',value:entry.id,checked:historySelection.has(entry.id)});
  select.setAttribute('aria-label','选择 '+nameOf(entry));
  select.onchange = () => {
    if (select.checked) historySelection.add(entry.id);
    else historySelection.delete(entry.id);
    updateHistorySelection();
  };
  const remove = button('删除',() => void deleteHistoryEntries([entry.id]),'button history-delete','trash-2');
  remove.setAttribute('aria-label','删除 '+nameOf(entry));
  actions.append(remove);
  const folder = state.snapshot.activeCategoryId === null ? node('span',{className:'badge',textContent:categoryName(entry.categoryId)}) : null;
  const head = node('div',{className:'history-head'},select,node('h2',{textContent:nameOf(entry)}),node('time',{textContent:date,dateTime:entry.updated}),folder,status,actions);
  const left = node('div',{},node('h3',{textContent:'垫图'}),entry.images.ref.length ? thumbnails(entry.images.ref) : small('暂无垫图'));
  const middle = node('div',{},node('h3',{textContent:'提示词正文'}));
  if (active) {
    const body = node('textarea',{value:active.draft.body,maxLength:24000,rows:9,className:'history-body-input'});
    body.setAttribute('aria-label',active.mode === 'tweak'?'微调提示词正文':'编辑提示词正文');
    body.oninput = () => { active.draft.body = body.value; };
    if (active.mode === 'edit') {
      const title = node('input',{value:active.draft.title,maxLength:100,className:'history-title-input',placeholder:'标题（可选）'});
      title.setAttribute('aria-label','编辑历史记录标题');
      title.oninput = () => { active.draft.title = title.value; };
      middle.append(title);
    }
    middle.append(body);
    if (active.mode === 'tweak') middle.append(small('复制后恢复原记录。'));
  } else middle.append(node('p',{textContent:entry.body}));
  const right = node('div',{},node('h3',{textContent:'后缀参数'}));
  if (active) right.append(historyParameterEditor(active));
  else {
    const params = historyDraft(entry).params;
    const labels = new Map(parameters.map(([key,label]) => [key,label]));
    right.append(params.length ? node('dl',{className:'history-parameters'},...params.map(([key,value]) =>
      node('div',{},node('dt',{textContent:labels.get(key) || '--'+key}),node('dd',{textContent:'--'+key+(value?' '+value:'')})))) : small('暂无后缀参数'));
  }
  right.append(node('h3',{className:'history-style-title',textContent:'风格参考'}));
  const visual = entryStyles(entry);
  if (visual.length) right.append(thumbnails(visual));
  else right.append(small('暂无风格样图'));
  if (styleKeys(entry.params).length) right.append(button('在 Midjourney 查找',async () => {
    try {
      await api.styleExplorer(styleKeys(entry.params)[0].split('|')[0]);
      toast('已复制风格码，可粘贴到 Midjourney 风格浏览搜索框。');
    } catch (error) { toast(error,true); }
  },'link-button'));
  const results = node('div',{className:'history-results'},node('h3',{textContent:'生成结果 · '+entry.images.result.length}),entry.images.result.length ? thumbnails(entry.images.result) : null,state.historyMode && !active ? button('添加出图',() => useEntry(entry,false,true),'button quiet right','image-plus') : null);
  return node('article',{className:'card history-card'},head,node('div',{className:'history-grid'},left,middle,right),entry.error ? node('p',{className:'history-error',textContent:entry.error}) : null,results);
}

function empty(title,description,glyph,action) {
  return node('section',{className:'card empty-card'},node('div',{className:'section-icon'},icon(glyph)),node('h2',{textContent:title}),small(description),action);
}

function renderHistory() {
  const filter = $('#history-filter').value;
  const query = normalize($('#history-search').value);
  const all = scopedEntries();
  const list = all.filter(entry => (!query || normalize(nameOf(entry)+' '+entry.prompt).includes(query))
    && (!filter || (filter === 'result' && entry.images.result.length) || (filter === 'style' && (entry.images.style.length || entry.params.some(([key]) => key === 'sref' || key === 'style'))) || (filter === 'error' && entry.status === 'error')));
  const root = $('#history-list');
  const visibleIds = new Set(list.map(entry => entry.id));
  for (const id of historySelection) if (!visibleIds.has(id)) historySelection.delete(id);
  $('#history-selection').hidden = !list.length;
  root.replaceChildren(...(list.length ? list.map(historyCard) : [
    all.length ? empty('没有匹配的记录','试试其他关键词或筛选条件。','search')
      : empty('还没有历史记录','编写提示词并保存后，就可以在这里查阅和补充出图。','history',button('编写提示词',() => showView('editor'),'button forest','square-pen'))
  ]));
  updateHistorySelection();
}

function updateHistorySelection() {
  const total = document.querySelectorAll('#history-list .history-select').length;
  const selected = historySelection.size;
  const selectAll = $('#history-select-all');
  selectAll.checked = total > 0 && selected === total;
  selectAll.indeterminate = selected > 0 && selected < total;
  $('#history-selected-count').textContent = '已选 '+selected+' 条';
  $('#history-delete-selected').disabled = !selected || historyDeleting;
}

async function deleteHistoryEntries(ids) {
  if (historyDeleting || state.saving || state.imports || galleryBusy) return toast('请等当前操作完成。',true);
  historyDeleting = true;
  updateHistorySelection();
  try {
    const result = await api.deleteEntries(ids);
    for (const id of ids) {
      historySelection.delete(id);
      state.historyEdits.delete(id);
    }
    const needsRender = state.historyEdits.size > 0;
    refreshSnapshot(result);
    if (state.view === 'history' && needsRender) renderHistory();
    toast(result.deletedCount ? '已删除 '+result.deletedCount+' 条历史记录。' : '选中的历史记录已不存在。');
  } catch (error) { toast(error,true); }
  finally { historyDeleting = false; updateHistorySelection(); }
}

function renderLibrary() {
  hideAssociationPreview();
  const root = $('#library-content');
  const {terms,packs} = libraryData();
  const query = normalize($('#library-search').value);
  const matches = term => !query || normalize(term).includes(query);
  root.replaceChildren();
  const stylePacks = packs.filter(pack => matches(pack.name+' '+pack.style.join(' ')));
  if (stylePacks.length) root.append(node('section',{className:'card library-panel'},node('h2',{textContent:'风格包 · '+stylePacks.length}),packGrid(stylePacks)));
  const groups = elementGroups();
  for (const [key,,glyph] of groups) {
    const label = elementPath(key).map(item => groupLabel(item,groups)).join(' › ');
    const group = [...terms[key].values()].filter(row => matches(row.term)).sort((a,b) => b.count-a.count);
    if (group.length) root.append(node('section',{className:'card library-panel'},node('h2',{},icon(glyph),label+' · '+group.length),termChips(group,key)));
  }
  if (!root.children.length) root.append(query
    ? empty('没有匹配的词条','试试其他关键词。','search')
    : empty('提示词库还是空的','每次保存提示词后，提取出的画面元素和风格会在这里积累。','library-big',button('开始编写',() => showView('editor'),'button forest','square-pen')));
}

async function copy(text= formatPrompt(effectiveDraft()),message='提示词已复制') {
  if (!text) return toast('请先填写提示词。',true);
  try { await api.copy(text); toast(message); } catch (error) { toast(error,true); }
}

async function save() {
  if (state.categoryBusy || state.saving || state.imports || galleryBusy || historyDeleting) return;
  commitBodyInput();
  hydrateDraftImages();
  const draft = structuredClone(state.draft);
  if (!draft.body) return toast('请先填写提示词正文。',true);
  clearTimeout(state.saveTimer);
  state.saving = true;
  updatePreview();
  try {
    const remote = Object.values(draft.images).flat().filter(image => image.url && !image.file);
    const downloads = remote.map(image => pendingImages.get(scopedImageKey(draft.categoryId,image.url)));
    if (downloads.some(Boolean)) {
      $('#save-status').textContent = '正在保存参考图…';
      await Promise.all(downloads);
      for (const image of remote) image.file = gallery.find(item => item.url === image.url)?.file || '';
    }
    const result = await api.save(draft);
    // Keep text typed while the save was in flight as an unsaved draft.
    const latest = effectiveDraft();
    const changedSinceSave = JSON.stringify(latest) !== JSON.stringify(draft);
    state.draft = changedSinceSave ? {...latest,id:result.entry.id} : {...result.draft};
    bodyInput = null;
    if (changedSinceSave) void persistDraft();
    refreshSnapshot(result);
    renderDraft();
    toast(result.entry.status==='pending'?'已保存到历史，DeepSeek 正在分类':'已保存到历史');
  } catch (error) { toast(error,true); }
  finally { state.saving = false; updatePreview(); }
}

function renderSettings() {
  const {model,hasKey,autoClassify} = state.snapshot.settings;
  $('#model').value = model;
  $('#auto-classify').checked = autoClassify;
  $('#classification-prompt').value = globalThis.classificationPrompt({knownGroups:[...new Set(state.snapshot.entries.flatMap(entry => Object.values(entry.analysis?.groups || {})))]});
  $('#key').value = '';
  $('#key').placeholder = hasKey?'已配置 · 输入新 Key 可替换':'sk-…';
  $('#data-dir').textContent = state.snapshot.dataDir;
  $('#test-status').textContent = '';
  state.removeKey = false;
}

async function saveSettings() {
  const settings = {key:$('#key').value,model:$('#model').value,removeKey:state.removeKey,autoClassify:$('#auto-classify').checked};
  refreshSnapshot(await api.settings(settings));
  renderSettings();
  toast('设置已保存');
}

function dropTarget(target) {
  if ($('#modal').open) return target.closest('#modal [data-image-role]');
  if (state.view === 'gallery' && target.closest('#gallery')) return target.closest('.gallery-card[data-link-target]') || $('#gallery-drop');
  if (state.view === 'editor') return target.closest('[data-link-target], .asset-group');
  return null;
}

function insertMjPrompt(text,start,end) {
  const field = $('#body');
  const value = field.value;
  const parsed = parsePrompt(text);
  const replace = start === 0 && end === value.length && Boolean(parsed.body && value.trim());
  const left = value.slice(0,start);
  const right = value.slice(end);
  const nextBody = parsed.body ? [left.trimEnd(),parsed.body,right.trimStart()].filter(Boolean).join('\n') : left+right;
  const previousTokens = state.draft.bodyTokens;
  const linked = applyPrompt(state.draft,text,replace);
  state.draft = applyPrompt({...linked,bodyTokens:replace ? undefined : previousTokens},nextBody.trim());
  bodyInput = null;
  hydrateDraftImages();
  changed({full:true});
  field.focus();
  const cursor = Math.min(nextBody.length,state.draft.body.length);
  field.setSelectionRange(cursor,cursor);
  translateImportedDraft();
}

function wire() {
  const associationPanel = $('#association-preview');
  associationPanel.onmouseenter = () => clearTimeout(associationHideTimer);
  associationPanel.onmouseleave = scheduleAssociationHide;
  associationPanel.onfocusin = () => clearTimeout(associationHideTimer);
  associationPanel.onfocusout = event => {
    if (!associationPanel.contains(event.relatedTarget) && event.relatedTarget !== associationAnchor) scheduleAssociationHide();
  };
  document.addEventListener('keydown',event => { if (event.key === 'Escape') hideAssociationPreview(); });
  window.addEventListener('resize',hideAssociationPreview);
  document.addEventListener('scroll',event => {
    if (!associationPanel.contains(event.target)) hideAssociationPreview();
  },true);
  $('.brand-icon').append(icon('aperture'));
  for (const el of document.querySelectorAll('[data-icon]')) el.prepend(icon(el.dataset.icon));
  for (const el of document.querySelectorAll('[data-icon-only]')) el.append(icon(el.dataset.iconOnly));
  for (const el of document.querySelectorAll('[data-view]')) el.addEventListener('click',() => {
    if (el.dataset.view !== state.view) showView(el.dataset.view);
  });
  for (const el of document.querySelectorAll('[data-action=new]')) el.onclick = newDraft;
  $('[data-action=new-category]').onclick = categoryDialog;
  $('#translate-draft').onclick = () => void translateDraft();
  $('[data-action=paste-mj]').onclick = async () => {
    const field = $('#body');
    const draft = state.draft;
    try {
      const text = await api.readPromptClipboard();
      if (!text.trim()) return toast('剪贴板里没有可粘贴的文字。',true);
      if (state.view !== 'editor' || state.draft !== draft) return;
      const {selectionStart:start,selectionEnd:end} = field;
      insertMjPrompt(text,start === end ? field.value.length : start,start === end ? field.value.length : end);
    } catch (error) { toast(error,true); }
  };
  $('[data-action=example]').onclick = () => {
    if (state.draft.body.trim()) return toast('当前已有正文。新建提示词后可以填入示例。');
    state.draft.title ||= '雨后温室';
    state.draft.body = '年轻的植物学家，白色亚麻衬衣，安静的玻璃温室，杂志插画，低饱和大地色系，柔和自然光，细腻纸张颗粒';
    state.draft.params = [...new Map([...state.draft.params,['ar','3:2'],['s','250']])];
    changed({full:true});
    $('#body').focus();
  };
  $('#body').oninput = event => { bodyInput = event.target.value; changed(); };
  $('#body').onpaste = event => {
    const text = event.clipboardData.getData('text/plain');
    const parsed = parsePrompt(text);
    if (!parsed.refs.length && !parsed.params.length) {
      if (text.trim()) setTimeout(translateImportedDraft,0);
      return;
    }
    event.preventDefault();
    insertMjPrompt(text,event.target.selectionStart,event.target.selectionEnd);
  };
  $('#body').onblur = event => {
    if (bodyInput === null) return;
    if (event.relatedTarget?.closest('#draft-tokens')) return;
    materializePrompt();
    if (!event.relatedTarget?.closest('#composer-content')) renderParameterGrid();
    if (!event.relatedTarget?.closest('#asset-groups')) renderAssets();
  };
  $('#title').oninput = event => { state.draft.title = event.target.value; changed(); };
  $('[data-action=save]').onclick = () => void save();
  $('[data-action=classify-saved]').onclick = async event => {
    const entry = getEntry();
    if (!entry || entry.body !== effectiveDraft().body) return;
    const control = event.currentTarget;
    control.disabled = true;
    try { refreshSnapshot(await api.classify(entry.id)); toast('已提交智能体分类'); }
    catch (error) { toast(error,true); }
    finally { control.disabled = false; }
  };
  $('[data-action=copy-classification-prompt]').onclick = () => void copy($('#classification-prompt').value,'分类提示词已复制');
  $('[data-action=copy]').onclick = () => { materializePrompt(); void copy(); };
  $('#history-mode').onclick = event => {
    state.historyMode = !state.historyMode;
    if (!state.historyMode) state.historyEdits.clear();
    event.currentTarget.setAttribute('aria-pressed',String(state.historyMode));
    event.currentTarget.classList.toggle('forest',state.historyMode);
    renderHistory();
  };
  $('#history-search').oninput = renderHistory;
  $('#history-filter').onchange = renderHistory;
  $('#history-select-all').onchange = event => {
    for (const select of document.querySelectorAll('#history-list .history-select')) {
      select.checked = event.currentTarget.checked;
      if (select.checked) historySelection.add(select.value);
      else historySelection.delete(select.value);
    }
    updateHistorySelection();
  };
  $('#history-delete-selected').onclick = () => {
    const ids = [...historySelection];
    if (!ids.length || historyDeleting) return;
    const modal = $('#modal');
    openDialog('批量删除历史记录',node('div',{},small('将永久删除选中的 '+ids.length+' 条历史记录。草稿和图库图片会保留。'),
      node('div',{className:'dialog-actions'},button('取消',() => modal.close()),button('删除所选',() => {
        modal.close();
        void deleteHistoryEntries(ids);
      },'button primary','trash-2'))));
  };
  $('#library-search').oninput = renderLibrary;
  $('#gallery-search').oninput = renderGallery;
  $('[data-action=gallery-add]').onclick = () => imageDialog('gallery');
  $('[data-action=gallery-group]').onclick = addGalleryGroup;
  $('#gallery-drop').dataset.imageRole = 'gallery';
  $('#gallery-drop').onclick = () => imageDialog('gallery');
  $('#guide-search').oninput = event => { state.guideSearch = event.target.value; renderGuide(); };
  $('#file-picker').onchange = event => {
    const files = [...event.target.files];
    event.target.value = '';
    if (files.length) importTransfer({files,items:[]},state.fileRole,'',state.fileGroup);
  };
  document.addEventListener('dragover',event => {
    const group = dropTarget(event.target);
    const types = Array.from(event.dataTransfer.types,type => type.toLowerCase());
    if (!types.includes('files') && (!group || !types.some(type => ['text/uri-list','text/html','text/plain','text/x-moz-url','downloadurl'].includes(type)))) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = group ? 'copy' : 'none';
    document.querySelectorAll('.dragover').forEach(el => { if (el !== group) el.classList.remove('dragover'); });
    group?.classList.add('dragover');
  });
  document.addEventListener('dragleave',event => {
    if (!event.relatedTarget) document.querySelectorAll('.dragover').forEach(el => el.classList.remove('dragover'));
  });
  document.addEventListener('drop',event => {
    document.querySelectorAll('.dragover').forEach(el => el.classList.remove('dragover'));
    const group = dropTarget(event.target);
    if (!group && !event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    if (!group) return;
    const data = droppedImages(event.dataTransfer);
    if (!data.files.length && !data.items.length) return toast('未收到图片。请拖动原图，或复制图片地址后导入。',true);
    if ($('#modal').open) $('#modal').close();
    importTransfer(data,group.dataset.imageRole,group.dataset.linkTarget);
  });
  document.addEventListener('keydown',event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && state.view === 'editor' && !$('#modal').open) {
      event.preventDefault();
      void save();
    }
  });
  $('#settings-form').onsubmit = event => {
    event.preventDefault();
    void saveSettings().catch(error => toast(error,true));
  };
  $('[data-action=remove-key]').onclick = () => {
    state.removeKey = true;
    $('#key').value = '';
    $('#key').placeholder = '点击保存设置后清除';
  };
  $('[data-action=test]').onclick = async event => {
    const button = event.currentTarget;
    const status = $('#test-status');
    button.disabled = true;
    try {
      if ($('#key').value.trim()) await saveSettings();
      status.textContent = '正在通过 DeepSeek Harness 测试…';
      await api.testHarness();
      status.textContent = '连接成功';
    } catch (error) { status.textContent = errorMessage(error); }
    finally { button.disabled = false; }
  };
  $('[data-action=open-data]').onclick = async () => {
    try {
      const error = await api.openData();
      if (error) throw new Error(error);
    } catch (error) { toast(error,true); }
  };
}

async function start() {
  const data = await api.snapshot();
  state.snapshot = data;
  translationReady = data.translationReady;
  state.draft = withStyleLinks(data.draft || blank());
  wire();
  refreshSnapshot(data);
  showView('editor');
  hydrateDraftImages();
  if (pendingImages.size) renderAssets();
  api.onLibrary(refreshSnapshot);
  api.onTranslationProgress(translationProgress);
}

start().catch(error => toast(error,true));
