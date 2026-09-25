const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
// PhonePe's pg-sdk-node tarball (phonepe.mycloudrepo.io) started shipping
// without any code, so every deploy installed an empty SDK and all payments
// failed. We now call PhonePe's Standard Checkout v2 REST API directly; these
// tiny builders keep the old SDK call style used below.
function makeBuilder(){ const o={}; const b=new Proxy({}, { get:(_,k)=> k==='build' ? ()=>({...o}) : (v)=>{ o[k]=v; return b; } }); return b; }
const MetaInfo = { builder: makeBuilder };
const StandardCheckoutPayRequest = { builder: makeBuilder };
const RefundRequest = { builder: makeBuilder };

const app = express();
// Render/Vercel sit behind one proxy hop; this makes req.ip the real client IP
// (used for login rate limiting) instead of a spoofable X-Forwarded-For value.
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS||1));
app.use('/api/admin/upload-image', express.json({limit:'3mb'}));
app.use(express.json({limit:'200kb', verify:(req,res,buf)=>{try{req.rawBody=buf.toString('utf8');}catch{}}}));
app.use((req,res,next)=>{
  res.header('X-Content-Type-Options','nosniff');
  res.header('Referrer-Policy','no-referrer');
  next();
});

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
const BASE = process.env.PHONEPE_BASE_URL || (ENV==='PROD' ? 'https://api.phonepe.com/apis/pg' : 'https://api-preprod.phonepe.com/apis/pg-sandbox');
const CLIENT_ID = process.env.PHONEPE_CLIENT_ID || '';
const CLIENT_SECRET = process.env.PHONEPE_CLIENT_SECRET || '';
const CLIENT_VERSION = process.env.PHONEPE_CLIENT_VERSION || '';
const ACCESS_CODE = process.env.PHONEPE_ACCESS_CODE || '';
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'https://www.hoychoycafe.com';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'hoychoycafe@gmail.com';
// Legacy fallback so existing deployments keep working; the admin panel nags
// until it is changed. Set ADMIN_PASSWORD in the environment to override.
const LEGACY_DEFAULT_PASSWORD = 'h0ych0ycafe123';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || LEGACY_DEFAULT_PASSWORD;
const ADMIN_WHATSAPP_PHONE = process.env.ADMIN_WHATSAPP_PHONE || '';
const WA_PHONE_NUMBER_ID = process.env.WA_PHONE_NUMBER_ID || '';
const WA_ACCESS_TOKEN = process.env.WA_ACCESS_TOKEN || '';
const MIN_ORDER_RUPEES = Number(process.env.MIN_ORDER_RUPEES||200);
const ADMIN_REMEMBER_TTL_DAYS = Number(process.env.ADMIN_REMEMBER_TTL_DAYS||365);
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID || '';

const DATA_DIR = process.env.DATA_DIR || (fs.existsSync('/var/data') ? '/var/data' : path.join(__dirname, 'data'));
const OV_PATH = path.join(DATA_DIR, 'overrides.json');
const SESS_PATH = path.join(DATA_DIR, 'sessions.json');
const AUTH_PATH = path.join(DATA_DIR, 'admin-auth.json');
function ensureDir(){try{fs.mkdirSync(DATA_DIR,{recursive:true});}catch{}}
function loadOverridesFS(){ try{ ensureDir(); const s=fs.readFileSync(OV_PATH,'utf-8'); return JSON.parse(s||'{}'); }catch{ return {}; } }
function saveOverridesFS(obj){ try{ ensureDir(); fs.writeFileSync(OV_PATH, JSON.stringify(obj,null,2)); }catch{} }
function loadSessionsFS(){ try{ ensureDir(); const s=fs.readFileSync(SESS_PATH,'utf-8'); return JSON.parse(s||'{}'); }catch{ return {}; } }
function saveSessionsFS(map){ try{ ensureDir(); const obj={}; map.forEach((val,key)=>{ obj[key]=val; }); fs.writeFileSync(SESS_PATH, JSON.stringify(obj,null,2)); }catch{} }
function loadAuthFS(){ try{ ensureDir(); const s=fs.readFileSync(AUTH_PATH,'utf-8'); return JSON.parse(s||'{}'); }catch{ return {}; } }
function saveAuthFS(obj){ try{ ensureDir(); fs.writeFileSync(AUTH_PATH, JSON.stringify(obj,null,2)); }catch{} }

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
  // Value goes in the request body, not the URL path: large payloads (orders,
  // menus with many overrides) overflow URL length limits and silently fail.
  try{ if(!UP_URL||!UP_TOKEN) return false; const r=await fetch(`${UP_URL}/set/${encodeURIComponent(key)}`,{method:'POST',headers:{Authorization:`Bearer ${UP_TOKEN}`},body:JSON.stringify(value)}); return r.ok; }catch{ return false }
}
async function upDel(key){
  try{ if(!UP_URL||!UP_TOKEN) return false; const r=await fetch(`${UP_URL}/del/${encodeURIComponent(key)}`,{method:'POST',headers:{Authorization:`Bearer ${UP_TOKEN}`}}); return r.ok; }catch{ return false }
}

function safeEqual(a, b){
  const ba = Buffer.from(String(a)); const bb = Buffer.from(String(b));
  if(ba.length !== bb.length){ crypto.timingSafeEqual(ba, ba); return false; }
  return crypto.timingSafeEqual(ba, bb);
}
function hashPassword(pwd){
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pwd), salt, 64).toString('hex');
  return { salt, hash };
}
function verifyHashed(pwd, rec){
  try{
    const h = crypto.scryptSync(String(pwd), rec.salt, 64).toString('hex');
    return safeEqual(h, rec.hash);
  }catch{ return false }
}

let dynamicAdminAuth = loadAuthFS();
async function refreshAdminAuthFromStore(){
  try{
    const v = await upGet('hc:admin_auth');
    if(v && typeof v==='object' && (v.hash || v.password)){
      dynamicAdminAuth = v;
      saveAuthFS(dynamicAdminAuth);
    }
  }catch{}
}
async function storeAdminPassword(pwd){
  dynamicAdminAuth = { ...hashPassword(pwd), updatedAt: Date.now() };
  saveAuthFS(dynamicAdminAuth);
  await upSet('hc:admin_auth', dynamicAdminAuth);
}
function checkAdminPassword(pwd){
  const rec = dynamicAdminAuth || {};
  if(rec.hash && rec.salt) return verifyHashed(pwd, rec);
  if(rec.password){
    const ok = safeEqual(pwd, rec.password);
    // Upgrade legacy plaintext storage to a hash on first successful login.
    if(ok) storeAdminPassword(pwd).catch(()=>{});
    return ok;
  }
  return safeEqual(pwd, ADMIN_PASSWORD);
}
function isUsingDefaultPassword(){
  const rec = dynamicAdminAuth || {};
  if(rec.hash) return verifyHashed(LEGACY_DEFAULT_PASSWORD, rec);
  if(rec.password) return rec.password === LEGACY_DEFAULT_PASSWORD;
  return ADMIN_PASSWORD === LEGACY_DEFAULT_PASSWORD;
}

let overrides = loadOverridesFS();
let lastOverridesRefresh = 0;
async function refreshOverridesFromStore(force = false){
  const now = Date.now();
  if(!force && now - lastOverridesRefresh < 4000){ return; }
  const v = await upGet('hc:overrides');
  if(v && typeof v==='object'){ overrides = v; saveOverridesFS(overrides); }
  lastOverridesRefresh = now;
}
function saveOverrides(obj){ overrides = obj; saveOverridesFS(obj); lastOverridesRefresh = Date.now(); upSet('hc:overrides', obj); }
const sessions = new Map();
try{ const obj = loadSessionsFS(); if(obj && typeof obj==='object'){ const m=new Map(Object.entries(obj)); sessions.clear(); m.forEach((val,key)=>sessions.set(key,val)); } }catch{}
const ADMIN_TOKEN_TTL_HOURS = Number(process.env.ADMIN_TOKEN_TTL_HOURS||24);
const ADMIN_MAX_CONCURRENT_SESSIONS = Number(process.env.ADMIN_MAX_CONCURRENT_SESSIONS||6);
async function refreshSessionsFromStore(){
  try{
    const v = await upGet('hc:sessions');
    const src = (v && typeof v==='object') ? v : loadSessionsFS();
    if(src && typeof src==='object'){
      Object.entries(src).forEach(([key,val])=>{
        const cur = sessions.get(key);
        if(!cur || (val && val.exp>cur.exp)) sessions.set(key,val);
      });
      persistSessions();
    }
  }catch{}
}
function persistSessions(){ try{ saveSessionsFS(sessions); const obj={}; sessions.forEach((val,key)=>{ obj[key]=val; }); upSet('hc:sessions', obj); }catch{} }
function createSession(ttlHours){
  const t=crypto.randomBytes(24).toString('hex');
  const hours = Number(ttlHours||ADMIN_TOKEN_TTL_HOURS)||ADMIN_TOKEN_TTL_HOURS;
  const now = Date.now();
  const exp = now + hours*60*60*1000;
  sessions.set(t,{exp, ttlHours:hours, createdAt: now, lastActive: now});
  persistSessions();
  return t;
}
function pruneSessions(){
  const now = Date.now();
  sessions.forEach((s,k)=>{ if(!s || now>s.exp) sessions.delete(k); });
  // Too many devices: sign out the least recently used one rather than
  // locking the owner out of their own panel.
  while(sessions.size >= ADMIN_MAX_CONCURRENT_SESSIONS){
    let oldestKey=null, oldest=Infinity;
    sessions.forEach((s,k)=>{ const t=s.lastActive||s.createdAt||0; if(t<oldest){ oldest=t; oldestKey=k; } });
    if(oldestKey==null) break;
    sessions.delete(oldestKey);
  }
}
function revokeSessions(exceptToken){
  const keep = exceptToken ? sessions.get(exceptToken) : null;
  sessions.clear();
  if(keep) sessions.set(exceptToken, keep);
  persistSessions();
}
function isValidSession(t){ if(!t) return false; const s=sessions.get(t); if(!s) return false; const now=Date.now(); if(now>s.exp){ sessions.delete(t); persistSessions(); return false; } s.lastActive = now; return true; }

