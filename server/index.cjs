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
const ADMIN_WHATSAPP_PHONE = process.env.ADMIN_WHATSAPP_PHONE || '';
const WA_PHONE_NUMBER_ID = process.env.WA_PHONE_NUMBER_ID || '';
const WA_ACCESS_TOKEN = process.env.WA_ACCESS_TOKEN || '';
const MIN_ORDER_RUPEES = Number(process.env.MIN_ORDER_RUPEES||200);
const ADMIN_REMEMBER_TTL_DAYS = Number(process.env.ADMIN_REMEMBER_TTL_DAYS||30);
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID || '';

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
async function refreshSessionsFromStore(){ try{ const v = await upGet('hc:sessions'); if(v && typeof v==='object'){ const m=new Map(Object.entries(v)); sessions.clear(); m.forEach((val,key)=>sessions.set(key,val)); } }catch{} }
function persistSessions(){ try{ const obj={}; sessions.forEach((val,key)=>{ obj[key]=val; }); upSet('hc:sessions', obj); }catch{} }
function createSession(ttlHours){ const t=crypto.randomBytes(24).toString('hex'); const hours = Number(ttlHours||ADMIN_TOKEN_TTL_HOURS)||ADMIN_TOKEN_TTL_HOURS; const exp=Date.now()+hours*60*60*1000; sessions.set(t,{exp, ttlHours:hours}); persistSessions(); return t; }
function isValidSession(t){ const s=sessions.get(t); if(!s) return false; if(Date.now()>s.exp){ sessions.delete(t); persistSessions(); return false; } return true; }

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
    const tok = TELEGRAM_BOT_TOKEN;
    const chat = TELEGRAM_ADMIN_CHAT_ID;
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
    const items = Array.isArray(o.items)?o.items:[];
    const names = items.map(it=>`${(it.item&&it.item.name)||''} ×${Number(it.qty||0)}`).filter(Boolean);
    const preview = names.slice(0,4).join(', ');
    const more = names.length>4 ? `, +${names.length-4} more` : '';
    const cust = o.customer||{};
    const ph = String(cust.phone||'').trim();
    const addr = String(cust.address||'').trim();
    let map = '';
    try{
      const g=cust.geo;
      if(g && g.lat!=null && g.lng!=null){ map = `https://maps.google.com/?q=${Number(g.lat)},${Number(g.lng)}`; }
      else if(cust.manualLink){ map = String(cust.manualLink); }
    }catch{}
    const lines = [];
    lines.push(`🆕 New Order`);
    if(name) lines.push(`Name: ${name}`);
    lines.push(`ID: ${o.id}`);
    lines.push(`Amount: ₹${amt}`);
    if(preview) lines.push(preview + more);
    if(ph) lines.push(`📞 ${ph}`);
    if(addr) lines.push(`🏠 ${addr}`);
    if(map) lines.push(`📍 ${map}`);
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
    const names = items.map(it=>`${(it.item&&it.item.name)||''} ×${Number(it.qty||0)}`).filter(Boolean);
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
    const lines = [];
    lines.push(`⚠️ Payment Pending`);
    lines.push(`ID: ${o.id}`);
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
    lines.push(`🔄 Order Status Updated`);
    lines.push(`ID: ${o.id}`);
    lines.push(`Status: ${pretty}`);
    return lines.join('\n');
  }catch{ return 'Order status updated'; }
}

