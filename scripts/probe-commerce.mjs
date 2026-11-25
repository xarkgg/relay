import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {mkdir} from 'node:fs/promises';
import express from 'express';

let puppeteer;
try {puppeteer=(await import(process.env.RELAY_PUPPETEER_PATH||'puppeteer')).default;}
catch {
  const root=execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim();
  puppeteer=(await import(pathToFileURL(`${root}/puppeteer/lib/puppeteer/puppeteer.js`).href)).default;
}
const browser=await puppeteer.launch({headless:true,pipe:true,timeout:30_000,protocolTimeout:30_000,
  executablePath:process.env.PUPPETEER_EXECUTABLE_PATH||'chromium-browser',args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
await mkdir('probe-shots',{recursive:true});
const app=express();
app.use(express.json());
let account=null,entitlements=[],record={calls:[]};
app.all('/api/commerce/*splat',(req,res,next)=>{
  record.calls.push({method:req.method,path:req.path,body:req.body,authorization:req.get('authorization'),csrf:req.get('x-relay-csrf')});
  next();
});
app.get('/api/commerce/config',(_req,res)=>res.json({authEnabled:true,checkoutEnabled:true,network:'Pi Testnet',sandbox:true,activationReady:false,price:'12500000'}));
app.get('/api/commerce/session',(_req,res)=>res.json({account:null}));
app.post('/api/commerce/auth/pi',(req,res)=>{
  assert.deepEqual(req.body,{accessToken:'fixture-access-token-123456'});
  account={id:'acct-fixture',username:'PioneerFixture'};
  res.json({account,token:'a'.repeat(64),csrf:'csrf-fixture',expires:Date.now()+3_600_000});
});
app.get('/api/commerce/purchases',(req,res)=>res.json({entitlements,pending:[]}));
app.post('/api/commerce/intents',(_req,res)=>res.status(201).json({id:'intent-fixture',amount:1.25,
  memo:'Relay Follow-up Desk / 30-day Testnet access',metadata:{relay_intent:'intent-fixture',agent:'follow-up-desk'}}));
app.post('/api/commerce/payments/pay-fixture/approve',(_req,res)=>res.json({paymentId:'pay-fixture',state:'approved'}));
app.post('/api/commerce/payments/pay-fixture/complete',(req,res)=>{
  assert.equal(req.body.txid,'a'.repeat(64));
  entitlements=[{id:'ent-fixture',agent:'follow-up-desk',network:'Pi Testnet',starts_at:Date.now(),expires_at:Date.now()+86_400_000}];
  res.json({entitlement:entitlements[0]});
});
app.post('/api/commerce/logout',(_req,res)=>{account=null;entitlements=[];res.json({ok:true});});
app.use(express.static('dist'));
const server=await new Promise(resolve=>{const server=app.listen(0,'127.0.0.1',()=>resolve(server));});
const base=`http://127.0.0.1:${server.address().port}`;
let checks=0;
const verify=(value,message)=>{assert.ok(value,message);console.log(`ok ${++checks} - ${message}`);};
const errors=[];
try {
  const context=await browser.createBrowserContext();
  const page=await context.newPage();
  await page.setViewport({width:390,height:844});
  await page.setRequestInterception(true);
  page.on('request',request=>{
    if(request.url()==='https://sdk.minepi.com/pi-sdk.js')return request.respond({status:200,contentType:'application/javascript',body:`
      window.Pi={
        init:async config=>{window.__piInit=config},
        authenticate:async(scopes,onIncomplete)=>{window.__piScopes=scopes;return {accessToken:'fixture-access-token-123456',user:{uid:'ignored-client-uid'}}},
        createPayment:(payment,callbacks)=>{window.__piPayment=payment;setTimeout(async()=>{await callbacks.onReadyForServerApproval('pay-fixture');await callbacks.onReadyForServerCompletion('pay-fixture','${'a'.repeat(64)}')},0)}
      };`});
    request.continue();
  });
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.goto(base,{waitUntil:'networkidle0'});
  await page.waitForSelector('#commerce:not([hidden])');
  verify(await page.$eval('#commerce-user',node=>node.textContent.includes('No email')),'configured preview offers Pi-only sign-in');
  verify(await page.$eval('#pi-buy',node=>node.hidden),'checkout stays hidden before sign-in');
  await page.click('#pi-signin');
  await page.waitForFunction(()=>document.querySelector('#commerce-user').textContent.includes('PioneerFixture'));
  verify(JSON.stringify(await page.evaluate(()=>window.__piScopes))===JSON.stringify(['username']),'initial sign-in requests the narrow username scope');
  verify(record.calls.find(call=>call.path.endsWith('/auth/pi')).body.uid===undefined,'client identity is not sent to the backend');
  await page.click('#pi-buy');
  await page.waitForFunction(()=>document.querySelector('#entitlements').textContent.includes('Testnet access'));
  verify(JSON.stringify(await page.evaluate(()=>window.__piScopes))===JSON.stringify(['username','payments']),'checkout reauthenticates with payment permission');
  const payment=await page.evaluate(()=>window.__piPayment);
  verify(payment.amount===1.25&&payment.metadata.relay_intent==='intent-fixture'&&Object.keys(payment).length===3,'SDK receives only the server-priced payment fields');
  const mutations=record.calls.filter(call=>/approve|complete/.test(call.path));
  verify(mutations.length===2&&mutations.every(call=>call.authorization===`Bearer ${'a'.repeat(64)}`&&call.csrf==='csrf-fixture'),'approval and completion carry the session and CSRF proof');
  verify(await page.$eval('#entitlements',node=>node.textContent.includes('activation is still pending')),'completed Testnet payment does not claim device activation');
  for (const width of [320,390,1280]) {
    await page.setViewport({width,height:width<600?844:900});
    verify(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`commerce UI has no horizontal overflow at ${width}px`);
    await page.screenshot({path:`probe-shots/commerce-${width}.png`,fullPage:true});
  }
  verify(errors.length===0,`browser errors: ${errors.join(' | ')||'none'}`);
  await context.close();
  console.log(`PASS: ${checks} commerce-browser checks with a scripted Pi SDK fixture.`);
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