let tokenCache = { token: '', expiresAt: 0 };
let sdkClient = null;
async function phonepeApi(method, path, body){
  const token = await getAuthToken();
  if(!token) throw new Error('phonepe_auth_failed');
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type':'application/json', 'Authorization': `O-Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000)
  });
  const data = await r.json().catch(()=>({}));
  if(r.status===401){ tokenCache = { token:'', expiresAt:0 }; }
  if(!r.ok){
    console.log('phonepe_api_error', method, path, r.status, JSON.stringify(data).slice(0,300));
    const e = new Error(data?.message || data?.code || `phonepe_http_${r.status}`); e.details = data; throw e;
  }
  return data;
}
function getSdkClient(){
  if(!CLIENT_ID || !CLIENT_SECRET) return null;
  if(sdkClient) return sdkClient;
  sdkClient = {
    async pay(req){
      return phonepeApi('POST', '/checkout/v2/pay', {
        merchantOrderId: String(req.merchantOrderId),
        amount: Number(req.amount),
        expireAfter: 1800,
        metaInfo: req.metaInfo || {},
        paymentFlow: { type:'PG_CHECKOUT', message:'HoyChoy Café order', merchantUrls:{ redirectUrl: String(req.redirectUrl) } }
      });
    },
    async getOrderStatus(merchantOrderId){
      const d = await phonepeApi('GET', `/checkout/v2/order/${encodeURIComponent(merchantOrderId)}/status?details=false`);
      return { ...d, payment_details: d.paymentDetails || d.payment_details || [] };
    },
    async refund(req){
      return phonepeApi('POST', '/payments/v2/refund', {
        merchantRefundId: String(req.merchantRefundId),
        originalMerchantOrderId: String(req.originalMerchantOrderId),
        amount: Number(req.amount)
      });
    },
    async getRefundStatus(merchantRefundId){
      return phonepeApi('GET', `/payments/v2/refund/${encodeURIComponent(merchantRefundId)}/status`);
    },
    // PhonePe signs webhooks with Authorization: SHA256("username:password").
    validateCallback(username, password, authHeader, rawBody){
      const expected = crypto.createHash('sha256').update(`${username}:${password}`).digest('hex');
      const got = String(authHeader||'').replace(/^SHA256\s*/i,'').trim().toLowerCase();
      if(!got || !safeEqual(got, expected)) throw new Error('invalid_callback_signature');
      const body = JSON.parse(rawBody);
      return { event: body.event, type: body.event, payload: body.payload || {} };
    }
  };
  return sdkClient;
}

async function getAuthToken(){
  try{
    if(ACCESS_CODE) return ACCESS_CODE;
    const now = Math.floor(Date.now()/1000);
    if(tokenCache.token && tokenCache.expiresAt - 60 > now) return tokenCache.token;
    const url = process.env.PHONEPE_OAUTH_URL || (ENV==='PROD'
      ? 'https://api.phonepe.com/apis/identity-manager/v1/oauth/token'
      : 'https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token');
    const body = new URLSearchParams({
      client_id: CLIENT_ID,
      client_version: CLIENT_VERSION || '1',
      client_secret: CLIENT_SECRET,
      grant_type: 'client_credentials'
    }).toString();
    const res = await fetch(url,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body, signal: AbortSignal.timeout(15000)});
    const data = await res.json().catch(()=>({}));
    if(!res.ok || !data.access_token){
      console.log('phonepe_oauth_failed', res.status, JSON.stringify(data).slice(0,200));
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
// Orders used to live only in memory, so every Render restart/sleep wiped the
// order history. They are now mirrored to disk and Upstash.
const ORDERS_PATH = path.join(DATA_DIR, 'orders.json');
const MAX_STORED_ORDERS = Number(process.env.MAX_STORED_ORDERS||1500);
const orders = (()=>{ try{ ensureDir(); const a=JSON.parse(fs.readFileSync(ORDERS_PATH,'utf-8')||'[]'); return Array.isArray(a)?a:[]; }catch{ return []; } })();
let ordersSaveTimer = null;
function persistOrders(){
  clearTimeout(ordersSaveTimer);
  ordersSaveTimer = setTimeout(()=>{
    try{
      if(orders.length > MAX_STORED_ORDERS){
        orders.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
        orders.length = MAX_STORED_ORDERS;
      }
      ensureDir(); fs.writeFileSync(ORDERS_PATH, JSON.stringify(orders));
      upSet('hc:orders', orders);
    }catch{}
  }, 400);
}
async function loadOrdersFromStore(){
  try{
    const v = await upGet('hc:orders');
    if(Array.isArray(v)){
      const byId = new Map(orders.map(o=>[String(o.id), o]));
      v.forEach(o=>{ if(o && o.id!=null && !byId.has(String(o.id))){ orders.push(o); byId.set(String(o.id), o); } });
    }
    orders.forEach(o=>{ if(o.paymentState) payments.set(String(o.id), {status:o.paymentState==='PAID'?'COMPLETED':o.paymentState, transactionId:o.txnId||null}); });
  }catch{}
}
loadOrdersFromStore();
const orderClients = new Set();
const orderRecon = new Map();
const tgOrderReminderTimers = new Map();
const tgPayPendingTimers = new Map();

function findOrderById(id){
  try{ return orders.find(o=>String(o.id)===String(id)) || null; }catch{ return null }
}
function upsertOrder(record){
  try{
    const idx = orders.findIndex(o=>String(o.id)===String(record.id));
    if(idx<0){
      let rec = { ...record };
      try{
        if(!rec.tgCreatedNotified){
          const text = fmtTGNewOrder(rec);
          sendTelegram(text).then(r=>{
            if(r && r.ok){
              try{ const i=orders.findIndex(o=>String(o.id)===String(rec.id)); if(i>=0){ orders[i] = { ...orders[i], tgCreatedNotified:true }; broadcast({type:'order.updated', order:orders[i]}); } }catch{}
            }else{ try{ console.log('telegram_send_failed_new_order', r && r.data); }catch{} }
          }).catch(()=>{ try{ console.log('telegram_send_error_new_order'); }catch{} });
        }
      }catch{}
      try{
        const st=String(rec.status||'PENDING');
        if(st==='PENDING' && !rec.tgPendingPayNotified){
          sendTelegram(fmtTGPendingPayment(rec)).then(r=>{
            if(r && r.ok){ try{ const i=orders.findIndex(o=>String(o.id)===String(rec.id)); if(i>=0){ orders[i] = { ...orders[i], tgPendingPayNotified:true }; broadcast({type:'order.updated', order:orders[i]}); } }catch{} }
            else{ try{ console.log('telegram_send_failed_pending', r && r.data); }catch{} }
          }).catch(()=>{ try{ console.log('telegram_send_error_pending'); }catch{} });
        }
      }catch{}
      orders.push(rec);
      scheduleOrderReminder(String(rec.id||''));
      broadcast({type:'order.created', order:rec});
      return rec;
    }
    orders[idx] = { ...orders[idx], ...record };
    try{ const st = String(orders[idx].status||''); if(st==='ACCEPTED'||st==='DELIVERED'||st==='CANCELLED'){ clearOrderReminder(String(orders[idx].id||'')); } }catch{}
    broadcast({type:'order.updated', order:orders[idx]});
    return orders[idx];
  }catch{ return null }
}
function broadcast(payload){
  if(payload && /^order/.test(String(payload.type||''))) persistOrders();
  const msg = `data: ${JSON.stringify(payload)}\n\n`;
  orderClients.forEach((res)=>{ try{ res.write(msg); }catch{} });
}
async function sendWhatsApp(body){
  try{
    const id = WA_PHONE_NUMBER_ID;
    const tok = WA_ACCESS_TOKEN;
    const to = ADMIN_WHATSAPP_PHONE;
    if(!id||!tok||!to) return {ok:false};
    const url = `https://graph.facebook.com/v19.0/${id}/messages`;
    const r = await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${tok}`},body:JSON.stringify({messaging_product:'whatsapp',to,type:'text',text:{body}})});
    const data = await r.json().catch(()=>null);
    return {ok:r.ok, data};
  }catch{ return {ok:false}; }
}
function formatOrderWhatsApp(o){
  try{
    const amt = Number(o.total||0);
    const items = Array.isArray(o.items)?o.items:[];
    const cnt = items.reduce((s,it)=> s + Number(it.qty||0), 0);
    const link = `${PUBLIC_BASE_URL}/admin`;
    const lines = [];
    lines.push(`🟢 New Paid Order`);
    lines.push(`ID: ${o.id}`);
    lines.push(`Amount: ₹${amt}`);
    lines.push(`Items: ${cnt}`);
    lines.push(`Payment: PhonePe UPI`);
    lines.push(link);
    return lines.join('\n');
  }catch{ return 'New paid order'; }
}

async function sendTelegram(text){
  try{
    const tok = overrides?.storeSettings?.telegramBotToken || TELEGRAM_BOT_TOKEN;
    const chat = overrides?.storeSettings?.telegramChatId || TELEGRAM_ADMIN_CHAT_ID;
    if(!tok||!chat) return {ok:false};
    const url = `https://api.telegram.org/bot${tok}/sendMessage`;
    const r = await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:chat,text:String(text)})});
    const data = await r.json().catch(()=>null);
    return {ok:r.ok, data};
  }catch{ return {ok:false}; }
}

