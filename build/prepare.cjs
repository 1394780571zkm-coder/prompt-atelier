const fs = require('node:fs');
const path = require('node:path');
const {modelDownloaded} = require('../translation.cjs');
const root = path.resolve(__dirname,'..');
const runtime = path.join(__dirname,'runtime','node.exe');
fs.mkdirSync(path.dirname(runtime),{recursive:true});
fs.copyFileSync(process.execPath,runtime);
if (!modelDownloaded(path.join(root,'data','translation-models'))) throw new Error('缺少本地翻译模型，不能制作完整版。');
for (const model of ['opus-mt-en-zh','m2m100_418M']) {
  const directory = path.join(root,'data','translation-models','Xenova',model);
  if (!fs.existsSync(directory)) throw new Error('缺少翻译模型：'+model);
  const complete = fs.readdirSync(directory).some(revision => {
    const target = path.join(directory,revision);
    return ['config.json','generation_config.json','tokenizer.json','tokenizer_config.json','onnx/encoder_model_quantized.onnx','onnx/decoder_model_merged_quantized.onnx']
      .every(file => fs.statSync(path.join(target,file),{throwIfNoEntry:false})?.size > 0);
  });
  if (!complete) throw new Error('翻译模型不完整：'+model);
}
for (const file of ['runtime/LICENSE','THIRD-PARTY-NOTICES.txt','opus-mt-model-card.md','m2m100-model-card.md']) {
  if (!fs.existsSync(path.join(__dirname,file))) throw new Error('缺少打包资源：'+file);
}
console.log('运行时和翻译模型已准备好。');
