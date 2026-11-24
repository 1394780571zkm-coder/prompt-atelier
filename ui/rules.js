(() => {
const elementPresets = [
  ['subject','主体','user-round',[['年轻女性','a young woman'],['狐狸','a fox'],['陶瓷花瓶','a ceramic vase'],'少女','白猫']],
  ['features','脸部与外貌','eye',[['雀斑','freckles'],['蓝色耳环','blue earrings'],'小麦色皮肤']],
  ['hairColor','发色','palette',[['黑色头发','black hair'],'栗色头发','银白色头发']],
  ['hairStyle','发型','scissors',['齐肩短发','高马尾','波浪长发']],
  ['eyes','眼睛','eye',['浅色眼眸','深棕色眼睛','碧绿双眼']],
  ['hands','手部特征','hand',['修长手指','手戴银色戒指','指尖涂有红色指甲油','戴红手套','戴黑色皮手套','戴米白色织物手套']],
  ['upper','人物 · 上半身','shirt',[['白色亚麻衬衣','white linen shirt','a white linen shirt'],['牛仔夹克','denim jacket'],['黑色高领衫','black turtleneck'],['衬衣','shirt','a shirt'],['白色衬衣','white shirt','a white shirt'],'羊毛大衣']],
  ['lower','人物 · 下半身','footprints',[['阔腿长裤','wide-leg trousers'],['百褶裙','pleated skirt'],['皮靴','leather boots'],'高腰短裤']],
  ['pose','动作与神态','person-standing',[['侧身回眸','looking over her shoulder'],['缓步行走','walking'],['温柔微笑','gentle smile'],'低头沉思']],
  ['environment','环境与背景','mountain',[]],
  ['indoor','室内场景','house',[['空旷摄影棚','empty studio'],'安静的玻璃温室','木质餐厅','公寓客厅']],
  ['tabletop','桌面元素','utensils',['陶瓷餐盘','玻璃杯与餐具','餐盘里的荷包蛋','桌上的花瓶']],
  ['outdoor','室外场景','mountain',[['薄雾森林','misty forest'],['城市夜景','city at night'],'雨夜街道']],
  ['environmentTime','时间与天气','cloud',['清晨','黄昏','阴天','细雨']],
  ['environmentDetails','背景细节','mountain',['远处朦胧的剪影','背景留白','层叠的远景','背景散布细小光点']],
  ['medium','画风','paintbrush',[['杂志插画','editorial illustration'],['水彩','watercolor'],['油画','oil painting'],['三十五毫米胶片摄影','35mm film photography'],'水彩插画']],
  ['mediumStyle','画风表现','paintbrush',['细线勾勒','复古印刷风','平涂色块','写意笔触',['照片般写实','photorealistic'],['超写实','hyperrealistic'],['极简','minimalist']]],
  ['art','艺术家与艺术流派','swatch-book',[['印象派','impressionism'],['超现实主义','surrealism'],['新艺术风格','art nouveau'],'浮世绘','抽象主义']],
  ['lighting','光线','sun',[['柔和自然光','soft daylight'],['轮廓光','rim lighting'],['体积光','volumetric light'],'柔和侧光']],
  ['color','色彩','palette',[['低饱和大地色系','muted earth tones'],['单色调','monochrome'],['浅柔配色','pastel palette'],'低饱和暖色']],
  ['mood','氛围','cloud',[['静谧怀旧','quiet and nostalgic'],['梦幻朦胧','dreamlike'],['俏皮活泼','playful'],'宁静治愈']],
  ['composition','构图与镜头','scan-line',[['近距离特写','close-up'],['宽景构图','wide shot'],['对称构图','symmetrical composition'],'俯视构图']],
  ['camera','摄影与胶片','camera',[['柯达人像八百胶片','Kodak Portra 800'],['三十五毫米焦距','35 mm','35mm'],['八十五毫米焦距','85 mm','85mm'],['一点八大光圈','f/1.8'],['移轴摄影','tilt-shift']]],
  ['render','渲染与画质','box',[['虚幻引擎渲染','Unreal Engine'],['辛烷渲染','Octane Render'],['建筑可视化','architectural visualization'],['四千分辨率','4K'],['八千分辨率','8K']]],
  ['texture','材质与细节','layers',[['细腻纸张颗粒','fine paper grain'],['清晰笔触','brush strokes'],['哑光质感','matte texture'],'纸张纹理']],
  ['other','其他描述','text',[]]
];

const categories = elementPresets.map(([key,label,icon,terms]) => [
  key,label,icon,terms.map(term => Array.isArray(term) ? term[0] : term)
]);
const localizedElements = new Map(elementPresets.flatMap(([, , ,terms]) => terms.flatMap(term =>
  Array.isArray(term) ? term.slice(1).map(alias => [alias.toLowerCase(),term[0]]) : []
)));

function isChineseElement(term) {
  return /\p{Script=Han}/u.test(term) && !/[^\p{Script=Han}\p{Number}\p{Punctuation}\p{Separator}]/u.test(term);
}

function chineseElementTerm(term) {
  return localizedElements.get(term.trim().toLowerCase().replace(/\s+/g,' ')) || (isChineseElement(term) ? term : '');
}

const parameters = [
  ['ar','画面比例','1:1','3:2','2:3','16:9','9:16','4:5'],
  ['s','风格化','50','100','250','750'],
  ['c','变化幅度','0','10','25','50'],
  ['v','模型版本','8.2','8.1','7','6.1','6','5.2','5.1','5','4','3','2','1'],
  ['niji','动漫模型','7','6','5','4'],
  ['q','质量 · 依模型而定','0.25','0.5','1','2','4'],
  ['seed','随机种子','42'],
  ['no','排除元素','text, watermark'],
  ['sref','风格参考','random'],
  ['sw','风格权重','100','250','500'],
  ['sv','风格版本','4','6'],
  ['p','个性化或情绪板'],
  ['iw','垫图权重','0.5','1','1.5','2'],
  ['edit','编辑参考图'],
  ['oref','全能参考图 · V7'],
  ['ow','全能参考权重 · V7','100','200'],
  ['w','怪异度','100','500','1000'],
  ['r','重复生成','2','3','4'],
  ['raw','Raw 模式',true],['tile','无缝平铺',true],['draft','草稿模式 · V7',true],
  ['hd','高清',true],['sd','标准清晰度',true],
  ['fast','快速',true],['relax','慢速',true],['turbo','极速',true],
  ['stealth','隐私模式',true],['public','公开模式',true],
  ['motion','视频运动','low','high'],['loop','视频循环',true],['end','视频结束帧'],['bs','视频批量','1','2','4'],['video','视频',true],
  ['style','旧版风格','raw','4a','4b','4c','cute','expressive','original','scenic'],
  ['cref','角色参考 · V6'],['cw','角色权重 · V6','0','50','100'],
  ['stop','提前停止 · 旧版','25','50','75'],['sameseed','同一随机种子 · 旧版','42'],
  ['test','测试模型 · 旧版',true],['testp','测试摄影模型 · 旧版',true],
  ['creative','创意模式 · 旧版',true],['uplight','轻度放大 · 旧版',true],['upbeta','Beta 放大 · 旧版',true],
  ['upanime','动漫放大 · 旧版',true],['hq','高画质 · 旧版',true],
  ['newclip','新 CLIP · 旧版',true],['nostretch','关闭拉伸 · 旧版',true],['old','旧模型开关 · 旧版',true],['vibe','早期模型 · 旧版',true]
];

const aliases = {aspect:'ar',stylize:'s',chaos:'c',version:'v',quality:'q',profile:'p',personalize:'p',repeat:'r',weird:'w'};
const styleGroups = new Set(['medium','mediumStyle','art','lighting','color','mood','composition','camera','render','texture']);
const personGroups = ['subject','features','hairColor','hairStyle','eyes','hands','upper','lower','pose'];
const personSubjects = ['年轻女性','少女','青年男性','年轻的植物学家'];
const elementBranches = {person:personGroups,environment:['indoor','outdoor','environmentTime','environmentDetails','lighting','mood'],indoor:['tabletop'],medium:['mediumStyle']};

// A style pack describes transferable visual treatment, never the depicted content.
// This is a final guard for both AI and offline classification results.
const styleContentPattern = /(?:人物|人像|角色|女性|男性|女人|男人|少女|女孩|男孩|女仆|模特|肖像|身体|全身|半身|面容|脸|眼睛|眼眸|嘴唇|头发|发型|胸前|胸部|腰部|手臂|双手|手指|腿部|双腿|脚部|姿势|动作|入镜|服装|服饰|上衣|衬衫|外套|连体衣|连体裤|裤子|裙子|手套|鞋子|高跟鞋|短靴|发箍|配饰|乳胶|皮革|餐盘|食物|蛋包饭|家具|桌面|道具|物件|建筑|房间|街道|森林|海边|背景|场景|文字|字体|字样|排版位置|(?:画面|图像)(?:左|右|上|下|中央|中心)|\b(?:person|people|portrait|character|woman|women|man|men|girl|boy|maid|model|body|face|eye|hair|hand|arm|leg|foot|pose|full[ -]?body|half[ -]?body|in frame|clothing|outfit|shirt|jacket|dress|pants|trousers|skirt|glove|shoe|boot|latex|leather|plate|food|table|prop|object|building|room|street|forest|background|scene|caption|typography placement)\b)/iu;

function reusableStyleTerm(term) {
  return typeof term === 'string' && term.trim() && !styleContentPattern.test(term);
}

function elementPath(group) {
  const parent = Object.keys(elementBranches).find(key => elementBranches[key].includes(group));
  return parent ? [...elementPath(parent),group] : [group];
}

function elementDescendants(group) {
  return [group,...(elementBranches[group] || []).flatMap(elementDescendants)];
}

// Stable ids let labels learned from separate records merge into one category.
function customGroupKey(label) {
  const name = String(label || '').normalize('NFKC').trim().toLowerCase();
  if (!name || name.length > 24 || !/^[\p{L}\p{N} ·-]+$/u.test(name)) return '';
  return 'custom-'+Array.from(name,character => character.codePointAt(0).toString(36)).join('-');
}

function publicUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
    if (/^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[|[^.]+$)/i.test(url.hostname) || /\.(local|localhost)$/i.test(url.hostname)) return '';
    return url.href;
  } catch {
    return '';
  }
}