function fmtTGNewOrder(o){
  try{
    const name = (o.customer&&o.customer.name)||'';
    const amt = Number(o.total||0);
    const st = String(o.status||'INITIATED');
    const lines = [];
    lines.push(`🆕 New Order`);
    if(name) lines.push(`Name: ${name}`);
    lines.push(`ID: ${o.id}`);
    lines.push(`Amount: ₹${amt}`);
    lines.push(`Method: PhonePe`);
    lines.push(`Payment: ${st}`);
    return lines.join('\n');
  }catch{ return 'New order'; }
}
function fmtTGPaySuccess(o){
  try{
    const amt = Number(o.total||0);
    const items = Array.isArray(o.items)?o.items:[];
    const cust = o.customer||{};
    const nm = String(cust.name||'').trim();
    const ph = String(cust.phone||'').trim();
    const addr = String(cust.address||'').trim();
    let map = '';
    try{
      const g=cust.geo;
      if(g && g.lat!=null && g.lng!=null){ map = `https://maps.google.com/?q=${Number(g.lat)},${Number(g.lng)}`; }
      else if(cust.manualLink){ map = String(cust.manualLink); }
    }catch{}
    const names = items.map(it=>`${(it.item&&it.item.name)||it.name||''} ×${Number(it.qty||0)}`).filter(Boolean);
    const preview = names.slice(0,4).join(', ');
    const more = names.length>4 ? `, +${names.length-4} more` : '';
    const lines = [];
    lines.push(`💳 Payment Successful`);
    lines.push(`ID: ${o.id}`);
    lines.push(`Amount: ₹${amt}`);
    if(preview) lines.push(preview + more);
    if(nm || ph) lines.push(`👤 ${nm}${ph?` · ${ph}`:''}`);
    if(addr) lines.push(`🏠 ${addr}`);
    if(map) lines.push(`📍 ${map}`);
    lines.push(`Method: PhonePe`);
    return lines.join('\n');
  }catch{ return 'Payment successful'; }
}
function fmtTGPayFailed(o){
  try{
    const amt = Number(o.total||0);
    const lines = [];
    lines.push(`❌ Payment Failed`);
    lines.push(`ID: ${o.id}`);
    lines.push(`Amount: ₹${amt}`);
    lines.push(`Method: PhonePe`);
    return lines.join('\n');
  }catch{ return 'Payment failed'; }
}
function fmtTGPendingPayment(o){
  try{
    const amt = Number(o.total||0);
    const items = Array.isArray(o.items)?o.items:[];
    const cust = o.customer||{};
    const nm = String(cust.name||'').trim();
    const ph = String(cust.phone||'').trim();
    const addr = String(cust.address||'').trim();
    let map = '';
    try{
      const g=cust.geo;
      if(g && g.lat!=null && g.lng!=null){ map = `https://maps.google.com/?q=${Number(g.lat)},${Number(g.lng)}`; }
      else if(cust.manualLink){ map = String(cust.manualLink); }
    }catch{}
    const names = items.map(it=>`${(it.item&&it.item.name)||it.name||''} ×${Number(it.qty||0)}`).filter(Boolean);
    const preview = names.slice(0,4).join(', ');
    const more = names.length>4 ? `, +${names.length-4} more` : '';
    const lines = [];
    lines.push(`⚠️ Payment Pending`);
    lines.push(`ID: ${o.id}`);
    if(amt>0) lines.push(`Amount: ₹${amt}`);
    if(preview) lines.push(preview + more);
    if(nm || ph) lines.push(`👤 ${nm}${ph?` · ${ph}`:''}`);
    if(addr) lines.push(`🏠 ${addr}`);
    if(map) lines.push(`📍 ${map}`);
    lines.push(`Action: Check admin panel`);
    return lines.join('\n');
  }catch{ return 'Payment pending'; }
}
function fmtTGPendingOrder(o){
  try{
    const lines = [];
    lines.push(`⏰ Pending Order Reminder`);
    lines.push(`ID: ${o.id}`);
    lines.push(`Waiting for admin action`);
    return lines.join('\n');
  }catch{ return 'Pending order reminder'; }
}
function fmtTGStatusChange(o, status){
  try{
    const pretty = String(status||o.status||'UPDATED').toUpperCase();
    const lines = [];
    lines.push(`🔄 Order Status: ${pretty}`);
    lines.push(`Order ID: #${o.id}`);
    if(o.prepTime && pretty === 'ACCEPTED') lines.push(`⏱ Prep Time: ${o.prepTime}`);
    if(o.cancelReason && pretty === 'CANCELLED') lines.push(`❌ Reason: ${o.cancelReason}`);
    if(o.customer?.name) lines.push(`👤 Customer: ${o.customer.name} (${o.customer.phone||''})`);
    if(o.customer?.address) lines.push(`📍 Address: ${o.customer.address}`);
    if(o.total) lines.push(`💰 Total: ₹${o.total}`);
    return lines.join('\n');
  }catch{ return 'Order status updated'; }
}

// ---- Payment state (single source of truth) --------------------------------
const FULFILMENT_STATUSES = ['ACCEPTED','PREPARING','OUT_FOR_DELIVERY','DELIVERED','CANCELLED'];
function mapPaymentState(raw){
  const s = String(raw||'').toUpperCase();
  if(s==='COMPLETED'||s==='SUCCESS'||s==='PAID'||s==='PAYMENT_SUCCESS') return 'PAID';
  if(s==='FAILED'||s==='PAYMENT_ERROR'||s==='PAYMENT_DECLINED') return 'FAILED';
  return 'PENDING';
}
function applyPaymentState(orderId, rawState, txn){
  const id = String(orderId||''); if(!id) return null;
  const mapped = mapPaymentState(rawState);
  if(findOrderById(id)?.paymentState==='PAID' && mapped!=='PAID') return findOrderById(id);
  payments.set(id, {status: mapped==='PAID' ? 'COMPLETED' : mapped, transactionId: txn||null});
  const existing = findOrderById(id) || { id, createdAt: Date.now(), total: 0, items: [], customer: {}, status:'PENDING' };
  // Once PhonePe has confirmed payment, a stale "pending" answer can't undo it.
  if(existing.paymentState==='PAID' && mapped!=='PAID') return existing;
  // A late webhook must never drag an order the kitchen already accepted back to "PAID".
  const status = FULFILMENT_STATUSES.includes(String(existing.status)) ? existing.status : mapped;
  const updated = { ...existing, status, paymentState: mapped, txnId: txn || existing.txnId || null };
  if(mapped==='PAID' && !existing.paidAt) updated.paidAt = Date.now();
  const saved = upsertOrder(updated) || updated;
  if(mapped==='PAID' && !existing.tgPaySuccessNotified){
    sendWhatsApp(formatOrderWhatsApp(saved)).catch(()=>{});
    sendTelegram(fmtTGPaySuccess(saved)).then(r=>{
      if(r && r.ok) upsertOrder({ id, notified:true, tgPaySuccessNotified:true });
      else console.log('telegram_send_failed_pay_success', r && r.data);
    }).catch(()=>{});
  }
  if(mapped==='FAILED' && !existing.tgPayFailedNotified){
    sendTelegram(fmtTGPayFailed(saved)).then(r=>{ if(r && r.ok) upsertOrder({ id, tgPayFailedNotified:true }); }).catch(()=>{});
  }
  if(mapped!=='PENDING') clearPaymentPendingReminder(id);
  return saved;
}
// Asks PhonePe directly. Used whenever a request claims a payment changed but
// cannot prove it (unsigned callbacks, customer refreshing the status page).
const lastVerify = new Map();
async function verifyWithPhonePe(orderId, minGapMs = 5000){
  const id = String(orderId||''); if(!id) return null;
  const now = Date.now();
  if(now - (lastVerify.get(id)||0) < minGapMs) return findOrderById(id);
  lastVerify.set(id, now);
  try{
    const client = getSdkClient(); if(!client) return null;
    const response = await client.getOrderStatus(id);
    const list = Array.isArray(response?.payment_details) ? response.payment_details : [];
    const txn = list.length ? list[list.length-1]?.transactionId : null;
    return applyPaymentState(id, response?.state || 'PENDING', txn);
  }catch{ return null }
}

