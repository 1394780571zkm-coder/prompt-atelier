const assert = require('node:assert/strict');
const {test} = require('node:test');
const {splitPromptBody,composeSplitterBody,parsePrompt,formatPrompt} = require('../ui/rules.js');
const {bodyTokenState,cleanBodyTokenState,draftBodyParts} = require('../ui/rules.js');

test('draft token state restores muted words, duplicates, weights and original ordering',() => {
  const parts = splitPromptBody('水彩::2，森林，水彩');
  parts.filter(part => part.original)[2].enabled = false;
  const draft = {body:composeSplitterBody(parts).trim(),bodyTokens:bodyTokenState(parts)};
  assert.equal(draft.body,'水彩::2，森林');
  assert.deepEqual(cleanBodyTokenState(draft.body,draft.bodyTokens),draft.bodyTokens);
  const restored = draftBodyParts(JSON.parse(JSON.stringify(draft)));
  assert.equal(restored.filter(part => part.original)[2].enabled,false);
  restored.filter(part => part.original)[2].enabled = true;
  assert.equal(composeSplitterBody(restored),'水彩::2，森林，水彩');
  assert.equal(cleanBodyTokenState('其他正文',draft.bodyTokens),undefined);
  assert.equal(cleanBodyTokenState('',{source:'word --seed 42',disabled:[0]}),undefined);
});

test('adding enabled words preserves muted words without changing active separators',() => {
  for (const muted of [[0],[1],[2],[0,1],[1,2]]) {
    const parts = splitPromptBody('a,b,c');
    const words = parts.filter(part => part.original);
    muted.forEach(index => { words[index].enabled = false; });
    const body = composeSplitterBody(parts).trim()+', d';
    const reconciled = draftBodyParts({body,bodyTokens:bodyTokenState(parts)});
    assert.equal(composeSplitterBody(reconciled).trim(),body);
    assert.deepEqual(reconciled.filter(part => part.original && part.enabled === false).map(part => part.text),muted.map(index => words[index].text));
    assert.ok(cleanBodyTokenState(body,bodyTokenState(reconciled)));
  }
});

test('token switches remove orphan separators and re-enable the exact original body',() => {
  const original = '  woman::2，  misty forest；watercolor\nsoft light  ';
  const parts = splitPromptBody(original);
  const tokens = parts.filter(part => part.original);
  assert.equal(composeSplitterBody(parts),original);
  tokens[0].enabled = false;
  assert.equal(composeSplitterBody(parts),'misty forest；watercolor\nsoft light');
  tokens[2].enabled = false;
  assert.equal(composeSplitterBody(parts),'misty forest\nsoft light');
  tokens[3].enabled = false;
  assert.equal(composeSplitterBody(parts),'misty forest');
  tokens[1].enabled = false;
  assert.equal(composeSplitterBody(parts),'');
  for (const token of tokens) token.enabled = true;
  assert.equal(composeSplitterBody(parts),original);
});

test('staged fragment replacements preserve original text, weights, refs and parameters',() => {
  const parsed = parsePrompt('https://example.org/ref.png portrait::2, forest, watercolor --ar 16:9 --sref 123 --seed 42');
  const parts = splitPromptBody(parsed.body);
  const tokens = parts.filter(part => part.original);
  tokens[1].text = 'ocean';
  assert.equal(tokens[1].original,'forest');
  const output = formatPrompt({...parsed,body:composeSplitterBody(parts),images:{ref:parsed.refs.map(url => ({url})),style:[],result:[]}});
  assert.equal(output,'https://example.org/ref.png portrait::2, ocean, watercolor --ar 16:9 --sref 123 --seed 42');
  tokens[1].enabled = false;
  assert.equal(composeSplitterBody(parts),'portrait::2, watercolor');
  tokens[1].enabled = true;
  assert.equal(composeSplitterBody(parts),'portrait::2, ocean, watercolor');
});
