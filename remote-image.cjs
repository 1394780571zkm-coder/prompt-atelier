const dns = require('node:dns/promises');
const http = require('node:http');
const https = require('node:https');
const {BlockList} = require('node:net');
const tls = require('node:tls');
const {Readable} = require('node:stream');
const {publicUrl} = require('./ui/rules.js');

const maxImageBytes = 20 * 1024 * 1024;
const blocked = new BlockList();
for (const [address,bits] of [
  ['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],
  ['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],
  ['192.88.99.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],
  ['203.0.113.0',24],['224.0.0.0',3]
]) blocked.addSubnet(address,bits);

const activeSlots = [];
let active = 0;

async function withDownloadSlot(callback) {
  if (active >= 4) await new Promise(resolve => activeSlots.push(resolve));
  else active++;
  try { return await callback(); }
  finally {
    const next = activeSlots.shift();
    if (next) next();
    else active--;
  }
}

function requestImage(target,address,signal,proxyEnv) {
  const transport = target.protocol === 'https:' ? https : http;
  const isHttps = transport === https;
  const useProxy = Boolean(isHttps ? proxyEnv.https_proxy || proxyEnv.HTTPS_PROXY : proxyEnv.http_proxy || proxyEnv.HTTP_PROXY);
  const agent = useProxy ? new transport.Agent({proxyEnv}) : false;
  const path = target.pathname+target.search;
  return new Promise((resolve,reject) => {
    const request = transport.get({
      hostname:useProxy && isHttps ? address : target.hostname,port:isHttps ? 443 : 80,path,
      signal,agent,family:4,
      ...(isHttps ? {servername:target.hostname,ca:[...tls.getCACertificates('default'),...tls.getCACertificates('system')]} : {}),
      lookup:(_name,options,done) => options.all ? done(null,[{address,family:4}]) : done(null,address,4),
      headers:{Host:target.host,Accept:'image/png,image/jpeg,image/webp,image/gif,application/octet-stream;q=0.5','User-Agent':'Prompt Atelier/1.0'}
    },response => {
      if (agent) response.once('close',() => agent.destroy());
      resolve(response);
    });
    request.on('error',reject);
  });
}

async function readImage(value,resolveProxy,browserFetch) {
  const signal = AbortSignal.timeout(20000);
  for (let redirects = 0; redirects <= 5; redirects++) {
    if (!publicUrl(value)) throw new Error('请输入可公开访问的图片地址。');
    const target = new URL(value);
    if (target.port) throw new Error('图片链接必须使用标准 HTTP 或 HTTPS 端口。');
    const addresses = await dns.lookup(target.hostname,{family:4,all:true});
    if (!addresses.length || addresses.some(({address}) => blocked.check(address))) throw new Error('无法导入非公网地址。');
    let proxyEnv = process.env;
    if (resolveProxy && !Object.keys(process.env).some(name => /^(?:https?|all)_proxy$/i.test(name))) {
      const proxy = /^(PROXY|HTTPS) ([^;\s]+)/.exec(await resolveProxy(target.href));
      if (proxy) proxyEnv = {HTTP_PROXY:(proxy[1] === 'HTTPS'?'https://':'http://')+proxy[2],HTTPS_PROXY:(proxy[1] === 'HTTPS'?'https://':'http://')+proxy[2]};
    }
    let response;
    if (browserFetch) {
      // Chromium uses the desktop's proxy/PAC and TLS configuration, as Discord does.
      // Redirects stay manual so every destination passes the public-address checks.
      const fetched = await browserFetch(target.href,{signal,redirect:'manual',credentials:'omit',headers:{Accept:'image/png,image/jpeg,image/webp,image/gif,application/octet-stream;q=0.5'}});
      response = fetched.body ? Readable.fromWeb(fetched.body) : Readable.from([]);
      response.statusCode = fetched.status;
      response.headers = Object.fromEntries(fetched.headers);
    } else response = await requestImage(target,addresses[0].address,signal,proxyEnv);
    if ([301,302,303,307,308].includes(response.statusCode)) {
      const location = response.headers.location;
      response.destroy();
      if (!location) throw new Error('图片地址重定向无效。');
      value = new URL(location,target).href;
      continue;
    }
    if (response.statusCode !== 200 || /^(?:text\/|application\/(?:json|xml))/i.test(response.headers['content-type'] || '')) {
      response.destroy();
      if ([403,404].includes(response.statusCode) && /(?:^|\.)(?:discordapp\.(?:com|net)|discord\.com)$/.test(target.hostname))
        throw new Error('Discord 图片链接已失效或无权访问，请在 Discord 重新打开原图后再次拖入。');
      throw new Error(response.statusCode === 200 ? '该地址返回的是网页，请使用原始图片地址。' : '图片服务器返回 HTTP '+response.statusCode+'。');
    }
    if (Number(response.headers['content-length']) > maxImageBytes) {
      response.destroy();
      throw new Error('单张图片大小须在 20 MB 以内。');
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of response) {
      size += chunk.length;
      if (size > maxImageBytes) throw new Error('单张图片大小须在 20 MB 以内。');
      chunks.push(chunk);
    }
    return Buffer.concat(chunks,size);
  }
  throw new Error('图片地址重定向次数过多。');
}

function downloadImage(value,resolveProxy,browserFetch) {
  return withDownloadSlot(async () => {
    for (let attempt=0; ; attempt++) {
      try { return await readImage(value,resolveProxy,browserFetch); }
      catch (error) {
        const transient = ['ECONNRESET','ECONNREFUSED','ETIMEDOUT','EPIPE','ABORT_ERR'].includes(error.code)
          || /net::ERR_(?:CONNECTION|NETWORK|TIMED_OUT|PROXY|TUNNEL)|TLS connection|fetch failed/i.test(error.message);
        if (!transient || attempt >= 1) throw error;
      }
    }
  }).catch(error => {
    if (error.code === 'ABORT_ERR' || error.name === 'TimeoutError') throw new Error('下载图片超时，请检查网络或代理后重试。');
    if (['ENOTFOUND','EAI_AGAIN'].includes(error.code)) throw new Error('无法解析图片网站，请检查地址或网络。');
    if (['ECONNRESET','ECONNREFUSED','ETIMEDOUT','EPIPE'].includes(error.code) || /net::ERR_|TLS connection|fetch failed/i.test(error.message))
      throw new Error('图片下载连接中断，请确认系统代理可访问 Discord 图片网站后重试；也可先保存图片再拖入。');
    throw error;
  });
}

module.exports = {downloadImage,maxImageBytes};
