import { createCommerceApp } from '../server/commerce/app.js';

let app;
export default function handler(req,res) {
  try {
    app ||= createCommerceApp();
    const url = new URL(req.url,'http://localhost');
    const route = url.searchParams.get('relay_route');
    req.url = route ? `/${route}` : url.pathname.replace(/^\/api\/commerce/,'') || '/';
    return app(req,res);
  } catch {
    res.statusCode = 503;
    res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({code:'CONFIGURATION_REQUIRED',error:'Relay accounts need a valid operator configuration.'}));
  }
}