// ---- Server-side pricing ----------------------------------------------------
// The browser used to send the amount to charge and the server trusted it, so a
// customer could edit the request and pay ₹1 for a full order.
const CAFE_LAT = Number(process.env.CAFE_LAT||26.194053);
const CAFE_LNG = Number(process.env.CAFE_LNG||93.866083);
const DEFAULT_DELIVERY_RATES = { maxRadius: 10, tiers: [ {upToKm:5, fee:60}, {upToKm:8, fee:80}, {upToKm:10, fee:120} ] };
let baseMenuCache = null;
function getBaseMenu(){
  if(baseMenuCache) return baseMenuCache;
  try{ baseMenuCache = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/data/menu.json'),'utf8')); }catch{ baseMenuCache = { items: [] }; }
  return baseMenuCache;
}
function getServerMenuItems(){
  const ov = overrides || {};
  const removed = new Set(Array.isArray(ov.removed) ? ov.removed : []);
  const edited = (ov.edited && typeof ov.edited==='object') ? ov.edited : {};
  const avail = (ov.availability && typeof ov.availability==='object') ? ov.availability : {};
  const map = new Map();
  (getBaseMenu().items||[]).forEach(it=>{ if(it && it.id && !removed.has(it.id)) map.set(it.id, { ...it, ...(edited[it.id]||{}) }); });
  (Array.isArray(ov.added) ? ov.added : []).forEach(it=>{ if(it && it.id && !removed.has(it.id)) map.set(it.id, { ...it }); });
  map.forEach((it,id)=>{ if(avail[id]!=null) it.available = !!avail[id]; });
  return map;
}
function haversineKm(lat1,lon1,lat2,lon2){
  const toRad=(v)=>v*Math.PI/180, R=6371;
  const dLat=toRad(lat2-lat1), dLon=toRad(lon2-lon1);
  const a=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
function priceOrder({ items, couponCode, coord }){
  const menu = getServerMenuItems();
  const lines = [];
  for(const raw of (Array.isArray(items)?items:[])){
    const id = String(raw?.id || raw?.item?.id || '');
    const qty = Math.floor(Number(raw?.qty||0));
    if(!id || !(qty>0) || qty>50) return { error:'invalid-items' };
    const it = menu.get(id);
    if(!it) return { error:'item-unavailable', item: String(raw?.name||raw?.item?.name||id) };
    if(it.available===false) return { error:'item-unavailable', item: it.name };
    lines.push({ id, name: it.name, qty, price: Number(it.price||0) });
  }
  if(!lines.length) return { error:'empty-cart' };
  const ss = overrides?.storeSettings || {};
  const subtotal = lines.reduce((s,l)=>s+l.price*l.qty, 0);
  let discountPct = 0, coupon = null;
  if(couponCode){
    const key = String(couponCode).trim().toUpperCase();
    const c = (overrides?.coupons||{})[key];
    if(c && c.enabled && Number(c.percent)>0){ discountPct = Math.min(100, Number(c.percent)); coupon = key; }
  }
  const discounted = Math.max(0, Math.round(subtotal*(1-discountPct/100)));
  const gstPercent = ss.gstPercent!=null ? Math.max(0, Number(ss.gstPercent)) : 5;
  const gst = Math.round(discounted*gstPercent/100);
  const rates = (overrides?.deliveryRates?.tiers?.length) ? overrides.deliveryRates : DEFAULT_DELIVERY_RATES;
  const tiers = rates.tiers.slice().sort((a,b)=>a.upToKm-b.upToKm);
  let deliveryFee = Number(tiers[0]?.fee ?? 60), distanceKm = null;
  if(coord && Number.isFinite(Number(coord.lat)) && Number.isFinite(Number(coord.lng))){
    distanceKm = Number(haversineKm(CAFE_LAT, CAFE_LNG, Number(coord.lat), Number(coord.lng)).toFixed(2));
    const maxR = Number(rates.maxRadius || tiers[tiers.length-1]?.upToKm || 10);
    const tier = distanceKm <= maxR ? tiers.find(t=>distanceKm<=t.upToKm) : null;
    if(!tier) return { error:'out-of-range', distanceKm, maxRadius:maxR };
    deliveryFee = Number(tier.fee);
  }
  const packagingFee = Math.max(0, Number(ss.packagingFee||0));
  const grandTotal = discounted + gst + deliveryFee + packagingFee;
  return { lines, subtotal, discountPct, coupon, discounted, gstPercent, gst, deliveryFee, distanceKm, packagingFee, grandTotal };
}
function isStoreClosedNow(){
  if(process.env.APP_CLOSED==='1') return true;
  if(overrides.appClosed!==true) return false;
  const until = Number(overrides.closedUntil||0);
  return !(until>0 && Date.now()>=until);
}
function cleanLink(u){
  try{ const x=new URL(String(u)); return (x.protocol==='https:'||x.protocol==='http:') ? x.toString().slice(0,500) : ''; }catch{ return '' }
}
function cleanCustomer(c){
  c = c || {};
  const s = (v,n)=>String(v==null?'':v).slice(0,n);
  const geo = c.geo && Number.isFinite(Number(c.geo.lat)) && Number.isFinite(Number(c.geo.lng)) ? { lat:Number(c.geo.lat), lng:Number(c.geo.lng) } : null;
  const ml = String(c.manualLink||'').trim();
  const mm = ml.match(/^(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)$/);
  const manualLink = mm ? `https://maps.google.com/?q=${mm[1]},${mm[2]}` : cleanLink(ml);
  return { name:s(c.name,80), phone:s(c.phone,20).replace(/[^\d+]/g,''), address:s(c.address,500), note:s(c.note,500), geo, manualLink };
}

function getMinOrderAmount(){
  if(overrides?.storeSettings?.minOrderAmount !== undefined && overrides.storeSettings.minOrderAmount !== null){
    return Number(overrides.storeSettings.minOrderAmount);
  }
  return MIN_ORDER_RUPEES;
}

app.get('/api/app-status', async (req,res)=>{
  try{ await refreshOverridesFromStore(); }catch{}
  // "Close for 2 hours" used to close the store forever because nothing ever
  // checked closedUntil. Reopen automatically once it has passed.
  if(overrides.appClosed===true && Number(overrides.closedUntil||0)>0 && Date.now()>=Number(overrides.closedUntil)){
    overrides.appClosed = false; overrides.closedUntil = 0; saveOverrides(overrides);
  }
  const closed = isStoreClosedNow();
  const open = !closed;
  const reason = closed ? 'CLOSED_BY_OWNER' : 'OPEN';
  res.set('Cache-Control', 'public, max-age=5, stale-while-revalidate=10');
  res.json({open, reason, ownerClosed: overrides.appClosed===true, closedUntil: overrides.closedUntil||0});
});

function bearer(req){
  const hdr = req.headers['authorization']||'';
  return hdr.startsWith('Bearer ') ? hdr.slice(7) : hdr;
}
function requireAdmin(req,res,next){
  if(isValidSession(bearer(req))) return next();
  return res.status(401).json({error:'unauthorized'});
}

let globalFailures = { count: 0, windowStart: Date.now() };
app.post('/api/admin/login', async (req,res)=>{
  const { email, password, remember } = req.body||{};
  try{ await refreshAdminAuthFromStore(); }catch{}
  if(!ADMIN_EMAIL) return res.status(500).json({error:'admin-not-configured'});
  const cid = getClientId(req);
  const rec = loginAttempts.get(cid)||{count:0, blockedUntil:0};
  if(rec.blockedUntil && Date.now()<rec.blockedUntil){
    return res.status(429).json({error:'rate_limited', retryAt: rec.blockedUntil});
  }
  // Backstop against attackers rotating IPs: cap total failures per 15 minutes.
  if(Date.now()-globalFailures.windowStart > 15*60*1000) globalFailures = { count:0, windowStart:Date.now() };
  if(globalFailures.count >= 50){
    return res.status(429).json({error:'rate_limited', retryAt: globalFailures.windowStart + 15*60*1000});
  }
  const emailOk = safeEqual(String(email||'').trim().toLowerCase(), String(ADMIN_EMAIL).toLowerCase());
  const pwdOk = checkAdminPassword(String(password||''));
  if(emailOk && pwdOk){
    loginAttempts.delete(cid);
    pruneSessions();
    const token=createSession(remember ? ADMIN_REMEMBER_TTL_DAYS*24 : ADMIN_TOKEN_TTL_HOURS);
    return res.json({ok:true, token});
  }
  globalFailures.count++;
  rec.count = (rec.count||0)+1;
  if(rec.count>=5){ rec.blockedUntil = Date.now()+10*60*1000; rec.count=0; }
  loginAttempts.set(cid, rec);
  return res.status(401).json({error:'invalid-credentials'});
});

app.post('/api/admin/logout', (req,res)=>{
  const tok = bearer(req);
  if(tok && sessions.has(tok)){ sessions.delete(tok); persistSessions(); }
  res.json({ok:true});
});

app.post('/api/admin/logout-others', requireAdmin, (req,res)=>{
  revokeSessions(bearer(req));
  res.json({ok:true, sessions: sessions.size});
});

app.post('/api/admin/change-password', requireAdmin, async (req,res)=>{
  try{
    const { currentPassword, newPassword } = req.body||{};
    if(!currentPassword || !newPassword){
      return res.status(400).json({error:'current_and_new_password_required', message:'Current and new passwords are required'});
    }
    try{ await refreshAdminAuthFromStore(); }catch{}
    if(!checkAdminPassword(String(currentPassword))){
      return res.status(400).json({error:'incorrect_current_password', message:'Current password is incorrect'});
    }
    const cleanNew = String(newPassword).trim();
    if(cleanNew.length < 8){
      return res.status(400).json({error:'weak_password', message:'New password must be at least 8 characters long'});
    }
    if(cleanNew === LEGACY_DEFAULT_PASSWORD){
      return res.status(400).json({error:'weak_password', message:'Please choose a password other than the default one'});
    }
    await storeAdminPassword(cleanNew);
    // Anyone who knew the old password is signed out everywhere except here.
    revokeSessions(bearer(req));
    return res.json({ok:true, message:'Password updated. All other devices have been signed out.'});
  }catch(e){
    return res.status(500).json({error:'server-error', message:'Failed to update password'});
  }
});

app.get('/api/admin/me', (req,res)=>{
  const tok = bearer(req);
  const ok = isValidSession(tok);
  if(ok){ const s=sessions.get(tok); if(s){ const hours = s.ttlHours||ADMIN_TOKEN_TTL_HOURS; const now=Date.now(); s.exp=now+hours*60*60*1000; s.lastActive=now; persistSessions(); } }
  if(!ok) return res.json({authed:false});
  return res.json({authed:true, email: ADMIN_EMAIL, defaultPassword: isUsingDefaultPassword(), sessions: sessions.size});
});

app.post('/api/admin/debug/send-telegram', requireAdmin, async (req,res)=>{
  try{
    const { text } = req.body||{};
    const msg = String(text||'HoyChoy order notifications active');
    const result = await sendTelegram(msg);
    return res.json({ok:!!(result&&result.ok), details:result&&result.data||null});
  }catch(e){ return res.status(500).json({error:'server-error'}); }
});

app.get('/api/admin/debug/telegram-config', requireAdmin, (req,res)=>{
  try{
    const currentToken = overrides?.storeSettings?.telegramBotToken || TELEGRAM_BOT_TOKEN;
    const currentChat = overrides?.storeSettings?.telegramChatId || TELEGRAM_ADMIN_CHAT_ID;
    const hasToken = !!currentToken;
    const hasChat = !!currentChat;
    res.json({
      ok: true,
      TELEGRAM_BOT_TOKEN_set: hasToken,
      TELEGRAM_ADMIN_CHAT_ID_set: hasChat,
      maskedToken: currentToken ? (currentToken.length > 8 ? currentToken.slice(0, 4) + '••••' + currentToken.slice(-4) : '••••') : '',
      chatId: currentChat || ''
    });
  }catch{ res.status(500).json({error:'server-error'}); }
});

app.post('/api/admin/debug/telegram-set-config', requireAdmin, (req,res)=>{
  try{
    const { botToken, chatId } = req.body||{};
    overrides.storeSettings = overrides.storeSettings || {};
    if(botToken !== undefined){
      const t = String(botToken).trim();
      if(t) overrides.storeSettings.telegramBotToken = t;
      else delete overrides.storeSettings.telegramBotToken;
    }
    if(chatId !== undefined){
      const c = String(chatId).trim();
      if(c) overrides.storeSettings.telegramChatId = c;
      else delete overrides.storeSettings.telegramChatId;
    }
    saveOverrides(overrides);
    return res.json({ok:true, message:'Telegram settings saved successfully'});
  }catch{ return res.status(500).json({error:'server-error'}); }
});

app.get('/api/menu-overrides', (req,res)=>{
  refreshOverridesFromStore().finally(()=>{
    res.set('Cache-Control', 'public, max-age=5, stale-while-revalidate=15');
    const safe = { ...(overrides || {}) };
    delete safe.adminPassword;
    if(safe.storeSettings){
      safe.storeSettings = { ...safe.storeSettings };
      delete safe.storeSettings.telegramBotToken;
    }
    res.json(safe);
  });
});

// Removed: /api/debug/overrides was public and returned the raw overrides,
// including the Telegram bot token.

// Called by the customer's browser after payment. It can only fill in details
// that are missing; price, items and payment status come from the server.
app.post('/api/order', async (req,res)=>{
  try{
    const { orderId, customer, items } = req.body||{};
    if(!orderId || !customer){
      return res.status(400).json({error:'invalid-order'});
    }
    const existing = findOrderById(orderId);
    if(!existing) return res.status(404).json({error:'order-not-found'});
    const patch = { id: existing.id };
    const cust = existing.customer || {};
    if(!cust.phone || !cust.address) patch.customer = cleanCustomer(customer);
    if((!Array.isArray(existing.items) || !existing.items.length) && Array.isArray(items)){
      const priced = priceOrder({ items });
      if(!priced.error) patch.items = priced.lines;
    }
    let saved = upsertOrder(patch) || existing;
    if(saved.paymentState!=='PAID') saved = (await verifyWithPhonePe(saved.id)) || saved;
    if(saved.paymentState==='PAID' && !saved.tgPaySuccessNotified){
      const r = await sendTelegram(fmtTGPaySuccess(saved));
      if(r && r.ok) saved = upsertOrder({ id: saved.id, tgPaySuccessNotified:true }) || saved;
    }
    return res.json({ok:true, status: saved.paymentState||'PENDING'});
  }catch(e){
    return res.status(500).json({error:'server-error'});
  }
});

app.get('/api/admin/orders', requireAdmin, (req,res)=>{
  const list = orders.slice().sort((a,b)=>b.createdAt-a.createdAt);
  res.json({orders:list});
});

app.get('/api/admin/orders.csv', requireAdmin, (req,res)=>{
  const list = orders.slice().sort((a,b)=>b.createdAt-a.createdAt);
  // Quote every cell, and neutralise leading =,+,-,@ so Excel can't run formulas
  // a customer typed into their name or address.
  const cell = (v)=>{ let s=String(v==null?'':v); if(/^[=+\-@\t\r]/.test(s)) s="'"+s; return `"${s.replace(/"/g,'""')}"`; };
  const header = ['id','date','orderStatus','payment','total','name','phone','address','note','items'].join(',');
  const rows = list.map(o=>{
    const items = (o.items||[]).map(it=>`${(it.item&&it.item.name)||it.name||''} x${it.qty}`).join(' | ');
    const cust = o.customer||{};
    const created = new Date(o.createdAt||Date.now()).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'});
    return [o.id, created, o.status||'NEW', o.paymentState||'', Number(o.total||0), cust.name, cust.phone, cust.address, cust.note, items].map(cell).join(',');
  });
  const csv = '﻿' + [header].concat(rows).join('\n');
  res.setHeader('Content-Type','text/csv');
  res.setHeader('Content-Disposition','attachment; filename="orders.csv"');
  res.send(csv);
});

app.get('/api/admin/orders/stream', (req,res)=>{
  const hdr = req.headers['authorization']||'';
  const tokHdr = hdr.startsWith('Bearer ') ? hdr.slice(7) : hdr;
  const tok = req.query.token || tokHdr || '';
  if(!isValidSession(tok)) return res.status(401).end();
  try{ const s=sessions.get(tok); if(s){ const hours = s.ttlHours||ADMIN_TOKEN_TTL_HOURS; s.exp=Date.now()+hours*60*60*1000; persistSessions(); } }catch{}
  res.setHeader('Content-Type','text/event-stream');
  res.setHeader('Cache-Control','no-cache');
  res.setHeader('Connection','keep-alive');
  res.flushHeaders && res.flushHeaders();
  const init = {type:'init', orders:orders.slice().sort((a,b)=>b.createdAt-a.createdAt)};
  res.write(`data: ${JSON.stringify(init)}\n\n`);
  orderClients.add(res);
  const HEARTBEAT_MS = 25*1000;
  const heartbeat = setInterval(()=>{
    try{
      res.write(`: ping\n\n`);
      const s = sessions.get(tok);
      if(s){ const hours = s.ttlHours||ADMIN_TOKEN_TTL_HOURS; s.exp = Date.now()+hours*60*60*1000; persistSessions(); }
    }catch{}
  }, HEARTBEAT_MS);
  req.on('close', ()=>{ try{ clearInterval(heartbeat); }catch{} orderClients.delete(res); });
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

app.post('/api/admin/set-delivery-rates', requireAdmin, (req,res)=>{
  try{
    const { maxRadius, tiers } = req.body || {};
    if(!Array.isArray(tiers) || !tiers.length){
      return res.status(400).json({error:'tiers-required'});
    }
    const cleanTiers = tiers.map(t => ({
      upToKm: Math.max(0.1, Number(t.upToKm || 0)),
      fee: Math.max(0, Number(t.fee || 0))
    })).sort((a, b) => a.upToKm - b.upToKm);
    
    const maxR = Number(maxRadius) > 0 ? Number(maxRadius) : cleanTiers[cleanTiers.length - 1].upToKm;
    
    overrides.deliveryRates = {
      maxRadius: maxR,
      tiers: cleanTiers
    };
    saveOverrides(overrides);
    res.json({ok:true, deliveryRates: overrides.deliveryRates});
  }catch(e){
    res.status(500).json({error:'server-error'});
  }
});


app.get('/api/admin/coupons', requireAdmin, (req,res)=>{
  try{
    overrides.coupons = overrides.coupons || {};
    res.json({ok:true, coupons:overrides.coupons});
  }catch(e){ res.status(500).json({error:'server-error'}); }
});

app.post('/api/admin/coupon-set', requireAdmin, (req,res)=>{
  try{
    const { code, percent, enabled } = req.body||{};
    const c = String(code||'').trim();
    if(!c) return res.status(400).json({error:'invalid-code'});
    const p = Math.max(0, Math.min(100, Number(percent||0)));
    overrides.coupons = overrides.coupons || {};
    const key = c.toUpperCase();
    overrides.coupons[key] = { percent:p, enabled: !!enabled };
    saveOverrides(overrides);
    res.json({ok:true, code:key, percent:p, enabled:!!enabled});
  }catch(e){ res.status(500).json({error:'server-error'}); }
});

app.post('/api/admin/coupon-delete', requireAdmin, (req,res)=>{
  try{
    const { code } = req.body||{};
    if(!code) return res.status(400).json({error:'code-required'});
    const key = String(code).trim().toUpperCase();
    overrides.coupons = overrides.coupons || {};
    if(overrides.coupons[key]){
      delete overrides.coupons[key];
      saveOverrides(overrides);
    }
    return res.json({ok:true, code:key, coupons: overrides.coupons});
  }catch(e){ res.status(500).json({error:'server-error'}); }
});

app.get('/api/admin/store-settings', requireAdmin, (req,res)=>{
  try{
    overrides.storeSettings = overrides.storeSettings || {};
    const safeSettings = { ...overrides.storeSettings };
    delete safeSettings.telegramBotToken;
    return res.json({ok:true, storeSettings: safeSettings});
  }catch(e){ res.status(500).json({error:'server-error'}); }
});

app.post('/api/admin/store-settings', requireAdmin, (req,res)=>{
  try{
    const b = req.body||{};
    const ss = overrides.storeSettings = overrides.storeSettings || {};
    const txt = (v,n)=>String(v==null?'':v).trim().slice(0,n);

    if(b.contactPhone !== undefined) ss.contactPhone = String(b.contactPhone).replace(/[^0-9]/g, '').slice(0,15);
    if(b.upiId !== undefined) ss.upiId = txt(b.upiId,80);
    if(b.merchantName !== undefined) ss.merchantName = txt(b.merchantName,80);
    if(b.minOrderAmount !== undefined) ss.minOrderAmount = Math.max(0, Number(b.minOrderAmount||0));
    if(b.packagingFee !== undefined) ss.packagingFee = Math.max(0, Number(b.packagingFee||0));
    if(b.gstPercent !== undefined) ss.gstPercent = Math.min(28, Math.max(0, Number(b.gstPercent||0)));
    if(b.openingHours !== undefined) ss.openingHours = txt(b.openingHours,80);
    if(b.announcement !== undefined) ss.announcement = txt(b.announcement,200);
    if(b.contactEmail !== undefined) ss.contactEmail = txt(b.contactEmail,120);
    if(b.instagramUrl !== undefined) ss.instagramUrl = cleanLink(b.instagramUrl);
    if(b.locationUrl !== undefined) ss.locationUrl = cleanLink(b.locationUrl);

    saveOverrides(overrides);
    const safe = { ...ss }; delete safe.telegramBotToken;
    return res.json({ok:true, storeSettings: safe});
  }catch(e){
    return res.status(500).json({error:'server-error', message:e.message});
  }
});

app.get('/api/coupon/:code', (req,res)=>{
  try{
    const raw = String(req.params.code||'').trim().toUpperCase();
    const bucket = overrides.coupons || {};
    const c = bucket[raw];
    if(c && c.enabled && Number(c.percent)>0){
      return res.json({ok:true, code:raw, percent:Number(c.percent)});
    }
    return res.status(404).json({ok:false});
  }catch(e){ res.status(500).json({error:'server-error'}); }
});

app.post('/api/admin/refund', requireAdmin, async (req,res)=>{
  try{
    const { orderId, amount } = req.body||{};
    if(!orderId || amount==null) return res.status(400).json({error:'invalid-refund-request'});
    const pay = payments.get(orderId);
    const ord = findOrderById(orderId);
    const paid = (ord && ord.paymentState==='PAID') || (pay && mapPaymentState(pay.status)==='PAID');
    if(!paid){
      return res.status(400).json({error:'payment-not-verified'});
    }
    const maxRefund = Number(ord?.total || pay?.amount || 0);
    if(!(Number(amount)>0) || (maxRefund>0 && Number(amount)>maxRefund)){
      return res.status(400).json({error:'invalid-amount', max:maxRefund});
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
      // Record it on the order so a second tap doesn't refund twice unnoticed.
      if(ord) upsertOrder({ id: ord.id, refunds: [ ...(ord.refunds||[]), { refundId, amount:Number(amount), at:Date.now(), state:response?.state||'PENDING' } ] });
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
  const { id, name, price, veg, category, image, featured } = req.body||{};
  if(!name || price==null) return res.status(400).json({error:'name and price required'});
  const itemId = id || String(Date.now());
  const item = { id: itemId, name: String(name).trim(), price: Number(price||0), veg: !!veg, category: category||'Misc', available: true };
  if(image && typeof image === 'string' && image.trim()){
    item.image = image.trim();
    overrides.images = overrides.images || {};
    overrides.images[itemId] = item.image;
  }
  overrides.added = Array.isArray(overrides.added)?overrides.added:[];
  overrides.added.push(item);

  if(featured === true){
    overrides.featured = Array.isArray(overrides.featured) ? overrides.featured : [];
    if(!overrides.featured.includes(itemId)){
      overrides.featured.push(itemId);
    }
  }

  saveOverrides(overrides);
  res.json({ok:true, item, overrides});
});

app.post('/api/admin/bulk-items', requireAdmin, (req,res)=>{
  try{
    const { items, mode } = req.body||{};
    if(!Array.isArray(items) || items.length === 0){
      return res.status(400).json({error:'items_array_required', message:'No items provided for bulk upload'});
    }

    // Load base items from menu.json if present
    let baseItemIds = new Set();
    try{
      const menuJsonPath = path.join(__dirname, '../src/data/menu.json');
      if(fs.existsSync(menuJsonPath)){
        const raw = fs.readFileSync(menuJsonPath, 'utf8');
        const parsed = JSON.parse(raw);
        if(Array.isArray(parsed?.items)){
          parsed.items.forEach(it => { if(it && it.id) baseItemIds.add(it.id); });
        }
      }
    }catch(err){
      console.warn('[BulkItems] Notice: base menu.json could not be loaded:', err.message);
    }

    overrides.added = Array.isArray(overrides.added) ? overrides.added : [];
    overrides.edited = (overrides.edited && typeof overrides.edited === 'object') ? overrides.edited : {};
    overrides.availability = (overrides.availability && typeof overrides.availability === 'object') ? overrides.availability : {};
    overrides.featured = Array.isArray(overrides.featured) ? overrides.featured : [];
    overrides.images = (overrides.images && typeof overrides.images === 'object') ? overrides.images : {};
    overrides.removed = Array.isArray(overrides.removed) ? overrides.removed : [];

    let addedCount = 0;
    let updatedCount = 0;

    for(const it of items){
      const id = String(it.id||'').trim();
      const name = String(it.name||'').trim();
      if(!id || !name) continue;

      const price = Number(it.price != null ? it.price : 0);
      const veg = !!it.veg;
      const category = String(it.category||'Misc').trim();
      const available = it.available !== undefined ? !!it.available : true;
      const featured = !!it.featured;
      const image = typeof it.image === 'string' ? it.image.trim() : '';

      // Un-remove if it was previously removed
      overrides.removed = overrides.removed.filter(x => x !== id);

      const isBase = baseItemIds.has(id);
      const existingAddedIdx = overrides.added.findIndex(x => x.id === id);

      if(isBase){
        overrides.edited[id] = {
          name,
          price,
          veg,
          category,
          ...(image ? { image } : {})
        };
        updatedCount++;
      } else if(existingAddedIdx !== -1){
        overrides.added[existingAddedIdx] = {
          id,
          name,
          price,
          veg,
          category,
          available,
          ...(image ? { image } : {})
        };
        updatedCount++;
      } else {
        // Brand new dish
        overrides.added.push({
          id,
          name,
          price,
          veg,
          category,
          available,
          ...(image ? { image } : {})
        });
        addedCount++;
      }

      // Update availability
      overrides.availability[id] = available;

      // Update featured
      if(featured && !overrides.featured.includes(id)){
        overrides.featured.push(id);
      } else if(!featured && overrides.featured.includes(id)){
        overrides.featured = overrides.featured.filter(x => x !== id);
      }

      // Update image
      if(image){
        overrides.images[id] = image;
      }
    }

    saveOverrides(overrides);
    return res.json({
      ok: true,
      message: `Bulk update successful: ${addedCount} added, ${updatedCount} updated (${items.length} total processed)`,
      addedCount,
      updatedCount,
      overrides
    });
  }catch(e){
    return res.status(500).json({error:'server-error', message:e.message});
  }
});

app.post('/api/admin/edit-item', requireAdmin, (req,res)=>{
  const { id, name, price, veg, category, image, featured } = req.body||{};
  if(!id) return res.status(400).json({error:'id required'});

  overrides.edited = overrides.edited || {};
  const prevEdit = overrides.edited[id] || {};
  const updatedEdit = { ...prevEdit };

  if(name != null) updatedEdit.name = String(name).trim();
  if(price != null) updatedEdit.price = Number(price);
  if(veg != null) updatedEdit.veg = !!veg;
  if(category != null) updatedEdit.category = String(category).trim();
  if(image !== undefined){
    const cleanImg = typeof image === 'string' ? image.trim() : '';
    if(cleanImg){
      updatedEdit.image = cleanImg;
      overrides.images = overrides.images || {};
      overrides.images[id] = cleanImg;
    } else {
      delete updatedEdit.image;
      if(overrides.images){
        delete overrides.images[id];
      }
    }
  }

  overrides.edited[id] = updatedEdit;

  // Also update in overrides.added if this item was added via admin
  if(Array.isArray(overrides.added)){
    const idx = overrides.added.findIndex(x=>x.id===id);
    if(idx !== -1){
      overrides.added[idx] = { ...overrides.added[idx], ...updatedEdit };
    }
  }

  // Handle featured toggle if provided
  if(featured !== undefined){
    overrides.featured = Array.isArray(overrides.featured) ? overrides.featured : [];
    if(featured && !overrides.featured.includes(id)){
      overrides.featured.push(id);
    } else if(!featured && overrides.featured.includes(id)){
      overrides.featured = overrides.featured.filter(x=>x !== id);
    }
  }

  saveOverrides(overrides);
  res.json({ok:true, id, item: updatedEdit, overrides});
});

app.post('/api/admin/set-featured', requireAdmin, (req,res)=>{
  const { featured, id, isFeatured } = req.body||{};
  overrides.featured = Array.isArray(overrides.featured) ? overrides.featured : [];

  if(Array.isArray(featured)){
    overrides.featured = featured.filter(Boolean);
  } else if(id && isFeatured !== undefined){
    if(isFeatured && !overrides.featured.includes(id)){
      overrides.featured.push(id);
    } else if(!isFeatured && overrides.featured.includes(id)){
      overrides.featured = overrides.featured.filter(x=>x !== id);
    }
  } else {
    return res.status(400).json({error:'featured array or id with isFeatured required'});
  }

  saveOverrides(overrides);
  res.json({ok:true, featured: overrides.featured, overrides});
});

app.post('/api/admin/remove-item', requireAdmin, (req,res)=>{
  const { id } = req.body||{};
  if(!id) return res.status(400).json({error:'id required'});
  overrides.removed = Array.isArray(overrides.removed)?overrides.removed:[];
  if(!overrides.removed.includes(id)) overrides.removed.push(id);
  if(Array.isArray(overrides.featured)){
    overrides.featured = overrides.featured.filter(x=>x !== id);
  }
  if(overrides.images && overrides.images[id]){
    delete overrides.images[id];
  }
  if(overrides.edited && overrides.edited[id]){
    delete overrides.edited[id];
  }
  saveOverrides(overrides);
  res.json({ok:true});
});

app.post('/api/admin/restore-item', requireAdmin, (req,res)=>{
  const { id } = req.body||{};
  if(!id) return res.status(400).json({error:'id required'});
  overrides.removed = Array.isArray(overrides.removed)?overrides.removed:[];
  overrides.removed = overrides.removed.filter(x=>x !== id);
  saveOverrides(overrides);
  res.json({ok:true, overrides});
});

app.post('/api/admin/reset-menu', requireAdmin, (req,res)=>{
  try{
    overrides.added = [];
    overrides.edited = {};
    overrides.removed = [];
    overrides.images = {};
    saveOverrides(overrides);
    return res.json({ok:true, message:'Menu customizations reset to defaults', overrides});
  }catch(e){
    return res.status(500).json({error:'server-error'});
  }
});

// ---- Dish photo uploads -----------------------------------------------------
// Lets the owner upload a photo from their phone instead of needing someone to
// host it and paste a URL. Photos are resized in the browser before upload.
const IMG_DIR = path.join(DATA_DIR, 'images');
const IMG_TYPES = { 'image/jpeg':'jpg', 'image/png':'png', 'image/webp':'webp' };
app.post('/api/admin/upload-image', requireAdmin, async (req,res)=>{
  try{
    const m = String(req.body?.dataUrl||'').match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
    if(!m) return res.status(400).json({error:'invalid-image', message:'Please choose a JPG, PNG or WebP photo'});
    const buf = Buffer.from(m[2], 'base64');
    if(buf.length > 1.5*1024*1024) return res.status(413).json({error:'too-large', message:'Photo is too large (max 1.5 MB after resizing)'});
    const id = crypto.randomBytes(9).toString('hex') + '.' + IMG_TYPES[m[1]];
    try{ fs.mkdirSync(IMG_DIR,{recursive:true}); fs.writeFileSync(path.join(IMG_DIR,id), buf); }catch{}
    await upSet(`hc:img:${id}`, { type:m[1], data:m[2] });
    const base = `${req.protocol}://${req.get('host')}`;
    return res.json({ok:true, url:`${base}/api/img/${id}`});
  }catch(e){ return res.status(500).json({error:'server-error'}); }
});
app.get('/api/img/:id', async (req,res)=>{
  const id = String(req.params.id||'');
  if(!/^[a-f0-9]{18}\.(jpg|png|webp)$/.test(id)) return res.status(404).end();
  const type = Object.keys(IMG_TYPES).find(k=>IMG_TYPES[k]===id.split('.').pop());
  res.set('Cache-Control','public, max-age=31536000, immutable');
  res.set('Content-Type', type);
  try{ return res.send(fs.readFileSync(path.join(IMG_DIR,id))); }catch{}
  const v = await upGet(`hc:img:${id}`);
  if(v && v.data){
    const buf = Buffer.from(v.data,'base64');
    try{ fs.mkdirSync(IMG_DIR,{recursive:true}); fs.writeFileSync(path.join(IMG_DIR,id), buf); }catch{}
    return res.send(buf);
  }
  res.set('Cache-Control','no-store');
  return res.status(404).end();
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
    // Exact host allowlist, checked on every redirect hop. The old substring
    // check let "google.com.attacker.net" (or a redirect) make this server fetch
    // arbitrary URLs, including internal ones.
    const allowedHost = (h)=>{ h=String(h||'').toLowerCase(); return u.protocol==='https:' || u.protocol==='http:' ? (h==='goo.gl' || h==='maps.app.goo.gl' || h==='google.com' || /^[a-z0-9-]+\.google\.com$/.test(h) || /^(www\.)?google\.co\.in$/.test(h)) : false; };
    if(!allowedHost(u.hostname)) return res.status(400).json({error:'unsupported-host'});
    let parsed = parseCoordsFromUrl(u);
    if(parsed && parsed.lat!=null && parsed.lng!=null) return res.json({coord:{lat:parsed.lat,lng:parsed.lng}});
    let current = u;
    for(let hop=0; hop<5; hop++){
      const r = await fetch(current.toString(), {redirect:'manual', signal: AbortSignal.timeout(6000)});
      const loc = r.headers.get('location');
      if(!(r.status>=300 && r.status<400 && loc)) break;
      const next = new URL(loc, current);
      if(!/^https?:$/.test(next.protocol) || !allowedHost(next.hostname)) break;
      current = next;
    }
    const finalUrl = current.toString();
    const uf = current;
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
    const { amount, orderId, customerPhone, customerName, snapshot } = req.body||{};
    if(!amount || !orderId) return res.status(400).json({error:'amount and orderId required'});
    if(!/^[A-Za-z0-9_-]{6,60}$/.test(String(orderId))) return res.status(400).json({error:'invalid-order-id'});
    if(findOrderById(orderId)) return res.status(409).json({error:'duplicate-order'});
    try{ await refreshOverridesFromStore(); }catch{}
    if(isStoreClosedNow()) return res.status(403).json({error:'store-closed', message: overrides.closingMessage||'We are closed right now.'});
    const priced = priceOrder({ items: snapshot?.items, couponCode: snapshot?.coupon, coord: snapshot?.coord });
    if(priced.error){
      const msg = priced.error==='item-unavailable' ? `"${priced.item}" is no longer available. Please update your cart.`
        : priced.error==='out-of-range' ? `Sorry, we only deliver within ${priced.maxRadius} km.`
        : 'Your cart could not be processed. Please refresh and try again.';
      return res.status(400).json({error:priced.error, message:msg});
    }
    const minAmt = getMinOrderAmount();
    if(priced.subtotal + priced.deliveryFee < minAmt) return res.status(400).json({error:'min-order-amount', min:minAmt, message:`Minimum order is ₹${minAmt}.`});
    // The customer's location is self-reported, so a higher delivery tier than
    // our estimate is fine; paying less than the server's price is not.
    if(Number(amount) < priced.grandTotal - 1){
      return res.status(409).json({error:'price-changed', expected: priced.grandTotal, message:`Prices have been updated. Your new total is ₹${priced.grandTotal}.`});
    }
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
    payments.set(orderId, {status:'PENDING', amount:Number(amount)});
    startReconcile(orderId, 1800);
    schedulePaymentPendingReminder(String(orderId));
    upsertOrder({
      id: String(orderId),
      txnId: null,
      total: Number(amount),
      subtotal: priced.subtotal,
      discountPct: priced.discountPct,
      coupon: priced.coupon,
      gst: priced.gst,
      deliveryFee: Number(amount) - (priced.discounted + priced.gst + priced.packagingFee),
      packagingFee: priced.packagingFee,
      distanceKm: priced.distanceKm,
      items: priced.lines,
      customer: cleanCustomer(snapshot?.customer || { name:customerName, phone:customerPhone }),
      createdAt: Date.now(),
      status: 'PENDING',
      paymentState: 'PENDING'
    });
    return res.json({redirectUrl:url, orderId});
  }catch(e){
    console.log('initiate_payment_failed', String(e && e.message || e));
    return res.status(502).json({error:'payment-start-failed', message:'PhonePe is not responding right now. Please try again in a minute.'});
  }
});
app.post('/api/initiate-test-payment', async (req,res)=>{
  try{
    if(ENV!=='SANDBOX') return res.status(400).json({error:'not-allowed-in-prod'});
    const { customerPhone, customerName, redirectOrigin } = req.body||{};
    const orderId = `HC-TEST-${Date.now()}`;
    const client = getSdkClient();
    if(!client) return res.status(500).json({error:'sdk-not-configured'});
    const paisa = 100; // ₹1
    const metaInfo = MetaInfo.builder()
      .udf1(String(customerPhone||''))
      .udf2(String(customerName||'TEST'))
      .build();
    const origin = String(redirectOrigin||'http://localhost:5173').replace(/\/$/,'');
    const rurl = `${origin}/?merchantTransactionId=${orderId}`;
    const request = StandardCheckoutPayRequest.builder()
      .merchantOrderId(String(orderId))
      .amount(paisa)
      .redirectUrl(String(rurl))
      .metaInfo(metaInfo)
      .build();
    const response = await client.pay(request);
    const url = response?.redirect_url || response?.redirectUrl || null;
    if(!url) return res.status(500).json({error:'phonepe-init-failed', details:response});
    payments.set(orderId, {status:'PENDING', amount:1});
    startReconcile(orderId, 1800);
    schedulePaymentPendingReminder(String(orderId));
    const preRecord = {
      id: orderId,
      txnId: null,
      total: 1,
      items: [],
      customer: { name:String(customerName||'TEST'), phone:String(customerPhone||'') },
      createdAt: Date.now(),
      status: 'PENDING'
    };
    upsertOrder(preRecord);
    return res.json({redirectUrl:url, orderId});
  }catch(e){
    return res.status(500).json({error:'server-error', message:String(e)});
  }
});

// Admin-only: generate a ₹1 test payment link in any environment
app.post('/api/admin/initiate-1rs-test', requireAdmin, async (req,res)=>{
  try{
    const { customerPhone, customerName, redirectOrigin } = req.body||{};
    const orderId = `HC-TEST-1RS-${Date.now()}`;
    const client = getSdkClient();
    if(!client) return res.status(500).json({error:'sdk-not-configured'});
    const paisa = 100; // ₹1
    const metaInfo = MetaInfo.builder()
      .udf1(String(customerPhone||''))
      .udf2(String(customerName||'TEST'))
      .build();
    const origin = String(redirectOrigin||PUBLIC_BASE_URL||'https://www.hoychoycafe.com').replace(/\/$/,'');
    const rurl = `${origin}/?merchantTransactionId=${orderId}`;
    const request = StandardCheckoutPayRequest.builder()
      .merchantOrderId(String(orderId))
      .amount(paisa)
      .redirectUrl(String(rurl))
      .metaInfo(metaInfo)
      .build();
    const response = await client.pay(request);
    const url = response?.redirect_url || response?.redirectUrl || null;
    if(!url) return res.status(500).json({error:'phonepe-init-failed', details:response});
    payments.set(orderId, {status:'PENDING', amount:1});
    startReconcile(orderId, 1800);
    schedulePaymentPendingReminder(String(orderId));
    const preRecord = {
      id: orderId,
      txnId: null,
      total: 1,
      items: [],
      customer: { name:String(customerName||'TEST'), phone:String(customerPhone||'') },
      createdAt: Date.now(),
      status: 'PENDING'
    };
    upsertOrder(preRecord);
    return res.json({redirectUrl:url, orderId});
  }catch(e){
    return res.status(500).json({error:'server-error', message:String(e)});
  }
});

// Removed: /api/create-sdk-order was unused by the site and charged whatever
// amount the caller sent without creating an order record.

// PhonePe's server-to-server callback. Only a correctly signed callback is
// trusted directly; anything else just prompts us to ask PhonePe ourselves.
// (Previously an unsigned POST of {merchantTransactionId, state:"COMPLETED"}
// marked any order as paid.)
function handlePhonePeCallback(req){
  const client = getSdkClient();
  const cbUser = process.env.PHONEPE_CB_USER||'';
  const cbPass = process.env.PHONEPE_CB_PASS||'';
  if(client && cbUser && cbPass && req.rawBody){
    try{
      const validated = client.validateCallback(cbUser, cbPass, req.headers['authorization']||'', req.rawBody);
      const event = String(validated?.event || validated?.type || '');
      const payload = validated?.payload||{};
      const orderId = String(payload.originalMerchantOrderId||payload.merchantOrderId||payload.orderId||'');
      const st = String(payload.state||'PENDING');
      if(event.startsWith('pg.refund')){
        broadcast({type:'refund.updated', orderId, refundId:String(payload.merchantRefundId||payload.refundId||''), state:st});
      }else if(orderId){
        applyPaymentState(orderId, st, String(payload.transactionId||payload.paymentDetails?.[0]?.transactionId||''));
      }
      return { ok:true, verified:true };
    }catch{ /* fall through to a status check */ }
  }
  const b = req.body||{};
  const claimed = String(b.merchantTransactionId||b.merchantOrderId||b.payload?.merchantOrderId||b.payload?.originalMerchantOrderId||'');
  if(claimed && findOrderById(claimed)) verifyWithPhonePe(claimed, 0).catch(()=>{});
  return { ok:true, verified:false };
}
app.post('/api/payment-callback', (req,res)=>{
  try{ return res.json(handlePhonePeCallback(req)); }catch{ return res.status(500).json({error:'callback-error'}); }
});
app.post('/api/phonepe/webhook', (req,res)=>{
  try{ return res.json(handlePhonePeCallback(req)); }catch{ return res.status(500).json({error:'callback-error'}); }
});

app.get('/api/payment-status/:id', async (req,res)=>{
  try{
    const id = String(req.params.id||'');
    const ord = (await verifyWithPhonePe(id)) || findOrderById(id);
    if(!ord) return res.status(404).json({error:'order-not-found'});
    res.json({status: ord.paymentState||'PENDING', transactionId: ord.txnId||null});
  }catch(e){
    res.status(500).json({error:'server-error'});
  }
});

// Public: the customer's payment page polls this. Returns no personal details.
app.get('/api/order-status/:id', async (req,res)=>{
  try{
    const id = String(req.params.id||'');
    let ord = findOrderById(id);
    if(!ord) return res.status(404).json({error:'order-not-found'});
    if(ord.paymentState!=='PAID' && ord.paymentState!=='FAILED') ord = (await verifyWithPhonePe(id)) || ord;
    return res.json({ status: ord.paymentState||'PENDING', orderStatus: ord.status||'PENDING', transactionId: ord.txnId||null, prepTime: ord.prepTime||null, total: ord.total||0 });
  }catch(e){
    res.status(500).json({error:'server-error'});
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
      if(status==='COMPLETED' || status==='FAILED'){
        applyPaymentState(orderId, status, txn);
        stop();
        return;
      }
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
  function stop(){
    try{
      clearTimeout(t);
      orderRecon.delete(orderId);
      const pay = payments.get(orderId)||{};
      const st = String(pay.status||'');
      if(st==='PENDING'){
        const ord = findOrderById(orderId) || { id: orderId };
        if(!ord.tgPendingPayNotified){
          sendTelegram(fmtTGPendingPayment(ord)).then(r=>{ if(r && r.ok){ const updated = { ...ord, tgPendingPayNotified:true }; upsertOrder(updated); } else { try{ console.log('telegram_send_failed_pending', r && r.data); }catch{} } }).catch(()=>{ try{ console.log('telegram_send_error_pending'); }catch{} });
        }
      }
    }catch{}
  }
  scheduleNext();
}

refreshSessionsFromStore();
refreshAdminAuthFromStore();
refreshOverridesFromStore(true);

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>{
  console.log(`PhonePe server listening on http://localhost:${PORT}`);
});
const ORDER_STATUSES = ['PENDING','PAID','ACCEPTED','PREPARING','OUT_FOR_DELIVERY','DELIVERED','CANCELLED'];
function setOrderStatus(id, status, extra){
  const idx = orders.findIndex(o=>String(o.id)===String(id));
  if(idx<0) return null;
  const now = Date.now();
  const updated = { ...orders[idx], status, statusUpdatedAt: now };
  if(status==='ACCEPTED'){ updated.acceptedAt = now; if(extra?.prepTime) updated.prepTime = String(extra.prepTime).slice(0,40); }
  else if(status==='OUT_FOR_DELIVERY') updated.outForDeliveryAt = now;
  else if(status==='DELIVERED') updated.deliveredAt = now;
  else if(status==='CANCELLED'){ updated.cancelledAt = now; if(extra?.cancelReason) updated.cancelReason = String(extra.cancelReason).slice(0,200); }
  orders[idx] = updated;
  if(status==='ACCEPTED'||status==='DELIVERED'||status==='CANCELLED') clearOrderReminder(String(id));
  sendTelegram(fmtTGStatusChange(updated, status)).catch(()=>{});
  broadcast({type:'order.updated', order:updated});
  return updated;
}
app.post('/api/admin/order-delivered', requireAdmin, (req,res)=>{
  const o = setOrderStatus(req.body?.id, 'DELIVERED');
  return o ? res.json({ok:true, order:o}) : res.status(404).json({error:'order-not-found'});
});
app.post('/api/admin/order-accept', requireAdmin, (req,res)=>{
  const o = setOrderStatus(req.body?.id, 'ACCEPTED', req.body);
  return o ? res.json({ok:true, order:o}) : res.status(404).json({error:'order-not-found'});
});
app.post('/api/admin/order-update-status', requireAdmin, (req,res)=>{
  const { id, status } = req.body||{};
  const upper = String(status||'').toUpperCase();
  if(!id || !ORDER_STATUSES.includes(upper)) return res.status(400).json({error:'id and valid status required'});
  const o = setOrderStatus(id, upper, req.body);
  return o ? res.json({ok:true, order:o}) : res.status(404).json({error:'order-not-found'});
});
// Owner can re-check a stuck "payment pending" order against PhonePe.
app.post('/api/admin/order-verify-payment', requireAdmin, async (req,res)=>{
  const id = String(req.body?.id||'');
  if(!findOrderById(id)) return res.status(404).json({error:'order-not-found'});
  const o = await verifyWithPhonePe(id, 0);
  if(!o) return res.status(502).json({error:'phonepe-unavailable', message:'Could not reach PhonePe. Try again in a minute.'});
  return res.json({ok:true, order:o});
});
app.post('/api/admin/order-delete', requireAdmin, (req,res)=>{
  const { id } = req.body||{};
  if(!id) return res.status(400).json({error:'id required'});
  const idx = orders.findIndex(o=>String(o.id)===String(id));
  if(idx<0) return res.status(404).json({error:'order-not-found'});
  orders.splice(idx,1);
  broadcast({type:'order.deleted', id:String(id)});
  return res.json({ok:true, id:String(id)});
});
app.post('/api/admin/orders-clear', requireAdmin, (req,res)=>{
  orders.length = 0;
  broadcast({type:'orders.cleared'});
  persistOrders();
  return res.json({ok:true});
});
const loginAttempts = new Map();
function getClientId(req){
  try{
    return req.ip || 'unknown';
  }catch{ return 'unknown'; }
}
// SEO endpoints served by backend (do not interfere with SPA rendering)
app.get('/robots.txt', (req, res) => {
  try{
    const origin = (process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
    const txt = `User-agent: *\nAllow: /\nDisallow: /admin\nSitemap: ${origin}/sitemap.xml\n`;
    res.set('Content-Type','text/plain');
    res.send(txt);
  }catch{ res.set('Content-Type','text/plain'); res.send('User-agent: *\nAllow: /\n'); }
});

app.get('/sitemap.xml', (req, res) => {
  const origin = (process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  const paths = ['/', '/privacy', '/terms', '/refund', '/shipping', '/about', '/reserve'];
  const now = new Date().toISOString();
  const urls = paths.map(p=>`  <url>\n    <loc>${origin}${p}</loc>\n    <lastmod>${now}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>${p==='/'?'1.00':'0.80'}</priority>\n  </url>`).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;
  res.set('Content-Type','application/xml');
  res.send(xml);
});
function scheduleOrderReminder(orderId, delayMs){
  try{
    const id = String(orderId||'');
    if(!id) return;
    const o = findOrderById(id) || {};
    if(o.tgOrderReminderSent) return;
    if(tgOrderReminderTimers.has(id)) return;
    const ms = Number(delayMs||600000);
    const t = setTimeout(()=>{
      try{
        const cur = findOrderById(id) || {};
        const st = String(cur.status||'');
        if(!cur.tgOrderReminderSent && st!=='ACCEPTED' && st!=='DELIVERED' && st!=='CANCELLED'){
          sendTelegram(fmtTGPendingOrder(cur)).then(r=>{ if(r && r.ok){ const updated = { ...cur, tgOrderReminderSent:true }; upsertOrder(updated); } else { try{ console.log('telegram_send_failed_order_reminder', r && r.data); }catch{} } }).catch(()=>{ try{ console.log('telegram_send_error_order_reminder'); }catch{} });
        }
      }catch{}
      tgOrderReminderTimers.delete(id);
    }, ms);
    tgOrderReminderTimers.set(id,{t});
  }catch{}
}
function clearOrderReminder(orderId){
  try{ const id=String(orderId||''); const rec=tgOrderReminderTimers.get(id); if(rec&&rec.t){ clearTimeout(rec.t); } tgOrderReminderTimers.delete(id); }catch{}
}
function schedulePaymentPendingReminder(orderId, delayMs){
  try{
    const id = String(orderId||'');
    if(!id) return;
    if(tgPayPendingTimers.has(id)) return;
    const ms = Number(delayMs||600000);
    const t = setTimeout(()=>{
      try{
        const ord = findOrderById(id) || { id };
        if(!ord.tgPendingPayNotified){
          sendTelegram(fmtTGPendingPayment(ord)).then(r=>{ if(r && r.ok){ const updated = { ...ord, tgPendingPayNotified:true }; upsertOrder(updated); } else { try{ console.log('telegram_send_failed_pending', r && r.data); }catch{} } }).catch(()=>{ try{ console.log('telegram_send_error_pending'); }catch{} });
        }
      }catch{}
      tgPayPendingTimers.delete(id);
    }, ms);
    tgPayPendingTimers.set(id,{t});
  }catch{}
}
function clearPaymentPendingReminder(orderId){
  try{ const id=String(orderId||''); const rec=tgPayPendingTimers.get(id); if(rec&&rec.t){ clearTimeout(rec.t); } tgPayPendingTimers.delete(id); }catch{}
}
