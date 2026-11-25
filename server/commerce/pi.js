import { RelayError, demand } from '../errors.js';

export function createPiClient({apiKey = '', base = 'https://api.minepi.com/v2'} = {}) {
  async function request(path, {method = 'GET', token, body} = {}) {
    let response;
    try {
      response = await fetch(base + path, {method, redirect:'error', signal:AbortSignal.timeout(12_000),
        headers:{Authorization:token ? `Bearer ${token}` : `Key ${apiKey}`, 'Content-Type':'application/json'},
        body:body ? JSON.stringify(body) : undefined});
    } catch { throw new RelayError('PI_UNAVAILABLE','Pi did not confirm this request. It can be safely checked again.',503); }
    if (token && response.status === 401) throw new RelayError('PI_AUTH_FAILED','Pi could not verify this sign-in.',401);
    demand(response.ok,'PI_UNAVAILABLE','Pi did not confirm this request. It can be safely checked again.',503);
    const reader = response.body.getReader();
    let bytes = 0, text = '';
    const decoder = new TextDecoder();
    try {
      for (;;) {
        const {done,value} = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 64_000) { await reader.cancel(); throw new Error('Response limit'); }
        text += decoder.decode(value,{stream:true});
      }
      return JSON.parse(text + decoder.decode());
    } catch { throw new RelayError('PI_RESPONSE_INVALID','Pi returned an invalid response. No access was granted.',502); }
    finally { reader.releaseLock(); }
  }
  const paymentPath = id => {
    demand(typeof id === 'string' && /^[a-zA-Z0-9_-]{1,120}$/.test(id),'BAD_PAYMENT_ID','Use a valid payment identifier.');
    return `/payments/${encodeURIComponent(id)}`;
  };
  return {
    me(token) {
      demand(typeof token === 'string' && token.length >= 16 && token.length <= 4096 && !/[\s\x00-\x1f]/.test(token),
        'BAD_TOKEN','Use the access token returned by Pi sign-in.');
      return request('/me',{token});
    },
    payment: id => request(paymentPath(id)),
    approve: id => request(paymentPath(id) + '/approve',{method:'POST'}),
    complete: (id,txid) => request(paymentPath(id) + '/complete',{method:'POST',body:{txid}})
  };
}
