const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {Worker,isMainThread,parentPort,workerData} = require('node:worker_threads');

const models = {
  english:{
    id:'Xenova/opus-mt-en-zh',revision:'046f55aec303cdee3e0318604406d4df20f1e8ea',
    files:[
      ['encoder_model_quantized.onnx',52899742,'d3b7912bf6a9bd27e4c074c2df91d4ff3d5b4bc5f7f6c8d7cc9c805c98fbafee'],
      ['decoder_model_merged_quantized.onnx',60212804,'023be4f841f4c47cd65fffcbaa81c0d99d7f7e0138f7ba0e03fa220a4e688aff']
    ]
  },
  multilingual:{
    id:'Xenova/m2m100_418M',revision:'9c374f0b7aca709787cea97b047bfbbd1559d177',
    files:[
      ['encoder_model_quantized.onnx',287856370,'13a94e354a9140764eb81102d77d3ec6952d796e6f113c651eeb3c3443da0386'],
      ['decoder_model_merged_quantized.onnx',344128178,'007654bcabb6cea6fd3bde34ce933137b431330b3755781145d7b6906270b45a']
    ]
  }
};
const metadataFiles = ['config.json','generation_config.json','tokenizer_config.json','tokenizer.json'];

function modelDownloaded(cacheDir) {
  return Object.values(models).some(model => {
    const dir = path.join(cacheDir,model.id,model.revision);
    return model.files.every(([file,size]) => fileSize(path.join(dir,'onnx',file)) === size)
      && metadataFiles.every(file => fileSize(path.join(dir,file)) > 0);
  });
}

function fileSize(file) { return fs.statSync(file,{throwIfNoEntry:false})?.size || 0; }

async function fetchRange(url,start,end,size) {
  for (let attempt=0; ; attempt++) {
    try {
      const response = await fetch(url,{
        headers:{Range:'bytes='+start+'-'+end},signal:AbortSignal.timeout(30000)
      });
      if (response.status !== 206 || response.headers.get('content-range') !== 'bytes '+start+'-'+end+'/'+size) {
        await response.body?.cancel();
        throw new Error('模型下载返回了无效的文件分段（HTTP '+response.status+'）。');
      }
      const chunk = await response.bytes();
      if (chunk.length !== end-start+1) throw new Error('模型下载中断。');
      return chunk;
    } catch (error) {
      if (attempt >= 4) throw error;
      await new Promise(resolve => setTimeout(resolve,500*(attempt+1)));
    }
  }
}

async function downloadMetadata(cacheDir,model,file) {
  const dir = path.join(cacheDir,model.id,model.revision);
  const target = path.join(dir,file);
  if (fileSize(target)) return;
  for (let attempt=0; ; attempt++) {
    try {
      const response = await fetch('https://huggingface.co/'+model.id+'/resolve/'+model.revision+'/'+file,{signal:AbortSignal.timeout(30000)});
      if (!response.ok) throw new Error('翻译模型配置下载失败。');
      const text = await response.text();
      JSON.parse(text);
      await fs.promises.mkdir(dir,{recursive:true});
      await fs.promises.writeFile(target+'.tmp',text,'utf8');
      await fs.promises.rename(target+'.tmp',target);
      return;
    } catch (error) {
      if (attempt >= 4) throw error;
      await new Promise(resolve => setTimeout(resolve,500*(attempt+1)));
    }
  }
}

async function downloadWeights(cacheDir,model,[file,size,checksum],index,progress) {
  const dir = path.join(cacheDir,model.id,model.revision,'onnx');
  const target = path.join(dir,file);
  if (fileSize(target) === size) return;
  await fs.promises.mkdir(dir,{recursive:true});
  const partial = target+'.part';
  let offset = fileSize(partial);
  if (offset > size) {
    await fs.promises.truncate(partial,0);
    offset = 0;
  }
  const report = () => progress({stage:'download',percent:Math.floor(offset/size*100),file:index+1});
  report();
  const url = 'https://huggingface.co/'+model.id+'/resolve/'+model.revision+'/onnx/'+file+'?download=true';
  const chunkSize = 1024*1024;
  while (offset < size) {
    const requests = [];
    for (let start=offset; start < Math.min(size,offset+3*chunkSize); start+=chunkSize) {
      requests.push(fetchRange(url,start,Math.min(size,start+chunkSize)-1,size));
    }
    for (const result of await Promise.allSettled(requests)) {
      if (result.status === 'rejected') throw result.reason;
      await fs.promises.appendFile(partial,result.value);
      offset += result.value.length;
    }
    report();
  }
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(partial)) hash.update(chunk);
  if (hash.digest('hex') !== checksum) {
    await fs.promises.unlink(partial);
    throw new Error('翻译模型校验失败。');
  }
  await fs.promises.rename(partial,target);
}

