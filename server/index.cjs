const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { StandardCheckoutClient, Env, MetaInfo, StandardCheckoutPayRequest, CreateSdkOrderRequest, RefundRequest } = require('pg-sdk-node');

const app = express();
app.use(express.json({verify:(req,res,buf)=>{try{req.rawBody=buf.toString('utf8');}catch{}}}));

app.use((req,res,next)=>{
  res.header('Access-Control-Allow-Origin','*');
  res.header('Access-Control-Allow-Methods','GET,POST,PUT,PATCH,DELETE,OPTIONS');
  const reqHdr = req.headers['access-control-request-headers'];
  res.header('Access-Control-Allow-Headers', reqHdr ? reqHdr : 'Content-Type,Authorization');
  if(req.method==='OPTIONS') return res.sendStatus(204);
  next();
});

const MERCHANT_ID = process.env.PHONEPE_MERCHANT_ID || 'MERCHANT_ID_HERE';
const SALT_KEY = process.env.PHONEPE_SALT_KEY || 'SALT_KEY_HERE';
const SALT_INDEX = process.env.PHONEPE_SALT_INDEX || '1';
const ENV = (process.env.PHONEPE_ENV || 'SANDBOX').toUpperCase();
const BASE = ENV==='PROD' ? 'https://api.phonepe.com/apis/pg' : 'https://api-preprod.phonepe.com/apis/pg-sandbox';
const CLIENT_ID = process.env.PHONEPE_CLIENT_ID || '';
const CLIENT_SECRET = process.env.PHONEPE_CLIENT_SECRET || '';
const CLIENT_VERSION = process.env.PHONEPE_CLIENT_VERSION || '';
const ACCESS_CODE = process.env.PHONEPE_ACCESS_CODE || '';
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'https://www.hoychoycafe.com';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'hoychoycafe@gmail.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'h0ych0ycafe123';
const MIN_ORDER_RUPEES = Number(process.env.MIN_ORDER_RUPEES||200);

const DATA_DIR = process.env.DATA_DIR || '/var/data';
const OV_PATH = path.join(DATA_DIR, 'overrides.json');
function ensureDir(){try{fs.mkdirSync(DATA_DIR,{recursive:true});}catch{}}
function loadOverridesFS(){ try{ ensureDir(); const s=fs.readFileSync(OV_PATH,'utf-8'); return JSON.parse(s||'{}'); }catch{ return {}; } }
function saveOverridesFS(obj){ try{ ensureDir(); fs.writeFileSync(OV_PATH, JSON.stringify(obj,null,2)); }catch{} }
const UP_URL = process.env.UPSTASH_REDIS_REST_URL || '';
const UP_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';
async function upGet(key){
  try{
    if(!UP_URL||!UP_TOKEN) return null;
    const r=await fetch(`${UP_URL}/get/${encodeURIComponent(key)}`,{headers:{Authorization:`Bearer ${UP_TOKEN}`}});
    if(!r.ok) return null;
    const j=await r.json().catch(()=>null);
    const raw = j && typeof j.result!=="undefined" ? j.result : null;
    if(raw==null || raw==='null') return null;
    try{ return JSON.parse(raw); }catch{ return raw; }
  }catch{ return null }
}
async function upSet(key, value){
  try{ if(!UP_URL||!UP_TOKEN) return false; const val=encodeURIComponent(JSON.stringify(value)); const r=await fetch(`${UP_URL}/set/${encodeURIComponent(key)}/${val}`,{method:'POST',headers:{Authorization:`Bearer ${UP_TOKEN}`}}); return r.ok; }catch{ return false }
}
let overrides = loadOverridesFS();
async function refreshOverridesFromStore(){ const v = await upGet('hc:overrides'); if(v && typeof v==='object'){ overrides = v; saveOverridesFS(overrides); } }
function saveOverrides(obj){ overrides = obj; saveOverridesFS(obj); upSet('hc:overrides', obj); }
const sessions = new Map();
const ADMIN_TOKEN_TTL_HOURS = Number(process.env.ADMIN_TOKEN_TTL_HOURS||24);
function createSession(ttlHours){ const t=crypto.randomBytes(24).toString('hex'); const hours = Number(ttlHours||ADMIN_TOKEN_TTL_HOURS)||ADMIN_TOKEN_TTL_HOURS; const exp=Date.now()+hours*60*60*1000; sessions.set(t,{exp, ttlHours:hours}); return t; }
function isValidSession(t){ const s=sessions.get(t); if(!s) return false; if(Date.now()>s.exp){ sessions.delete(t); return false; } return true; }

