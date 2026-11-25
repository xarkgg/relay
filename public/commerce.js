import {formatAmount} from '/shared/invoices.js';

const $ = selector => document.querySelector(selector);
const escape = value => String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]);
let config,account=null,token='',csrf='',sdkPromise,busy=false;
let entitlements=[],pending=[],incomplete=new Set();

function message(text,error=false) {
  const node=$('#commerce-message');
  node.textContent=text;
  node.className=error?'error':'muted';
  node.hidden=!text;
}
async function request(path,{method='GET',body}={}) {
  const response=await fetch('/api/commerce'+path,{method,credentials:'same-origin',
    headers:{...(body?{'Content-Type':'application/json','X-Relay-CSRF':csrf}:{}),
      ...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});
  const result=await response.json();
  if(!response.ok) {
    const error=new Error(result.error||'The account service could not finish this action.');
    error.code=result.code;
    throw error;
  }
  return result;
}
function paint() {
  $('#pi-signin').hidden=!!account;
  $('#pi-signout').hidden=!account;
  $('#commerce-user').textContent=account?`Signed in as ${account.username||'a Pi user'}`:'Use your Pi account. No email or password required.';
  $('#pi-buy').hidden=!config.checkoutEnabled||!account||!!entitlements.length;
  $('#pi-buy').textContent=`Testnet checkout · ${config.price?formatAmount(config.price):''} Pi`;
  for(const node of document.querySelectorAll('#commerce button'))node.disabled=busy;
  $('#entitlements').innerHTML=entitlements.map(item=>`<div class="notice">Testnet access recorded until ${escape(new Date(item.expires_at).toLocaleDateString())}. Device activation is still pending.</div>`).join('');
  const ids=new Set([...incomplete,...pending.filter(item=>item.payment_id).map(item=>item.payment_id)]);
  $('#pending-payments').innerHTML=[...ids].map(id=>`<div class="export-bar"><span>Unfinished Pi payment</span><button class="secondary" data-recover="${escape(id)}" ${busy?'disabled':''}>Check payment</button></div>`).join('');
}
async function refresh() {
  if(account) {
    const result=await request('/purchases');
    entitlements=result.entitlements;pending=result.pending;
  }
  paint();
}
async function sdk() {
  if(!sdkPromise)sdkPromise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src='https://sdk.minepi.com/pi-sdk.js';
    script.onload=async()=>{
      try {
        if(!window.Pi?.authenticate)throw new Error('Pi sign-in is unavailable. Open Relay in Pi Browser.');
        await window.Pi.init({version:'2.0',sandbox:config.sandbox});
        resolve(window.Pi);
      } catch(error){reject(error);}
    };
    script.onerror=()=>{script.remove();reject(new Error('Pi could not load. Open Relay in Pi Browser and try again.'));};
    document.head.append(script);
  }).catch(error=>{sdkPromise=null;throw error;});
  return sdkPromise;
}
async function authenticate(withPayments=false) {
  const pi=await sdk();
  const auth=await pi.authenticate(withPayments?['username','payments']:['username'],payment=>{
    if(typeof payment.identifier==='string')incomplete.add(payment.identifier);
  });
  // Only the token is sent. The backend obtains identity and scopes from Pi /me.
  const result=await request('/auth/pi',{method:'POST',body:{accessToken:auth.accessToken}});
  account=result.account;token=result.token;csrf=result.csrf;
  await refresh();
}
async function action(fn) {
  if(busy)return;
  busy=true;message('');paint();
  try {await fn();}
  catch(error){message(error.message,true);}
  finally {busy=false;await refresh().catch(error=>message(error.message,true));}
}

export async function mountCommerce() {
  config=await request('/config');
  $('#checkout-status').textContent=config.checkoutEnabled?'Testnet checkout':'Pi checkout not configured';
  if(!config.authEnabled)return;
  $('#catalogue-note').textContent=config.checkoutEnabled
    ?'Pi sign-in and Testnet purchase verification are available here. Desktop activation and Mainnet checkout are still unavailable.'
    :'Pi sign-in is available here. Checkout and desktop activation are not configured.';
  $('#commerce').hidden=false;
  const session=await request('/session');
  account=session.account;csrf=session.csrf||'';
  await refresh();
  $('#pi-signin').addEventListener('click',()=>action(()=>authenticate()));
  $('#pi-signout').addEventListener('click',()=>action(async()=>{
    await request('/logout',{method:'POST',body:{}});
    account=null;token='';csrf='';entitlements=[];pending=[];incomplete.clear();
  }));
  $('#pending-payments').addEventListener('click',event=>{
    const button=event.target.closest('[data-recover]');
    if(!button)return;
    action(async()=>{
      await authenticate(true);
      try {await request(`/payments/${encodeURIComponent(button.dataset.recover)}/recover`,{method:'POST',body:{}});}
      catch(error) {
        if(error.code!=='PAYMENT_CANCELLED')throw error;
        incomplete.delete(button.dataset.recover);
        message('Pi confirmed this payment was cancelled. No access was granted.');
        return;
      }
      incomplete.delete(button.dataset.recover);
      message('Pi confirmed the Testnet access record.');
    });
  });
  $('#pi-buy').addEventListener('click',()=>action(async()=>{
    await authenticate(true);
    if(entitlements.length)return message('You already have a current Testnet access record.');
    if(incomplete.size||pending.some(item=>item.payment_id))return message('Check the unfinished payment before starting another purchase.');
    const intent=await request('/intents',{method:'POST',body:{}});
    const pi=await sdk();
    await new Promise(resolve=>{
      let settled=false;
      const finish=()=>{settled=true;resolve();};
      pi.createPayment({amount:intent.amount,memo:intent.memo,metadata:intent.metadata},{
        onReadyForServerApproval:async paymentId=>{
          if(settled)return;
          try {await request(`/payments/${encodeURIComponent(paymentId)}/approve`,{method:'POST',body:{}});}
          catch(error){message(error.message,true);}
        },
        onReadyForServerCompletion:async(paymentId,txid)=>{
          if(settled)return;
          try {
            await request(`/payments/${encodeURIComponent(paymentId)}/complete`,{method:'POST',body:{txid}});
            incomplete.delete(paymentId);
            message('Pi confirmed the Testnet access record. Device activation is still pending.');
            finish();
          } catch(error){incomplete.add(paymentId);message(error.message,true);}
        },
        onCancel:paymentId=>{
          if(settled)return;
          if(typeof paymentId==='string')incomplete.add(paymentId);
          message('Payment cancelled. Check its status before starting another purchase.');
          finish();
        },
        onError:(_error,payment)=>{
          if(settled)return;
          if(typeof payment?.identifier==='string')incomplete.add(payment.identifier);
          message('Pi did not finish checkout. Any submitted payment must be checked before trying again.',true);
          finish();
        }
      });
    });
  }));
}