function createTranslator(cacheDir,onProgress) {
  let worker;
  let active;
  let queue = Promise.resolve();
  const run = (text,source) => {
    if (!worker) {
      const current = worker = new Worker(__filename,{workerData:{cacheDir}});
      const fail = error => {
        if (current !== worker) return;
        worker = null;
        active?.reject(error);
        active = null;
      };
      worker.on('error',() => fail(new Error('本地翻译未能启动，请重试。')));
      worker.on('exit',() => fail(new Error('本地翻译已退出，请重试。')));
      worker.on('message',({type,value}) => {
        if (type === 'progress') return onProgress(value);
        if (!active) return;
        if (type === 'result') active.resolve(value);
        else active.reject(new Error(value));
        active = null;
      });
      worker.unref();
    }
    return new Promise((resolve,reject) => {
      active = {resolve,reject};
      worker.postMessage({text,source});
    });
  };
  return (text,source) => {
    const texts = Array.isArray(text) ? text : [text];
    if (!texts.length || texts.length > 200 || texts.some(value => typeof value !== 'string' || !value.trim()) || texts.reduce((sum,value) => sum+value.length,0) > 24000)
      throw new Error('请输入 1–24000 字符、最多 200 个正文片段。');
    if (source !== undefined && source !== 'en') throw new Error('无效的翻译语言。');
    const job = queue.then(() => run(text,source));
    queue = job.catch(() => {});
    return job;
  };
}

function chunks(text) {
  const lines = text.trim().split(/\r?\n/);
  return lines.map(line => {
    const remaining = Array.from(line.trim());
    const parts = [];
    while (remaining.length) {
      let end = Math.min(remaining.length,300);
      if (remaining.length > end) {
        const natural = remaining.slice(0,end).findLastIndex(char => /[\s,;.!?，。；！？、]/u.test(char));
        if (natural >= 180) end = natural+1;
      }
      parts.push(remaining.splice(0,end).join('').trim());
    }
    return parts.filter(Boolean);
  });
}

function sourceLanguage(text,detect,languageMap,supported) {
  if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text)) return 'ja';
  if (/\p{Script=Hangul}/u.test(text)) return 'ko';
  if (/\p{Script=Han}/u.test(text) && !/[\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Arabic}]/u.test(text)) return 'zh';
  const only = Object.keys(languageMap).filter(id => !supported || supported.has(languageMap[id]));
  const language = languageMap[detect(text,{only,minLength:12})];
  if (language) return language;
  if (/^\s*[\p{Script=Latin}\p{M}\p{N}\p{P}\p{S}\s]+$/u.test(text)) return 'en';
  return languageMap[detect(text,{only,minLength:1})];
}

if (!isMainThread) {
  require('node:http').setGlobalProxyFromEnv?.();
  const progress = value => parentPort.postMessage({type:'progress',value});
  let libraries;
  const engines = new Map();
  parentPort.on('message',async ({text,source}) => {
    try {
      if (!libraries) {
        progress({stage:'loading'});
        const [{pipeline,env},{franc},{iso6393To1}] = await Promise.all([
          import('@huggingface/transformers'),import('franc-min'),import('iso-639-3')
        ]);
        env.cacheDir = workerData.cacheDir;
        env.allowLocalModels = true;
        env.allowRemoteModels = false;
        libraries = {pipeline,franc,iso6393To1};
      }
      const {pipeline,franc,iso6393To1} = libraries;
      const input = Array.isArray(text) ? text : [text];
      const detected = source || sourceLanguage(input.join(' ').slice(0,2000),franc,iso6393To1);
      if (!detected) throw new Error('没能识别原文语言。请尝试输入更完整的句子。');
      const model = detected === 'en' ? models.english : models.multilingual;
      let translate = engines.get(model.id);
      if (!translate) {
        progress({stage:'loading'});
        const {cacheDir} = workerData;
        const downloads = await Promise.allSettled([
          ...model.files.map((file,index) => downloadWeights(cacheDir,model,file,index,progress)),
          ...metadataFiles.map(file => downloadMetadata(cacheDir,model,file))
        ]);
        const failure = downloads.find(result => result.status === 'rejected');
        if (failure) throw failure.reason;
        progress({stage:'loading'});
        translate = await pipeline('translation',model.id,{
          revision:model.revision,device:'cpu',dtype:'q8',session_options:{intraOpNumThreads:2,interOpNumThreads:1}
        });
        engines.set(model.id,translate);
      }
      const supported = model === models.english ? new Set(['en']) : new Set(translate.tokenizer.language_codes);
      if (detected !== 'zh' && !supported.has(detected)) throw new Error('本地模型暂不支持这段文字的语言。');
      const lines = input.map(value => chunks(value));
      const total = lines.flat().reduce((count,line) => count+line.length,0);
      let current = 0;
      const result = [];
      for (const item of lines) {
        const translatedLines = [];
        for (const line of item) {
          const translated = [];
          for (const part of line) {
            progress({stage:'translating',current:++current,total});
            const language = detected === 'zh' ? sourceLanguage(part,franc,iso6393To1,supported) : detected;
            if (language === 'zh' || !language || !/\p{L}/u.test(part)) translated.push(part);
            else {
              const [{translation_text:value}] = await translate(part,{src_lang:language,tgt_lang:'zh',max_new_tokens:420});
              translated.push(value);
            }
          }
          translatedLines.push(translated.join(' '));
        }
        result.push(translatedLines.join('\n'));
      }
      parentPort.postMessage({type:'result',value:Array.isArray(text) ? result : result[0]});
    } catch (error) {
      console.warn('本地翻译失败',error.message);
      parentPort.postMessage({type:'error',value:'本地翻译失败，请检查网络连接和磁盘空间后重试。'});
    }
  });
}

module.exports = {createTranslator,modelDownloaded};
