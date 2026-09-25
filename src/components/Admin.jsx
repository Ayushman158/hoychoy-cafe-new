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
    const ping = ()=>{
      authedFetch(`${BACKEND_URL}/api/admin/me`,{}).then(r=>r.json()).then(d=>setAuthed(!!d.authed)).catch(()=>{});
    };
    ping();
    const id = setInterval(ping, 10*60*1000);
    const onFocus = ()=>{ try{ ping(); }catch{} };
    const onVis = ()=>{ try{ if(document.visibilityState==='visible') ping(); }catch{} };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVis);
    return ()=>{ try{ clearInterval(id); }catch{} };
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
    try{
      const d = await fetchBackendOverridesAndCache();
      if(d){
        setOwnerClosed(!!d.appClosed);
        setClosingMessage(String(d.closingMessage||""));
        if(d.deliveryRates && Array.isArray(d.deliveryRates.tiers)){
          setDeliveryRates(d.deliveryRates);
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
    if(!pwdNew || pwdNew.length < 6){
      setPwdMsg("New password must be at least 6 characters long");
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
      setPwdMsg("Password changed successfully! Keep your new password secure.");
      setPwdCurrent("");
      setPwdNew("");
      setPwdConfirm("");
    }catch(err){
      setPwdMsg("Network error while updating password");
    }
    setPwdLoading(false);
  }

  return (
    <section className="max-w-[900px] mx-auto px-4 pt-[calc(env(safe-area-inset-top)+8px)] pb-[calc(env(safe-area-inset-bottom)+12px)] md:pt-0 overflow-x-hidden">
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
      {msg && <div className="mt-2 text-[#f5c84a]">{msg}</div>}
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
      {authed && (
      <div className="card mt-3">
        <div className="section-title">Restaurant Status</div>
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

      {authed && (
      <div className="card mt-3">
        <div className="section-title flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span>Admin Security & Password</span>
          </div>
          <span className="text-xs text-muted font-normal">Account: {email || 'hoychoycafe@gmail.com'}</span>
        </div>
        <p className="text-xs text-muted mb-3">Change your admin password anytime. Your new password will be saved securely and used for all future logins.</p>

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
              <label className="text-xs text-muted block mb-1">New Password (min 6 characters)</label>
              <div className="flex gap-2">
                <input
                  className="flex-1 bg-[#111] border border-[#222] rounded-xl p-2.5 text-sm"
                  placeholder="New password"
                  type={showPwdNew ? 'text' : 'password'}
                  value={pwdNew}
                  onChange={e=>setPwdNew(e.target.value)}
                  minLength={6}
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
                  minLength={6}
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
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
      {authed && (
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

      {authed && (
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

      {authed && (
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
            <input
              className="bg-[#111] border border-[#222] rounded-xl p-2 text-sm"
              placeholder="Dish Image URL (optional direct image link)"
              value={addImage}
              onChange={e=>setAddImage(e.target.value)}
            />
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
                  Image URL <span className="text-[#888] font-normal">(direct link from PostImages, ImgBB, Cloudinary, etc.)</span>
                </label>
                <div className="flex gap-2">
                  <input
                    className="flex-1 bg-[#181818] border border-[#2e2e2e] rounded-xl p-2.5 text-sm"
                    placeholder="https://..."
                    value={editingItem.image || ''}
                    onChange={e=>setEditingItem(s=>({...s, image: e.target.value}))}
                  />
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
              <span className="flex flex-wrap items-center gap-2 min-w-0">
                <span className="font-bold">₹{o.total}</span>
                <span className="min-w-0 truncate">{o.customer?.name}</span>
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
