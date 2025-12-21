import React, { useEffect, useMemo, useState } from "react";
import { getMenu, makeIdFromName } from "../utils/menu.js";
import { BACKEND_URL, OWNER_PHONE } from "../config.js";

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
  const [msg,setMsg]=useState("");
  const [orders,setOrders]=useState([]);
  const [notifs,setNotifs]=useState([]);
  const [unread,setUnread]=useState(0);
  const [showBell,setShowBell]=useState(false);
  const [kitchen,setKitchen]=useState(false);
  const [lastAlert,setLastAlert]=useState(null);
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
  const [waTemplate,setWaTemplate]=useState('Your order has been placed. We will deliver within 15 minutes.');
  const [waCustom,setWaCustom]=useState('');
  const [coupons,setCoupons]=useState({});
  const [newCode,setNewCode]=useState('');
  const [newPercent,setNewPercent]=useState('');
  const [newEnabled,setNewEnabled]=useState(true);
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
    if(orderFilter==='DELIVERED') return (orders||[]).filter(o=>o.status==='DELIVERED');
    if(orderFilter==='NEW') return (orders||[]).filter(o=>o.status!=='DELIVERED');
    return orders||[];
  },[orders,orderFilter]);
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
    try{ const r=await authedFetch(`${BACKEND_URL}/api/admin/me`,{}); const d=await r.json(); setAuthed(!!d.authed); }catch{}
    }
    check();
  },[token]);

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
            if(d.type==='order.created' && d.order) setOrders((prev)=>[d.order, ...prev]);
            if(d.type==='order.updated' && d.order){
              setOrders((prev)=>prev.map(x=>x.id===d.order.id?d.order:x));
              if(d.order.status==='PAID'){
                const info = {id:d.order.id, total:Number(d.order.total||0), ts:Date.now()};
                const already = (notifiedIds||[]).includes(info.id);
                if(!already){
                  setNotifiedIds(prev=>[...prev, info.id]);
                  setNotifs(prev=>[{title:'New paid order', body:`#${info.id} • ₹${info.total}`, ts:info.ts}, ...prev].slice(0,20));
                  setUnread(u=>{ const nu=(u+1); updateAppBadge(nu); return nu; });
                  showSwNotification('New paid order', `#${info.id} • ₹${info.total}`);
                  playAlertTone();
                  if(kitchen){ setLastAlert(d.order); }
                }
              }
            }
          }catch{}
        };
        es.onerror = ()=>{ try{ es.close(); }catch{}; setMsg('Connection lost. Reconnecting…'); t=setTimeout(open,2000); };
      }catch{ t=setTimeout(open,2000); }
    }
    open();
    return ()=>{ try{ es && es.close(); }catch{}; try{ clearTimeout(t); }catch{} };
  },[authed, token]);
  function logout(){ localStorage.removeItem('hc_admin_token'); setToken(''); setAuthed(false); setMsg('Logged out'); }

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
      setToken(d.token); setAuthed(true); setMsg('Logged in');
    }catch{ setMsg('Network error'); }
    setLogging(false);
  }

  async function refreshStatus(){
    try{ const r=await fetch(`${BACKEND_URL}/api/app-status`); const d=await r.json(); if(r.ok) setStatus(d); }catch{}
  }
  async function refreshOverrides(){
    try{ const r=await fetch(`${BACKEND_URL}/api/menu-overrides`); const d=await r.json(); if(r.ok){ setOwnerClosed(!!d.appClosed); setClosingMessage(String(d.closingMessage||"")); } }catch{}
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
      const fresh = getMenu().items||[]; setItems(fresh); setMsg('Availability updated');
    }catch{ setMsg('Network error'); }
  }

  async function refundOrder(orderId, amount){
    setOrderStatus(s=>({...s,[orderId]:{pending:true,type:'info',text:'Processing refund…'}}));
    setMsg("");
    try{
      const r=await authedFetch(`${BACKEND_URL}/api/admin/refund`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({orderId,amount})});
      const d=await r.json();
      if(!r.ok || !d.ok){
        const err = d && d.error ? d.error : 'refund-failed';
        const friendly = err==='refund-not-configured' ? 'Refund is not configured on the server' : (err==='payment-not-verified' ? 'Payment not verified for this order' : 'Refund failed');
        setOrderStatus(s=>({...s,[orderId]:{pending:false,type:'error',text:friendly}}));
        setMsg(friendly);
        return;
      }
      setOrderStatus(s=>({...s,[orderId]:{pending:false,type:'success',text:'Refund initiated successfully'}}));
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
    if(!confirm('Clear all orders? This cannot be undone.')) return;
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
  async function removeItem(id){
    if(!confirm('Delete this item from menu?')) return;
    setMsg('');
    try{
      const r=await authedFetch(`${BACKEND_URL}/api/admin/remove-item`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});
      const d=await r.json();
      if(!r.ok || !d.ok){ setMsg('Failed to delete item'); return; }
      setItems(getMenu().items||[]);
      setMsg('Item deleted');
    }catch{ setMsg('Network error'); }
  }

  async function addItem(e){
    e.preventDefault(); setMsg("");
    const id = makeIdFromName(name||'item');
    try{
      const r=await authedFetch(`${BACKEND_URL}/api/admin/add-item`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,name,price:Number(price||0),veg,category})});
      const d=await r.json();
      if(!r.ok){ setMsg('Failed to add item'); return; }
      setItems(getMenu().items||[]);
      setName(""); setPrice(""); setVeg(false); setCategory("Misc");
      setMsg('Item added');
    }catch{ setMsg('Network error'); }
  }

  return (
    <section className="max-w-[900px] mx-auto px-4 py-6">
      <div className="flex items-center justify-between">
        <div className="font-bold text-lg">Admin Panel</div>
        <div className="flex items-center gap-2">
          {authed && (
            <button className="btn" type="button" onClick={()=>setMenuOpen(true)} aria-label="Menu">☰</button>
          )}
        </div>
      </div>
      {menuOpen && authed && (
        <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/60" onClick={()=>setMenuOpen(false)}></div>
          <div className="absolute right-0 top-0 h-full w-[82%] max-w-[360px] bg-[#0f0f0f] border-l border-[#222] shadow-xl p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="font-bold">Admin Menu</div>
              <button className="btn" type="button" onClick={()=>setMenuOpen(false)}>✕</button>
            </div>
            <button className="relative btn" type="button" onClick={()=>{ setShowBell(s=>!s); }} aria-label="Notifications">🔔{unread>0 && <span className="absolute -top-1 -right-1 bg-[#f5c84a] text-black text-xs rounded-full px-1">{unread}</span>}</button>
            <button className="btn" type="button" onClick={()=>{ try{ if(window.__bip){ window.__bip.prompt(); } else { const ua=navigator.userAgent||''; const isIOS=/iPhone|iPad|iPod/.test(ua); const isSafari=/Safari/.test(ua)&&!/Chrome/.test(ua); if(isIOS && isSafari){ alert('On iPhone/iPad: Tap Share → Add to Home Screen to install.'); } else { alert('Use browser menu: Install App / Add to Home Screen.'); } } }catch{} }}>Install App</button>
            <button className="btn" type="button" onClick={()=>{ try{ Notification && Notification.requestPermission && Notification.requestPermission(); }catch{} }}>Enable Notifications</button>
            <button className="btn" type="button" onClick={()=>setKitchen(k=>!k)}>{kitchen?'Exit Kitchen':'Kitchen Mode'}</button>
            <button className="btn" type="button" onClick={logout}>Logout</button>
          </div>
        </div>
      )}
      {showBell && (
        <div className="fixed right-4 top-14 z-[60] w-72 bg-[#0f0f0f] border border-[#222] rounded-xl p-2 shadow-lg">
          <div className="flex items-center justify-between">
            <div className="font-bold">Notifications</div>
            <button className="text-xs underline" type="button" onClick={()=>{setUnread(0); clearAppBadge(); setShowBell(false);}}>Mark all read</button>
          </div>
          <ul className="max-h-64 overflow-auto mt-2">
            {notifs.map((n,i)=>(
              <li key={i} className="row"><span>{n.title}</span><span className="text-sm">{n.body}</span></li>
            ))}
          </ul>
        </div>
      )}
      {kitchen && lastAlert && (
        <div className="fixed inset-0 bg-black/90 z-[70] flex flex-col items-center justify-center">
          <div className="text-2xl font-extrabold">New Paid Order</div>
          <div className="mt-2">#{lastAlert.id} • ₹{Number(lastAlert.total||0)}</div>
          <div className="mt-3">
            <button className="btn btn-primary" type="button" onClick={async()=>{
              try{
                const r=await authedFetch(`${BACKEND_URL}/api/admin/order-accept`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:lastAlert.id})});
                const d=await r.json();
                if(r.ok && d && d.ok){ setOrders(prev=>prev.map(x=>x.id===d.order.id?d.order:x)); setLastAlert(null); setUnread(u=>Math.max(0,u-1)); }
              }catch{}
            }}>Accept Order</button>
          </div>
        </div>
      )}
      {msg && <div className="mt-2 text-[#f5c84a]">{msg}</div>}
      {!authed && (
        <div className="card mt-3">
          <div className="section-title">Admin Login</div>
          <form onSubmit={login} className="flex flex-col gap-2">
            <input className="bg-[#111] border border-[#222] rounded-xl p-2" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} />
            <div className="flex items-center gap-2">
              <input className="flex-1 bg-[#111] border border-[#222] rounded-xl p-2" placeholder="Password" type={showPwd?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)} />
              <button type="button" className="btn" onClick={()=>setShowPwd(v=>!v)}>{showPwd?'Hide':'Show'}</button>
            </div>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)} />
              <span>Keep me signed in</span>
            </label>
            <button className={`btn btn-primary ${logging?'btn-disabled':''}`} type="submit" disabled={logging}>Login</button>
          </form>
        </div>
      )}
      {authed && (
      <div className="card mt-3">
        <div className="section-title">Restaurant Status</div>
        <div className="row"><span>Current</span><span className="font-bold">{status.open?'OPEN':'CLOSED'} ({status.reason})</span></div>
        <div className="flex items-center gap-3 mt-2">
          <span>Owner Toggle</span>
          <button
            type="button"
            onClick={()=>setOpen(ownerClosed)}
            className={`relative inline-flex items-center h-8 w-20 rounded-full border transition ${!ownerClosed?'bg-[#f5c84a] text-black border-[#f5c84a]':'bg-transparent text-white border-[#444]'} ${toggling?'opacity-70 cursor-not-allowed':''}`}
            disabled={toggling}
          >
            <span className="absolute left-2 text-xs font-bold">{!ownerClosed?'ON':''}</span>
            <span className="absolute right-2 text-xs font-bold">{ownerClosed?'OFF':''}</span>
            <span className={`inline-block h-6 w-6 rounded-full bg-white shadow transform transition ${!ownerClosed?'translate-x-12':'translate-x-1'}`}></span>
          </button>
          <span className="text-sm text-muted">{!ownerClosed?'Open':'Closed by owner'}</span>
          {untilLabel && <span className="text-xs text-[#f5c84a] ml-2">{untilLabel}</span>}
          {ownerClosed===false && (
            <span className="flex items-center gap-2 ml-4">
              <span className="text-xs">Close for</span>
              <select className="bg-[#111] border border-[#222] rounded-xl p-1 text-xs" value={closureDuration} onChange={e=>setClosureDuration(e.target.value)}>
                <option value="0">Until I reopen</option>
                <option value="7200000">2 hours</option>
                <option value="21600000">6 hours</option>
                <option value="43200000">12 hours</option>
              </select>
              <span className="text-xs ml-2">or until</span>
              <input type="date" className="bg-[#111] border border-[#222] rounded-xl p-1 text-xs" value={customDate} onChange={e=>setCustomDate(e.target.value)} />
              <input type="time" className="bg-[#111] border border-[#222] rounded-xl p-1 text-xs" value={customTime} onChange={e=>setCustomTime(e.target.value)} />
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
      {authed && (
      <div className="card mt-3">
        <div className="section-title">Coupon Management</div>
        <div className="grid grid-cols-1 gap-2">
          <div className="row">
            <span>Existing Coupons</span>
            <span className="text-sm">{Object.keys(coupons||{}).length||0}</span>
          </div>
          <ul className="flex flex-col gap-2 max-h-[200px] overflow-auto">
            {Object.entries(coupons||{}).map(([code,info])=> (
              <li key={code} className="row">
                <span>{code}</span>
                <span className="flex items-center gap-2 text-sm">
                  <span>{info.percent}%</span>
                  <span className={`inline-block w-2 h-2 rounded-full ${info.enabled?'bg-success':'bg-error'}`}></span>
                </span>
              </li>
            ))}
          </ul>
          <div className="border-t border-[#222] my-2"/>
          <div className="grid grid-cols-3 gap-2">
            <input className="bg-[#111] border border-[#222] rounded-xl p-2" placeholder="Code" value={newCode} onChange={e=>setNewCode(e.target.value)} />
            <input className="bg-[#111] border border-[#222] rounded-xl p-2" placeholder="Percent" value={newPercent} onChange={e=>setNewPercent(e.target.value)} />
            <select className="bg-[#111] border border-[#222] rounded-xl p-2" value={newEnabled?'enabled':'disabled'} onChange={e=>setNewEnabled(e.target.value==='enabled')}>
              <option value="enabled">Enabled</option>
              <option value="disabled">Disabled</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-primary" type="button" onClick={async()=>{
              setMsg('');
              try{
                const r=await authedFetch(`${BACKEND_URL}/api/admin/coupon-set`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:newCode, percent:Number(newPercent||0), enabled:newEnabled})});
                const d=await r.json();
                if(!r.ok || !d.ok){ setMsg('Failed to save coupon'); return; }
                setMsg('Coupon saved'); setNewCode(''); setNewPercent(''); setNewEnabled(true); await refreshCoupons();
              }catch{ setMsg('Network error'); }
            }}>Save Coupon</button>
            <button className="btn" type="button" onClick={()=>{ setNewCode(''); setNewPercent(''); setNewEnabled(true); }}>Clear</button>
            <button className="btn" type="button" onClick={refreshCoupons}>Refresh</button>
          </div>
        </div>
      </div>
      )}
      {authed && (
      <div className="card mt-3">
        <div className="section-title flex items-center justify-between">
          <span>Menu Availability</span>
          <input className="bg-[#111] border border-[#222] rounded-xl p-2 w-56" placeholder="Search items" value={query} onChange={e=>setQuery(e.target.value)} />
        </div>
        <ul className="flex flex-col gap-2 max-h-[300px] overflow-auto">
          {(items||[]).filter(it=>it.name.toLowerCase().includes(query.toLowerCase())).map(it=> (
            <li key={it.id} className="row">
              <span>{it.name}</span>
              <span className="flex items-center gap-2">
                <span className={`inline-block w-2 h-2 rounded-full ${it.available?'bg-success':'bg-error'}`}></span>
                <button className="px-2 py-1 rounded-md bg-[#2a2a2a] border border-[#3a3a3a]" onClick={()=>toggleAvailability(it.id,!it.available)}>{it.available?'Mark Out':'Mark Available'}</button>
                <button className="px-2 py-1 rounded-md border border-transparent text-[#ff8aa0] hover:bg-[#1a1a1a]" onClick={()=>removeItem(it.id)} aria-label="Delete">
                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 6h8"/>
                    <rect x="6" y="9" width="12" height="12" rx="2"/>
                    <path d="M10 12v6"/>
                    <path d="M14 12v6"/>
                  </svg>
                </button>
              </span>
            </li>
          ))}
        </ul>
      </div>
      )}
      {authed && (
      <div className="card mt-3">
        <div className="section-title">Add Item</div>
        <form onSubmit={addItem} className="flex flex-col gap-2">
          <input className="bg-[#111] border border-[#222] rounded-xl p-2" placeholder="Name" value={name} onChange={e=>setName(e.target.value)} required />
          <div className="grid grid-cols-2 gap-2">
            <input className="bg-[#111] border border-[#222] rounded-xl p-2" placeholder="Price (₹)" value={price} onChange={e=>setPrice(e.target.value)} required />
            <select className="bg-[#111] border border-[#222] rounded-xl p-2" value={category} onChange={e=>setCategory(e.target.value)}>
              {categories.map(c=> (<option key={c} value={c}>{c}</option>))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select className="bg-[#111] border border-[#222] rounded-xl p-2" value={veg?'veg':'nonveg'} onChange={e=>setVeg(e.target.value==='veg')}>
              <option value="veg">Veg</option>
              <option value="nonveg">Non-Veg</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-primary flex-1" type="submit">Add Item</button>
            <button type="button" className="btn flex-1" onClick={()=>{setName('');setPrice('');setVeg(false);setCategory('Misc');}}>Clear</button>
          </div>
        </form>
      </div>
      )}

      {authed && (
        <div className="card mt-3">
        <div className="section-title flex items-center justify-between">
          <span>Orders</span>
          <div className="flex items-center gap-2">
            <select className="bg-[#111] border border-[#222] rounded-xl p-1 text-xs" value={orderFilter} onChange={e=>setOrderFilter(e.target.value)}>
              <option value="ALL">All</option>
              <option value="NEW">New</option>
              <option value="DELIVERED">Delivered</option>
            </select>
            <button className="btn" onClick={exportCsv}>Export CSV</button>
            <button className="btn" onClick={clearAll}>Clear All</button>
          </div>
        </div>
        <ul className="flex flex-col gap-2 max-h-[280px] overflow-auto">
          {(filteredOrders||[]).map((o)=> (
            <li key={o.id} className="row">
              <span>#{o.id}</span>
              <span className="flex items-center gap-2">
                <span className="font-bold">₹{o.total}</span>
                <span>{o.customer?.name}</span>
                <span className="text-muted text-xs">{new Date(o.createdAt).toLocaleTimeString()}</span>
                {o.status==='DELIVERED' && <span className="text-success text-xs">Delivered</span>}
                <button className="px-2 py-1 rounded-md bg-[#2a2a2a] border border-[#3a3a3a]" onClick={()=>setSelected(o)}>View</button>
                <button className="px-2 py-1 rounded-md bg-[#2a2a2a] border border-[#3a3a3a]" onClick={()=>markDelivered(o.id)}>Mark Delivered</button>
                <button className="px-2 py-1 rounded-md bg-[#2a2a2a] border border-[#3a3a3a]" onClick={()=>{ if(confirm(`Refund ₹${o.total}?`)) refundOrder(o.id, o.total); }} disabled={orderStatus[o.id]?.pending}>Refund</button>
                <button className="px-2 py-1 rounded-md border border-transparent text-[#ff8aa0] hover:bg-[#1a1a1a]" onClick={()=>deleteOrder(o.id)} aria-label="Delete">
                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 6h8"/>
                    <rect x="6" y="9" width="12" height="12" rx="2"/>
                    <path d="M10 12v6"/>
                    <path d="M14 12v6"/>
                  </svg>
                </button>
                {orderStatus[o.id]?.text && (
                  <span className={`text-xs ${orderStatus[o.id]?.type==='success'?'text-success':orderStatus[o.id]?.type==='error'?'text-error':'text-muted'}`}>{orderStatus[o.id]?.text}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>
      )}

          {authed && selected && (
            <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center" onClick={()=>setSelected(null)}>
              <div className="bg-[#0f0f0f] border border-[#222] rounded-xl p-4 w-[600px] max-w-[95%] max-h-[80vh] overflow-y-auto" onClick={e=>e.stopPropagation()}>
                <div className="section-title flex items-center justify-between"><span>Order #{selected.id}</span><button className="btn" onClick={()=>setSelected(null)}>✕</button></div>
                <div className="mt-2">
                  <div className="row"><span>Status</span><span className="font-bold">{selected.status||'NEW'}</span></div>
                  <div className="row"><span>Total</span><span className="font-bold">₹{selected.total}</span></div>
                  <div className="row"><span>Customer</span><span>{selected.customer?.name} • {selected.customer?.phone}</span></div>
                  <div className="mt-2"><div className="font-semibold">Address</div><div className="text-sm">{selected.customer?.address}</div></div>
                  <div className="mt-1"><button className="btn" onClick={async()=>{ try{ await navigator.clipboard.writeText(selected.customer?.address||''); setMsg('Address copied'); }catch{} }}>Copy Address</button></div>
                  {selected.customer?.note && (
                    <div className="mt-2"><div className="font-semibold">Order Notes</div><div className="text-sm">{selected.customer?.note}</div></div>
                  )}
                  {selected.customer?.geo && (
                    <div className="mt-2 text-sm"><a className="text-[#f5c84a] underline" href={`https://maps.google.com/?q=${selected.customer.geo.lat},${selected.customer.geo.lng}`} target="_blank">Open in Maps</a></div>
                  )}
                  {selected.customer?.manualLink && (
                    <div className="mt-2 text-sm"><a className="text-[#f5c84a] underline" href={selected.customer.manualLink} target="_blank">User Link</a></div>
                  )}
                  <div className="mt-3">
                    <div className="font-semibold">Items</div>
                    <ul className="text-sm mt-1">
                      {(selected.items||[]).map((it,i)=> (
                        <li key={i}>• {it.item?.name} ×{it.qty} — ₹{it.item?.price}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="mt-3 border border-[#222] rounded-xl p-3 bg-[#080808] space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-sm">WhatsApp Update</div>
                    </div>
                    <div className="grid gap-2 mt-1">
                      <select className="w-full bg-[#111] border border-[#222] rounded-xl p-2 text-sm" value={waTemplate} onChange={e=>setWaTemplate(e.target.value)}>
                        <option value="Thank you for ordering from HoyChoy Café! Your order is confirmed. Estimated delivery: 15–20 minutes.">Confirm: 15–20 minutes</option>
                        <option value="Thank you for ordering from HoyChoy Café! Estimated delivery: ~30 minutes.">Confirm: ~30 minutes</option>
                        <option value="Thank you for ordering from HoyChoy Café! Due to high order volume, delivery may take up to 45 minutes. We appreciate your patience.">Delay: up to 45 minutes</option>
                        <option value="Thank you for ordering from HoyChoy Café! Due to heavy traffic, delivery may take up to 1 hour. We’ll keep you updated.">Delay: up to 1 hour</option>
                        <option value="Due to heavy traffic in our café, delivery may take longer than usual. We sincerely apologize and appreciate your patience.">Delay: heavy café traffic</option>
                        <option value="Thank you for choosing HoyChoy Café! Your order is being prepared. Our rider will be on the way shortly.">Kitchen: preparing now</option>
                        <option value="Thank you for ordering from HoyChoy Café! Your order is out for delivery.">Status: out for delivery</option>
                        <option value="Thank you for ordering from HoyChoy Café. Your order has reached nearby and will arrive shortly.">Status: nearby</option>
                        <option value="We’re running a little behind today—your order may take an extra 20 minutes. Thank you for your patience. — HoyChoy Café">Delay: extra 20 minutes</option>
                        <option value={`We attempted to call you but couldn’t connect. Kindly confirm your location here or call us at ${OWNER_PHONE}. — HoyChoy Café`}>Action: could not connect</option>
                        <option value="Your order is ready for pickup at HoyChoy Café. You may collect it anytime within the next 20 minutes. Thank you!">Pickup: ready at café</option>
                        <option value="We have received your order and shared it with our kitchen team. Thank you for choosing HoyChoy Café.">Info: kitchen notified</option>
                        <option value="If you have any special instructions for this order, please reply to this message. — HoyChoy Café">Info: ask for instructions</option>
                        <option>Custom…</option>
                      </select>
                      {waTemplate==='Custom…' && (
                        <textarea className="bg-[#111] border border-[#222] rounded-xl p-2 text-sm min-h-[60px]" placeholder="Type a custom message" value={waCustom} onChange={e=>setWaCustom(e.target.value)} />
                      )}
                      <div className="text-xs text-muted">Opens WhatsApp with pre‑filled text; no contact saving needed.</div>
                      <div>
                        <button className="btn" type="button" onClick={()=>{
                          const raw=(selected.customer?.phone||'').replace(/[^\d]/g,'');
                          const phone = raw.length===10 ? `91${raw}` : raw; // default to India code if 10 digits
                          if(!phone){ setMsg('No customer phone number'); return; }
                          const text = waTemplate==='Custom…' ? (waCustom||'Your order has been placed.') : waTemplate;
                          const url = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
                          window.open(url,'_blank');
                        }}>Send WhatsApp Update</button>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <a className="btn" href={`tel:${selected.customer?.phone}`}>Call</a>
                    <a className="btn" target="_blank" rel="noopener" href={`https://wa.me/${OWNER_PHONE}?text=${encodeURIComponent(`🟢 New Order #${selected.id}\nTotal: ₹${selected.total}\nCustomer: ${selected.customer?.name} (${selected.customer?.phone})\nAddress: ${selected.customer?.address}\nItems: ${(selected.items||[]).map(it=>`${it.item?.name}×${it.qty}`).join(', ')}`)}`}>WhatsApp</a>
                    <button className="btn" onClick={()=>markDelivered(selected.id)}>Mark Delivered</button>
                    <button className="btn" onClick={()=>refundOrder(selected.id, selected.total)}>Refund</button>
                  </div>
                </div>
              </div>
            </div>
          )}
    </section>
  );
}
