const assert = require('node:assert/strict');
const {test} = require('node:test');
const {termExampleEntries,imageUsageEntries,personGroups} = require('../ui/rules.js');

const image = {file:'shared.png',url:'https://example.org/shared.png',name:'参考图'};
const entry = (id,tags,images) => ({id,analysis:{tags},images:{ref:[],style:[],result:[],...images}});

test('term examples match localized aliases in their own group and exclude every person branch',() => {
  const first = entry('a',{medium:['watercolor'],color:['pastel palette']},{ref:[image]});
  const second = entry('b',{medium:['水彩']},{result:[{file:'result.png'}]});
  const unrelated = entry('c',{other:['watercolor']},{result:[image]});
  const noPictures = entry('d',{medium:['watercolor']},{});
  const entries = [first,second,unrelated,noPictures];
  assert.deepEqual(termExampleEntries(entries,'medium','水彩').map(item => item.id),['a','b']);
  assert.deepEqual(termExampleEntries(entries,'medium',' Watercolor ').map(item => item.id),['a','b']);
  for (const group of personGroups) {
    assert.deepEqual(termExampleEntries([entry('person',{[group]:['watercolor']},{result:[image]})],group,'watercolor'),[]);
  }
});

test('gallery associations keep each prompt and all actual image roles without duplicate records',() => {
  const entries = [
    entry('ref',{},{ref:[image,image],result:[{file:'other.png'}]}),
    entry('both',{},{style:[{...image,previewOnly:true}],result:[{file:image.file}]}),
    entry('url',{},{ref:[{url:image.url}]}),
    entry('unrelated',{},{result:[{file:'unrelated.png'}]})
  ];
  const usages = imageUsageEntries(entries,image);
  assert.deepEqual(usages.map(item => [item.entry.id,item.roles]),[
    ['ref',['ref']],['both',['style','result']],['url',['ref']]
  ]);
  assert.equal(usages[1].stylePreviewOnly,true);
  assert.deepEqual(imageUsageEntries(entries,{file:'missing.png'}),[]);
});