function parsePrompt(input) {
  let body = input.trim().replace(/^\/imagine(?:\s+prompt:)?\s+/i,'')
    .replace(/\s+[–—-]\s+(?:<@!?\d+>|@[^\n]+?)\s*\(Open on website for full quality\)(?:\s*\([^)]*\))?\s*$/i,'')
    .replace(/\[[^\]\n]+\]\((https?:\/\/[^\s)]+)\)|<(https?:\/\/[^\s>]+)>/gi,(_match,markdown,angle) => markdown || angle);
  const refs = [];
  while (/^https?:\/\/\S+(?:\s+|$)/i.test(body)) {
    const [match] = body.match(/^https?:\/\/\S+(?:\s+|$)/i);
    const token = match.trim();
    if (!styleReferenceUrl(token)) break;
    refs.push(token);
    body = body.slice(match.length);
  }
  const tokens = [...body.matchAll(/(?:^|\s)--([a-z][a-z0-9-]*)(?=\s|$)/gi)];
  return {
    refs,
    body: body.slice(0,tokens[0]?.index ?? body.length).trim(),
    params: tokens.map((token,index) => {
      const key = token[1].toLowerCase();
      return [aliases[key] ?? key,body.slice(token.index + token[0].length,tokens[index+1]?.index ?? body.length).trim()];
    })
  };
}

