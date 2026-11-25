const {test} = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const {Readable} = require('node:stream');
const {fetchDesktopImage} = require('../desktop-image.cjs');

function transport(onEnd) {
  const request = new EventEmitter();
  request.setHeader = () => {};
  request.abort = () => request.emit('error',new Error('Redirect was cancelled'));
  request.end = () => onEnd(request);
  return {request:options => {
    assert.equal(options.redirect,'manual');
    const verifiedSite = /^https:\/\/(?:cdn\.midjourney\.com|s\.mj\.run)\//.test(options.url);
    assert.equal(options.credentials,verifiedSite?'include':'omit');
    assert.equal(options.useSessionCookies,verifiedSite);
    return request;
  }};
}

test('desktop redirect returns its destination despite cancellation from Electron',async () => {
  const net = transport(request => request.emit('redirect',307,'GET','https://cdn.midjourney.com/image.png'));
  const result = await fetchDesktopImage(net,{},'https://s.mj.run/example',{signal:AbortSignal.timeout(1000),headers:{}});
  assert.equal(result.status,307);
  assert.equal(result.headers.get('location'),'https://cdn.midjourney.com/image.png');
  assert.equal(result.body,null);
});

test('desktop transport preserves image bytes and response headers',async () => {
  const net = transport(request => {
    const response = Readable.from([Buffer.from([1,2,3])]);
    response.statusCode = 200;
    response.headers = {'content-type':['image/png']};
    request.emit('response',response);
    response.on('end',() => request.emit('close'));
  });
  const result = await fetchDesktopImage(net,{},'https://cdn.midjourney.com/image.png',{signal:AbortSignal.timeout(1000),headers:{}});
  assert.equal(result.headers.get('content-type'),'image/png');
  assert.deepEqual([...new Uint8Array(await new Response(result.body).arrayBuffer())],[1,2,3]);
});
