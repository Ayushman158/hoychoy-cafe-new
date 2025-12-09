const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

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
const BASE = ENV==='PROD' ? 'https://api.phonepe.com/apis/hermes' : 'https://api-preprod.phonepe.com/apis/pg-sandbox';
const CLIENT_ID = process.env.PHONEPE_CLIENT_ID || '';
const CLIENT_SECRET = process.env.PHONEPE_CLIENT_SECRET || '';
const CLIENT_VERSION = process.env.PHONEPE_CLIENT_VERSION || '';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'hoychoycafe@gmail.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'h0ych0ycafe123';

const OV_PATH = path.join(__dirname, 'data', 'overrides.json');
function ensureDir(){try{fs.mkdirSync(path.dirname(OV_PATH),{recursive:true});}catch{}}
function loadOverrides(){
  try{ ensureDir(); const s=fs.readFileSync(OV_PATH,'utf-8'); return JSON.parse(s||'{}'); }catch{ return {}; }
}
function saveOverrides(obj){ try{ ensureDir(); fs.writeFileSync(OV_PATH, JSON.stringify(obj,null,2)); }catch{} }
let overrides = loadOverrides();
const sessions = new Map();
function createSession(){ const t=crypto.randomBytes(24).toString('hex'); const exp=Date.now()+24*60*60*1000; sessions.set(t,{exp}); return t; }
function isValidSession(t){ const s=sessions.get(t); if(!s) return false; if(Date.now()>s.exp){ sessions.delete(t); return false; } return true; }

let tokenCache = { token: '', expiresAt: 0 };

async function getAuthToken(){
  try{
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
  const path = '/pg/v1/pay';
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

const payments = new Map();
const orders = [];
const orderClients = new Set();

function isWithinHours(){ const h=new Date().getHours(); return h>=12 && h<21; }
app.get('/api/app-status', (req,res)=>{
  const within = isWithinHours();
  const closed = overrides.appClosed===true || process.env.APP_CLOSED==='1';
  const open = within && !closed;
  const reason = closed ? 'CLOSED_BY_OWNER' : (within ? 'OPEN' : 'OUT_OF_HOURS');
  res.json({open, reason});
});

function requireAdmin(req,res,next){
  const hdr = req.headers['authorization']||'';
  const tok = hdr.startsWith('Bearer ') ? hdr.slice(7) : hdr;
  if(isValidSession(tok)) return next();
  return res.status(401).json({error:'unauthorized'});
}

app.post('/api/admin/login', (req,res)=>{
  const { email, password } = req.body||{};
  if(!ADMIN_EMAIL || !ADMIN_PASSWORD) return res.status(500).json({error:'admin-not-configured'});
  if(email===ADMIN_EMAIL && password===ADMIN_PASSWORD){ const token=createSession(); return res.json({ok:true, token}); }
  return res.status(401).json({error:'invalid-credentials'});
});

app.get('/api/admin/me', (req,res)=>{
  const hdr = req.headers['authorization']||'';
  const tok = hdr.startsWith('Bearer ') ? hdr.slice(7) : hdr;
  return res.json({authed:isValidSession(tok)});
});

app.get('/api/menu-overrides', (req,res)=>{
  res.json(overrides||{});
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
  const { open } = req.body || {};
  overrides.appClosed = !open;
  saveOverrides(overrides);
  res.json({ok:true, appClosed:overrides.appClosed});
});

app.post('/api/admin/set-availability', requireAdmin, (req,res)=>{
  const { id, available } = req.body || {};
  if(!id) return res.status(400).json({error:'id required'});
  overrides.availability = overrides.availability||{};
  overrides.availability[id] = !!available;
  saveOverrides(overrides);
  res.json({ok:true});
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

app.post('/api/initiate-payment', async (req,res)=>{
  try{
    const { amount, orderId, customerPhone, customerName, redirectUrl, callbackUrl } = req.body;
    if(!amount || !orderId) return res.status(400).json({error:'amount and orderId required'});
    const payload = {
      merchantId: MERCHANT_ID,
      merchantTransactionId: orderId,
      amount: Math.round(Number(amount)*100),
      merchantUserId: customerPhone || customerName || 'user',
      mobileNumber: customerPhone,
      redirectUrl,
      callbackUrl,
      paymentInstrument: { type: 'PAY_PAGE' }
    };
    const resp = await phonepePay(payload);
    if(!resp.ok) return res.status(500).json({error:'phonepe-init-failed', details:resp.data});
    const url = resp.data?.data?.instrumentResponse?.redirectInfo?.url;
    payments.set(orderId, {status:'PENDING', amount});
    return res.json({redirectUrl:url, orderId});
  }catch(e){
    return res.status(500).json({error:'server-error', message:String(e)});
  }
});

app.post('/api/payment-callback', (req,res)=>{
  try{
    const { merchantTransactionId, transactionId, state } = req.body || {};
    if(merchantTransactionId){
      payments.set(merchantTransactionId, {status:state, transactionId});
    }
    res.json({ok:true});
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>{
  console.log(`PhonePe server listening on http://localhost:${PORT}`);
});