function styleReferenceTokens(value='') {
  return value.split(/\s+/).filter(Boolean);
}

function styleReferenceUrl(token) {
  return publicUrl(token.replace(/::\d+(?:\.\d+)?$/,''));
}

function referenceImage(token,name) {
  const url = styleReferenceUrl(token);
  return {file:'',url,name,previewOnly:false,weight:token.match(/::(\d+(?:\.\d+)?)$/)?.[1] || ''};
}

function styleReferenceValue(draft) {
  const manual = styleReferenceTokens(new Map(draft.params).get('sref'));
  const manualUrls = new Set(manual.map(styleReferenceUrl));
  const images = draft.images.style.filter(image => !image.previewOnly && image.url && !manualUrls.has(image.url));
  return [...new Set([...manual,...images.map(image => image.url)])].join(' ');
}

function formatPrompt(draft) {
  const refs = [...new Set(draft.images.ref.filter(image => !image.previewOnly && image.url).map(image => image.url+(image.weight ? '::'+image.weight : '')))];
  const params = new Map(draft.params);
  const sref = styleReferenceValue(draft);
  if (sref) params.set('sref',sref);
  else params.delete('sref');
  return [...refs,draft.body.trim(),...formatParameters(params)].filter(Boolean).join(' ');
}

function formatParameters(params) {
  return Array.from(params,([key,value]) => ('--'+key+' '+value.trim().replace(/\s+/g,' ')).trim());
}