let tokenCache = { token: '', expiresAt: 0 };
let sdkClient = null;
function getSdkClient(){
  try{
    if(!sdkClient){
      const envObj = ENV==='PROD' ? Env.PRODUCTION : Env.SANDBOX;
      sdkClient = StandardCheckoutClient.getInstance(CLIENT_ID, CLIENT_SECRET, CLIENT_VERSION || '4.0', envObj);
    }
  }catch{}
  return sdkClient;
}

async function getAuthToken(){
  try{
    if(ACCESS_CODE) return ACCESS_CODE;
    const now = Math.floor(Date.now()/1000);
    if(tokenCache.token && tokenCache.expiresAt - 60 > now) return tokenCache.token;
    const url = ENV==='PROD'
      ? 'https://api.phonepe.com/apis/identity-manager/v1/oauth/token'
      : 'https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token';
    const body = new URLSearchParams({
      client_id: CLIENT_ID,
      client_version: CLIENT_VERSION,
      client_secret: CLIENT_SECRET,
      grant_type: 'client_credentials'
    }).toString();
    const res = await fetch(url,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
    const data = await res.json();
    if(!res.ok || !data.access_token){
      throw new Error('oauth_failed');
    }
    tokenCache = { token: data.access_token, expiresAt: data.expires_at || (now+3600) };
    return tokenCache.token;
  }catch(e){
    return '';
  }
}

function xVerify(hashInput){
  const hash = crypto.createHash('sha256').update(hashInput).digest('hex');
  return `${hash}###${SALT_INDEX}`;
}

async function phonepePay(payload){
  const path = '/checkout/v2/pay';
  const json = JSON.stringify(payload);
  const base64 = Buffer.from(json).toString('base64');
  const headers = {
    'Content-Type':'application/json',
    'X-VERIFY': xVerify(base64 + path + SALT_KEY),
    'X-MERCHANT-ID': MERCHANT_ID
  };
  const auth = await getAuthToken();
  if(auth) headers['Authorization'] = `O-Bearer ${auth}`;
  const res = await fetch(`${BASE}${path}`,{method:'POST',headers,body:JSON.stringify({request:base64})});
  const data = await res.json();
  return {ok:res.ok, data};
}

async function phonepeStatus(merchantTransactionId){
  const path = `/pg/v1/status/${MERCHANT_ID}/${merchantTransactionId}`;
  const headers = {
    'Content-Type':'application/json',
    'X-VERIFY': xVerify(path + SALT_KEY),
    'X-MERCHANT-ID': MERCHANT_ID
  };
  const auth = await getAuthToken();
  if(auth) headers['Authorization'] = `O-Bearer ${auth}`;
  const res = await fetch(`${BASE}${path}`,{method:'GET',headers});
  const data = await res.json();
  return {ok:res.ok, data};
}

async function phonepeRefund(merchantTransactionId, amount){
  const path = '/pg/v1/refund';
  const payload = {
    merchantId: MERCHANT_ID,
    merchantTransactionId,
    amount: Math.round(Number(amount)*100)
  };
  const json = JSON.stringify(payload);
  const base64 = Buffer.from(json).toString('base64');
  const headers = {
    'Content-Type':'application/json',
    'X-VERIFY': xVerify(base64 + path + SALT_KEY),
    'X-MERCHANT-ID': MERCHANT_ID
  };
  const auth = await getAuthToken();
  if(auth) headers['Authorization'] = `O-Bearer ${auth}`;
  const res = await fetch(`${BASE}${path}`,{method:'POST',headers,body:JSON.stringify({request:base64})});
  const data = await res.json();
  return {ok:res.ok, data};
}

const payments = new Map();
const orders = [];
const orderClients = new Set();
const orderRecon = new Map();

function isWithinHours(){ const h=new Date().getHours(); return h>=12 && h<21; }
app.get('/api/app-status', async (req,res)=>{
  try{ await refreshOverridesFromStore(); }catch{}
  const closed = overrides.appClosed===true || process.env.APP_CLOSED==='1';
  const open = !closed;
  const reason = closed ? 'CLOSED_BY_OWNER' : 'OPEN';
  res.json({open, reason, ownerClosed: overrides.appClosed===true, closedUntil: overrides.closedUntil||0});
});

function requireAdmin(req,res,next){
  const hdr = req.headers['authorization']||'';
  const tok = hdr.startsWith('Bearer ') ? hdr.slice(7) : hdr;
  if(isValidSession(tok)) return next();
  return res.status(401).json({error:'unauthorized'});
}

app.post('/api/admin/login', (req,res)=>{
  const { email, password, remember } = req.body||{};
  if(!ADMIN_EMAIL || !ADMIN_PASSWORD) return res.status(500).json({error:'admin-not-configured'});
  const cid = getClientId(req);
  const rec = loginAttempts.get(cid)||{count:0, blockedUntil:0};
  if(rec.blockedUntil && Date.now()<rec.blockedUntil){
    const retryAt = rec.blockedUntil;
    return res.status(429).json({error:'rate_limited', retryAt});
  }
  if(email===ADMIN_EMAIL && password===ADMIN_PASSWORD){
    loginAttempts.delete(cid);
    const token=createSession(remember ? 24*7 : ADMIN_TOKEN_TTL_HOURS);
    return res.json({ok:true, token});
  }
  rec.count = (rec.count||0)+1;
  if(rec.count>=5){ rec.blockedUntil = Date.now()+10*60*1000; rec.count=0; }
  loginAttempts.set(cid, rec);
  return res.status(401).json({error:'invalid-credentials'});
});

app.get('/api/admin/me', (req,res)=>{
  const hdr = req.headers['authorization']||'';
  const tok = hdr.startsWith('Bearer ') ? hdr.slice(7) : hdr;
  const ok = isValidSession(tok);
  if(ok){ const s=sessions.get(tok); if(s){ const hours = s.ttlHours||ADMIN_TOKEN_TTL_HOURS; s.exp=Date.now()+hours*60*60*1000; } }
  return res.json({authed:ok});
});

app.get('/api/menu-overrides', (req,res)=>{
  refreshOverridesFromStore().finally(()=>{ res.json(overrides||{}); });
});

// Debug helpers (no secrets) to verify persistence state
app.get('/api/debug/overrides', async (req,res)=>{
  try{
    const up = await upGet('hc:overrides');
    const fsOv = loadOverridesFS();
    res.json({
      upstashConfigured: !!(UP_URL && UP_TOKEN),
      upstashValue: up || null,
      filesystemValue: fsOv || null,
      activeValue: overrides || null
    });
  }catch(e){ res.status(500).json({error:'debug-failed'}); }
});

app.post('/api/order', async (req,res)=>{
  try{
    const { orderId, transactionId, customer, items, total } = req.body||{};
    if(!orderId || !Array.isArray(items) || !items.length || !customer || total==null){
      return res.status(400).json({error:'invalid-order'});
    }
    const pay = payments.get(orderId);
    if(!pay || String(pay.status)!=='SUCCESS'){
      return res.status(400).json({error:'payment-not-verified'});
    }
    const record = {
      id: orderId,
      txnId: transactionId || pay.transactionId || null,
      total: Number(total||0),
      items,
      customer,
      createdAt: Date.now()
    };
    orders.push(record);
    const payload = `data: ${JSON.stringify({type:'order.created', order:record})}\n\n`;
    orderClients.forEach((res)=>{ try{ res.write(payload); }catch{} });
    return res.json({ok:true, order:record});
  }catch(e){
    return res.status(500).json({error:'server-error', message:String(e)});
  }
});

app.get('/api/admin/orders', requireAdmin, (req,res)=>{
  const list = orders.slice().sort((a,b)=>b.createdAt-a.createdAt);
  res.json({orders:list});
});

app.get('/api/admin/orders.csv', requireAdmin, (req,res)=>{
  const list = orders.slice().sort((a,b)=>b.createdAt-a.createdAt);
  const header = ['id','createdAt','status','total','name','phone','address','note','items'].join(',');
  const rows = list.map(o=>{
    const items = (o.items||[]).map(it=>`${(it.item&&it.item.name)||''} x${it.qty}`).join(' | ');
    const cust = o.customer||{};
    const created = new Date(o.createdAt||Date.now()).toISOString();
    const status = o.status||'NEW';
    return [
      o.id,
      created,
      status,
      Number(o.total||0),
      (cust.name||'').replace(/,/g,' '),
      (cust.phone||'').replace(/,/g,' '),
      (cust.address||'').replace(/,/g,' '),
      (cust.note||'').replace(/,/g,' '),
      items.replace(/,/g,';')
    ].join(',');
  });
  const csv = [header].concat(rows).join('\n');
  res.setHeader('Content-Type','text/csv');
  res.setHeader('Content-Disposition','attachment; filename="orders.csv"');
  res.send(csv);
});

app.get('/api/admin/orders/stream', (req,res)=>{
  const hdr = req.headers['authorization']||'';
  const tokHdr = hdr.startsWith('Bearer ') ? hdr.slice(7) : hdr;
  const tok = req.query.token || tokHdr || '';
  if(!isValidSession(tok)) return res.status(401).end();
  res.setHeader('Content-Type','text/event-stream');
  res.setHeader('Cache-Control','no-cache');
  res.setHeader('Connection','keep-alive');
  res.flushHeaders && res.flushHeaders();
  const init = {type:'init', orders:orders.slice().sort((a,b)=>b.createdAt-a.createdAt)};
  res.write(`data: ${JSON.stringify(init)}\n\n`);
  orderClients.add(res);
  req.on('close', ()=>{ orderClients.delete(res); });
});

app.post('/api/admin/set-app-open', requireAdmin, (req,res)=>{
  const { open, until } = req.body || {};
  overrides.appClosed = !open;
  if(!open){
    if(typeof until==='number' && until>0){
      overrides.closedUntil = Date.now() + until;
    }else{
      // Indefinite closure until admin reopens
      overrides.closedUntil = 0;
    }
  }else{
    overrides.closedUntil = 0;
  }
  saveOverrides(overrides);
  res.json({ok:true, appClosed:overrides.appClosed, closedUntil:overrides.closedUntil||0});
});

app.post('/api/admin/set-closing-message', requireAdmin, (req,res)=>{
  try{
    const { preset, message } = req.body||{};
    overrides.closingPreset = preset || null;
    overrides.closingMessage = (message||'').trim();
    saveOverrides(overrides);
    res.json({ok:true, closingMessage:overrides.closingMessage, closingPreset:overrides.closingPreset});
  }catch(e){
    res.status(500).json({error:'server-error'});
  }
});

app.post('/api/admin/set-availability', requireAdmin, (req,res)=>{
  const { id, available } = req.body || {};
  if(!id) return res.status(400).json({error:'id required'});
  overrides.availability = overrides.availability||{};
  overrides.availability[id] = !!available;
  saveOverrides(overrides);
  res.json({ok:true});
});

app.post('/api/admin/refund', requireAdmin, async (req,res)=>{
  try{
    const { orderId, amount } = req.body||{};
    if(!orderId || amount==null) return res.status(400).json({error:'invalid-refund-request'});
    const pay = payments.get(orderId);
    if(!pay || (String(pay.status)!=='SUCCESS' && String(pay.status)!=='COMPLETED')){
      return res.status(400).json({error:'payment-not-verified'});
    }
    const client = getSdkClient();
    if(client){
      const refundId = crypto.randomBytes(16).toString('hex');
      const paisa = Math.round(Number(amount)*100);
      const request = RefundRequest.builder()
        .amount(paisa)
        .merchantRefundId(refundId)
        .originalMerchantOrderId(String(orderId))
        .build();
      const response = await client.refund(request);
      return res.json({ok:true, refundId, state:response?.state||'PENDING', details:response});
    }
    if(!MERCHANT_ID || !SALT_KEY){
      return res.status(501).json({error:'refund-not-configured'});
    }
    const resp = await phonepeRefund(orderId, amount);
    if(!resp.ok){
      return res.status(500).json({error:'phonepe-refund-failed', details:resp.data});
    }
    return res.json({ok:true, details:resp.data});
  }catch(e){
    return res.status(500).json({error:'server-error', message:String(e)});
  }
});

app.get('/api/admin/refund-status/:id', requireAdmin, async (req,res)=>{
  try{
    const id = req.params.id;
    const client = getSdkClient();
    if(!client) return res.status(500).json({error:'sdk-not-configured'});
    const response = await client.getRefundStatus(String(id));
    return res.json({ok:true, state:response?.state||'PENDING', details:response});
  }catch(e){
    return res.status(500).json({error:'server-error', message:String(e)});
  }
});

app.post('/api/admin/add-item', requireAdmin, (req,res)=>{
  const { id, name, price, veg, category } = req.body||{};
  if(!name || price==null) return res.status(400).json({error:'name and price required'});
  const item = { id: id||String(Date.now()), name, price:Number(price||0), veg:!!veg, category:category||'Misc', available:true };
  overrides.added = Array.isArray(overrides.added)?overrides.added:[];
  overrides.added.push(item);
  saveOverrides(overrides);
  res.json({ok:true, item});
});

app.post('/api/admin/remove-item', requireAdmin, (req,res)=>{
  const { id } = req.body||{};
  if(!id) return res.status(400).json({error:'id required'});
  overrides.removed = Array.isArray(overrides.removed)?overrides.removed:[];
  if(!overrides.removed.includes(id)) overrides.removed.push(id);
  saveOverrides(overrides);
  res.json({ok:true});
});

function parseCoordsFromUrl(u){
  try{
    const q=u.searchParams.get('q')||u.searchParams.get('ll')||u.searchParams.get('query');
    let mm=q&&q.match(/^\s*(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)\s*$/);
    if(mm) return {lat:Number(mm[1]),lng:Number(mm[2]), q};
    const atMatch = u.pathname.match(/@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/);
    if(atMatch) return {lat:Number(atMatch[1]),lng:Number(atMatch[2]), q};
    return {q};
  }catch{return null}
}

app.post('/api/resolve-maps', async (req,res)=>{
  try{
    const { url } = req.body||{};
    if(!url) return res.status(400).json({error:'url-required'});
    const u = new URL(String(url));
    const host=u.hostname.toLowerCase();
    if(!(host.includes('google.com')||host.includes('goo.gl'))) return res.status(400).json({error:'unsupported-host'});
    let parsed = parseCoordsFromUrl(u);
    if(parsed && parsed.lat!=null && parsed.lng!=null) return res.json({coord:{lat:parsed.lat,lng:parsed.lng}});
    const r = await fetch(String(url), {redirect:'follow'});
    const finalUrl = r.url || String(url);
    const uf = new URL(finalUrl);
    parsed = parseCoordsFromUrl(uf);
    if(parsed && parsed.lat!=null && parsed.lng!=null) return res.json({coord:{lat:parsed.lat,lng:parsed.lng}, finalUrl});
    const qStr = parsed && parsed.q ? parsed.q : null;
    if(qStr){
      try{
        const geo = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(qStr)}`,{headers:{'User-Agent':'HoyChoyCafe/1.0'}});
        const arr = await geo.json();
        if(Array.isArray(arr) && arr.length){
          const item = arr[0];
          const lat = Number(item.lat), lng = Number(item.lon);
          if(Number.isFinite(lat)&&Number.isFinite(lng)) return res.json({coord:{lat,lng}, provider:'osm'});
        }
      }catch{}
    }
    return res.status(400).json({error:'coords-not-found', finalUrl});
  }catch(e){
    return res.status(400).json({error:'invalid-url'});
  }
});

app.post('/api/initiate-payment', async (req,res)=>{
  try{
    const { amount, orderId, customerPhone, customerName, expireAfter } = req.body;
    if(!amount || !orderId) return res.status(400).json({error:'amount and orderId required'});
    if(Number(amount) < MIN_ORDER_RUPEES) return res.status(400).json({error:'min-order-amount', min:MIN_ORDER_RUPEES});
    const client = getSdkClient();
    if(!client) return res.status(500).json({error:'sdk-not-configured'});
    const paisa = Math.round(Number(amount)*100);
    const metaInfo = MetaInfo.builder()
      .udf1(String(customerPhone||''))
      .udf2(String(customerName||''))
      .build();
    const request = StandardCheckoutPayRequest.builder()
      .merchantOrderId(String(orderId))
      .amount(paisa)
      .redirectUrl(String(`${PUBLIC_BASE_URL}/?merchantTransactionId=${orderId}`))
      .metaInfo(metaInfo)
      .build();
    const response = await client.pay(request);
    const url = response?.redirect_url || response?.redirectUrl || null;
    if(!url) return res.status(500).json({error:'phonepe-init-failed', details:response});
    payments.set(orderId, {status:'PENDING', amount});
    startReconcile(orderId, Number(expireAfter)||1800);
    return res.json({redirectUrl:url, orderId});
  }catch(e){
    return res.status(500).json({error:'server-error', message:String(e)});
  }
});

app.post('/api/create-sdk-order', async (req,res)=>{
  try{
    const { amount, orderId } = req.body||{};
    if(!amount || !orderId) return res.status(400).json({error:'missing-fields'});
    if(Number(amount) < MIN_ORDER_RUPEES) return res.status(400).json({error:'min-order-amount', min:MIN_ORDER_RUPEES});
    const client = getSdkClient();
    if(!client) return res.status(500).json({error:'sdk-not-configured'});
    const paisa = Math.round(Number(amount)*100);
    const request = CreateSdkOrderRequest.StandardCheckoutBuilder()
      .merchantOrderId(String(orderId))
      .amount(paisa)
      .redirectUrl(String(`${PUBLIC_BASE_URL}/?merchantTransactionId=${orderId}`))
      .build();
    const response = await client.createSdkOrder(request);
    const token = response?.token || null;
    if(!token) return res.status(500).json({error:'create-sdk-order-failed', details:response});
    payments.set(orderId, {status:'PENDING', amount});
    return res.json({token, orderId});
  }catch(e){
    return res.status(500).json({error:'server-error', message:String(e)});
  }
});

app.post('/api/payment-callback', (req,res)=>{
  try{
    const { merchantTransactionId, transactionId, state } = req.body || {};
    const client = getSdkClient();
    const auth = req.headers['authorization']||'';
    const cbUser = process.env.PHONEPE_CB_USER||'';
    const cbPass = process.env.PHONEPE_CB_PASS||'';
    if(client && cbUser && cbPass && auth && req.rawBody){
      try{
        const validated = client.validateCallback(cbUser, cbPass, auth, req.rawBody);
        const payload = validated?.payload||{};
        const orderId = String(payload.originalMerchantOrderId||payload.orderId||merchantTransactionId||'');
        const txn = String(payload.transactionId||transactionId||'');
        const st = String(payload.state||state||'PENDING');
        if(orderId){ payments.set(orderId, {status:st, transactionId:txn}); }
        return res.json({ok:true, state:st});
      }catch(e){
        if(merchantTransactionId){ payments.set(merchantTransactionId, {status:state, transactionId}); }
        return res.json({ok:true, state});
      }
    }else{
      if(merchantTransactionId){ payments.set(merchantTransactionId, {status:state, transactionId}); }
      return res.json({ok:true, state});
    }
  }catch{
    res.status(500).json({error:'callback-error'});
  }
});

app.post('/api/phonepe/webhook', (req,res)=>{
  try{
    const client = getSdkClient();
    const auth = req.headers['authorization']||'';
    const cbUser = process.env.PHONEPE_CB_USER||'';
    const cbPass = process.env.PHONEPE_CB_PASS||'';
    if(client && cbUser && cbPass && req.rawBody){
      try{
        const validated = client.validateCallback(cbUser, cbPass, auth, req.rawBody);
        const event = validated?.event || validated?.type || '';
        const payload = validated?.payload||{};
        const orderId = String(payload.originalMerchantOrderId||payload.orderId||'');
        const txn = String(payload.transactionId||'');
        const st = String(payload.state||'PENDING');
        if(orderId){
          const mapped = st==='COMPLETED' ? 'SUCCESS' : (st==='FAILED' ? 'FAILED' : 'PENDING');
          payments.set(orderId, {status:mapped, transactionId:txn});
        }
        if(event && event.startsWith('pg.refund')){
          const rid = String(payload.merchantRefundId||payload.refundId||'');
          const msg = `data: ${JSON.stringify({type:'refund.updated', orderId, refundId:rid, state:st})}\n\n`;
          orderClients.forEach((res)=>{ try{ res.write(msg); }catch{} });
        }
        return res.json({ok:true});
      }catch(e){
        return res.status(400).json({error:'invalid-callback'});
      }
    }
    return res.json({ok:true});
  }catch{
    res.status(500).json({error:'callback-error'});
  }
});

app.get('/api/payment-status/:id', async (req,res)=>{
  try{
    const id = req.params.id;
    const resp = await phonepeStatus(id);
    if(!resp.ok) return res.status(500).json({error:'phonepe-status-failed', details:resp.data});
    const code = resp.data?.code;
    const status = resp.data?.data?.state || 'PENDING';
    const transactionId = resp.data?.data?.transactionId || null;
    payments.set(id, {status, transactionId});
    res.json({status, transactionId, code});
  }catch(e){
    res.status(500).json({error:'server-error', message:String(e)});
  }
});

app.get('/api/order-status/:id', async (req,res)=>{
  try{
    const orderId = req.params.id;
    const client = getSdkClient();
    if(!client) return res.status(500).json({error:'sdk-not-configured'});
    const response = await client.getOrderStatus(String(orderId));
    const status = response?.state || 'PENDING';
    const list = Array.isArray(response?.payment_details) ? response.payment_details : [];
    const latest = list.length ? list[list.length-1] : null;
    const transactionId = latest?.transactionId || null;
    payments.set(orderId, {status, transactionId});
    res.json({status, transactionId, order: response});
  }catch(e){
    res.status(500).json({error:'sdk-order-status-failed', message:String(e)});
  }
});

function startReconcile(orderId, expireAfter){
  try{ if(orderRecon.has(orderId)) return; }catch{}
  const start = Date.now();
  let elapsed = 0;
  let stage = -1;
  const plan = [
    {delay:20000, freq:0},
    {duration:30000, freq:3000},
    {duration:60000, freq:6000},
    {duration:60000, freq:10000},
    {duration:60000, freq:30000},
    {duration:Infinity, freq:60000}
  ];
  async function poll(){
    try{
      const client = getSdkClient();
      if(!client){ scheduleNext(); return; }
      const response = await client.getOrderStatus(String(orderId));
      const status = response?.state || 'PENDING';
      const list = Array.isArray(response?.payment_details) ? response.payment_details : [];
      const latest = list.length ? list[list.length-1] : null;
      const txn = latest?.transactionId || null;
      payments.set(orderId,{status, transactionId:txn});
      const age = Math.floor((Date.now()-start)/1000);
      if(status==='COMPLETED' || status==='FAILED' || age>=expireAfter){ stop(); return; }
      scheduleNext();
    }catch{ scheduleNext(); }
  }
  function scheduleNext(){
    const ageMs = Date.now()-start;
    if(stage<0){ stage=0; setTimer(plan[0].delay); return; }
    let acc=0; for(let i=1;i<plan.length;i++){ const seg=plan[i]; acc+=seg.duration; if(ageMs<=plan[0].delay+acc){ setTimer(seg.freq); return; } }
    setTimer(plan[plan.length-1].freq);
  }
  let t=null;
  function setTimer(ms){ clearTimeout(t); t=setTimeout(poll, ms); orderRecon.set(orderId,{t}); }
  function stop(){ try{ clearTimeout(t); orderRecon.delete(orderId); }catch{} }
  scheduleNext();
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>{
  console.log(`PhonePe server listening on http://localhost:${PORT}`);
});
app.post('/api/admin/order-delivered', requireAdmin, (req,res)=>{
  try{
    const { id } = req.body||{};
    if(!id) return res.status(400).json({error:'id required'});
    const idx = orders.findIndex(o=>String(o.id)===String(id));
    if(idx<0) return res.status(404).json({error:'order-not-found'});
    orders[idx] = { ...orders[idx], status:'DELIVERED', deliveredAt: Date.now() };
    const payload = `data: ${JSON.stringify({type:'order.updated', order:orders[idx]})}\n\n`;
    orderClients.forEach((res)=>{ try{ res.write(payload); }catch{} });
    return res.json({ok:true, order:orders[idx]});
  }catch(e){
    return res.status(500).json({error:'server-error'});
  }
});

app.post('/api/admin/order-delete', requireAdmin, (req,res)=>{
  try{
    const { id } = req.body||{};
    if(!id) return res.status(400).json({error:'id required'});
    const idx = orders.findIndex(o=>String(o.id)===String(id));
    if(idx<0) return res.status(404).json({error:'order-not-found'});
    const removed = orders.splice(idx,1)[0];
    const payload = `data: ${JSON.stringify({type:'order.deleted', id:String(id)})}\n\n`;
    orderClients.forEach((res)=>{ try{ res.write(payload); }catch{} });
    return res.json({ok:true, id:String(id)});
  }catch(e){
    return res.status(500).json({error:'server-error'});
  }
});

app.post('/api/admin/orders-clear', requireAdmin, (req,res)=>{
  try{
    orders.length = 0;
    const payload = `data: ${JSON.stringify({type:'orders.cleared'})}\n\n`;
    orderClients.forEach((res)=>{ try{ res.write(payload); }catch{} });
    return res.json({ok:true});
  }catch(e){
    return res.status(500).json({error:'server-error'});
  }
});
const loginAttempts = new Map();
function getClientId(req){
  try{
    const xf = (req.headers['x-forwarded-for']||'').split(',')[0].trim();
    return xf || req.ip || 'unknown';
  }catch{ return 'unknown'; }
}
// SEO endpoints served by backend (do not interfere with SPA rendering)
app.get('/robots.txt', (req, res) => {
  try{
    const origin = (process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
    const txt = `User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`;
    res.set('Content-Type','text/plain');
    res.send(txt);
  }catch{ res.set('Content-Type','text/plain'); res.send('User-agent: *\nAllow: /\n'); }
});

app.get('/sitemap.xml', (req, res) => {
  const origin = (process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  const paths = ['/', '/privacy', '/terms', '/refund', '/shipping', '/about', '/reserve', '/admin'];
  const now = new Date().toISOString();
  const urls = paths.map(p=>`  <url>\n    <loc>${origin}${p}</loc>\n    <lastmod>${now}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>${p==='/'?'1.00':'0.80'}</priority>\n  </url>`).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;
  res.set('Content-Type','application/xml');
  res.send(xml);
});