function isWithinHours(){ const h=new Date().getHours(); return h>=12 && h<21; }
app.get('/api/app-status', async (req,res)=>{
  try{ await refreshOverridesFromStore(); }catch{}
  try{ await refreshSessionsFromStore(); }catch{}
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
    const token=createSession(remember ? ADMIN_REMEMBER_TTL_DAYS*24 : ADMIN_TOKEN_TTL_HOURS);
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
  if(ok){ const s=sessions.get(tok); if(s){ const hours = s.ttlHours||ADMIN_TOKEN_TTL_HOURS; s.exp=Date.now()+hours*60*60*1000; persistSessions(); } }
  return res.json({authed:ok});
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
    const hasToken = !!TELEGRAM_BOT_TOKEN;
    const hasChat = !!TELEGRAM_ADMIN_CHAT_ID;
    res.json({ok:true, TELEGRAM_BOT_TOKEN_set:hasToken, TELEGRAM_ADMIN_CHAT_ID_set:hasChat});
  }catch{ res.status(500).json({error:'server-error'}); }
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
    if(!orderId || !customer){
      return res.status(400).json({error:'invalid-order'});
    }
    const existing = findOrderById(orderId) || { id: orderId, createdAt: Date.now(), status:'PENDING' };
    const updated = {
      ...existing,
      txnId: transactionId || existing.txnId || null,
      total: Number(total||existing.total||0),
      items: Array.isArray(items)?items:(existing.items||[]),
      customer,
    };
    let saved = upsertOrder(updated);
    try{
      const pay = payments.get(orderId) || {};
      const raw = String(pay.status||saved.status||'PENDING');
      const mapped = (raw==='COMPLETED'||raw==='SUCCESS'||raw==='PAID') ? 'PAID' : (raw==='FAILED' ? 'FAILED' : 'PENDING');
      if(mapped==='PAID' && !saved.tgPaySuccessNotified){
        const r = await sendTelegram(fmtTGPaySuccess(saved));
        if(r && r.ok){
          clearPaymentPendingReminder(String(orderId));
          saved = upsertOrder({ ...saved, tgPaySuccessNotified:true }) || saved;
        }else{ try{ console.log('telegram_send_failed_pay_success', r && r.data); }catch{} }
      }else if(mapped==='FAILED' && !saved.tgPayFailedNotified){
        const r = await sendTelegram(fmtTGPayFailed(saved));
        if(r && r.ok){
          clearPaymentPendingReminder(String(orderId));
          saved = upsertOrder({ ...saved, tgPayFailedNotified:true }) || saved;
        }else{ try{ console.log('telegram_send_failed_pay_failed', r && r.data); }catch{} }
      }else if(mapped==='PENDING'){
        schedulePaymentPendingReminder(String(orderId));
        if(!saved.tgPendingPayNotified){
          const r = await sendTelegram(fmtTGPendingPayment(saved));
          if(r && r.ok){ saved = upsertOrder({ ...saved, tgPendingPayNotified:true }) || saved; }
          else{ try{ console.log('telegram_send_failed_pending', r && r.data); }catch{} }
        }
      }
    }catch{}
    return res.json({ok:true, order:saved});
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
    const { amount, orderId, customerPhone, customerName, expireAfter, snapshot } = req.body;
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
    schedulePaymentPendingReminder(String(orderId));
    const pre = findOrderById(orderId);
    const baseCust = { name:String(customerName||''), phone:String(customerPhone||'') };
    const preRecord = {
      id: orderId,
      txnId: null,
      total: Number(amount||0),
      items: Array.isArray(snapshot?.items)?snapshot.items:(pre?.items||[]),
      customer: snapshot?.customer || pre?.customer || baseCust,
      createdAt: pre?.createdAt || Date.now(),
      status: pre?.status || 'PENDING'
    };
    upsertOrder(preRecord);
    return res.json({redirectUrl:url, orderId});
  }catch(e){
    return res.status(500).json({error:'server-error', message:String(e)});
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
        if(orderId){
          payments.set(orderId, {status:st, transactionId:txn});
          const mapped = st==='COMPLETED' ? 'PAID' : (st==='FAILED' ? 'FAILED' : 'PENDING');
          const existing = findOrderById(orderId) || { id: orderId, createdAt: Date.now(), total: 0, items: [], customer: {}, status:'PENDING' };
          let updated = { ...existing, status:mapped, txnId: txn||existing.txnId||null };
          const shouldNotify = mapped==='PAID' && !existing.notified;
          if(shouldNotify){
            const text = formatOrderWhatsApp(updated);
            sendWhatsApp(text).catch(()=>{});
            sendTelegram(fmtTGPaySuccess(updated)).then(r=>{ if(r && r.ok){ updated = { ...updated, notified:true, tgPaySuccessNotified:true }; } else { try{ console.log('telegram_send_failed_pay_success', r && r.data); }catch{} } }).catch(()=>{ try{ console.log('telegram_send_error_pay_success'); }catch{} });
          }
          if(mapped==='FAILED' && !existing.tgPayFailedNotified){
            sendTelegram(fmtTGPayFailed(updated)).then(r=>{ if(r && r.ok){ updated = { ...updated, tgPayFailedNotified:true }; } else { try{ console.log('telegram_send_failed_pay_failed', r && r.data); }catch{} } }).catch(()=>{ try{ console.log('telegram_send_error_pay_failed'); }catch{} });
          }
          if(mapped==='PAID' || mapped==='FAILED'){ clearPaymentPendingReminder(String(orderId)); }
          upsertOrder(updated);
        }
        return res.json({ok:true, state:st});
      }catch(e){
        if(merchantTransactionId){
          payments.set(merchantTransactionId, {status:state, transactionId});
          const mapped = state==='COMPLETED' ? 'PAID' : (state==='FAILED' ? 'FAILED' : 'PENDING');
          const existing = findOrderById(merchantTransactionId) || { id: merchantTransactionId, createdAt: Date.now(), total: 0, items: [], customer: {}, status:'PENDING' };
          let updated = { ...existing, status:mapped, txnId: transactionId||existing.txnId||null };
          const shouldNotify = mapped==='PAID' && !existing.notified;
          if(shouldNotify){
            const text = formatOrderWhatsApp(updated);
            sendWhatsApp(text).catch(()=>{});
            sendTelegram(fmtTGPaySuccess(updated)).then(r=>{ if(r && r.ok){ updated = { ...updated, notified:true, tgPaySuccessNotified:true }; } else { try{ console.log('telegram_send_failed_pay_success', r && r.data); }catch{} } }).catch(()=>{ try{ console.log('telegram_send_error_pay_success'); }catch{} });
          }
          if(mapped==='FAILED' && !existing.tgPayFailedNotified){
            sendTelegram(fmtTGPayFailed(updated)).then(r=>{ if(r && r.ok){ updated = { ...updated, tgPayFailedNotified:true }; } else { try{ console.log('telegram_send_failed_pay_failed', r && r.data); }catch{} } }).catch(()=>{ try{ console.log('telegram_send_error_pay_failed'); }catch{} });
          }
          if(mapped==='PAID' || mapped==='FAILED'){ clearPaymentPendingReminder(String(merchantTransactionId)); }
          upsertOrder(updated);
        }
        return res.json({ok:true, state});
      }
    }else{
      if(merchantTransactionId){
        payments.set(merchantTransactionId, {status:state, transactionId});
        const mapped = state==='COMPLETED' ? 'PAID' : (state==='FAILED' ? 'FAILED' : 'PENDING');
        const existing = findOrderById(merchantTransactionId) || { id: merchantTransactionId, createdAt: Date.now(), total: 0, items: [], customer: {}, status:'PENDING' };
        let updated = { ...existing, status:mapped, txnId: transactionId||existing.txnId||null };
        const shouldNotify = mapped==='PAID' && !existing.notified;
        if(shouldNotify){
          const text = formatOrderWhatsApp(updated);
          sendWhatsApp(text).catch(()=>{});
          sendTelegram(fmtTGPaySuccess(updated)).then(r=>{ if(r && r.ok){ updated = { ...updated, notified:true, tgPaySuccessNotified:true }; } else { try{ console.log('telegram_send_failed_pay_success', r && r.data); }catch{} } }).catch(()=>{ try{ console.log('telegram_send_error_pay_success'); }catch{} });
        }
        if(mapped==='FAILED' && !existing.tgPayFailedNotified){
          sendTelegram(fmtTGPayFailed(updated)).then(r=>{ if(r && r.ok){ updated = { ...updated, tgPayFailedNotified:true }; } else { try{ console.log('telegram_send_failed_pay_failed', r && r.data); }catch{} } }).catch(()=>{ try{ console.log('telegram_send_error_pay_failed'); }catch{} });
        }
        if(mapped==='PAID' || mapped==='FAILED'){ clearPaymentPendingReminder(String(merchantTransactionId)); }
        upsertOrder(updated);
      }
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
          const mapped = st==='COMPLETED' ? 'PAID' : (st==='FAILED' ? 'FAILED' : 'PENDING');
          payments.set(orderId, {status:mapped, transactionId:txn});
          const existing = findOrderById(orderId) || { id: orderId, createdAt: Date.now(), total: 0, items: [], customer: {}, status:'PENDING' };
          let updated = { ...existing, status:mapped, txnId: txn||existing.txnId||null };
          const shouldNotify = mapped==='PAID' && !existing.notified;
          if(shouldNotify){
            const text = formatOrderWhatsApp(updated);
            sendWhatsApp(text).catch(()=>{});
            sendTelegram(fmtTGPaySuccess(updated)).then(r=>{ if(r && r.ok){ updated = { ...updated, notified:true, tgPaySuccessNotified:true }; } else { try{ console.log('telegram_send_failed_pay_success', r && r.data); }catch{} } }).catch(()=>{ try{ console.log('telegram_send_error_pay_success'); }catch{} });
          }
          if(mapped==='FAILED' && !existing.tgPayFailedNotified){
            sendTelegram(fmtTGPayFailed(updated)).then(r=>{ if(r && r.ok){ updated = { ...updated, tgPayFailedNotified:true }; } else { try{ console.log('telegram_send_failed_pay_failed', r && r.data); }catch{} } }).catch(()=>{ try{ console.log('telegram_send_error_pay_failed'); }catch{} });
          }
          if(mapped==='PAID' || mapped==='FAILED'){ clearPaymentPendingReminder(String(orderId)); }
          upsertOrder(updated);
        }
        if(event && event.startsWith('pg.order')){
          // Broadcast order state changes explicitly
          broadcast({type:'order.state', orderId, state:st});
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
    const existing = findOrderById(orderId);
    if(existing){
      const status = existing.status || 'PENDING';
      const transactionId = existing.txnId || null;
      return res.json({status, transactionId, order: existing});
    }
    const pay = payments.get(orderId);
    if(pay){ return res.json({status:pay.status||'PENDING', transactionId:pay.transactionId||null}); }
    return res.status(404).json({error:'order-not-found'});
  }catch(e){
    res.status(500).json({error:'server-error', message:String(e)});
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
    try{ sendTelegram(fmtTGStatusChange(orders[idx],'DELIVERED')).then(r=>{ if(!r || !r.ok){ try{ console.log('telegram_send_failed_status_delivered', r && r.data); }catch{} } }).catch(()=>{ try{ console.log('telegram_send_error_status_delivered'); }catch{} }); }catch{}
    const payload = `data: ${JSON.stringify({type:'order.updated', order:orders[idx]})}\n\n`;
    orderClients.forEach((res)=>{ try{ res.write(payload); }catch{} });
    return res.json({ok:true, order:orders[idx]});
  }catch(e){
    return res.status(500).json({error:'server-error'});
  }
});
app.post('/api/admin/order-accept', requireAdmin, (req,res)=>{
  try{
    const { id } = req.body||{};
    if(!id) return res.status(400).json({error:'id required'});
    const idx = orders.findIndex(o=>String(o.id)===String(id));
    if(idx<0) return res.status(404).json({error:'order-not-found'});
    orders[idx] = { ...orders[idx], status:'ACCEPTED', acceptedAt: Date.now() };
    try{ sendTelegram(fmtTGStatusChange(orders[idx],'ACCEPTED')).then(r=>{ if(!r || !r.ok){ try{ console.log('telegram_send_failed_status_accepted', r && r.data); }catch{} } }).catch(()=>{ try{ console.log('telegram_send_error_status_accepted'); }catch{} }); }catch{}
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