function removeImageReferences(record,file,urls) {
  if (!record) return record;
  const references = new Set(urls);
  const images = Object.fromEntries(Object.entries(record.images || {}).map(([role,items]) => [role,
    items.filter(image => image.file !== file && !references.has(image.url))]));
  const params = record.params.flatMap(([key,value]) => {
    if (!['sref','oref','cref','edit','end'].includes(key)) return [[key,value]];
    const original = styleReferenceTokens(value);
    const tokens = original.filter(token => !references.has(styleReferenceUrl(token)));
    return tokens.length === original.length ? [[key,value]] : tokens.length ? [[key,tokens.join(' ')]] : [];
  });
  return {...record,images,params};
}

function styleKeys(params) {
  const values = new Map(params);
  return (values.get('sref') || '').split(/\s+/).filter(code => /^\d+(?:::\d+(?:\.\d+)?)?$/.test(code))
    .map(code => [code.split('::')[0],values.get('v') || (values.get('niji') ? 'niji '+values.get('niji') : ''),values.get('sv') || ''].join('|'));
}

function suggestedGroup(value) {
  const localized = chineseElementTerm(value);
  const preset = categories.find(category => category[3].includes(localized));
  if (preset) return preset[0];
  const rules = [
    ['tabletop',/餐盘上|(?:盘子|碟子|盘中)[里上中]?[^，。]*(?:放|盛|摆|装|蛋|食)|桌面|桌上|餐具|米饭上|荷包蛋|蛋包饭|(?:on|in) (?:the |a )?(?:dinner |ceramic )?(?:plate|table)|tabletop|fried egg|tableware/iu],
    ['environmentDetails',/作为背景|画面背景|纯.*背景|背景留白|背景散布|远处.*(?:剪影|景物)|plain background|solid (?:color |colour )?background/iu],
    ['composition',/低机位|高机位|仰视|俯视|入镜|画面主体|透视缩短|字体排版|文字排版|shot|close.up|symmetr|composition|framing|构图|镜头|特写|景深|广角|近景/iu],
    ['texture',/表面[^，。]*(?:高光|反射|质感)|反光质感|texture|grain|matte|纸纹|纹理|颗粒|质感/iu],
    ['color',/人物主要配色|配色|色调|黑白|色彩|低饱和|高饱和|撞色|tones?|palette|monochrome|saturat/iu],
    ['art',/in the style of|inspired by|impressionis|surrealis|art nouveau|cubism|postmodernis|ukiyo.e|art deco|艺术家|印象派|超现实主义|立体主义|抽象主义|浮世绘|艺术流派/iu],
    ['lower',/trousers|pants|skirt|boots|sneakers|长裤|短裤|半身裙|短靴|高跟鞋|连体裤|穿[^，。]*鞋|袜|裤/iu],
    ['upper',/shirt|blouse|jacket|coat|sweater|hoodie|vest|blazer|衬衣|衬衫|夹克|上衣|毛衣|卫衣|大衣|外套|背心|绑带结构|机能服饰/iu],
    ['pose',/回望|回眸|抬[起头腿手]|仰头|扭转|侧身|伸展|托着|端着|轻触|表情|动作|姿[态势]|低头|站姿|坐姿|微笑|奔跑|smil|walking|sitting|running|looking/iu],
    ['hands',/\b(?:hands?|fingers?|fingernails?|gloves?)\b|手套|手指|双手|手部|指甲|指尖|手臂|手腕/iu],
    ['eyes',/\beyes?\b|眼睛|眼眸|瞳色|双眼|眼线|睫毛|眉毛/iu],
    ['hairStyle',/ponytail|braids?|bob cut|马尾|短发|长发|刘海|发尾|卷发|发箍|发型|辫/iu],
    ['hairColor',/(?:black|brown|red|white|silver|blond) hair|(?:黑|白|棕|红|金|银)色?头发|发色/iu],
    ['features',/面容|五官|脸庞|脸型|面庞|皮肤|肌肤|白皙|肤色|嘴唇|唇形|鼻梁|雀斑|耳环|身体曲线|手工配饰|\b(?:face|complexion|skin|lips|freckles|earrings?)\b/iu],
    ['subject',/^(?:(?:一位|一个|一名|一只).{0,24})?(?:成年女性|年轻女性|女子|少女|青年男性|男孩|女孩|狐狸|白猫)$|^(?:a |an |the )?(?:girl|boy|woman|man|fox|cat)$/iu],
    ['lighting',/\blight(?:ing)?\b|backlit|bokeh|柔光|逆光|侧光|光线|灯光|光影|自然光|夕照|轮廓光|明暗对比/iu],
    ['mood',/dreamlike|nostalgi|mood|tranquil|playful|治愈|氛围|空灵|梦幻|忧郁|宁静|怀旧/iu],
    ['indoor',/\b(?:studio|interior|kitchen|restaurant|caf[eé]|bedroom)\b|室内|摄影棚|温室|餐厅|厨房|咖啡馆|客厅|卧室|公寓/iu],
    ['outdoor',/\b(?:forest|city|garden|street|desert|beach)\b|森林|街道|海边|沙漠|户外|室外|城市街景|城市夜景/iu],
    ['environmentTime',/\b(?:dawn|dusk|sunset|rain|overcast)\b|清晨|凌晨|黄昏|傍晚|雨天|阴天|晴天|细雨/iu],
    ['environmentDetails',/\bbackground\b|背景|远景/iu],
    ['camera',/\blens\b|kodak|portra|fujifilm|f\/?\d+\.\d+|\d+\s*mm|tilt.shift|focal length|焦距|光圈|胶片|移轴/iu],
    ['render',/octane|unreal engine|corona render|cinema ?4d|blender render|quixel|\b(?:4|8|16|32)k\b|渲染|分辨率/iu],
    ['mediumStyle',/photorealis|hyper.?realis|minimali|stylized|极简|写实|未来主义|美学|色块|轮廓线|平面设计/iu],
    ['medium',/illustrat|watercolo|oil paint|gouache|anime|manga|photograph|line art|pencil sketch|digital paint|cinematic|pixel art|woodcut|flat design|插画|水彩|国风|水墨|赛璐璐|油画|版画|摄影|手绘|线稿|动漫|工笔|像素|画风|风格|海报/iu],
    ['texture',/brush stroke|笔触/iu],
    ['environment',/\bscene\b|场景/iu]
  ];
  return rules.find(([,pattern]) => pattern.test(value))?.[0] || 'other';
}

