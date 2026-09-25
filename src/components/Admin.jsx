import React, { useEffect, useMemo, useState } from "react";
import {
  getMenu,
  makeIdFromName,
  fetchBackendOverridesAndCache,
  saveBackendOverrides,
  generateMenuCSV,
  downloadCSV,
  parseMenuCSV
} from "../utils/menu.js";
import { BACKEND_URL, OWNER_PHONE } from "../config.js";

const VegIcon = () => (
  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 flex-shrink-0 inline-block" fill="none" strokeWidth="2">
    <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" className="text-success" />
    <circle cx="12" cy="12" r="4" fill="currentColor" className="text-success" />
  </svg>
);

const NonVegIcon = () => (
  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 flex-shrink-0 inline-block" fill="none" strokeWidth="2">
    <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" className="text-error" />
    <polygon points="12,7 17,16 7,16" fill="currentColor" className="text-error" />
  </svg>
);

const esc = (v)=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeHref = (u)=>{ try{ const x=new URL(String(u)); return /^https?:$/.test(x.protocol) ? x.toString() : ''; }catch{ return ''; } };
// Orders from the server store items flat ({name,price,qty}); older ones nest them under .item.
const itemName = (it)=> it?.item?.name || it?.name || 'Item';
const itemPrice = (it)=> Number(it?.item?.price ?? it?.price ?? 0);
const isPaid = (o)=> o?.paymentState==='PAID' || (!o?.paymentState && ['PAID','ACCEPTED','PREPARING','OUT_FOR_DELIVERY','DELIVERED'].includes(String(o?.status)));

