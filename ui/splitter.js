(() => {
const {splitPromptBody,composeSplitterBody,validFragment} = globalThis.promptRules;
const input = $('#splitter-input');
const translated = new Map();
let session,source;
let groupingRequest = 0;
let saving = false;
let translateTimer;

async function start(value,useAI=true) {
  const request = ++groupingRequest;
  const status = $('#splitter-group-status');
  const control = $('#splitter-start');
  control.disabled = false;
  const draft = structuredClone(value);
  if (!draft.body.trim() || draft.body.length > 24000) return toast('请输入 1–24000 字符的提示词正文。',true);
  const parts = splitPromptBody(draft.body);
  const fragments = parts.filter(part => part.original);
  if (!fragments.length || fragments.length > 200) return toast('每次可拆分 1–200 个正文片段。',true);
  const previous = session;
  const labels = new Map();
  if (useAI) {
    if (!state.snapshot.settings.hasKey) {
      status.textContent = '请先在设置中配置 DeepSeek API Key，或使用离线分组。';
      return;
    }
    status.textContent = 'DeepSeek 正在参考本地分类表分组…';
    control.disabled = true;
    try {
      const groups = await api.groupSplitterPrompt(draft.body,state.snapshot.activeCategoryId);
      if (request !== groupingRequest) return;
      for (const {key,label,items} of groups) {
        labels.set(key,label);
        for (const index of items) if (fragments[index-1]) fragments[index-1].group = key;
      }
      status.textContent = 'DeepSeek 已完成分组：'+groups.length+' 组。';
    } catch (error) {
      if (request === groupingRequest) status.textContent = errorMessage(error)+' 也可选择离线分组。';
      return;
    } finally { if (request === groupingRequest) control.disabled = false; }
  } else status.textContent = '已离线分组，未调用 DeepSeek。';
  if (previous && previous.draft.body === draft.body) {
    for (const [index,part] of parts.entries()) if (part.original) {
      part.text = previous.parts[index].text;
      part.enabled = previous.parts[index].enabled;
    }
  }
  draft.images.result = [];
  const sref = styleReferenceValue(draft);
  if (sref) draft.params = [...draft.params.filter(([key]) => key !== 'sref'),['sref',sref]];
  session = {draft,parts,labels,selected:new Map(),parameters:draft.params.map(([key,value]) => ({key,value,original:value,enabled:true})),translationError:''};
  $('#splitter-results').hidden = false;
  render();
  scheduleTranslation();
}

function groupsForSession() {
  const groups = new Map(elementGroups().map(row => [row[0],row]));
  for (const [key,label] of session.labels) if (!groups.has(key)) groups.set(key,[key,label]);
  return [...groups.values()];
}

function variant() {
  const body = composeSplitterBody(session.parts);
  const params = session.parameters.filter(part => part.enabled).map(({key,value}) => [key,value]);
  const images = structuredClone(session.draft.images);
  // Style image URLs are already represented by the sref token in this editor.
  images.style = images.style.map(image => ({...image,previewOnly:true}));
  return {...session.draft,body,params,images,hints:{},person:session.draft.person.filter(term => body.includes(term))};
}

function preview() {
  const changed = session.parts.filter(part => part.original && (part.text !== part.original || part.enabled === false)).length
    + session.parameters.filter(part => !part.enabled || part.value !== part.original).length;
  const draft = variant();
  const valid = Boolean(draft.body.trim()) && draft.body.length <= 24000 && session.parts.every(part => !part.original || part.enabled === false || part.text === part.original || validFragment(part.text));
  $('#splitter-count').textContent = session.parts.filter(part => part.original).length+' 个词块 · 已调整 '+changed+' 项';
  $('#splitter-variant').textContent = formatPrompt(draft) || '点亮至少一个正文词块，组合全新提示词。';
  $('#splitter-reset').disabled = !changed;
  $('#splitter-copy-variant').disabled = !valid;
  $('#splitter-to-editor').disabled = !valid;
  $('#splitter-save').disabled = !valid || !changed || saving;
}

function openReplacements(part) {
  const current = session;
  const panel = $('#splitter-replacements');
  current.replacement = part;
  const {terms} = libraryData();
  const presets = elementGroups().find(([key]) => key === part.group)?.[3] || [];
  let values = [...new Set([...presets,...[...(terms[part.group]?.values() || [])].map(item => item.term)])]
    .filter(value => value !== part.text && validFragment(value));
  const custom = node('input',{className:'dialog-field',placeholder:'选择下面的备选，或输入自定义替换词',maxLength:24000});
  custom.setAttribute('aria-label','待导入的替换词');
  const choices = node('div',{className:'splitter-choices'});
  const hint = small('选择备选后点击「导入」，仅替换当前词块。');
  const apply = button('导入',() => {
    if (session !== current || current.replacement !== part) return;
    const value = custom.value.trim();
    if (!validFragment(value)) return toast('请输入有效正文片段，不要包含参数或图片链接。',true);
    if (composeSplitterBody(current.parts.map(item => item === part ? {...item,text:value,enabled:true} : item)).length > 24000)
      return toast('替换后的正文不能超过 24000 字符。',true);
    part.text = value;
    part.enabled = true;
    render();
    scheduleTranslation();
    toast('已导入全新提示词。');
  },'button forest');
  apply.disabled = true;
  const drawChoices = () => choices.replaceChildren(...(values.length ? values.slice(0,60).map(value => {
    const option = button(value,() => { custom.value = value; custom.oninput(); drawChoices(); },'button splitter-choice'+(custom.value === value ? ' selected' : ''));
    option.setAttribute('aria-pressed',String(custom.value === value));
    return option;
  }) : [small('同类词库暂无备选，可自定义或生成 DeepSeek 备选。')]));
  custom.oninput = () => { apply.disabled = !validFragment(custom.value.trim()); };
  const direction = node('input',{className:'dialog-field',placeholder:'可选调整方向，例如：雨夜、复古电影',maxLength:240});
  direction.setAttribute('aria-label','调整方向');
  const generate = button('DeepSeek 备选',async () => {
    if (!state.snapshot.settings.hasKey) return toast('请先在设置中配置 DeepSeek API Key。',true);
    if (!validFragment(part.text) || part.text.length > 1500) return toast('请选择不超过 1500 字符的有效正文片段。',true);
    generate.disabled = true;
    hint.textContent = '正在生成局部替换备选…';
    try {
      const suggestions = await api.suggestFragment({text:part.text,category:groupLabel(part.group,groupsForSession()),direction:direction.value.trim()});
      if (session !== current || current.replacement !== part || !choices.isConnected) return;
      values = [...new Set([...suggestions.filter(validFragment),...values])];
      drawChoices();
      hint.textContent = '备选已生成，选中后点击「导入」。';
    } catch (error) { if (hint.isConnected) hint.textContent = errorMessage(error); }
    finally { generate.disabled = false; }
  },'button','sparkles');
  panel.replaceChildren(
    node('div',{className:'splitter-actions'},node('strong',{textContent:'替换 · '+groupLabel(part.group,groupsForSession())}),
      button('收起',() => { panel.hidden = true; current.replacement = null; },'button quiet right')),
    node('div',{className:'splitter-target',textContent:'原文：'+part.original}),
    choices,node('div',{className:'splitter-replacement-input'},custom,apply),
    node('div',{className:'splitter-replacement-input'},direction,generate),hint);
  panel.hidden = false;
  drawChoices();
}

function editToken(part,isParameter=false) {
  const current = session;
  const field = node('textarea',{className:'dialog-field',value:isParameter ? part.value : part.text,rows:3,maxLength:isParameter ? 1000 : 24000});
  field.setAttribute('aria-label',isParameter ? '参数值' : '词块内容');
  const groups = groupsForSession();
  const group = node('select',{className:'dialog-field'},...groups.map(([key,label]) => node('option',{value:key,textContent:label})));
  group.value = part.group;
  group.setAttribute('aria-label','词块类别');
  openDialog(isParameter ? '修改参数 --'+part.key : '修改词块',node('div',{className:'splitter-suggestions'},
    small('原文：'+(isParameter ? part.original : part.original)),field,isParameter ? null : group,
    button('应用修改',() => {
      if (session !== current) return $('#modal').close();
      const value = field.value.trim();
      if (isParameter) {
        if (/[\r\n]|--[a-z]/i.test(value)) return toast('请只填写当前参数的值。',true);
        part.value = value;
      } else {
        if (value !== part.original && !validFragment(value)) return toast('请输入有效正文片段。',true);
        if (composeSplitterBody(current.parts.map(item => item === part ? {...item,text:value} : item)).length > 24000)
          return toast('正文不能超过 24000 字符。',true);
        part.text = value;
        part.group = group.value;
      }
      $('#modal').close();
      render();
      scheduleTranslation();
    },'button forest')));
  field.focus();
}

function renderTokens() {
  const groups = groupsForSession();
  const tokens = session.parts.filter(part => part.original).map(part => makeToken(part,false,groups));
  tokens.push(...session.parameters.map(part => makeToken(part,true,groups)));
  $('#splitter-tokens').replaceChildren(...tokens);
  preview();
}

function makeToken(part,isParameter,groups) {
  const current = session;
  const label = isParameter ? '--'+part.key+' '+part.value : part.text;
  const chip = button('',null,'splitter-token'+(part.enabled === false ? ' is-off' : '')+(isParameter ? ' is-parameter' : ''));
  chip.setAttribute('aria-pressed',String(part.enabled !== false));
  chip.setAttribute('aria-label',label+'；单击开关，双击编辑');
  chip.title = '单击点亮 / 点灭 · 双击修改';
  chip.append(node('span',{className:'splitter-token-category',textContent:(part.enabled === false ? '○ ' : '● ')+(isParameter ? '后缀参数' : groupLabel(part.group,groups))}),
    node('span',{className:'splitter-token-text',textContent:label}));
  if (!isParameter && needsTranslation(part.text)) {
    chip.append(node('span',{className:'splitter-token-zh',textContent:translated.get(part.text) || (current.translationError ? '译文未就绪 · 点击翻译中文重试' : '中文翻译中…')}));
  }
  let timer;
  const toggle = () => {
    if (session !== current) return;
    part.enabled = part.enabled === false;
    const focused = document.activeElement === chip;
    const index = [...$('#splitter-tokens').children].indexOf(chip);
    renderTokens();
    if (focused) $('#splitter-tokens').children[index]?.focus({preventScroll:true});
  };
  chip.onclick = event => {
    clearTimeout(timer);
    if (event.detail === 0) toggle();
    else if (event.detail === 1) timer = setTimeout(toggle,250);
  };
  chip.ondblclick = () => { clearTimeout(timer); editToken(part,isParameter); };
  chip.onkeydown = event => {
    if (event.key === 'F2') { event.preventDefault(); clearTimeout(timer); editToken(part,isParameter); }
  };
  return chip;
}

function render() {
  const groups = groupsForSession();
  const sections = new Map();
  for (const part of session.parts) if (part.original) {
    if (!sections.has(part.group)) sections.set(part.group,[]);
    sections.get(part.group).push(part);
  }
  $('#splitter-replacements').hidden = true;
  session.replacement = null;
  $('#splitter-groups').replaceChildren(...[...sections].map(([key,parts]) => {
    const label = groupLabel(key,groups);
    const select = node('select',{},...parts.map((part,index) => node('option',{value:String(index),textContent:part.original+(part.text !== part.original ? ' → '+part.text : '')})));
    select.setAttribute('aria-label',label+'原文词条');
    select.value = String(Math.min(session.selected.get(key) || 0,parts.length-1));
    select.onchange = () => session.selected.set(key,Number(select.value));
    const replace = button('替换',() => openReplacements(parts[Number(select.value)]),'button');
    return node('section',{className:'splitter-category'},node('div',{className:'splitter-actions'},node('strong',{textContent:label}),node('small',{textContent:String(parts.length)+' 项'})),
      node('div',{className:'splitter-category-select'},select,replace));
  }));
  renderTokens();
}

function needsTranslation(text) {
  return /[\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Arabic}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(text);
}
function scheduleTranslation() {
  clearTimeout(translateTimer);
  translateTimer = setTimeout(() => void translateTokens(),350);
}
async function translateTokens() {
  const current = session;
  if (!current || current.translating) return;
  const texts = [...new Set(current.parts.filter(part => part.original && needsTranslation(part.text) && !translated.has(part.text)).map(part => part.text))];
  const status = $('#splitter-translation-status');
  const control = $('#splitter-translate');
  status.hidden = false;
  if (!texts.length) { status.textContent = '中文对照已就绪。'; control.disabled = false; return; }
  if (texts.reduce((sum,text) => sum+text.length,0) > 24000) { status.textContent='词块总长度超过翻译限制。'; return; }
  current.translating = true;
  current.translationError = '';
  control.disabled = true;
  status.textContent = '正在生成 '+texts.length+' 个词块的中文对照，编辑功能可继续使用…';
  try {
    const english = /^[\x00-\x7f\p{P}\p{N}\s]+$/u.test(current.draft.body);
    const values = await api.translateFragments(texts,english ? 'en' : undefined);
    if (session !== current) return;
    texts.forEach((text,index) => translated.set(text,values[index]));
    status.textContent = '中文对照已就绪，译文仅供参考，复制时使用原文词块。';
    renderTokens();
  } catch (error) {
    if (session !== current) return;
    current.translationError = errorMessage(error);
    status.textContent = current.translationError+' 点击「翻译中文」重试。';
    renderTokens();
  } finally {
    current.translating = false;
    if (session === current) {
      control.disabled = false;
      if (!current.translationError && current.parts.some(part => part.original && needsTranslation(part.text) && !translated.has(part.text))) scheduleTranslation();
    }
  }
}

function loadDraft(draft) {
  clear();
  source = structuredClone(draft);
  input.value = formatPrompt(source);
  renderSourceImages();
  void start(source,state.snapshot.settings.hasKey);
}
function renderSourceImages() {
  const panel = $('#splitter-assets');
  panel.hidden = !source || !Object.values(source.images).some(images => images.length);
  panel.replaceChildren();
  if (panel.hidden) return;
  panel.append(node('div',{className:'splitter-actions'},node('h2',{textContent:'图片素材'}),
    button('编辑图片素材',() => {
      if (state.categoryBusy || state.saving || state.imports) return toast('请等当前操作完成。',true);
      replaceDraft(session ? {...variant(),images:{...variant().images,result:source.images.result}} : source);
    },'button right','images')));
  for (const [role,[label]] of Object.entries(roles)) {
    if (source.images[role].length) panel.append(node('div',{className:'splitter-source-images'},
      node('h3',{textContent:label}),thumbnails(source.images[role])));
  }
}
function copy(text) {
  void api.copy(text).then(() => toast('已复制，可粘贴到 Midjourney。')).catch(error => toast(error,true));
}
function clear() {
  clearTimeout(translateTimer);
  $('#splitter-results').hidden = true;
  $('#splitter-start').disabled = false;
  $('#splitter-translate').disabled = false;
  $('#splitter-translation-status').hidden = true;
  $('#splitter-group-status').textContent = '';
  groupingRequest++;
  session = null;
  source = null;
  renderSourceImages();
}
input.oninput = () => {
  const previous = source;
  clear();
  if (previous) {
    source = applyPrompt(previous,input.value,true);
    source.images.result = previous.images.result;
    renderSourceImages();
  }
};
$('#splitter-start').onclick = () => void start(source || applyPrompt(blank(),input.value));
$('#splitter-local').onclick = () => void start(source || applyPrompt(blank(),input.value),false);
$('#splitter-draft').onclick = () => loadDraft(effectiveDraft());
$('#splitter-reset').onclick = () => {
  for (const part of session.parts) if (part.original) { part.text = part.original; part.enabled = true; }
  for (const part of session.parameters) { part.value = part.original; part.enabled = true; }
  render();
  scheduleTranslation();
};
$('#splitter-translate').onclick = () => void translateTokens();
$('#splitter-copy-original').onclick = () => copy(formatPrompt(session.draft));
$('#splitter-copy-variant').onclick = () => copy(formatPrompt(variant()));
$('#splitter-to-editor').onclick = () => {
  if (!session || state.categoryBusy || state.saving || state.imports) return;
  replaceDraft({...variant(),id:'',title:(session.draft.title || '探索提示词')+' · 变体'});
  toast('全新提示词已导入编写器。');
};
$('#splitter-open').onclick = () => void api.openMidjourney().catch(error => toast(error,true));
$('#splitter-save').onclick = async () => {
  if (saving || state.categoryBusy || state.saving || galleryBusy || historyDeleting) return;
  const draft = variant();
  const title = (draft.title || session.draft.body.slice(0,42)).slice(0,90)+' · 变体';
  saving = true;
  preview();
  try {
    refreshSnapshot(await api.saveVariant({...draft,title}));
    toast('变体已另存到历史。');
  } catch (error) { toast(error,true); }
  finally { saving = false; if (session) preview(); }
};
globalThis.openSplitter = draft => { showView('splitter'); loadDraft(draft); };
globalThis.resetScopedSplitter = () => {
  input.value = '';
  clear();
  $('#splitter-group-status').textContent = '可粘贴提示词，或载入当前分类的草稿。';
};
})();