function reorganizeAnalysis(analysis={}) {
  const tags = Object.fromEntries(categories.map(([key]) => [key,[]]));
  const groups = {...analysis.groups};
  const fallbackGroup = customGroupKey('未归类细节');
  delete groups[fallbackGroup];
  const assignments = new Map();
  for (const [group,terms] of Object.entries(analysis.tags || {})) {
    if (!Array.isArray(terms)) continue;
    for (const term of terms) {
      if (typeof term !== 'string' || !term.trim()) continue;
      const suggested = suggestedGroup(term);
      const fallback = group === 'other' || group === fallbackGroup || !Object.hasOwn(tags,group) && !Object.hasOwn(groups,group);
      const refine = fallback || personGroups.includes(group) && personGroups.includes(suggested) ||
        elementPath(group)[0] === 'environment' && elementPath(suggested)[0] === 'environment' || suggested === 'tabletop';
      const target = suggested !== 'other' && (refine || group === 'traits') ? suggested
        : group === 'traits' ? 'mediumStyle' : fallback ? 'other' : group;
      const key = term.toLowerCase();
      const rank = target === 'other' ? 0 : target === suggested ? 2 : 1;
      if (!assignments.has(key) || assignments.get(key).rank < rank) assignments.set(key,{term,target,rank});
    }
  }
  for (const {term,target} of assignments.values()) (tags[target] ||= []).push(term);
  for (const key of Object.keys(groups)) if (!tags[key]?.length) delete groups[key];
  const content = [...assignments.values()].filter(({target}) => target !== 'other' && !styleGroups.has(target)).map(({term}) => term.toLowerCase());
  const style = [...new Set([...(analysis.style || []),...[...styleGroups].flatMap(key => tags[key])])]
    .filter(reusableStyleTerm)
    .filter(term => !content.some(value => term.toLowerCase().includes(value)));
  const name = reusableStyleTerm(analysis.name) ? analysis.name : '';
  return {...analysis,tags,groups,style,name};
}