// Shrinks a phone photo to at most 1000px on the long side so uploads stay small.
function resizeImage(file, maxSide=1000){
  return new Promise((resolve,reject)=>{
    const img = new Image();
    img.onload = ()=>{
      const scale = Math.min(1, maxSide/Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width*scale); c.height = Math.round(img.height*scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = ()=>reject(new Error('Could not read that photo'));
    img.src = URL.createObjectURL(file);
  });
}

export default function Admin(){
  const [token,setToken]=useState(()=>localStorage.getItem('hc_admin_token')||'');
  const [authed,setAuthed]=useState(false);
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [showPwd,setShowPwd]=useState(false);
  const [logging,setLogging]=useState(false);
  const [remember,setRemember]=useState(true);
  const [status,setStatus]=useState({open:true,reason:'OPEN'});
  const [items,setItems]=useState(()=>getMenu().items||[]);
  const categories = useMemo(()=>{
    const s = new Set((items||[]).map(it=>it.category).filter(Boolean));
    s.add('Misc');
    return Array.from(s).sort();
  },[items]);
  const [query,setQuery]=useState("");
  const [name,setName]=useState("");
  const [price,setPrice]=useState("");
  const [veg,setVeg]=useState(false);
  const [category,setCategory]=useState("Misc");
  const [customCategory,setCustomCategory]=useState("");
  const [isNewCategory,setIsNewCategory]=useState(false);
  const [addImage,setAddImage]=useState("");
  const [addFeatured,setAddFeatured]=useState(false);
  const [overrides,setOverrides]=useState({});
  const [editingItem,setEditingItem]=useState(null);
  const [editCustomCategory,setEditCustomCategory]=useState("");
  const [isEditNewCategory,setIsEditNewCategory]=useState(false);
  const [editingPriceId,setEditingPriceId]=useState(null);
  const [inlinePrice,setInlinePrice]=useState("");
  const [savingPrice,setSavingPrice]=useState(false);
  const [menuFilterCategory,setMenuFilterCategory]=useState("");
  const [featSelectId,setFeatSelectId]=useState("");
  const [showRemovedList,setShowRemovedList]=useState(false);

  // Bulk CSV Upload & Download state
  const [csvPreviewItems, setCsvPreviewItems] = useState(null);
  const [csvErrors, setCsvErrors] = useState([]);
  const [csvUploading, setCsvUploading] = useState(false);
  const [csvMsg, setCsvMsg] = useState("");
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [csvStats, setCsvStats] = useState({ total: 0, newCount: 0, updateCount: 0 });

  // Admin Password Change state
  const [pwdCurrent,setPwdCurrent]=useState("");
  const [pwdNew,setPwdNew]=useState("");
  const [pwdConfirm,setPwdConfirm]=useState("");
  const [showPwdCurrent,setShowPwdCurrent]=useState(false);
  const [showPwdNew,setShowPwdNew]=useState(false);
  const [showPwdConfirm,setShowPwdConfirm]=useState(false);
  const [pwdLoading,setPwdLoading]=useState(false);
  const [pwdMsg,setPwdMsg]=useState("");
  const [pwdSuccess,setPwdSuccess]=useState(false);

  const [msg,setMsg]=useState("");
  const [tab,setTab]=useState(()=>{ try{ return localStorage.getItem('hc_admin_tab')||'orders'; }catch{ return 'orders'; } });
  useEffect(()=>{ try{ localStorage.setItem('hc_admin_tab', tab); }catch{} },[tab]);
  const [me,setMe]=useState(null);
  const [uploadingImg,setUploadingImg]=useState(false);
  const [orders,setOrders]=useState([]);
  const [notifs,setNotifs]=useState([]);
  const [unread,setUnread]=useState(0);
  const [showBell,setShowBell]=useState(false);
  const [menuOpen,setMenuOpen]=useState(false);
  const [selected,setSelected]=useState(null);
  const [ownerClosed,setOwnerClosed]=useState(false);
  const [closingMessage,setClosingMessage]=useState("");
  const [orderStatus,setOrderStatus]=useState({});
  const [toggling,setToggling]=useState(false);
  const [closureDuration,setClosureDuration]=useState('0');
  const [customDate,setCustomDate]=useState('');
  const [customTime,setCustomTime]=useState('');
  const [orderFilter,setOrderFilter]=useState('ALL');
  const [orderSearch,setOrderSearch]=useState('');
  const [soundAlerts,setSoundAlerts]=useState(()=>{
    try{ return localStorage.getItem('hc_sound_alerts') !== 'false'; }catch{ return true; }
  });
  useEffect(()=>{
    try{ localStorage.setItem('hc_sound_alerts', String(soundAlerts)); }catch{}
  },[soundAlerts]);

  // Store & Contact Settings state
  const [storePhone, setStorePhone] = useState(OWNER_PHONE);
  const [storeUpi, setStoreUpi] = useState("");
  const [storeMerchantName, setStoreMerchantName] = useState("HoyChoy Café");
  const [storeMinOrder, setStoreMinOrder] = useState("200");
  const [storePackagingFee, setStorePackagingFee] = useState("0");
  const [storeGst, setStoreGst] = useState("5");
  const [storeHours, setStoreHours] = useState("");
  const [storeAnnouncement, setStoreAnnouncement] = useState("");
  const [storeEmail, setStoreEmail] = useState("");
  const [storeInstagram, setStoreInstagram] = useState("");
  const [storeLocation, setStoreLocation] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState("");

  // Telegram Alert Settings state
  const [tgBotToken, setTgBotToken] = useState("");
  const [tgChatId, setTgChatId] = useState("");
  const [tgConfig, setTgConfig] = useState(null);
  const [tgLoading, setTgLoading] = useState(false);
  const [tgMsg, setTgMsg] = useState("");
  const [tgTesting, setTgTesting] = useState(false);

  const [waTemplate,setWaTemplate]=useState('Your order has been placed. We will deliver within 15 minutes.');
  const [waCustom,setWaCustom]=useState('');
  const [coupons,setCoupons]=useState({});
  const [newCode,setNewCode]=useState('');
  const [newPercent,setNewPercent]=useState('');
  const [newEnabled,setNewEnabled]=useState(true);
  const DEFAULT_DELIVERY_RATES = {
    maxRadius: 10,
    tiers: [
      { upToKm: 5, fee: 60 },
      { upToKm: 8, fee: 80 },
      { upToKm: 10, fee: 120 }
    ]
  };
  const [deliveryRates, setDeliveryRates] = useState(DEFAULT_DELIVERY_RATES);
  const [newTierKm, setNewTierKm] = useState('');
  const [newTierFee, setNewTierFee] = useState('');
  const [savingDelivery, setSavingDelivery] = useState(false);
  const [notifiedIds,setNotifiedIds]=useState(()=>{ try{ const s=localStorage.getItem('hc_notified_orders'); return s?JSON.parse(s):[]; }catch{ return []; }});
  useEffect(()=>{ try{ localStorage.setItem('hc_notified_orders', JSON.stringify((notifiedIds||[]).slice(-200))); }catch{} },[notifiedIds]);
  useEffect(()=>{ try{ const s=localStorage.getItem('hc_admin_notifs'); const u=localStorage.getItem('hc_admin_unread'); if(s){ setNotifs(JSON.parse(s)); } if(u){ setUnread(Number(u)||0); } }catch{} },[]);
  useEffect(()=>{ try{ localStorage.setItem('hc_admin_notifs', JSON.stringify((notifs||[]).slice(0,50))); localStorage.setItem('hc_admin_unread', String(unread||0)); }catch{} },[notifs,unread]);
  function updateAppBadge(count){ try{ if(navigator.setAppBadge){ navigator.setAppBadge(Math.max(0,Number(count||0))); } }catch{} }
  function clearAppBadge(){ try{ if(navigator.clearAppBadge){ navigator.clearAppBadge(); } }catch{} }
  async function showSwNotification(title, body){
    try{
      const reg = await navigator.serviceWorker.getRegistration();
      if(reg && Notification && Notification.permission==='granted'){
        reg.showNotification(title, { body, icon:'/icons/icon-192-maskable.png', badge:'/icons/icon-96.png' });
      }
    }catch{}
  }
  function playAlertTone(){
    try{
      const Ctx = window.AudioContext||window.webkitAudioContext; if(!Ctx) return;
      const ctx = new Ctx();
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type='sine'; o.frequency.value=880; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime+0.02);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+0.25);
      o.start(); o.stop(ctx.currentTime+0.26);
      const o2 = ctx.createOscillator(); const g2 = ctx.createGain();
      o2.type='sine'; o2.frequency.value=660; o2.connect(g2); g2.connect(ctx.destination);
      g2.gain.setValueAtTime(0.001, ctx.currentTime+0.3);
      g2.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime+0.32);
      g2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+0.57);
      o2.start(ctx.currentTime+0.3); o2.stop(ctx.currentTime+0.58);
    }catch{}
  }
  const filteredOrders = useMemo(()=>{
    let list = orders || [];
    if(orderFilter==='DELIVERED') list = list.filter(o=>o.status==='DELIVERED');
    else if(orderFilter==='NEW') list = list.filter(o=>isPaid(o) && (!o.status || o.status==='NEW' || o.status==='PAID' || o.status==='PENDING'));
    else if(orderFilter==='UNPAID') list = list.filter(o=>!isPaid(o) && o.status!=='CANCELLED');
    else if(orderFilter==='ACCEPTED') list = list.filter(o=>o.status==='ACCEPTED' || o.status==='PREPARING');
    else if(orderFilter==='OUT_FOR_DELIVERY') list = list.filter(o=>o.status==='OUT_FOR_DELIVERY');
    else if(orderFilter==='CANCELLED') list = list.filter(o=>o.status==='CANCELLED');

    if(orderSearch.trim()){
      const q = orderSearch.trim().toLowerCase();
      list = list.filter(o => {
        const idMatch = String(o.id || '').toLowerCase().includes(q);
        const nameMatch = String(o.customer?.name || '').toLowerCase().includes(q);
        const phoneMatch = String(o.customer?.phone || '').toLowerCase().includes(q);
        const addrMatch = String(o.customer?.address || '').toLowerCase().includes(q);
        return idMatch || nameMatch || phoneMatch || addrMatch;
      });
    }
    return list;
  },[orders,orderFilter,orderSearch]);
  const today = useMemo(()=>{
    const start = new Date(); start.setHours(0,0,0,0);
    const list = (orders||[]).filter(o=>Number(o.createdAt||0)>=start.getTime() && isPaid(o) && o.status!=='CANCELLED');
    return {
      count: list.length,
      revenue: list.reduce((s,o)=>s+Number(o.total||0),0),
      waiting: (orders||[]).filter(o=>isPaid(o) && (o.status==='PAID'||o.status==='PENDING'||!o.status)).length,
      active: (orders||[]).filter(o=>o.status==='ACCEPTED'||o.status==='PREPARING'||o.status==='OUT_FOR_DELIVERY').length,
    };
  },[orders]);
  const untilLabel = useMemo(()=>{
    try{
      const cu = Number(status.closedUntil||0);
      if(status.ownerClosed){
        if(cu>0){
          const dt = new Date(cu);
          const t = dt.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
          return `Closed until ${t}`;
        }
        return 'Closed until admin reopens';
      }
      return '';
    }catch{ return '' }
  },[status]);
  async function authedFetch(url, options){
    const headers = Object.assign({}, options?.headers||{}, { 'Authorization': `Bearer ${token}` });
    const r = await fetch(url, Object.assign({}, options||{}, { headers }));
    if(r.status===401){ setAuthed(false); setMsg('Please log in again'); }
    return r;
  }

  useEffect(()=>{ refreshStatus(); },[]);
  useEffect(()=>{ refreshOverrides(); },[]);
  useEffect(()=>{ refreshCoupons(); },[]);
  useEffect(()=>{
    async function check(){
      if(!token) return;
    try{ const r=await authedFetch(`${BACKEND_URL}/api/admin/me`,{}); const d=await r.json(); setAuthed(!!d.authed); if(d.authed) setMe(d); }catch{}
    }
    check();
  },[token]);

  useEffect(()=>{
    if(!authed || !token) return;
    const ping = ()=>{
      authedFetch(`${BACKEND_URL}/api/admin/me`,{}).then(r=>r.json()).then(d=>{ setAuthed(!!d.authed); if(d.authed) setMe(d); }).catch(()=>{});
    };
    ping();
    const id = setInterval(ping, 10*60*1000);
    const onFocus = ()=>{ try{ ping(); }catch{} };
    const onVis = ()=>{ try{ if(document.visibilityState==='visible') ping(); }catch{} };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVis);
    return ()=>{ try{ clearInterval(id); window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onVis); }catch{} };
  },[authed, token]);

  useEffect(()=>{
    if(!authed || !token) return;
    let es=null; let t=null;
    function open(){
      try{
        es = new EventSource(`${BACKEND_URL}/api/admin/orders/stream?token=${encodeURIComponent(token)}`);
        es.onmessage = (ev)=>{
          try{
            const d = JSON.parse(ev.data||'{}');
            if(d.type==='init' && Array.isArray(d.orders)) setOrders(d.orders);
            if(d.type==='order.created' && d.order){
              // Unpaid checkouts are created here too; only chime once payment lands.
              setOrders((prev)=>[d.order, ...prev.filter(x=>x.id!==d.order.id)]);
            }
            if(d.type==='order.deleted') setOrders(prev=>prev.filter(x=>String(x.id)!==String(d.id)));
            if(d.type==='orders.cleared') setOrders([]);
            if(d.type==='order.updated' && d.order){
              setOrders((prev)=>prev.some(x=>x.id===d.order.id) ? prev.map(x=>x.id===d.order.id?d.order:x) : [d.order, ...prev]);
              setSelected(sel=> sel && sel.id===d.order.id ? d.order : sel);
              if(isPaid(d.order) && (d.order.status==='PAID' || d.order.status==='PENDING')){
                const info = {id:d.order.id, total:Number(d.order.total||0), ts:Date.now()};
                const already = (notifiedIds||[]).includes(info.id);
                if(!already){
                  setNotifiedIds(prev=>[...prev, info.id]);
                  setNotifs(prev=>[{title:'New paid order', body:`#${info.id} • ₹${info.total}`, ts:info.ts}, ...prev].slice(0,20));
                  setUnread(u=>{ const nu=(u+1); updateAppBadge(nu); return nu; });
                  showSwNotification('New paid order', `#${info.id} • ₹${info.total}`);
                  if(soundAlerts) playAlertTone();
                }
              }
            }
          }catch{}
        };
        es.onopen = ()=>{ setMsg(m=> m==='Connection lost. Reconnecting…' ? '' : m); };
        es.onerror = ()=>{ try{ es.close(); }catch{}; setMsg('Connection lost. Reconnecting…'); t=setTimeout(open,3000); };
      }catch{ t=setTimeout(open,2000); }
    }
    open();
    return ()=>{ try{ es && es.close(); }catch{}; try{ clearTimeout(t); }catch{} };
  },[authed, token]);
  function logout(){
    try{ fetch(`${BACKEND_URL}/api/admin/logout`,{method:'POST',headers:{'Authorization':`Bearer ${token}`}}); }catch{}
    localStorage.removeItem('hc_admin_token'); setToken(''); setAuthed(false); setMe(null); setMenuOpen(false); setMsg('Logged out');
  }
  async function logoutOthers(){
    if(!confirm('Sign out every other phone or computer that is logged in to this admin panel?')) return;
    try{
      const r = await authedFetch(`${BACKEND_URL}/api/admin/logout-others`,{method:'POST'});
      const d = await r.json();
      if(r.ok && d.ok){ setMe(m=>m?{...m, sessions:d.sessions}:m); setMsg('All other devices have been signed out'); }
      else setMsg('Could not sign out other devices');
    }catch{ setMsg('Network error'); }
  }
  async function uploadPhoto(file, onUrl){
    if(!file) return;
    setUploadingImg(true); setMsg('');
    try{
      const dataUrl = await resizeImage(file);
      const r = await authedFetch(`${BACKEND_URL}/api/admin/upload-image`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({dataUrl})});
      const d = await r.json();
      if(!r.ok || !d.url){ setMsg(d.message || 'Photo upload failed'); return; }
      onUrl(d.url);
      setMsg('Photo uploaded — remember to save the dish');
    }catch(e){ setMsg(e.message || 'Photo upload failed'); }
    finally{ setUploadingImg(false); }
  }
  async function verifyPayment(id){
    setOrderStatus(s=>({...s,[id]:{pending:true,type:'info',text:'Checking with PhonePe…'}}));
    try{
      const r = await authedFetch(`${BACKEND_URL}/api/admin/order-verify-payment`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});
      const d = await r.json();
      if(!r.ok || !d.ok){ setOrderStatus(s=>({...s,[id]:{pending:false,type:'error',text:d.message||'Could not check payment'}})); return; }
      setOrders(prev=>prev.map(x=>x.id===id?d.order:x));
      const st = d.order.paymentState||'PENDING';
      setOrderStatus(s=>({...s,[id]:{pending:false,type:st==='PAID'?'success':'error',text: st==='PAID' ? 'Payment confirmed by PhonePe' : `PhonePe says: ${st}`}}));
    }catch{ setOrderStatus(s=>({...s,[id]:{pending:false,type:'error',text:'Network error'}})); }
  }

  async function login(e){
    e.preventDefault(); setMsg(""); setLogging(true);
    try{
      const r=await fetch(`${BACKEND_URL}/api/admin/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,remember})});
      const d=await r.json();
      if(!r.ok || !d.token){
        if(d && d.error==='rate_limited' && d.retryAt){
          const secs = Math.max(0, Math.ceil((d.retryAt - Date.now())/1000));
          setMsg(`Too many attempts. Try again in ${secs} seconds.`);
        }else{
          setMsg('Invalid credentials');
        }
        return;
      }
      localStorage.setItem('hc_admin_token', d.token);
      setToken(d.token); setAuthed(true); setPassword(''); setMsg('Logged in');
    }catch{ setMsg('Network error'); }
    finally{ setLogging(false); }
  }

  async function refreshStatus(){
    try{ const r=await fetch(`${BACKEND_URL}/api/app-status`); const d=await r.json(); if(r.ok) setStatus(d); }catch{}
  }
  async function refreshOverrides(){
    try{
      const d = await fetchBackendOverridesAndCache();
      if(d){
        setOwnerClosed(!!d.appClosed);
        setClosingMessage(String(d.closingMessage||""));
        if(d.deliveryRates && Array.isArray(d.deliveryRates.tiers)){
          setDeliveryRates(d.deliveryRates);
        }
        if(d.storeSettings){
          if(d.storeSettings.contactPhone) setStorePhone(d.storeSettings.contactPhone);
          if(d.storeSettings.upiId) setStoreUpi(d.storeSettings.upiId);
          if(d.storeSettings.merchantName) setStoreMerchantName(d.storeSettings.merchantName);
          if(d.storeSettings.minOrderAmount !== undefined) setStoreMinOrder(String(d.storeSettings.minOrderAmount));
          if(d.storeSettings.packagingFee !== undefined) setStorePackagingFee(String(d.storeSettings.packagingFee));
          if(d.storeSettings.gstPercent !== undefined) setStoreGst(String(d.storeSettings.gstPercent));
          setStoreHours(d.storeSettings.openingHours||'');
          setStoreAnnouncement(d.storeSettings.announcement||'');
          setStoreEmail(d.storeSettings.contactEmail||'');
          setStoreInstagram(d.storeSettings.instagramUrl||'');
          setStoreLocation(d.storeSettings.locationUrl||'');
        }
        setOverrides(d||{});
        setItems(getMenu(d).items||[]);
      }
    }catch{}
  }
  async function refreshCoupons(){
    try{ if(!token) return; const r=await authedFetch(`${BACKEND_URL}/api/admin/coupons`,{method:'GET'}); const d=await r.json(); if(r.ok && d.ok){ setCoupons(d.coupons||{}); } }catch{}
  }
  async function setOpen(open){
    setMsg(""); setToggling(true);
    const prev = ownerClosed;
    setOwnerClosed(!open);
    try{
      let until = !open ? Number(closureDuration||'0') : 0;
      if(!open && (customDate||customTime)){
        if(!customDate || !customTime){ setOwnerClosed(prev); setMsg('Please pick both date and time'); setToggling(false); return; }
        const candidate = new Date(`${customDate}T${customTime}`);
        const ts = candidate.getTime();
        const diff = ts - Date.now();
        if(!Number.isFinite(ts) || diff<=0){ setOwnerClosed(prev); setMsg('Please choose a future date/time'); setToggling(false); return; }
        until = diff;
      }
      const r=await authedFetch(`${BACKEND_URL}/api/admin/set-app-open`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({open, until})});
      const d=await r.json();
      if(!r.ok){ setOwnerClosed(prev); setMsg('Failed to update app status'); setToggling(false); return; }
      await refreshStatus(); await refreshOverrides(); setMsg('App status updated');
    }catch{ setOwnerClosed(prev); setMsg('Network error'); }
    setToggling(false);
  }

  async function toggleAvailability(id, available){
    setMsg("");
    try{
      const r=await authedFetch(`${BACKEND_URL}/api/admin/set-availability`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,available})});
      if(!r.ok){ setMsg('Failed to update availability'); return; }
      await refreshOverrides(); setMsg(available ? 'Marked in stock' : 'Marked out of stock');
    }catch{ setMsg('Network error'); }
  }

  async function refundOrder(orderId, fullAmount){
    const already = (orders.find(o=>o.id===orderId)?.refunds||[]).reduce((s,r)=>s+Number(r.amount||0),0);
    const input = prompt(`Refund how much for order #${orderId}?${already?`\n(₹${already} already refunded)`:''}\nOrder total: ₹${fullAmount}`, String(Math.max(0, Number(fullAmount||0)-already)));
    if(input===null) return;
    const amount = Number(input);
    if(!(amount>0) || amount>Number(fullAmount||0)){ alert('Please enter an amount between ₹1 and the order total'); return; }
    setOrderStatus(s=>({...s,[orderId]:{pending:true,type:'info',text:'Processing refund…'}}));
    setMsg("");
    try{
      const r=await authedFetch(`${BACKEND_URL}/api/admin/refund`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({orderId,amount})});
      const d=await r.json();
      if(!r.ok || !d.ok){
        const err = d && d.error ? d.error : 'refund-failed';
        const friendly = err==='refund-not-configured' ? 'Refund is not configured on the server' : (err==='payment-not-verified' ? 'Payment not verified for this order' : err==='invalid-amount' ? 'Refund amount is more than the order total' : 'Refund failed');
        setOrderStatus(s=>({...s,[orderId]:{pending:false,type:'error',text:friendly}}));
        setMsg(friendly);
        return;
      }
      setOrderStatus(s=>({...s,[orderId]:{pending:false,type:'success',text:`Refund of ₹${amount} initiated (money reaches the customer in 3–5 days)`}}));
      setMsg('Refund initiated successfully');
    }catch{
      setOrderStatus(s=>({...s,[orderId]:{pending:false,type:'error',text:'Network error'}}));
      setMsg('Network error');
    }
  }

  async function markDelivered(id){
    setMsg("");
    try{
      const r=await authedFetch(`${BACKEND_URL}/api/admin/order-delivered`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});
      const d=await r.json();
      if(!r.ok || !d.ok){ setMsg('Failed to mark delivered'); return; }
      setOrders(prev=>prev.map(x=>x.id===id?d.order:x));
      setMsg('Order marked delivered');
    }catch{ setMsg('Network error'); }
  }
  async function deleteOrder(id){
    if(!confirm(`Delete order #${id}? This cannot be undone.`)) return;
    setMsg("");
    try{
      const r=await authedFetch(`${BACKEND_URL}/api/admin/order-delete`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});
      const d=await r.json();
      if(!r.ok || !d.ok){ setMsg('Failed to delete order'); return; }
      setOrders(prev=>prev.filter(x=>x.id!==id));
      setMsg('Order deleted');
    }catch{ setMsg('Network error'); }
  }
  async function clearAll(){
    const typed = prompt('This permanently deletes the whole order history. Type DELETE to confirm.');
    if(String(typed||'').trim().toUpperCase()!=='DELETE') return;
    setMsg("");
    try{
      const r=await authedFetch(`${BACKEND_URL}/api/admin/orders-clear`,{method:'POST',headers:{'Content-Type':'application/json'}});
      const d=await r.json();
      if(!r.ok || !d.ok){ setMsg('Failed to clear orders'); return; }
      setOrders([]);
      setMsg('All orders cleared');
    }catch{ setMsg('Network error'); }
  }
  async function exportCsv(){
    try{
      const r=await authedFetch(`${BACKEND_URL}/api/admin/orders.csv`,{method:'GET'});
      const txt=await r.text();
      const blob=new Blob([txt],{type:'text/csv'});
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');
      a.href=url; a.download='orders.csv'; a.click();
      URL.revokeObjectURL(url);
      setMsg('Exported CSV');
    }catch{ setMsg('Export failed'); }
  }
  function startEdit(it){
    const featList = Array.isArray(overrides?.featured) ? overrides.featured : [];
    const isFeat = featList.includes(it.id);
    const imgUrl = (overrides?.images && overrides.images[it.id]) || it.image || '';
    setEditingItem({
      id: it.id,
      name: it.name,
      price: it.price,
      veg: !!it.veg,
      category: it.category || 'Misc',
      image: imgUrl,
      featured: isFeat
    });
    setEditCustomCategory("");
    setIsEditNewCategory(false);
  }

  async function saveItemEdit(e){
    e.preventDefault();
    if(!editingItem) return;
    setMsg('');
    const finalCategory = (isEditNewCategory && editCustomCategory.trim())
      ? editCustomCategory.trim()
      : (editingItem.category || 'Misc');

    try{
      const r = await authedFetch(`${BACKEND_URL}/api/admin/edit-item`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingItem.id,
          name: editingItem.name,
          price: Number(editingItem.price || 0),
          veg: editingItem.veg,
          category: finalCategory,
          image: editingItem.image,
          featured: editingItem.featured
        })
      });
      const d = await r.json();
      if(!r.ok || !d.ok){ setMsg('Failed to update item'); return; }
      await refreshOverrides();
      setEditingItem(null);
      setMsg(`Updated "${editingItem.name}" successfully!`);
    }catch{ setMsg('Network error'); }
  }

  async function saveInlinePrice(id){
    const num = Number(inlinePrice);
    if(isNaN(num) || num < 0) {
      setMsg("Please enter a valid price (₹0 or more)");
      return;
    }
    setSavingPrice(true);
    setMsg("");
    try{
      const r = await authedFetch(`${BACKEND_URL}/api/admin/edit-item`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, price: num })
      });
      const d = await r.json();
      if(!r.ok || !d.ok){
        setMsg("Failed to update price");
        setSavingPrice(false);
        return;
      }
      await refreshOverrides();
      setEditingPriceId(null);
      setInlinePrice("");
      setMsg(`Price updated to ₹${num} successfully!`);
    }catch{
      setMsg("Network error updating price");
    }
    setSavingPrice(false);
  }

  async function toggleFeatured(id, isFeatured){
    setMsg('');
    try{
      const r = await authedFetch(`${BACKEND_URL}/api/admin/set-featured`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, isFeatured })
      });
      const d = await r.json();
      if(!r.ok || !d.ok){ setMsg('Failed to update featured item'); return; }
      await refreshOverrides();
      setMsg(isFeatured ? 'Item added to Front Showcase' : 'Item removed from Front Showcase');
    }catch{ setMsg('Network error'); }
  }

  async function reorderFeatured(id, direction){
    const featList = Array.isArray(overrides?.featured) ? [...overrides.featured] : [];
    const idx = featList.indexOf(id);
    if(idx === -1) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if(targetIdx < 0 || targetIdx >= featList.length) return;
    const temp = featList[idx];
    featList[idx] = featList[targetIdx];
    featList[targetIdx] = temp;
    
    setMsg("");
    try{
      const r = await authedFetch(`${BACKEND_URL}/api/admin/set-featured`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ featured: featList })
      });
      const d = await r.json();
      if(!r.ok || !d.ok){ setMsg("Failed to reorder featured items"); return; }
      await refreshOverrides();
      setMsg("Front showcase order updated!");
    }catch{
      setMsg("Network error reordering featured items");
    }
  }

  async function removeItem(id){
    if(!confirm('Delete this item from menu?')) return;
    setMsg('');
    try{
      const r=await authedFetch(`${BACKEND_URL}/api/admin/remove-item`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});
      const d=await r.json();
      if(!r.ok || !d.ok){ setMsg('Failed to delete item'); return; }
      await refreshOverrides();
      setMsg('Item deleted from menu');
    }catch{ setMsg('Network error'); }
  }

  async function restoreItem(id){
    setMsg("");
    try{
      const r = await authedFetch(`${BACKEND_URL}/api/admin/restore-item`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      const d = await r.json();
      if(!r.ok || !d.ok){ setMsg("Failed to restore item"); return; }
      await refreshOverrides();
      setMsg("Item restored to menu successfully!");
    }catch{
      setMsg("Network error restoring item");
    }
  }

  function handleDownloadCurrentCSV(){
    try{
      const currentItems = items || [];
      const currentFeat = Array.isArray(overrides?.featured) ? overrides.featured : [];
      const csvText = generateMenuCSV(currentItems, currentFeat);
      const dateStr = new Date().toISOString().slice(0, 10);
      downloadCSV(csvText, `hoychoy_menu_${dateStr}.csv`);
      setMsg("Menu CSV downloaded! Open in Excel/Sheets to edit or add new items.");
    }catch(err){
      setMsg("Failed to download CSV: " + err.message);
    }
  }

  function handleDownloadTemplateCSV(){
    try{
      const csvText = generateMenuCSV([], []);
      downloadCSV(csvText, `hoychoy_menu_template.csv`);
      setMsg("Sample template CSV downloaded!");
    }catch(err){
      setMsg("Failed to download template: " + err.message);
    }
  }

  function handleCsvFileSelect(e){
    const file = e.target.files && e.target.files[0];
    if(!file) return;
    setCsvMsg("");

    const reader = new FileReader();
    reader.onload = (event) => {
      try{
        const text = event.target.result;
        const { items: parsedItems, errors, error } = parseMenuCSV(text);
        if(error){
          setCsvErrors([error]);
          setCsvPreviewItems(null);
          setShowCsvModal(true);
          return;
        }

        const currentMap = new Map((items || []).map(it => [it.id, it]));
        let newCount = 0;
        let updateCount = 0;

        parsedItems.forEach(it => {
          if(currentMap.has(it.id)){
            updateCount++;
          }else{
            newCount++;
          }
        });

        setCsvStats({
          total: parsedItems.length,
          newCount,
          updateCount
        });
        setCsvPreviewItems(parsedItems);
        setCsvErrors(errors || []);
        setShowCsvModal(true);
      }catch(err){
        setCsvErrors(["Failed to parse CSV file: " + err.message]);
        setCsvPreviewItems(null);
        setShowCsvModal(true);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  async function handleApplyBulkCsv(){
    if(!csvPreviewItems || csvPreviewItems.length === 0) return;
    setCsvUploading(true);
    setCsvMsg("");
    try{
      const res = await authedFetch(`${BACKEND_URL}/api/admin/bulk-items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ items: csvPreviewItems })
      });
      const data = await res.json();
      if(!res.ok || !data.ok){
        throw new Error(data?.message || data?.error || 'Bulk upload failed');
      }

      await refreshOverrides();

      setCsvMsg(`Success: ${data.message || `Uploaded ${csvPreviewItems.length} dishes`}`);
      setMsg(`Bulk upload completed: ${csvStats.newCount} new dishes added, ${csvStats.updateCount} dishes updated!`);
      setTimeout(() => {
        setShowCsvModal(false);
        setCsvPreviewItems(null);
      }, 1200);
    }catch(err){
      setCsvMsg("Error uploading menu: " + err.message);
    }finally{
      setCsvUploading(false);
    }
  }

  async function addItem(e){
    e.preventDefault(); setMsg("");
    const id = makeIdFromName(name||'item');
    const finalCategory = (isNewCategory && customCategory.trim())
      ? customCategory.trim()
      : (category || 'Misc');

    try{
      const r=await authedFetch(`${BACKEND_URL}/api/admin/add-item`,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          id,
          name,
          price:Number(price||0),
          veg,
          category: finalCategory,
          image: addImage,
          featured: addFeatured
        })
      });
      const d=await r.json();
      if(!r.ok){ setMsg('Failed to add item'); return; }
      await refreshOverrides();
      setName(""); setPrice(""); setVeg(false); setCategory("Misc"); setCustomCategory(""); setIsNewCategory(false); setAddImage(""); setAddFeatured(false);
      setMsg(`Added "${name}" to menu!`);
    }catch{ setMsg('Network error'); }
  }

  async function handlePasswordChange(e){
    e.preventDefault();
    setPwdMsg("");
    setPwdSuccess(false);

    if(!pwdCurrent){
      setPwdMsg("Please enter your current password");
      return;
    }
    if(!pwdNew || pwdNew.length < 8){
      setPwdMsg("New password must be at least 8 characters long");
      return;
    }
    if(pwdNew !== pwdConfirm){
      setPwdMsg("New passwords do not match");
      return;
    }

    setPwdLoading(true);
    try{
      const r = await authedFetch(`${BACKEND_URL}/api/admin/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: pwdCurrent, newPassword: pwdNew })
      });
      const d = await r.json();
      if(!r.ok || !d.ok){
        setPwdMsg(d.message || d.error || "Failed to update password");
        setPwdLoading(false);
        return;
      }
      setPwdSuccess(true);
      setPwdMsg(d.message || "Password changed successfully!");
      setMe(m=>m?{...m, defaultPassword:false, sessions:1}:m);
      setPwdCurrent("");
      setPwdNew("");
      setPwdConfirm("");
    }catch(err){
      setPwdMsg("Network error while updating password");
    }
    setPwdLoading(false);
  }

  async function loadTelegramConfig(){
    try{
      const r = await authedFetch(`${BACKEND_URL}/api/admin/debug/telegram-config`);
      const d = await r.json();
      if(r.ok && d.ok){
        setTgConfig(d);
        if(d.chatId && !tgChatId) setTgChatId(d.chatId);
      }
    }catch{}
  }

  useEffect(()=>{
    if(authed && token){
      loadTelegramConfig();
    }
  },[authed, token]);

  async function saveTelegramConfig(e){
    e && e.preventDefault && e.preventDefault();
    setTgLoading(true);
    setTgMsg("");
    try{
      const body = { chatId: tgChatId };
      if(tgBotToken.trim()) body.botToken = tgBotToken.trim();
      const r = await authedFetch(`${BACKEND_URL}/api/admin/debug/telegram-set-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const d = await r.json();
      if(!r.ok || !d.ok){
        setTgMsg("Failed to update Telegram settings");
        setTgLoading(false);
        return;
      }
      setTgBotToken("");
      await loadTelegramConfig();
      setTgMsg("Telegram configuration updated successfully!");
    }catch{
      setTgMsg("Network error updating Telegram configuration");
    }
    setTgLoading(false);
  }

  async function testTelegram(){
    setTgTesting(true);
    setTgMsg("");
    try{
      const r = await authedFetch(`${BACKEND_URL}/api/admin/debug/send-telegram`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: "✅ Test alert from HoyChoy Café admin panel. Order alerts will arrive here." })
      });
      const d = await r.json();
      if(r.ok && d.ok){
        setTgMsg("Test message delivered to Telegram!");
      }else{
        setTgMsg("Failed to send test message. Check your Bot Token and Chat ID.");
      }
    }catch{
      setTgMsg("Network error sending test Telegram alert");
    }
    setTgTesting(false);
  }

  async function saveStoreSettings(e){
    e && e.preventDefault && e.preventDefault();
    setSavingSettings(true);
    setSettingsMsg("");
    try{
      const r = await authedFetch(`${BACKEND_URL}/api/admin/store-settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactPhone: storePhone,
          upiId: storeUpi,
          merchantName: storeMerchantName,
          minOrderAmount: Number(storeMinOrder || 0),
          packagingFee: Number(storePackagingFee || 0),
          gstPercent: Number(storeGst || 0),
          openingHours: storeHours,
          announcement: storeAnnouncement,
          contactEmail: storeEmail,
          instagramUrl: storeInstagram,
          locationUrl: storeLocation
        })
      });
      const d = await r.json();
      if(!r.ok || !d.ok){
        setSettingsMsg("Failed to save store settings");
        setSavingSettings(false);
        return;
      }
      await refreshOverrides();
      setSettingsMsg("Store settings updated successfully!");
      setMsg("Store settings saved!");
    }catch{
      setSettingsMsg("Network error saving store settings");
    }
    setSavingSettings(false);
  }

  async function deleteCoupon(code){
    if(!confirm(`Delete coupon "${code}"?`)) return;
    setMsg("");
    try{
      const r = await authedFetch(`${BACKEND_URL}/api/admin/coupon-delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });
      const d = await r.json();
      if(!r.ok || !d.ok){ setMsg("Failed to delete coupon"); return; }
      await refreshCoupons();
      setMsg(`Coupon "${code}" deleted successfully`);
    }catch{
      setMsg("Network error deleting coupon");
    }
  }

  async function toggleCoupon(code, currentEnabled, currentPercent){
    setMsg("");
    try{
      const r = await authedFetch(`${BACKEND_URL}/api/admin/coupon-set`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, percent: currentPercent, enabled: !currentEnabled })
      });
      const d = await r.json();
      if(!r.ok || !d.ok){ setMsg("Failed to update coupon"); return; }
      await refreshCoupons();
      setMsg(`Coupon "${code}" ${!currentEnabled ? 'enabled' : 'disabled'}`);
    }catch{
      setMsg("Network error updating coupon");
    }
  }

  async function resetMenuToDefaults(){
    if(!confirm("Are you sure you want to reset all menu customizations? All custom dishes, edits, and price overrides will revert to factory defaults.")) return;
    setMsg("");
    try{
      const r = await authedFetch(`${BACKEND_URL}/api/admin/reset-menu`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const d = await r.json();
      if(!r.ok || !d.ok){ setMsg("Failed to reset menu"); return; }
      await refreshOverrides();
      setMsg("Menu reset to factory defaults!");
    }catch{
      setMsg("Network error resetting menu");
    }
  }

  async function updateOrderStatus(id, newStatus, prepTime, cancelReason){
    setMsg("");
    try{
      const body = { id, status: newStatus };
      if(prepTime) body.prepTime = prepTime;
      if(cancelReason) body.cancelReason = cancelReason;
      const r = await authedFetch(`${BACKEND_URL}/api/admin/order-update-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const d = await r.json();
      if(!r.ok || !d.ok){ setMsg("Failed to update order status"); return; }
      setOrders(prev => prev.map(x => x.id === id ? d.order : x));
      if(selected && selected.id === id){
        setSelected(d.order);
      }
      setMsg(`Order #${id} marked as ${newStatus}`);
    }catch{
      setMsg("Network error updating order status");
    }
  }

  function printOrderReceipt(o){
    if(!o) return;
    const w = window.open('', '_blank', 'width=600,height=700');
    if(!w) { alert('Popup blocked. Please allow popups to print receipt.'); return; }
    // Everything below is escaped: the name/address/note come from customers,
    // and this window shares the admin page's origin (and its login token).
    const itemsHtml = (o.items||[]).map(it => `
      <tr>
        <td style="padding:6px 0; border-bottom:1px dashed #ddd;">${esc(itemName(it))}</td>
        <td style="padding:6px 0; text-align:center; border-bottom:1px dashed #ddd;">×${esc(it.qty)}</td>
        <td style="padding:6px 0; text-align:right; border-bottom:1px dashed #ddd;">₹${itemPrice(it) * Number(it.qty||0)}</td>
      </tr>
    `).join('');
    const subtotal = o.subtotal ?? (o.items||[]).reduce((s,it)=>s+itemPrice(it)*Number(it.qty||0),0);
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Order Receipt #${esc(o.id)}</title>
        <style>
          body { font-family: monospace, -apple-system, sans-serif; padding: 20px; max-width: 380px; margin: 0 auto; color: #000; font-size: 13px; line-height: 1.4; }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .divider { border-top: 1px dashed #000; margin: 12px 0; }
          .flex { display: flex; justify-content: space-between; }
          table { width: 100%; border-collapse: collapse; }
          @media print {
            body { padding: 0; }
            @page { margin: 10mm; }
          }
        </style>
      </head>
      <body>
        <div class="center bold" style="font-size: 18px; letter-spacing: 1px;">${esc((storeMerchantName||'HoyChoy Café').toUpperCase())}</div>
        <div class="center" style="font-size: 11px; color: #444; margin-top: 2px;">KITCHEN ORDER TICKET & BILL</div>
        <div class="divider"></div>
        <div class="flex"><span>Order ID:</span><span class="bold">#${esc(o.id)}</span></div>
        <div class="flex"><span>Date:</span><span>${esc(new Date(o.createdAt || Date.now()).toLocaleString())}</span></div>
        <div class="flex"><span>Status:</span><span class="bold">${esc(o.status || 'PAID')}</span></div>
        <div class="flex"><span>Payment:</span><span class="bold">${isPaid(o) ? 'PAID (PhonePe)' : 'NOT PAID'}</span></div>
        ${o.prepTime ? `<div class="flex"><span>Prep Time:</span><span class="bold">${esc(o.prepTime)}</span></div>` : ''}
        <div class="divider"></div>
        <div><span class="bold">Customer:</span> ${esc(o.customer?.name || 'Guest')}</div>
        <div><span class="bold">Phone:</span> ${esc(o.customer?.phone || 'N/A')}</div>
        <div><span class="bold">Address:</span> ${esc(o.customer?.address || 'N/A')}</div>
        ${o.customer?.note ? `<div style="margin-top:4px;"><span class="bold">Note:</span> <i>${esc(o.customer.note)}</i></div>` : ''}
        <div class="divider"></div>
        <table>
          <thead>
            <tr style="border-bottom:1px solid #000; text-align:left;">
              <th>Item</th>
              <th style="text-align:center;">Qty</th>
              <th style="text-align:right;">Amt</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>
        <div class="divider"></div>
        <div class="flex"><span>Subtotal:</span><span>₹${esc(subtotal)}</span></div>
        ${o.discountPct ? `<div class="flex"><span>Coupon ${esc(o.coupon||'')} (${esc(o.discountPct)}%):</span><span>-₹${esc(Math.round(subtotal*o.discountPct/100))}</span></div>` : ''}
        ${o.gst ? `<div class="flex"><span>GST:</span><span>₹${esc(o.gst)}</span></div>` : ''}
        ${o.deliveryFee ? `<div class="flex"><span>Delivery Fee:</span><span>₹${esc(o.deliveryFee)}</span></div>` : ''}
        ${o.packagingFee ? `<div class="flex"><span>Packaging Fee:</span><span>₹${esc(o.packagingFee)}</span></div>` : ''}
        <div class="divider"></div>
        <div class="flex bold" style="font-size: 15px;"><span>GRAND TOTAL:</span><span>₹${esc(o.total || 0)}</span></div>
        <div class="divider"></div>
        <div class="center" style="font-size: 11px; color: #555;">Thank you for ordering with ${esc(storeMerchantName||'HoyChoy Café')}!</div>
        <script>
          window.onload = function() { window.print(); };
        </script>
      </body>
      </html>
    `;
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  return (
    <section className="max-w-[900px] mx-auto px-4 pt-[calc(env(safe-area-inset-top)+8px)] pb-[calc(env(safe-area-inset-bottom)+12px)] md:pt-0 overflow-x-clip">
      <div className="hc-safe-buffer"></div>
      <div className="flex items-center justify-between">
        <div className="font-bold text-lg">Admin Panel</div>
        <div className="flex items-center gap-2">
          {authed && (
            <>
              <button className="relative btn" type="button" onClick={()=>{ setShowBell(s=>!s); }} aria-label="Notifications">🔔{unread>0 && <span className="absolute -top-1 -right-1 bg-[#f5c84a] text-black text-xs rounded-full px-1">{unread}</span>}</button>
              <button className="btn" type="button" onClick={()=>setMenuOpen(true)} aria-label="Menu">☰</button>
            </>
          )}
        </div>
      </div>
      {menuOpen && authed && (
        <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/60" onClick={()=>setMenuOpen(false)}></div>
          <div className="absolute right-0 top-0 h-full w-[86%] sm:w-[82%] max-w-[360px] bg-[#0f0f0f] border-l border-[#222] shadow-xl p-3 pt-[calc(env(safe-area-inset-top)+8px)] flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="font-bold">Admin Menu</div>
              <button className="btn" type="button" onClick={()=>setMenuOpen(false)}>✕</button>
            </div>
            <button className="btn" type="button" onClick={()=>{ try{ if(window.__bip){ window.__bip.prompt(); } else { const ua=navigator.userAgent||''; const isIOS=/iPhone|iPad|iPod/.test(ua); const isSafari=/Safari/.test(ua)&&!/Chrome/.test(ua); if(isIOS && isSafari){ alert('On iPhone/iPad: Tap Share → Add to Home Screen to install.'); } else { alert('Use browser menu: Install App / Add to Home Screen.'); } } }catch{} }}>Install App</button>
            <button className="btn" type="button" onClick={()=>{ try{ Notification && Notification.requestPermission && Notification.requestPermission(); }catch{} }}>Enable Notifications</button>
            <button className="btn" type="button" onClick={logout}>Logout</button>
          </div>
        </div>
      )}
      {showBell && (
        <div className="fixed inset-x-2 sm:left-auto sm:right-4 top-[calc(env(safe-area-inset-top)+52px)] z-[60] w-auto sm:w-72 bg-[#0f0f0f] border border-[#222] rounded-xl p-2 shadow-lg">
          <div className="flex items-center justify-between">
            <div className="font-bold">Notifications</div>
            <button className="text-xs underline" type="button" onClick={()=>{setUnread(0); clearAppBadge(); setShowBell(false);}}>Mark all read</button>
          </div>
          <ul className="max-h-64 overflow-auto mt-2">
            {notifs.map((n,i)=>(
              <li key={i} className="row"><span className="min-w-0 truncate mr-2">{n.title}</span><span className="text-sm min-w-0 truncate">{n.body}</span></li>
            ))}
          </ul>
        </div>
      )}
      {authed && me?.defaultPassword && (
        <div className="mt-3 p-3 rounded-xl border border-error bg-[#261818] text-error text-sm flex flex-wrap items-center justify-between gap-2">
          <span><b>Security:</b> you are still using the original password, which other people may know. Please change it now.</span>
          <button className="btn text-xs" type="button" onClick={()=>setTab('settings')}>Change password</button>
        </div>
      )}
      {authed && (
        <div className="sticky top-0 z-[50] -mx-4 px-4 pt-2 pb-2 bg-[#0a0a0a]/95 backdrop-blur border-b border-[#1e1e1e] mt-2">
          <div className="grid grid-cols-3 gap-1 bg-[#111] border border-[#222] rounded-xl p-1" role="tablist">
            {[['orders',`Orders${today.waiting?` (${today.waiting})`:''}`],['menu','Menu'],['settings','Settings']].map(([k,label])=>(
              <button key={k} type="button" role="tab" aria-selected={tab===k} onClick={()=>setTab(k)}
                className={`py-2 rounded-lg text-sm font-semibold transition ${tab===k?'bg-[#f5c84a] text-black':'text-white/80 hover:text-white'}`}>{label}</button>
            ))}
          </div>
        </div>
      )}
      {msg && <div className="mt-2 text-[#f5c84a]" role="status">{msg}</div>}
      {!authed && (
        <div className="card mt-3">
          <div className="section-title">Admin Login</div>
          <form onSubmit={login} className="flex flex-col gap-2">
            <input className="bg-[#111] border border-[#222] rounded-xl p-2" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} />
            <div className="flex flex-col sm:flex-row gap-2">
              <input className="flex-1 bg-[#111] border border-[#222] rounded-xl p-2" placeholder="Password" type={showPwd?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)} />
              <button type="button" className="btn w-full sm:w-auto" onClick={()=>setShowPwd(v=>!v)}>{showPwd?'Hide':'Show'}</button>
            </div>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)} />
              <span>Keep me signed in</span>
            </label>
            <button className={`btn btn-primary ${logging?'btn-disabled':''}`} type="submit" disabled={logging}>Login</button>
          </form>
        </div>
      )}
      {authed && tab==='orders' && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
          {[
            ['Waiting to accept', today.waiting, today.waiting? 'text-[#f5c84a]':'text-white'],
            ['In progress', today.active, 'text-blue-300'],
            ["Today's paid orders", today.count, 'text-white'],
            ["Today's sales", `₹${today.revenue.toLocaleString('en-IN')}`, 'text-success'],
          ].map(([label,val,cls])=>(
            <div key={label} className="bg-[#111] border border-[#222] rounded-xl p-3">
              <div className="text-[11px] text-muted">{label}</div>
              <div className={`text-lg font-extrabold ${cls}`}>{val}</div>
            </div>
          ))}
        </div>
      )}
      {authed && tab==='settings' && (
      <div className="card mt-3">
        <div className="section-title flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span>Admin Security & Password</span>
          </div>
          <span className="text-xs text-muted font-normal">Account: {me?.email || email || 'hoychoycafe@gmail.com'}</span>
        </div>
        <p className="text-xs text-muted mb-3">Change your admin password anytime. Changing it signs out every other device.</p>
        <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 mb-3 rounded-xl bg-[#141414] border border-[#222] text-xs">
          <span>Logged-in devices: <b>{me?.sessions ?? '–'}</b> <span className="text-muted">(lost a phone? sign the others out)</span></span>
          <button type="button" className="btn text-xs" onClick={logoutOthers}>Sign out other devices</button>
        </div>

        {pwdMsg && (
          <div className={`p-3 rounded-xl mb-3 text-xs flex items-center gap-2 border ${pwdSuccess ? 'bg-[#182618] border-success text-success' : 'bg-[#261818] border-error text-error'}`}>
            <span>{pwdSuccess ? '✓' : '✕'}</span>
            <span>{pwdMsg}</span>
          </div>
        )}

        <form onSubmit={handlePasswordChange} className="flex flex-col gap-3">
          <div>
            <label className="text-xs text-muted block mb-1">Current Password</label>
            <div className="flex gap-2">
              <input
                className="flex-1 bg-[#111] border border-[#222] rounded-xl p-2.5 text-sm"
                placeholder="Enter current password"
                type={showPwdCurrent ? 'text' : 'password'}
                value={pwdCurrent}
                onChange={e=>setPwdCurrent(e.target.value)}
                required
              />
              <button
                type="button"
                className="btn text-xs px-3"
                onClick={()=>setShowPwdCurrent(v=>!v)}
              >
                {showPwdCurrent ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted block mb-1">New Password (min 8 characters)</label>
              <div className="flex gap-2">
                <input
                  className="flex-1 bg-[#111] border border-[#222] rounded-xl p-2.5 text-sm"
                  placeholder="New password"
                  type={showPwdNew ? 'text' : 'password'}
                  value={pwdNew}
                  onChange={e=>setPwdNew(e.target.value)}
                  minLength={8}
                  required
                />
                <button
                  type="button"
                  className="btn text-xs px-2.5"
                  onClick={()=>setShowPwdNew(v=>!v)}
                >
                  {showPwdNew ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs text-muted block mb-1">Confirm New Password</label>
              <div className="flex gap-2">
                <input
                  className="flex-1 bg-[#111] border border-[#222] rounded-xl p-2.5 text-sm"
                  placeholder="Repeat new password"
                  type={showPwdConfirm ? 'text' : 'password'}
                  value={pwdConfirm}
                  onChange={e=>setPwdConfirm(e.target.value)}
                  minLength={8}
                  required
                />
                <button
                  type="button"
                  className="btn text-xs px-2.5"
                  onClick={()=>setShowPwdConfirm(v=>!v)}
                >
                  {showPwdConfirm ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
          </div>

          {pwdNew && pwdConfirm && pwdNew !== pwdConfirm && (
            <div className="text-xs text-error font-semibold">Passwords do not match</div>
          )}

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              className={`btn btn-primary font-bold px-5 py-2 text-xs flex items-center gap-2 ${pwdLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
              disabled={pwdLoading}
            >
              {pwdLoading ? 'Updating Password…' : 'Change Password'}
            </button>
          </div>
        </form>
      </div>
      )}

      {authed && tab==='settings' && (
      <div className="card mt-3">
        <div className="section-title">Coupon Management</div>
        <div className="grid grid-cols-1 gap-2">
          <div className="row">
            <span>Existing Coupons</span>
            <span className="text-sm font-semibold">{Object.keys(coupons||{}).length||0}</span>
          </div>
          <ul className="flex flex-col gap-2 max-h-[220px] overflow-auto">
            {Object.keys(coupons||{}).length === 0 ? (
              <li className="text-xs text-muted py-2">No coupons configured. Add one below.</li>
            ) : (
              Object.entries(coupons||{}).map(([code,info])=> (
                <li key={code} className="row bg-[#111] p-2 rounded-xl border border-[#222]">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-[#f5c84a]">{code}</span>
                    <span className="text-xs bg-[#222] px-2 py-0.5 rounded text-white">{info.percent}% OFF</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className={`text-xs px-2.5 py-1 rounded-lg border transition ${info.enabled ? 'border-success text-success hover:bg-success/10' : 'border-error text-error hover:bg-error/10'}`}
                      onClick={()=>toggleCoupon(code, !!info.enabled, Number(info.percent||0))}
                      title="Click to toggle status"
                    >
                      {info.enabled ? 'Active' : 'Disabled'}
                    </button>
                    <button
                      type="button"
                      className="text-xs px-2.5 py-1 rounded-lg bg-[#222] text-[#ff8aa0] hover:bg-[#333]"
                      onClick={()=>deleteCoupon(code)}
                      title="Delete coupon"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))
            )}
          </ul>
          <div className="border-t border-[#222] my-2"/>
          <div className="text-xs font-semibold text-muted">Create or Edit Coupon</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input className="bg-[#111] border border-[#222] rounded-xl p-2 font-mono uppercase" placeholder="Code (e.g. SAVE20)" value={newCode} onChange={e=>setNewCode(e.target.value.toUpperCase())} />
            <input className="bg-[#111] border border-[#222] rounded-xl p-2" type="number" min="1" max="100" placeholder="Discount % (e.g. 20)" value={newPercent} onChange={e=>setNewPercent(e.target.value)} />
            <select className="bg-[#111] border border-[#222] rounded-xl p-2" value={newEnabled?'enabled':'disabled'} onChange={e=>setNewEnabled(e.target.value==='enabled')}>
              <option value="enabled">Enabled (Active)</option>
              <option value="disabled">Disabled</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-primary" type="button" onClick={async()=>{
              setMsg('');
              const c = newCode.trim().toUpperCase();
              const p = Number(newPercent||0);
              if(!c){ setMsg('Please enter a coupon code'); return; }
              if(isNaN(p) || p <= 0 || p > 100){ setMsg('Please enter a valid percentage (1-100)'); return; }
              try{
                const r=await authedFetch(`${BACKEND_URL}/api/admin/coupon-set`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:c, percent:p, enabled:newEnabled})});
                const d=await r.json();
                if(!r.ok || !d.ok){ setMsg('Failed to save coupon'); return; }
                setMsg(`Coupon "${c}" saved successfully!`); setNewCode(''); setNewPercent(''); setNewEnabled(true); await refreshCoupons();
              }catch{ setMsg('Network error saving coupon'); }
            }}>Save Coupon</button>
            <button className="btn" type="button" onClick={()=>{ setNewCode(''); setNewPercent(''); setNewEnabled(true); }}>Clear</button>
            <button className="btn" type="button" onClick={refreshCoupons}>Refresh</button>
          </div>
        </div>
      </div>
      )}
      {authed && tab==='settings' && (
      <div className="card mt-3">
        <div className="section-title">Delivery Rates & Radius Management</div>
        <div className="flex flex-col gap-3">
          <div>
            <label className="text-sm font-medium text-muted block mb-1">Max Delivery Radius (km)</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                step="0.5"
                className="bg-[#111] border border-[#222] rounded-xl p-2 w-32 text-center"
                value={deliveryRates.maxRadius}
                onChange={e => setDeliveryRates(s => ({ ...s, maxRadius: Math.max(1, Number(e.target.value || 1)) }))}
              />
              <span className="text-sm text-muted">km (orders beyond this distance are rejected)</span>
            </div>
          </div>

          <div className="border-t border-[#222] my-1" />

          <div>
            <div className="row mb-2">
              <span className="font-semibold text-sm">Distance Pricing Tiers</span>
              <span className="text-xs text-muted">Ascending by km</span>
            </div>

            <div className="flex flex-col gap-2">
              {(deliveryRates.tiers || []).map((t, idx) => (
                <div key={idx} className="flex items-center gap-2 bg-[#141414] border border-[#222] p-2 rounded-xl">
                  <div className="flex-1 flex items-center gap-2 text-sm">
                    <span className="text-muted">Up to</span>
                    <input
                      type="number"
                      min="0.5"
                      step="0.5"
                      className="bg-[#111] border border-[#333] rounded-lg p-1 w-20 text-center"
                      value={t.upToKm}
                      onChange={e => {
                        const val = Math.max(0.1, Number(e.target.value || 0));
                        setDeliveryRates(s => {
                          const n = [...s.tiers];
                          n[idx] = { ...n[idx], upToKm: val };
                          return { ...s, tiers: n };
                        });
                      }}
                    />
                    <span>km</span>
                  </div>

                  <div className="flex-1 flex items-center gap-2 text-sm justify-end">
                    <span className="text-muted">Fee ₹</span>
                    <input
                      type="number"
                      min="0"
                      step="5"
                      className="bg-[#111] border border-[#333] rounded-lg p-1 w-20 text-center"
                      value={t.fee}
                      onChange={e => {
                        const val = Math.max(0, Number(e.target.value || 0));
                        setDeliveryRates(s => {
                          const n = [...s.tiers];
                          n[idx] = { ...n[idx], fee: val };
                          return { ...s, tiers: n };
                        });
                      }}
                    />
                    <button
                      type="button"
                      title="Delete tier"
                      className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#2a1a1a] text-error hover:bg-error hover:text-white transition"
                      onClick={() => {
                        setDeliveryRates(s => ({
                          ...s,
                          tiers: s.tiers.filter((_, i) => i !== idx)
                        }));
                      }}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-[#222] my-1" />

          <div className="flex flex-col sm:flex-row gap-2 items-center">
            <input
              type="number"
              min="0.5"
              step="0.5"
              className="bg-[#111] border border-[#222] rounded-xl p-2 w-full sm:flex-1 text-sm"
              placeholder="Up to km (e.g. 15)"
              value={newTierKm}
              onChange={e => setNewTierKm(e.target.value)}
            />
            <input
              type="number"
              min="0"
              step="5"
              className="bg-[#111] border border-[#222] rounded-xl p-2 w-full sm:flex-1 text-sm"
              placeholder="Fee in ₹ (e.g. 150)"
              value={newTierFee}
              onChange={e => setNewTierFee(e.target.value)}
            />
            <button
              type="button"
              className="btn w-full sm:w-auto"
              onClick={() => {
                const km = Number(newTierKm);
                const fee = Number(newTierFee);
                if (!km || km <= 0) { setMsg('Please enter a valid distance in km'); return; }
                if (isNaN(fee) || fee < 0) { setMsg('Please enter a valid fee'); return; }
                setDeliveryRates(s => {
                  const updated = [...(s.tiers || []), { upToKm: km, fee }].sort((a, b) => a.upToKm - b.upToKm);
                  const maxR = Math.max(s.maxRadius, km);
                  return { ...s, maxRadius: maxR, tiers: updated };
                });
                setNewTierKm('');
                setNewTierFee('');
              }}
            >
              + Add Tier
            </button>
          </div>

          <div className="flex gap-2 mt-2">
            <button
              type="button"
              className="btn btn-primary flex-1"
              disabled={savingDelivery}
              onClick={async () => {
                setSavingDelivery(true);
                setMsg('');
                try {
                  const sortedTiers = (deliveryRates.tiers || []).slice().sort((a, b) => a.upToKm - b.upToKm);
                  const r = await authedFetch(`${BACKEND_URL}/api/admin/set-delivery-rates`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      maxRadius: Number(deliveryRates.maxRadius),
                      tiers: sortedTiers
                    })
                  });
                  const d = await r.json();
                  if (!r.ok || !d.ok) {
                    setMsg('Failed to save delivery rates');
                    return;
                  }
                  setMsg('Delivery rates and radius saved successfully');
                  await refreshOverrides();
                } catch {
                  setMsg('Network error while saving delivery rates');
                } finally {
                  setSavingDelivery(false);
                }
              }}
            >
              {savingDelivery ? 'Saving…' : 'Save Delivery Rates'}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setDeliveryRates(DEFAULT_DELIVERY_RATES);
                setMsg('Restored default delivery rates (Click Save to apply)');
              }}
            >
              Reset Defaults
            </button>
          </div>
        </div>
      </div>
      )}

      {authed && tab==='settings' && (
      <div className="card mt-3">
        <div className="section-title">Store & Contact Settings</div>
        <div className="text-muted text-xs mb-3">Configure WhatsApp order notification phone, UPI payment address, minimum order value, and packaging fee.</div>
        
        {settingsMsg && (
          <div className={`p-2.5 rounded-xl text-xs mb-3 font-medium ${settingsMsg.includes('Failed')||settingsMsg.includes('error') ? 'bg-error/15 text-error border border-error/30' : 'bg-success/15 text-success border border-success/30'}`}>
            {settingsMsg}
          </div>
        )}

        <form onSubmit={saveStoreSettings} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-muted">WhatsApp Contact Phone *</label>
            <input
              className="bg-[#111] border border-[#222] rounded-xl p-2 text-sm"
              placeholder="e.g. 918638864806"
              value={storePhone}
              onChange={e => setStorePhone(e.target.value)}
              required
            />
            <span className="text-[11px] text-muted">Include country code without + (e.g. 91...)</span>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-muted">UPI ID / VPA</label>
            <input
              className="bg-[#111] border border-[#222] rounded-xl p-2 text-sm"
              placeholder="e.g. hoychoycafe@okaxis"
              value={storeUpi}
              onChange={e => setStoreUpi(e.target.value)}
            />
            <span className="text-[11px] text-muted">Optional. Online payments go through PhonePe; this is for reference only.</span>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-muted">Merchant / Cafe Name *</label>
            <input
              className="bg-[#111] border border-[#222] rounded-xl p-2 text-sm"
              placeholder="e.g. HoyChoy Café"
              value={storeMerchantName}
              onChange={e => setStoreMerchantName(e.target.value)}
              required
            />
            <span className="text-[11px] text-muted">Displayed on receipts and payment intents</span>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-muted">Minimum Order Amount (₹)</label>
            <input
              type="number"
              min="0"
              className="bg-[#111] border border-[#222] rounded-xl p-2 text-sm"
              placeholder="e.g. 200"
              value={storeMinOrder}
              onChange={e => setStoreMinOrder(e.target.value)}
            />
            <span className="text-[11px] text-muted">Set to 0 to disable minimum order restriction</span>
          </div>

          <div className="flex flex-col gap-1 sm:col-span-2">
            <label className="text-xs font-semibold text-muted">Packaging / Container Fee (₹)</label>
            <input
              type="number"
              min="0"
              className="bg-[#111] border border-[#222] rounded-xl p-2 text-sm max-w-xs"
              placeholder="e.g. 10"
              value={storePackagingFee}
              onChange={e => setStorePackagingFee(e.target.value)}
            />
            <span className="text-[11px] text-muted">Added to delivery orders for food containers/bags (₹0 if none)</span>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-muted">GST (%)</label>
            <input type="number" min="0" max="28" step="0.5" className="bg-[#111] border border-[#222] rounded-xl p-2 text-sm" value={storeGst} onChange={e=>setStoreGst(e.target.value)} />
            <span className="text-[11px] text-muted">Added to every bill. Default 5%.</span>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-muted">Opening Hours</label>
            <input className="bg-[#111] border border-[#222] rounded-xl p-2 text-sm" placeholder="e.g. 12:00 PM – 9:00 PM" value={storeHours} onChange={e=>setStoreHours(e.target.value)} />
            <span className="text-[11px] text-muted">Shown on the website and in the "we're closed" message</span>
          </div>

          <div className="flex flex-col gap-1 sm:col-span-2">
            <label className="text-xs font-semibold text-muted">Announcement Banner</label>
            <input className="bg-[#111] border border-[#222] rounded-xl p-2 text-sm" maxLength={200} placeholder="e.g. 🎉 20% off with code WEEKEND this Saturday & Sunday" value={storeAnnouncement} onChange={e=>setStoreAnnouncement(e.target.value)} />
            <span className="text-[11px] text-muted">Shown at the top of the menu page. Leave empty to hide it.</span>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-muted">Contact Email</label>
            <input type="email" className="bg-[#111] border border-[#222] rounded-xl p-2 text-sm" placeholder="hoychoycafe@gmail.com" value={storeEmail} onChange={e=>setStoreEmail(e.target.value)} />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-muted">Instagram Link</label>
            <input className="bg-[#111] border border-[#222] rounded-xl p-2 text-sm" placeholder="https://www.instagram.com/hoychoy_cafe/" value={storeInstagram} onChange={e=>setStoreInstagram(e.target.value)} />
          </div>

          <div className="flex flex-col gap-1 sm:col-span-2">
            <label className="text-xs font-semibold text-muted">Google Maps Location Link</label>
            <input className="bg-[#111] border border-[#222] rounded-xl p-2 text-sm" placeholder="Paste the Share link from Google Maps" value={storeLocation} onChange={e=>setStoreLocation(e.target.value)} />
            <span className="text-[11px] text-muted">Used for the "Location" link in the website footer</span>
          </div>

          <div className="sm:col-span-2 flex gap-2 mt-1">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={savingSettings}
            >
              {savingSettings ? 'Saving Settings…' : 'Save Store Settings'}
            </button>
            <button
              type="button"
              className="btn"
              onClick={refreshOverrides}
            >
              Reload
            </button>
          </div>
        </form>
      </div>
      )}

      {authed && tab==='settings' && (
      <div className="card mt-3">
        <div className="section-title flex items-center justify-between">
          <span>Telegram Alerts & Notifications</span>
          <div className="flex items-center gap-1.5 text-xs">
            <span className={`w-2.5 h-2.5 rounded-full ${tgConfig?.TELEGRAM_BOT_TOKEN_set && tgConfig?.TELEGRAM_ADMIN_CHAT_ID_set ? 'bg-success' : 'bg-[#f5c84a]'}`}></span>
            <span className="text-muted">
              {tgConfig?.TELEGRAM_BOT_TOKEN_set && tgConfig?.TELEGRAM_ADMIN_CHAT_ID_set ? 'Connected' : 'Setup Required'}
            </span>
          </div>
        </div>
        <div className="text-muted text-xs mb-3">Receive real-time alerts on your Telegram account or staff group whenever an order is placed, updated, or paid.</div>

        {tgMsg && (
          <div className={`p-2.5 rounded-xl text-xs mb-3 font-medium ${tgMsg.includes('Failed')||tgMsg.includes('error') ? 'bg-error/15 text-error border border-error/30' : 'bg-success/15 text-success border border-success/30'}`}>
            {tgMsg}
          </div>
        )}

        <form onSubmit={saveTelegramConfig} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-muted">Telegram Bot Token</label>
            <input
              type="password"
              className="bg-[#111] border border-[#222] rounded-xl p-2 text-sm font-mono"
              placeholder={tgConfig?.maskedToken ? `Active: ${tgConfig.maskedToken}` : 'Paste bot token from @BotFather'}
              value={tgBotToken}
              onChange={e => setTgBotToken(e.target.value)}
            />
            <span className="text-[11px] text-muted">{tgConfig?.TELEGRAM_BOT_TOKEN_set ? '✓ Token configured (leave blank to keep current)' : 'Not set yet'}</span>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-muted">Telegram Admin / Group Chat ID</label>
            <input
              type="text"
              className="bg-[#111] border border-[#222] rounded-xl p-2 text-sm font-mono"
              placeholder="e.g. 123456789 or -100123456789"
              value={tgChatId}
              onChange={e => setTgChatId(e.target.value)}
            />
            <span className="text-[11px] text-muted">{tgConfig?.TELEGRAM_ADMIN_CHAT_ID_set ? '✓ Chat ID configured' : 'Your Telegram user ID or group chat ID'}</span>
          </div>

          <div className="sm:col-span-2 flex flex-wrap gap-2 mt-1">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={tgLoading}
            >
              {tgLoading ? 'Saving…' : 'Save Telegram Config'}
            </button>
            <button
              type="button"
              className="btn"
              disabled={tgTesting || (!tgConfig?.TELEGRAM_BOT_TOKEN_set && !tgBotToken)}
              onClick={testTelegram}
            >
              {tgTesting ? 'Sending…' : 'Send Test Notification'}
            </button>
            <button
              type="button"
              className="btn"
              onClick={loadTelegramConfig}
            >
              Refresh
            </button>
          </div>
        </form>
      </div>
      )}

      {authed && tab==='menu' && (
      <div className="card mt-3">
        <div className="section-title flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span>Front Showcased Dishes (Homepage Spotlight)</span>
          </div>
          {(() => {
            const featIds = Array.isArray(overrides?.featured) && overrides.featured.length > 0 ? overrides.featured : [];
            return <span className="text-xs bg-[#f5c84a]/20 text-[#f5c84a] font-bold px-2 py-0.5 rounded-full">{featIds.length} Active on Front</span>;
          })()}
        </div>
        <p className="text-xs text-muted mb-2">Dishes spotlighted here appear in the top carousel on the customer homepage. Use the arrows to change their display order.</p>

        {/* Featured items badge list */}
        {(() => {
          const featIds = Array.isArray(overrides?.featured) && overrides.featured.length > 0 ? overrides.featured : [];
          const featItems = featIds.map(id => (items || []).find(it => it.id === id)).filter(Boolean);
          const nonFeatItems = (items || []).filter(it => !featIds.includes(it.id));

          return (
            <div className="flex flex-col gap-3">
              {featItems.length === 0 ? (
                <div className="text-xs text-muted p-2.5 rounded-xl bg-[#141414] border border-[#222]">
                  Using default best sellers list. Select and add dishes below to customize what displays on the front page spotlight!
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {featItems.map((f, idx) => {
                    const imgUrl = (overrides?.images && overrides.images[f.id]) || f.image || '';
                    return (
                      <div key={f.id} className="flex items-center gap-2 bg-[#181818] border border-[#333] hover:border-[#f5c84a]/40 px-2.5 py-1.5 rounded-xl shadow-sm">
                        {imgUrl ? (
                          <img src={imgUrl} alt={f.name} className="w-6 h-6 rounded-md object-cover" onError={(e)=>{ e.currentTarget.style.display='none'; }} />
                        ) : (
                          <span className="flex items-center">{f.veg ? <VegIcon /> : <NonVegIcon />}</span>
                        )}
                        <span className="text-xs font-semibold text-white">{f.name}</span>
                        <span className="text-xs text-[#f5c84a] font-bold">₹{f.price}</span>
                        <div className="flex items-center gap-0.5 ml-1 border-l border-[#333] pl-1.5">
                          <button
                            type="button"
                            className="text-xs text-gray-400 hover:text-white px-1 disabled:opacity-30"
                            title="Move earlier"
                            disabled={idx === 0}
                            onClick={() => reorderFeatured(f.id, 'up')}
                          >
                            ◀
                          </button>
                          <button
                            type="button"
                            className="text-xs text-gray-400 hover:text-white px-1 disabled:opacity-30"
                            title="Move later"
                            disabled={idx === featItems.length - 1}
                            onClick={() => reorderFeatured(f.id, 'down')}
                          >
                            ▶
                          </button>
                          <button
                            type="button"
                            className="text-xs text-muted hover:text-[#ff8aa0] px-1 font-bold"
                            title="Remove from front showcase"
                            onClick={() => toggleFeatured(f.id, false)}
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Add item to featured quick bar */}
              <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 pt-2 border-t border-[#222]">
                <select
                  className="flex-1 bg-[#111] border border-[#222] rounded-xl p-2 text-xs w-full sm:w-auto"
                  value={featSelectId}
                  onChange={e => setFeatSelectId(e.target.value)}
                >
                  <option value="">-- Select a dish to showcase on front --</option>
                  {nonFeatItems.map(it => (
                    <option key={it.id} value={it.id}>{it.name} (₹{it.price}) — {it.category}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-primary text-xs whitespace-nowrap w-full sm:w-auto font-bold"
                  disabled={!featSelectId}
                  onClick={() => {
                    if (featSelectId) {
                      toggleFeatured(featSelectId, true);
                      setFeatSelectId("");
                    }
                  }}
                >
                  + Spotlight on Front
                </button>
              </div>
            </div>
          );
        })()}
      </div>
      )}

      {authed && tab==='menu' && (
      <div className="card mt-3">
        <div className="section-title flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span>Menu & Pricing Management</span>
            <span className="text-xs text-muted font-normal">({(items||[]).length} dishes)</span>
          </div>
          <div className="flex flex-wrap sm:flex-nowrap gap-2 w-full sm:w-auto">
            <select
              className="bg-[#111] border border-[#222] rounded-xl p-2 text-xs w-full sm:w-36"
              value={menuFilterCategory}
              onChange={e => setMenuFilterCategory(e.target.value)}
            >
              <option value="">All Categories</option>
              {categories.map(c => (<option key={c} value={c}>{c}</option>))}
            </select>
            <input
              className="bg-[#111] border border-[#222] rounded-xl p-2 text-xs w-full sm:w-44"
              placeholder="Search dishes or categories…"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Bulk CSV Menu Upload & Download Bar */}
        <div className="p-3 mb-3 bg-[#151515] border border-[#262626] rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-xs font-bold text-white flex items-center gap-1.5">
              <span>Bulk Menu Management (.CSV)</span>
            </div>
            <p className="text-[11px] text-muted mt-0.5">
              Download the current menu spreadsheet to edit prices or add dishes in Excel/Sheets, then upload to update in bulk.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
            <button
              type="button"
              className="btn btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5 font-semibold bg-[#202020] hover:bg-[#282828] border border-[#333] text-white rounded-lg shadow-sm"
              onClick={handleDownloadCurrentCSV}
              title="Download all dishes formatted for Excel or Google Sheets"
            >
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>Download Menu (.CSV)</span>
            </button>

            <label className="btn btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5 font-bold rounded-lg shadow-md cursor-pointer hover:scale-105 active:scale-95 transition">
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <span>Upload CSV (Bulk Menu)</span>
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={handleCsvFileSelect}
              />
            </label>

            <button
              type="button"
              className="text-[11px] text-muted hover:text-[#f5c84a] px-1 py-1 underline"
              onClick={handleDownloadTemplateCSV}
              title="Download empty sample template CSV"
            >
              Sample Template
            </button>

            <button
              type="button"
              className="text-[11px] text-[#ff8aa0] hover:underline px-1 py-1 ml-1"
              onClick={resetMenuToDefaults}
              title="Reset all menu additions, deletions, and price customizations back to default factory menu"
            >
              Reset Menu to Defaults
            </button>
          </div>
        </div>

        <ul className="flex flex-col gap-2 max-h-[460px] overflow-auto pr-1">
          {(items||[]).filter(it=>{
            const matchQ = it.name.toLowerCase().includes(query.toLowerCase()) || (it.category||'').toLowerCase().includes(query.toLowerCase());
            const matchC = !menuFilterCategory || it.category === menuFilterCategory;
            return matchQ && matchC;
          }).map(it=> {
            const isFeat = Array.isArray(overrides?.featured) && overrides.featured.includes(it.id);
            const imgUrl = (overrides?.images && overrides.images[it.id]) || it.image || '';
            const isEditingThisPrice = editingPriceId === it.id;

            return (
              <li key={it.id} className="row flex-wrap sm:flex-nowrap gap-2 py-2.5 px-3 bg-[#131313] hover:bg-[#161616] rounded-xl border border-[#222] transition">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  {imgUrl ? (
                    <img src={imgUrl} alt={it.name} className="w-11 h-11 rounded-lg object-cover flex-shrink-0 border border-[#2e2e2e]" onError={(e)=>{ e.currentTarget.style.display='none'; }} />
                  ) : (
                    <div className="w-11 h-11 rounded-lg bg-[#1a1a1a] border border-[#2e2e2e] flex items-center justify-center flex-shrink-0">
                      {it.veg ? <VegIcon /> : <NonVegIcon />}
                    </div>
                  )}
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-sm text-white truncate">{it.name}</span>
                      {isFeat && (
                        <span className="bg-[#f5c84a]/20 text-[#f5c84a] text-[10px] px-1.5 py-0.5 rounded-full font-bold border border-[#f5c84a]/30">
                          Front Spotlight
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted flex-wrap">
                      {/* Price Display & Inline Edit */}
                      {isEditingThisPrice ? (
                        <div className="flex items-center gap-1 bg-black border border-[#f5c84a] rounded-lg p-0.5">
                          <span className="text-xs text-[#f5c84a] font-bold pl-1">₹</span>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            className="w-16 bg-transparent text-white text-xs p-1 font-bold outline-none"
                            value={inlinePrice}
                            onChange={e=>setInlinePrice(e.target.value)}
                            onKeyDown={e=>{
                              if(e.key === 'Enter') saveInlinePrice(it.id);
                              if(e.key === 'Escape') setEditingPriceId(null);
                            }}
                            autoFocus
                          />
                          <button
                            type="button"
                            className="px-1.5 py-0.5 text-xs bg-success text-black font-bold rounded hover:opacity-90 disabled:opacity-50"
                            disabled={savingPrice}
                            onClick={()=>saveInlinePrice(it.id)}
                            title="Save new price"
                          >
                            ✓
                          </button>
                          <button
                            type="button"
                            className="px-1.5 py-0.5 text-xs bg-[#333] text-white rounded hover:bg-[#444]"
                            onClick={()=>{ setEditingPriceId(null); setInlinePrice(""); }}
                            title="Cancel"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <span className="text-[#f5c84a] font-bold text-sm">₹{it.price}</span>
                          <button
                            type="button"
                            className="text-[10px] text-muted hover:text-[#f5c84a] px-1.5 py-0.5 rounded border border-[#2a2a2a] bg-[#1a1a1a] transition"
                            title="Quick edit price"
                            onClick={()=>{
                              setEditingPriceId(it.id);
                              setInlinePrice(String(it.price));
                            }}
                          >
                            Edit Price
                          </button>
                        </div>
                      )}

                      <span>•</span>
                      <span className="truncate max-w-[120px]">{it.category}</span>
                      <span>•</span>
                      <span className={it.veg ? 'text-success font-medium' : 'text-error font-medium'}>{it.veg ? 'Veg' : 'Non-Veg'}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0 ml-auto">
                  {/* Quick 1-click Spotlight toggle button */}
                  <button
                    type="button"
                    className={`px-2.5 py-1 text-xs rounded-lg border flex items-center gap-1 transition ${isFeat ? 'bg-[#f5c84a]/20 border-[#f5c84a]/50 text-[#f5c84a] font-bold' : 'bg-[#1e1e1e] border-[#333] text-gray-300 hover:text-white'}`}
                    onClick={() => toggleFeatured(it.id, !isFeat)}
                    title={isFeat ? "Remove from front showcase" : "Showcase this dish on the front page"}
                  >
                    {isFeat ? '★ Spotlight' : '+ Spotlight'}
                  </button>

                  {/* Full Edit button */}
                  <button
                    type="button"
                    className="px-2.5 py-1 text-xs rounded-lg bg-[#242424] hover:bg-[#333] border border-[#333] text-white flex items-center gap-1"
                    onClick={() => startEdit(it)}
                    title="Edit dish name, price, diet, category, and photo"
                  >
                    Edit
                  </button>

                  {/* Stock Toggle */}
                  <button
                    type="button"
                    className={`px-2 py-1 text-xs rounded-lg border ${it.available ? 'bg-[#182618] border-[#2e5e2e] text-success' : 'bg-[#261818] border-[#5e2e2e] text-error'}`}
                    onClick={() => toggleAvailability(it.id, !it.available)}
                    title={it.available ? "Mark as Out of Stock" : "Mark as In Stock"}
                  >
                    {it.available ? 'In Stock' : 'Out'}
                  </button>

                  {/* Delete button */}
                  <button
                    type="button"
                    className="p-1.5 rounded-lg border border-transparent text-[#ff8aa0] hover:bg-[#251818]"
                    onClick={() => removeItem(it.id)}
                    aria-label="Delete"
                    title="Remove dish from menu"
                  >
                    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M8 6h8"/>
                      <rect x="6" y="9" width="12" height="12" rx="2"/>
                      <path d="M10 12v6"/>
                      <path d="M14 12v6"/>
                    </svg>
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        {/* Collapsible Removed Dishes Restore Panel */}
        {Array.isArray(overrides?.removed) && overrides.removed.length > 0 && (
          <div className="mt-3 pt-2 border-t border-[#222]">
            <button
              type="button"
              className="text-xs text-muted hover:text-white flex items-center justify-between w-full p-1"
              onClick={() => setShowRemovedList(s => !s)}
            >
              <span>Removed Dishes ({overrides.removed.length})</span>
              <span>{showRemovedList ? '▲ Hide' : '▼ View & Restore'}</span>
            </button>

            {showRemovedList && (
              <div className="flex flex-col gap-1.5 mt-2 p-2 bg-[#121212] border border-[#222] rounded-xl max-h-40 overflow-auto">
                {overrides.removed.map(remId => (
                  <div key={remId} className="flex items-center justify-between py-1 px-2 rounded-lg bg-[#181818] text-xs">
                    <span className="font-mono text-gray-300 truncate">{remId}</span>
                    <button
                      type="button"
                      className="btn text-[11px] px-2 py-0.5 text-success border border-[#2e5e2e] bg-[#182618] hover:bg-[#203620]"
                      onClick={() => restoreItem(remId)}
                    >
                      ↩ Restore to Menu
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      )}

      {authed && tab==='menu' && (
      <div className="card mt-3">
        <div className="section-title">Add New Dish to Menu</div>
        <form onSubmit={addItem} className="flex flex-col gap-2.5">
          <input
            className="bg-[#111] border border-[#222] rounded-xl p-2.5 text-sm"
            placeholder="Dish Name (e.g., Crispy Corn Butter Pepper)"
            value={name}
            onChange={e=>setName(e.target.value)}
            required
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-muted block mb-0.5">Price (₹)</label>
              <input
                className="w-full bg-[#111] border border-[#222] rounded-xl p-2 text-sm font-semibold text-[#f5c84a]"
                placeholder="Price (₹)"
                type="number"
                min="0"
                step="1"
                value={price}
                onChange={e=>setPrice(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="text-[11px] text-muted block mb-0.5">Category</label>
              <select
                className="w-full bg-[#111] border border-[#222] rounded-xl p-2 text-sm"
                value={isNewCategory ? '__NEW__' : category}
                onChange={e=>{
                  if(e.target.value === '__NEW__'){
                    setIsNewCategory(true);
                  } else {
                    setIsNewCategory(false);
                    setCategory(e.target.value);
                  }
                }}
              >
                {categories.map(c=> (<option key={c} value={c}>{c}</option>))}
                <option value="__NEW__">+ Add New Category…</option>
              </select>
            </div>
          </div>

          {/* New custom category input if selected */}
          {isNewCategory && (
            <div className="flex flex-col gap-1 p-2.5 bg-[#141414] border border-[#2e2e2e] rounded-xl">
              <label className="text-xs text-[#f5c84a] font-semibold">Enter New Category Name:</label>
              <input
                className="bg-[#181818] border border-[#333] rounded-lg p-2 text-sm text-white"
                placeholder="e.g. Sizzlers, Combos, Mocktails, Desserts…"
                value={customCategory}
                onChange={e=>setCustomCategory(e.target.value)}
                required={isNewCategory}
                autoFocus
              />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-muted block mb-0.5">Diet Type</label>
              <select className="w-full bg-[#111] border border-[#222] rounded-xl p-2 text-sm" value={veg?'veg':'nonveg'} onChange={e=>setVeg(e.target.value==='veg')}>
                <option value="veg">Veg</option>
                <option value="nonveg">Non-Veg</option>
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-xs bg-[#111] border border-[#222] rounded-xl px-3 py-2.5 cursor-pointer w-full">
                <input type="checkbox" className="w-4 h-4 rounded text-[#f5c84a]" checked={addFeatured} onChange={e=>setAddFeatured(e.target.checked)} />
                <span className="font-semibold text-white">Spotlight on Front Page</span>
              </label>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex gap-2">
              <input
                className="flex-1 min-w-0 bg-[#111] border border-[#222] rounded-xl p-2 text-sm"
                placeholder="Dish photo link (or upload a photo →)"
                value={addImage}
                onChange={e=>setAddImage(e.target.value)}
              />
              <label className={`btn text-xs whitespace-nowrap cursor-pointer ${uploadingImg?'opacity-60 pointer-events-none':''}`}>
                {uploadingImg ? 'Uploading…' : 'Upload photo'}
                <input type="file" accept="image/*" className="hidden" onChange={e=>{ const f=e.target.files?.[0]; e.target.value=''; uploadPhoto(f, setAddImage); }} />
              </label>
            </div>
            {addImage && (
              <div className="flex items-center gap-2 p-2 bg-[#141414] border border-[#222] rounded-xl">
                <img src={addImage} alt="Preview" className="w-12 h-12 rounded-lg object-cover border border-[#333]" onError={(e)=>{ e.currentTarget.style.display='none'; }} />
                <span className="text-xs text-muted">Preview of the food photo</span>
              </div>
            )}
          </div>
          <div className="flex gap-2 pt-1">
            <button className="btn btn-primary flex-1 font-bold py-2.5 text-sm" type="submit">+ Add Dish to Menu</button>
            <button type="button" className="btn flex-1 py-2.5 text-sm" onClick={()=>{setName('');setPrice('');setVeg(false);setCategory('Misc');setCustomCategory('');setIsNewCategory(false);setAddImage('');setAddFeatured(false);}}>Clear</button>
          </div>
        </form>
      </div>
      )}

      {/* Edit Item Modal */}
      {editingItem && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="bg-[#121212] border border-[#2e2e2e] rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[#222] mb-4">
              <h3 className="font-bold text-lg text-white">
                Edit Menu Dish
              </h3>
              <button type="button" className="text-gray-400 hover:text-white text-xl px-2 py-1" onClick={()=>setEditingItem(null)}>✕</button>
            </div>
            <form onSubmit={saveItemEdit} className="flex flex-col gap-3">
              <div>
                <label className="text-xs text-muted block mb-1">Dish Name</label>
                <input className="w-full bg-[#181818] border border-[#2e2e2e] rounded-xl p-2.5 text-sm" value={editingItem.name} onChange={e=>setEditingItem(s=>({...s, name: e.target.value}))} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted block mb-1">Price (₹)</label>
                  <input className="w-full bg-[#181818] border border-[#2e2e2e] rounded-xl p-2.5 text-sm font-semibold text-[#f5c84a]" type="number" min="0" step="1" value={editingItem.price} onChange={e=>setEditingItem(s=>({...s, price: e.target.value}))} required />
                </div>
                <div>
                  <label className="text-xs text-muted block mb-1">Diet Type</label>
                  <select className="w-full bg-[#181818] border border-[#2e2e2e] rounded-xl p-2.5 text-sm" value={editingItem.veg ? 'veg' : 'nonveg'} onChange={e=>setEditingItem(s=>({...s, veg: e.target.value==='veg'}))}>
                    <option value="veg">Veg</option>
                    <option value="nonveg">Non-Veg</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted block mb-1">Category</label>
                <select
                  className="w-full bg-[#181818] border border-[#2e2e2e] rounded-xl p-2.5 text-sm"
                  value={isEditNewCategory ? '__NEW__' : editingItem.category}
                  onChange={e=>{
                    if(e.target.value === '__NEW__'){
                      setIsEditNewCategory(true);
                    } else {
                      setIsEditNewCategory(false);
                      setEditingItem(s=>({...s, category: e.target.value}));
                    }
                  }}
                >
                  {categories.map(c=> (<option key={c} value={c}>{c}</option>))}
                  <option value="__NEW__">+ Add New Category…</option>
                </select>
              </div>

              {/* Edit custom category input */}
              {isEditNewCategory && (
                <div className="flex flex-col gap-1 p-2.5 bg-[#141414] border border-[#2e2e2e] rounded-xl">
                  <label className="text-xs text-[#f5c84a] font-semibold">New Category Name:</label>
                  <input
                    className="bg-[#181818] border border-[#333] rounded-lg p-2 text-sm text-white"
                    placeholder="Enter new category name"
                    value={editCustomCategory}
                    onChange={e=>setEditCustomCategory(e.target.value)}
                    required={isEditNewCategory}
                    autoFocus
                  />
                </div>
              )}

              <div>
                <label className="text-xs text-muted block mb-1">
                  Photo <span className="text-[#888] font-normal">(upload from your phone, or paste an image link)</span>
                </label>
                <div className="flex gap-2">
                  <input
                    className="flex-1 bg-[#181818] border border-[#2e2e2e] rounded-xl p-2.5 text-sm"
                    placeholder="https://..."
                    value={editingItem.image || ''}
                    onChange={e=>setEditingItem(s=>({...s, image: e.target.value}))}
                  />
                  <label className={`btn text-xs px-2.5 whitespace-nowrap cursor-pointer ${uploadingImg?'opacity-60 pointer-events-none':''}`}>
                    {uploadingImg ? 'Uploading…' : 'Upload'}
                    <input type="file" accept="image/*" className="hidden" onChange={e=>{ const f=e.target.files?.[0]; e.target.value=''; uploadPhoto(f, (url)=>setEditingItem(s=>({...s, image:url}))); }} />
                  </label>
                  {editingItem.image && (
                    <button type="button" className="btn text-xs px-2.5" onClick={()=>setEditingItem(s=>({...s, image: ''}))}>Clear</button>
                  )}
                </div>
              </div>
              {editingItem.image && (
                <div className="p-2 border border-[#2a2a2a] rounded-xl bg-[#0a0a0a] flex items-center gap-3">
                  <img src={editingItem.image} alt="Preview" className="w-16 h-16 rounded-lg object-cover border border-[#333]" onError={(e)=>{ e.currentTarget.style.display='none'; }} />
                  <span className="text-xs text-muted">Preview of the food photo that will appear on the menu</span>
                </div>
              )}
              <label className="flex items-center gap-2.5 p-3 rounded-xl bg-[#181818] border border-[#2e2e2e] cursor-pointer mt-1">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded text-[#f5c84a]"
                  checked={!!editingItem.featured}
                  onChange={e=>setEditingItem(s=>({...s, featured: e.target.checked}))}
                />
                <div className="flex flex-col text-xs">
                  <span className="font-semibold text-white">Showcase on Front Page Spotlight</span>
                  <span className="text-muted">Display this item prominently in the top carousel on the homepage</span>
                </div>
              </label>
              <div className="flex gap-2 pt-2 border-t border-[#222]">
                <button className="btn btn-primary flex-1 py-2.5 font-bold" type="submit">Save Changes</button>
                <button type="button" className="btn flex-1 py-2.5" onClick={()=>setEditingItem(null)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {authed && tab==='orders' && (
        <div className="card mt-3">
          <div className="section-title flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span>Orders Management</span>
              <span className="text-xs text-muted font-normal">({filteredOrders.length} shown)</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={`text-xs px-2.5 py-1.5 rounded-lg border font-medium flex items-center gap-1.5 transition ${soundAlerts ? 'bg-success/15 border-success text-success' : 'bg-[#222] border-[#333] text-muted'}`}
                onClick={()=>setSoundAlerts(s=>!s)}
                title="Toggle audio alerts on incoming orders"
              >
                <span>{soundAlerts ? '🔊 Sound: ON' : '🔈 Sound: OFF'}</span>
              </button>
              <button
                type="button"
                className="text-xs px-2.5 py-1.5 rounded-lg bg-[#202020] hover:bg-[#282828] border border-[#333] text-white"
                onClick={playAlertTone}
                title="Play test audio chime"
              >
                Test Chime
              </button>
              <button className="btn text-xs py-1.5" onClick={exportCsv}>Export CSV</button>
              <button className="btn text-xs py-1.5 text-error" onClick={clearAll}>Clear All</button>
            </div>
          </div>

          {/* Search and Filters */}
          <div className="flex flex-wrap sm:flex-nowrap gap-2 mt-2 mb-3">
            <input
              type="text"
              className="bg-[#111] border border-[#222] rounded-xl p-2 text-xs flex-1 min-w-[160px]"
              placeholder="Search by order ID, name, phone, address..."
              value={orderSearch}
              onChange={e=>setOrderSearch(e.target.value)}
            />
            <select
              className="bg-[#111] border border-[#222] rounded-xl p-2 text-xs w-full sm:w-auto"
              value={orderFilter}
              onChange={e=>setOrderFilter(e.target.value)}
            >
              <option value="ALL">All Statuses</option>
              <option value="NEW">New (paid, waiting)</option>
              <option value="UNPAID">Payment pending / failed</option>
              <option value="ACCEPTED">Accepted / In Kitchen</option>
              <option value="OUT_FOR_DELIVERY">Out for Delivery</option>
              <option value="DELIVERED">Delivered</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>

          <ul className="flex flex-col gap-2 max-h-[380px] overflow-auto pr-1">
            {filteredOrders.length === 0 ? (
              <li className="text-center py-6 text-muted text-xs">No orders match the current filter or search.</li>
            ) : (
              filteredOrders.map((o)=> {
                const upperStatus = String(o.status||'NEW').toUpperCase();
                return (
                  <li key={o.id} className="p-3 bg-[#111] border border-[#222] rounded-xl flex flex-col gap-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-sm text-[#f5c84a]">#{o.id}</span>
                        <span className="font-bold text-sm">₹{o.grandTotal || o.total}</span>
                        <span className="text-muted text-xs">• {new Date(o.createdAt).toLocaleString([], {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'})}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${
                          upperStatus === 'DELIVERED' ? 'bg-success/20 text-success border border-success/40' :
                          upperStatus === 'OUT_FOR_DELIVERY' ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40' :
                          upperStatus === 'ACCEPTED' || upperStatus === 'PREPARING' ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40' :
                          upperStatus === 'CANCELLED' ? 'bg-error/20 text-error border border-error/40' :
                          'bg-[#f5c84a]/20 text-[#f5c84a] border border-[#f5c84a]/40'
                        }`}>
                          {upperStatus}{o.prepTime && upperStatus === 'ACCEPTED' ? ` (${o.prepTime})` : ''}
                        </span>
                        {isPaid(o)
                          ? <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-success/15 text-success border border-success/30">PAID</span>
                          : <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-error/15 text-error border border-error/30">{o.paymentState==='FAILED'?'PAYMENT FAILED':'NOT PAID'}</span>}
                      </div>
                    </div>

                    <div className="text-xs text-white/90 flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{o.customer?.name || 'Guest'}</span>
                      {o.customer?.phone && <span className="text-muted font-mono">{o.customer.phone}</span>}
                      {o.customer?.address && <span className="text-muted truncate max-w-[280px]">({o.customer.address})</span>}
                    </div>

                    {o.cancelReason && upperStatus === 'CANCELLED' && (
                      <div className="text-[11px] text-error">Reason: {o.cancelReason}</div>
                    )}

                    <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-[#222]">
                      <button className="px-2 py-1 text-xs rounded-lg bg-[#222] hover:bg-[#2c2c2c] border border-[#333] text-white" onClick={()=>setSelected(o)}>
                        Details & KOT
                      </button>

                      {!isPaid(o) && upperStatus !== 'CANCELLED' && (
                        <button
                          className="px-2 py-1 text-xs rounded-lg bg-[#222] hover:bg-[#2c2c2c] border border-[#333] text-white"
                          onClick={()=>verifyPayment(o.id)}
                          disabled={orderStatus[o.id]?.pending}
                          title="Ask PhonePe whether this customer actually paid"
                        >
                          Re-check payment
                        </button>
                      )}
                      {isPaid(o) && upperStatus !== 'DELIVERED' && upperStatus !== 'CANCELLED' && (
                        <>
                          {upperStatus !== 'ACCEPTED' && upperStatus !== 'OUT_FOR_DELIVERY' && (
                            <>
                              <button
                                className="px-2 py-1 text-xs rounded-lg bg-blue-900/40 hover:bg-blue-900/60 border border-blue-700/60 text-blue-300 font-medium"
                                onClick={()=>updateOrderStatus(o.id, 'ACCEPTED', '15 mins')}
                              >
                                Accept (15m)
                              </button>
                              <button
                                className="px-2 py-1 text-xs rounded-lg bg-blue-900/40 hover:bg-blue-900/60 border border-blue-700/60 text-blue-300 font-medium"
                                onClick={()=>updateOrderStatus(o.id, 'ACCEPTED', '30 mins')}
                              >
                                Accept (30m)
                              </button>
                            </>
                          )}
                          {upperStatus !== 'OUT_FOR_DELIVERY' && (
                            <button
                              className="px-2 py-1 text-xs rounded-lg bg-purple-900/40 hover:bg-purple-900/60 border border-purple-700/60 text-purple-300 font-medium"
                              onClick={()=>updateOrderStatus(o.id, 'OUT_FOR_DELIVERY')}
                            >
                              Dispatch
                            </button>
                          )}
                          <button
                            className="px-2 py-1 text-xs rounded-lg bg-success/20 hover:bg-success/30 border border-success/40 text-success font-medium"
                            onClick={()=>updateOrderStatus(o.id, 'DELIVERED')}
                          >
                            Mark Delivered
                          </button>
                          <button
                            className="px-2 py-1 text-xs rounded-lg bg-[#222] hover:bg-error/20 border border-[#333] hover:border-error/40 text-error"
                            onClick={()=>{
                              const r = prompt(`Cancel order #${o.id}? Enter cancellation reason for customer:`, 'Item unavailable');
                              if(r !== null) updateOrderStatus(o.id, 'CANCELLED', null, r.trim() || 'Cancelled by restaurant');
                            }}
                          >
                            Cancel
                          </button>
                        </>
                      )}

                      {isPaid(o) && (
                        <button
                          className="px-2 py-1 text-xs rounded-lg bg-[#222] hover:bg-[#2c2c2c] border border-[#333] text-muted hover:text-white"
                          onClick={()=>refundOrder(o.id, o.total)}
                          disabled={orderStatus[o.id]?.pending}
                        >
                          Refund{(o.refunds||[]).length ? ` (₹${o.refunds.reduce((s,r)=>s+Number(r.amount||0),0)} done)` : ''}
                        </button>
                      )}

                      <button
                        className="p-1 rounded-lg text-[#ff8aa0] hover:bg-[#222] ml-auto"
                        onClick={()=>deleteOrder(o.id)}
                        aria-label="Delete Order"
                        title="Delete Order"
                      >
                        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M8 6h8"/>
                          <rect x="6" y="9" width="12" height="12" rx="2"/>
                          <path d="M10 12v6"/>
                          <path d="M14 12v6"/>
                        </svg>
                      </button>
                    </div>

                    {orderStatus[o.id]?.text && (
                      <span className={`text-[11px] ${orderStatus[o.id]?.type==='success'?'text-success':orderStatus[o.id]?.type==='error'?'text-error':'text-muted'}`}>{orderStatus[o.id]?.text}</span>
                    )}
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}

      {authed && tab==='orders' && (
      <div className="card mt-3">
        <div className="section-title">Restaurant Status (open / close online orders)</div>
        <div className="row"><span>Current</span><span className="font-bold">{status.open?'OPEN':'CLOSED'} ({status.reason})</span></div>
        <div className="flex flex-wrap items-center gap-3 mt-2">
          <span className="text-sm">Owner Toggle</span>
          <button
            type="button"
            onClick={()=>setOpen(ownerClosed)}
            aria-pressed={!ownerClosed}
            className={`relative inline-flex items-center h-10 w-24 rounded-full border transition ${!ownerClosed?'bg-[#f5c84a] text-black border-[#f5c84a]':'bg-transparent text-white border-[#444]'} ${toggling?'opacity-70 cursor-not-allowed':''}`}
            disabled={toggling}
          >
            <span className={`absolute left-3 text-xs font-bold ${!ownerClosed?'opacity-100':'opacity-40'}`}>ON</span>
            <span className={`absolute right-3 text-xs font-bold ${ownerClosed?'opacity-100':'opacity-40'}`}>OFF</span>
            <span className={`inline-block h-7 w-7 rounded-full bg-white shadow transform transition ${!ownerClosed?'translate-x-12':'translate-x-1'}`}></span>
          </button>
          <span className="text-sm text-muted">{!ownerClosed?'Open':'Closed by owner'}</span>
          {untilLabel && <span className="text-xs text-[#f5c84a] ml-2">{untilLabel}</span>}
          {ownerClosed===false && (
            <span className="flex flex-wrap items-center gap-2 ml-0 sm:ml-4">
              <span className="text-xs">Close for</span>
              <select className="bg-[#111] border border-[#222] rounded-xl p-1 text-xs w-full sm:w-auto" value={closureDuration} onChange={e=>setClosureDuration(e.target.value)}>
                <option value="0">Until I reopen</option>
                <option value="7200000">2 hours</option>
                <option value="21600000">6 hours</option>
                <option value="43200000">12 hours</option>
              </select>
              <span className="text-xs">or until</span>
              <input type="date" className="bg-[#111] border border-[#222] rounded-xl p-1 text-xs w-full sm:w-auto" value={customDate} onChange={e=>setCustomDate(e.target.value)} />
              <input type="time" className="bg-[#111] border border-[#222] rounded-xl p-1 text-xs w-full sm:w-auto" value={customTime} onChange={e=>setCustomTime(e.target.value)} />
            </span>
          )}
        </div>
        <div className="flex gap-2 mt-2">
          <button className="btn" onClick={()=>{refreshStatus();refreshOverrides();}}>Refresh</button>
        </div>
        <div className="mt-3">
          <div className="section-title">Closing Message</div>
          <div className="text-muted text-xs mb-2">Shown on the customer app when the restaurant is closed by owner.</div>
          <div className="grid grid-cols-1 gap-2">
            <select className="bg-[#111] border border-[#222] rounded-xl p-2" onChange={e=>setClosingMessage(e.target.value)} value={closingMessage}>
              {[
                '😔 Sorry, our restaurant is closed today. Online orders are available 12:00–9:00 PM.',
                'We are closed today. Thank you for your support! 🫶',
                'Delivery partners are currently unavailable. Please try again later.',
                'We’re closing early today. Thank you for understanding.',
                'Kitchen is taking a short break. We’ll be back soon.',
                'Closed due to maintenance. We will be back soon ✨',
                'Closed for a private event. See you tomorrow!',
                'We will reopen tomorrow at 12:00 PM.',
                closingMessage||''
              ].filter((v,i,a)=>v && a.indexOf(v)===i).map((v,i)=>(<option key={i} value={v}>{v}</option>))}
            </select>
            <textarea className="bg-[#111] border border-[#222] rounded-xl p-2 min-h-[80px]" value={closingMessage} onChange={e=>setClosingMessage(e.target.value)} placeholder="Custom message (optional)" />
            <div className="flex gap-2">
              <button className="btn btn-primary" type="button" onClick={async ()=>{
                setMsg("");
                try{
                  const r=await authedFetch(`${BACKEND_URL}/api/admin/set-closing-message`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({preset:'custom',message:closingMessage})});
                  const d=await r.json();
                  if(!r.ok || !d.ok){ setMsg('Failed to save message'); return; }
                  setMsg('Closing message updated');
                  await refreshOverrides();
                }catch{ setMsg('Network error'); }
              }}>Save Message</button>
            </div>
          </div>
        </div>
      </div>
      )}

          {authed && selected && (
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[110] flex items-center justify-center p-3" onClick={()=>setSelected(null)}>
              <div className="bg-[#0f0f0f] border border-[#2a2a2a] rounded-2xl p-4 sm:p-5 w-[640px] max-w-full max-h-[85vh] overflow-y-auto shadow-2xl" onClick={e=>e.stopPropagation()}>
                <div className="section-title flex items-center justify-between pb-2 border-b border-[#222]">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-base">Order #{selected.id}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-[#222] text-[#f5c84a]">
                      {selected.status || 'NEW'}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${isPaid(selected)?'bg-success/15 text-success':'bg-error/15 text-error'}`}>{isPaid(selected)?'PAID':'NOT PAID'}</span>
                  </div>
                  <button className="text-gray-400 hover:text-white p-1 text-lg font-bold" onClick={()=>setSelected(null)}>✕</button>
                </div>

                <div className="mt-3 flex flex-wrap gap-2 items-center justify-between bg-[#151515] p-3 rounded-xl border border-[#252525]">
                  <div className={isPaid(selected)?'':'opacity-40 pointer-events-none'} aria-disabled={!isPaid(selected)}>
                    <div className="text-xs text-muted">Change Status:</div>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      <button className="text-xs px-2 py-1 rounded-lg bg-blue-950/60 border border-blue-700/60 text-blue-300" onClick={()=>updateOrderStatus(selected.id, 'ACCEPTED', '15 mins')}>Accept (15m)</button>
                      <button className="text-xs px-2 py-1 rounded-lg bg-blue-950/60 border border-blue-700/60 text-blue-300" onClick={()=>updateOrderStatus(selected.id, 'ACCEPTED', '30 mins')}>Accept (30m)</button>
                      <button className="text-xs px-2 py-1 rounded-lg bg-purple-950/60 border border-purple-700/60 text-purple-300" onClick={()=>updateOrderStatus(selected.id, 'OUT_FOR_DELIVERY')}>Dispatch</button>
                      <button className="text-xs px-2 py-1 rounded-lg bg-emerald-950/60 border border-emerald-700/60 text-emerald-300" onClick={()=>updateOrderStatus(selected.id, 'DELIVERED')}>Delivered</button>
                      <button className="text-xs px-2 py-1 rounded-lg bg-rose-950/60 border border-rose-700/60 text-rose-300" onClick={()=>{
                        const r = prompt('Cancellation reason:', 'Customer request / Item unavailable');
                        if(r !== null) updateOrderStatus(selected.id, 'CANCELLED', null, r.trim() || 'Cancelled');
                      }}>Cancel</button>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="btn btn-primary text-xs px-3 py-2 font-bold flex items-center gap-1.5 rounded-lg shadow-md"
                    onClick={()=>printOrderReceipt(selected)}
                  >
                    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="6 9 6 2 18 2 18 9"/>
                      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                      <rect x="6" y="14" width="12" height="8"/>
                    </svg>
                    <span>Print Bill / KOT</span>
                  </button>
                </div>

                <div className="mt-3 space-y-2">
                  <div className="row"><span>Customer</span><span className="font-semibold">{selected.customer?.name} • {selected.customer?.phone}</span></div>
                  <div className="row"><span>Total Amount</span><span className="font-bold text-[#f5c84a]">₹{selected.grandTotal || selected.total}</span></div>
                  {!isPaid(selected) && <div className="p-2.5 rounded-xl bg-[#261818] border border-error/40 text-error text-xs">PhonePe has not confirmed this payment. Do not prepare the food until it shows PAID — use "Re-check payment" on the order.</div>}
                  {selected.coupon && <div className="row"><span>Coupon</span><span>{selected.coupon} ({selected.discountPct}% off)</span></div>}
                  {selected.distanceKm!=null && <div className="row"><span>Distance</span><span>{selected.distanceKm} km</span></div>}
                  {selected.prepTime && <div className="row"><span>Kitchen Prep Time</span><span className="text-blue-300 font-semibold">{selected.prepTime}</span></div>}
                  {selected.cancelReason && <div className="row"><span>Cancel Reason</span><span className="text-error">{selected.cancelReason}</span></div>}

                  <div className="mt-2 bg-[#121212] p-3 rounded-xl border border-[#222]">
                    <div className="font-semibold text-xs text-muted mb-1">DELIVERY ADDRESS</div>
                    <div className="text-sm">{selected.customer?.address || 'No address provided'}</div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <button className="text-xs px-2.5 py-1 rounded bg-[#222] hover:bg-[#333] text-white" onClick={async()=>{ try{ await navigator.clipboard.writeText(selected.customer?.address||''); setMsg('Address copied'); }catch{} }}>Copy Address</button>
                      {selected.customer?.geo && (
                        <a className="text-xs px-2.5 py-1 rounded bg-[#222] hover:bg-[#333] text-[#f5c84a]" href={`https://maps.google.com/?q=${selected.customer.geo.lat},${selected.customer.geo.lng}`} target="_blank" rel="noopener noreferrer">Open Coordinates in Maps</a>
                      )}
                      {safeHref(selected.customer?.manualLink) && (
                        <a className="text-xs px-2.5 py-1 rounded bg-[#222] hover:bg-[#333] text-[#f5c84a]" href={safeHref(selected.customer.manualLink)} target="_blank" rel="noopener noreferrer">Open User Link</a>
                      )}
                    </div>
                  </div>

                  {selected.customer?.note && (
                    <div className="bg-[#121212] p-3 rounded-xl border border-[#222]">
                      <div className="font-semibold text-xs text-muted mb-0.5">ORDER NOTES</div>
                      <div className="text-sm italic text-amber-200/90">{selected.customer.note}</div>
                    </div>
                  )}

                  <div className="mt-3">
                    <div className="font-semibold text-xs text-muted mb-1.5">ITEMS ORDERED</div>
                    <ul className="text-sm divide-y divide-[#222] bg-[#121212] rounded-xl border border-[#222] overflow-hidden">
                      {(selected.items||[]).map((it,i)=> (
                        <li key={i} className="p-2.5 flex items-center justify-between">
                          <span>{itemName(it)} × <strong className="text-white">{it.qty}</strong></span>
                          <span className="font-mono text-muted">₹{itemPrice(it) * Number(it.qty||0)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* WhatsApp Quick Update Box */}
                  <div className="mt-3 border border-[#222] rounded-xl p-3 bg-[#0d0d0d] space-y-2">
                    <div className="font-semibold text-xs text-muted">SEND WHATSAPP STATUS TO CUSTOMER</div>
                    <div className="grid gap-2 mt-1">
                      <select className="w-full bg-[#111] border border-[#222] rounded-xl p-2 text-xs" value={waTemplate} onChange={e=>setWaTemplate(e.target.value)}>
                        <option value="Thank you for ordering from HoyChoy Café! Your order is confirmed. Estimated delivery: 15–20 minutes.">Confirm: 15–20 minutes</option>
                        <option value="Thank you for ordering from HoyChoy Café! Estimated delivery: ~30 minutes.">Confirm: ~30 minutes</option>
                        <option value="Thank you for ordering from HoyChoy Café! Due to high order volume, delivery may take up to 45 minutes. We appreciate your patience.">Delay: up to 45 minutes</option>
                        <option value="Thank you for ordering from HoyChoy Café! Due to heavy traffic, delivery may take up to 1 hour. We’ll keep you updated.">Delay: up to 1 hour</option>
                        <option value="Due to heavy traffic in our café, delivery may take longer than usual. We sincerely apologize and appreciate your patience.">Delay: heavy café traffic</option>
                        <option value="Thank you for choosing HoyChoy Café! Your order is being prepared. Our rider will be on the way shortly.">Kitchen: preparing now</option>
                        <option value="Thank you for ordering from HoyChoy Café! Your order is out for delivery.">Status: out for delivery</option>
                        <option value="Thank you for ordering from HoyChoy Café. Your order has reached nearby and will arrive shortly.">Status: nearby</option>
                        <option value="We’re running a little behind today—your order may take an extra 20 minutes. Thank you for your patience. — HoyChoy Café">Delay: extra 20 minutes</option>
                        <option value={`We attempted to call you but couldn’t connect. Kindly confirm your location here or call us at ${storePhone||OWNER_PHONE}. — HoyChoy Café`}>Action: could not connect</option>
                        <option value="Your order is ready for pickup at HoyChoy Café. You may collect it anytime within the next 20 minutes. Thank you!">Pickup: ready at café</option>
                        <option value="We have received your order and shared it with our kitchen team. Thank you for choosing HoyChoy Café.">Info: kitchen notified</option>
                        <option value="If you have any special instructions for this order, please reply to this message. — HoyChoy Café">Info: ask for instructions</option>
                        <option>Custom…</option>
                      </select>
                      {waTemplate==='Custom…' && (
                        <textarea className="bg-[#111] border border-[#222] rounded-xl p-2 text-xs min-h-[60px]" placeholder="Type custom message for customer" value={waCustom} onChange={e=>setWaCustom(e.target.value)} />
                      )}
                      <div>
                        <button className="btn text-xs py-1.5" type="button" onClick={()=>{
                          const raw=(selected.customer?.phone||'').replace(/[^\d]/g,'');
                          const phone = raw.length===10 ? `91${raw}` : raw;
                          if(!phone){ setMsg('No customer phone number'); return; }
                          const text = waTemplate==='Custom…' ? (waCustom||'Your order has been placed.') : waTemplate;
                          const url = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
                          window.open(url,'_blank');
                        }}>Send WhatsApp Update to Customer</button>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-2 border-t border-[#222]">
                    <a className="btn text-xs" href={`tel:${selected.customer?.phone}`}>Call Customer</a>
                    <a className="btn text-xs" target="_blank" rel="noopener noreferrer" href={`https://wa.me/${storePhone||OWNER_PHONE}?text=${encodeURIComponent(`🟢 New Order #${selected.id}\nTotal: ₹${selected.total}\nCustomer: ${selected.customer?.name} (${selected.customer?.phone})\nAddress: ${selected.customer?.address}\nItems: ${(selected.items||[]).map(it=>`${itemName(it)}×${it.qty}`).join(', ')}`)}`}>Forward to Kitchen (WhatsApp)</a>
                    {isPaid(selected) && <button className="btn text-xs" onClick={()=>refundOrder(selected.id, selected.total)}>Refund Order</button>}
                  </div>
                </div>
              </div>
            </div>
          )}

      {/* Bulk CSV Preview & Confirmation Modal */}
      {showCsvModal && (
        <div className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto" role="dialog" aria-modal="true">
          <div className="bg-[#141414] border border-[#2e2e2e] rounded-2xl w-full max-w-2xl p-4 sm:p-5 shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between pb-3 border-b border-[#222]">
              <div>
                <h3 className="text-base font-bold text-white">Bulk Menu Upload Preview</h3>
                <p className="text-xs text-muted">Review the dishes parsed from your CSV file before applying changes.</p>
              </div>
              <button
                type="button"
                className="text-gray-400 hover:text-white p-1 rounded-lg text-lg"
                onClick={() => { setShowCsvModal(false); setCsvPreviewItems(null); }}
              >
                ✕
              </button>
            </div>

            {/* Error alerts */}
            {csvErrors.length > 0 && (
              <div className="my-3 p-3 rounded-xl bg-[#2b1818] border border-error text-error text-xs flex flex-col gap-1 max-h-32 overflow-auto">
                <div className="font-bold flex items-center gap-1.5">
                  <span>Notice / Errors encountered:</span>
                </div>
                {csvErrors.map((err, i) => (
                  <div key={i}>• {err}</div>
                ))}
              </div>
            )}

            {/* Status Msg */}
            {csvMsg && (
              <div className="my-3 p-3 rounded-xl bg-[#182618] border border-success text-success text-xs font-semibold">
                {csvMsg}
              </div>
            )}

            {/* Stats summary */}
            {csvPreviewItems && (
              <div className="grid grid-cols-3 gap-2 my-3">
                <div className="bg-[#1b1b1b] border border-[#2a2a2a] p-2.5 rounded-xl text-center">
                  <div className="text-xs text-muted">Total Dishes</div>
                  <div className="text-base font-extrabold text-white">{csvStats.total}</div>
                </div>
                <div className="bg-[#1b1b1b] border border-[#2a2a2a] p-2.5 rounded-xl text-center">
                  <div className="text-xs text-muted">New Dishes</div>
                  <div className="text-base font-extrabold text-success">+{csvStats.newCount}</div>
                </div>
                <div className="bg-[#1b1b1b] border border-[#2a2a2a] p-2.5 rounded-xl text-center">
                  <div className="text-xs text-muted">Updated</div>
                  <div className="text-base font-extrabold text-[#f5c84a]">{csvStats.updateCount}</div>
                </div>
              </div>
            )}

            {/* Scrollable list of items */}
            {csvPreviewItems && csvPreviewItems.length > 0 ? (
              <div className="flex-1 overflow-y-auto pr-1 my-2 border border-[#222] rounded-xl bg-[#101010]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#181818] text-muted sticky top-0 border-b border-[#222]">
                    <tr>
                      <th className="p-2.5">Dish</th>
                      <th className="p-2.5">Category</th>
                      <th className="p-2.5">Price</th>
                      <th className="p-2.5">Diet</th>
                      <th className="p-2.5">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1e1e1e]">
                    {csvPreviewItems.map((it, idx) => {
                      const isExisting = (items || []).some(existing => existing.id === it.id);
                      return (
                        <tr key={it.id || idx} className="hover:bg-[#161616]">
                          <td className="p-2.5 font-semibold text-white">
                            <div className="truncate max-w-[180px]">{it.name}</div>
                            <div className="text-[10px] text-muted font-mono">{it.id}</div>
                          </td>
                          <td className="p-2.5 text-gray-300">{it.category}</td>
                          <td className="p-2.5 font-bold text-[#f5c84a]">₹{it.price}</td>
                          <td className="p-2.5">
                            <span className="flex items-center gap-1">
                              {it.veg ? <VegIcon /> : <NonVegIcon />}
                              <span className={it.veg ? 'text-success' : 'text-error'}>{it.veg ? 'Veg' : 'Non-Veg'}</span>
                            </span>
                          </td>
                          <td className="p-2.5">
                            {isExisting ? (
                              <span className="text-[10px] bg-[#f5c84a]/15 text-[#f5c84a] px-2 py-0.5 rounded-full font-bold">
                                Update
                              </span>
                            ) : (
                              <span className="text-[10px] bg-success/15 text-success px-2 py-0.5 rounded-full font-bold">
                                + New
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : !csvErrors.length ? (
              <div className="p-6 text-center text-xs text-muted">
                No items found to preview.
              </div>
            ) : null}

            {/* Actions */}
            <div className="flex items-center justify-between gap-2 pt-3 mt-2 border-t border-[#222]">
              <button
                type="button"
                className="btn text-xs px-4 py-2 border border-[#333] hover:bg-[#222] rounded-xl text-gray-300"
                onClick={() => { setShowCsvModal(false); setCsvPreviewItems(null); }}
                disabled={csvUploading}
              >
                Cancel
              </button>
              {csvPreviewItems && csvPreviewItems.length > 0 && (
                <button
                  type="button"
                  className="btn btn-primary text-xs px-5 py-2 font-bold rounded-xl shadow-lg flex items-center gap-2 disabled:opacity-50"
                  onClick={handleApplyBulkCsv}
                  disabled={csvUploading}
                >
                  {csvUploading ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                      <span>Saving Menu…</span>
                    </>
                  ) : (
                    <span>Confirm & Save {csvPreviewItems.length} Dishes</span>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