function localAnalysis(body,hints={},knownGroups={}) {
  const tags = Object.fromEntries(categories.map(([key]) => [key,[]]));
  const pieces = body.split(/[,，;；。\n]+/).map(value => value.trim()).filter(Boolean).flatMap(value => {
    const english = value.match(/^(.+?)\s+(?:wearing|dressed in|in)\s+(.+)$/i);
    const chinese = value.match(/^(?:身穿|穿着|穿戴|穿)(.+?)的(.+)$/);
    const clothing = value => ['upper','lower'].includes(suggestedGroup(value));
    if (english && clothing(english[2])) return [english[1],english[2]];
    if (chinese && clothing(chinese[1])) return [chinese[2],chinese[1]];
    return [value];
  });
  const groups = {};
  for (const [index,value] of pieces.entries()) {
    const hinted = Object.keys(hints).find(key => (Object.hasOwn(tags,key) || Object.hasOwn(knownGroups,key)) && hints[key]?.includes(value));
    const group = hinted || suggestedGroup(value);
    const label = knownGroups[group];
    const custom = label && customGroupKey(label);
    if (custom) groups[custom] = label;
    const target = custom || (!hinted && group === 'other' && index === 0 ? 'subject' : group);
    (tags[target] ||= []).push(value);
  }
  return reorganizeAnalysis({tags,groups});
}

function splitPromptBody(body) {
  return body.split(/([,，;；。\r\n]+)/).flatMap((text,index) => {
    const original = text.trim();
    if (index % 2 || !original) return text ? [{text}] : [];
    const start = text.indexOf(original);
    const group = suggestedGroup(original);
    return [{text:text.slice(0,start)},{original,text:original,group},{text:text.slice(start+original.length)}];
  });
}

function validFragment(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 24000 &&
    !/--[a-z]|https?:\/\/|::|[\r\n]|^\/imagine\b/i.test(value.trim());
}

function composeSplitterBody(parts) {
  if (parts.every(part => !part.original || part.enabled !== false)) return parts.map(part => part.text).join('');
  const included = [];
  let separator = '';
  for (const part of parts) {
    if (!part.original) { separator += part.text; continue; }
    if (part.enabled !== false) included.push({text:part.text,separator});
    separator = '';
  }
  return included.map((part,index) => (index ? part.separator || ', ' : '')+part.text).join('').trim();
}

function bodyTokenState(parts) {
  let index = 0;
  const disabled = [];
  for (const part of parts) if (part.original) {
    if (part.enabled === false) disabled.push(index);
    index++;
  }
  return disabled.length ? {source:parts.map(part => part.text).join(''),disabled} : undefined;
}

function readBodyTokenState(value) {
  if (!value || typeof value.source !== 'string' || value.source.length > 24000 ||
      !Array.isArray(value.disabled) || !value.disabled.length || value.disabled.length > 12000 ||
      parsePrompt(value.source).body !== value.source.trim()) return null;
  const parts = splitPromptBody(value.source);
  const tokens = parts.filter(part => part.original);
  if (value.disabled.some(index => !Number.isInteger(index) || index < 0 || index >= tokens.length)) return null;
  for (const index of value.disabled) tokens[index].enabled = false;
  return parts;
}

function cleanBodyTokenState(body,value) {
  const parts = readBodyTokenState(value);
  return parts && composeSplitterBody(parts).trim() === body.trim() ? bodyTokenState(parts) : undefined;
}

function draftBodyParts(draft) {
  const previous = readBodyTokenState(draft.bodyTokens);
  if (!previous) return splitPromptBody(draft.body);
  if (composeSplitterBody(previous).trim() === draft.body.trim()) return previous;
  // Keep muted words recoverable when tools append or change enabled words.
  const parts = splitPromptBody(draft.body);
  const active = parts.filter(part => part.original);
  let position = 0;
  for (const part of previous) {
    if (!part.original) continue;
    if (part.enabled !== false) { position++; continue; }
    const anchor = active[Math.min(position,active.length)];
    if (anchor) {
      let boundary = parts.indexOf(anchor);
      while (boundary > 0 && !parts[boundary-1].original) boundary--;
      const insertion = boundary > 0 ? [{text:', '},{...part}] : [{...part},{text:', '}];
      parts.splice(boundary,0,...insertion);
    }
    else parts.push({text:', '},{...part});
  }
  return parts;
}

function termExampleEntries(entries,group,term) {
  if (elementPath(group)[0] === 'person') return [];
  const key = value => (chineseElementTerm(value) || value).trim().toLocaleLowerCase().replace(/\s+/g,' ');
  const query = key(term);
  return entries.filter(entry =>
    (entry.analysis?.tags?.[group] || []).some(value => key(value) === query)
    && ['ref','style','result'].some(role => (entry.images?.[role] || []).some(image => image.file || image.url)));
}

function sameImage(first,second) {
  return Boolean(first.file && first.file === second.file || first.url && second.url && publicUrl(first.url) === publicUrl(second.url));
}

function imageUsageEntries(entries,image) {
  return entries.flatMap(entry => {
    const roles = ['ref','style','result'].filter(role => (entry.images?.[role] || []).some(item => sameImage(item,image)));
    const styleMatches = (entry.images?.style || []).filter(item => sameImage(item,image));
    return roles.length ? [{entry,roles,stylePreviewOnly:styleMatches.length > 0 && styleMatches.every(item => item.previewOnly)}] : [];
  });
}

const rules = {categories,parameters,aliases,styleGroups,personGroups,personSubjects,elementBranches,elementPath,elementDescendants,reusableStyleTerm,reorganizeAnalysis,customGroupKey,publicUrl,parsePrompt,formatPrompt,formatParameters,removeImageReferences,styleKeys,styleReferenceTokens,styleReferenceUrl,styleReferenceValue,referenceImage,localAnalysis,isChineseElement,chineseElementTerm,splitPromptBody,composeSplitterBody,bodyTokenState,cleanBodyTokenState,draftBodyParts,validFragment,termExampleEntries,imageUsageEntries};
if (typeof module !== 'undefined') module.exports = rules;
else globalThis.promptRules = rules;
})();
