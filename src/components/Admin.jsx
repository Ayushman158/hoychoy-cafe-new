import React, { useEffect, useMemo, useState } from "react";
import { getMenu, makeIdFromName } from "../utils/menu.js";
import { BACKEND_URL } from "../config.js";

export default function Admin(){
  const [token,setToken]=useState(()=>localStorage.getItem('hc_admin_token')||'');
  const [authed,setAuthed]=useState(false);
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
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
  const [ownerClosed,setOwnerClosed]=useState(false);

  useEffect(()=>{ refreshStatus(); },[]);
  useEffect(()=>{ refreshOverrides(); },[]);
  useEffect(()=>{
    async function check(){
      if(!token) return;
      try{ const r=await fetch(`${BACKEND_URL}/api/admin/me`,{headers:{'Authorization':`Bearer ${token}`}}); const d=await r.json(); setAuthed(!!d.authed); }catch{}
    }
    check();
  },[token]);

  useEffect(()=>{
    if(!authed || !token) return;
    try{
      const es = new EventSource(`${BACKEND_URL}/api/admin/orders/stream?token=${encodeURIComponent(token)}`);
      es.onmessage = (ev)=>{
        try{
          const d = JSON.parse(ev.data||'{}');
          if(d.type==='init' && Array.isArray(d.orders)) setOrders(d.orders);
          if(d.type==='order.created' && d.order) setOrders((prev)=>[d.order, ...prev]);
        }catch{}
      };
      es.onerror = ()=>{ es.close(); };
      return ()=>{ es.close(); };
    }catch{}
  },[authed, token]);
  function logout(){ localStorage.removeItem('hc_admin_token'); setToken(''); setAuthed(false); setMsg('Logged out'); }

  async function login(e){
    e.preventDefault(); setMsg("");
    try{
      const r=await fetch(`${BACKEND_URL}/api/admin/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});
      const d=await r.json();
      if(!r.ok || !d.token){ setMsg('Invalid credentials'); return; }
      localStorage.setItem('hc_admin_token', d.token);
      setToken(d.token); setAuthed(true); setMsg('Logged in');
    }catch{ setMsg('Network error'); }
  }

  async function refreshStatus(){
    try{ const r=await fetch(`${BACKEND_URL}/api/app-status`); const d=await r.json(); if(r.ok) setStatus(d); }catch{}
  }
  async function refreshOverrides(){
    try{ const r=await fetch(`${BACKEND_URL}/api/menu-overrides`); const d=await r.json(); if(r.ok) setOwnerClosed(!!d.appClosed); }catch{}
  }
  async function setOpen(v){
    setMsg("");
    try{
      const r=await fetch(`${BACKEND_URL}/api/admin/set-app-open`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},body:JSON.stringify({open:v})});
      const d=await r.json();
      if(!r.ok){ setMsg('Failed to update app status'); return; }
      await refreshStatus(); await refreshOverrides(); setMsg('App status updated');
    }catch{ setMsg('Network error'); }
  }

  async function toggleAvailability(id, available){
    setMsg("");
    try{
      const r=await fetch(`${BACKEND_URL}/api/admin/set-availability`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},body:JSON.stringify({id,available})});
      if(!r.ok){ setMsg('Failed to update availability'); return; }
      const fresh = getMenu().items||[]; setItems(fresh); setMsg('Availability updated');
    }catch{ setMsg('Network error'); }
  }

  async function refundOrder(orderId, amount){
    setMsg("");
    try{
      const r=await fetch(`${BACKEND_URL}/api/admin/refund`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},body:JSON.stringify({orderId,amount})});
      const d=await r.json();
      if(!r.ok || !d.ok){
        const err = d && d.error ? d.error : 'refund-failed';
        setMsg(err==='refund-not-configured' ? 'Refund not configured on server' : 'Refund failed');
        return;
      }
      setMsg('Refund initiated successfully');
    }catch{ setMsg('Network error'); }
  }

  async function addItem(e){
    e.preventDefault(); setMsg("");
    const id = makeIdFromName(name||'item');
    try{
      const r=await fetch(`${BACKEND_URL}/api/admin/add-item`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},body:JSON.stringify({id,name,price:Number(price||0),veg,category})});
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
        {authed && <button className="btn" onClick={logout}>Logout</button>}
      </div>
      {msg && <div className="mt-2 text-[#f5c84a]">{msg}</div>}
      {!authed && (
        <div className="card mt-3">
          <div className="section-title">Admin Login</div>
          <form onSubmit={login} className="flex flex-col gap-2">
            <input className="bg-[#111] border border-[#222] rounded-xl p-2" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} />
            <input className="bg-[#111] border border-[#222] rounded-xl p-2" placeholder="Password" type="password" value={password} onChange={e=>setPassword(e.target.value)} />
            <button className="btn btn-primary" type="submit">Login</button>
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
            className={`relative inline-flex items-center h-8 w-20 rounded-full border transition ${!ownerClosed?'bg-[#f5c84a] text-black border-[#f5c84a]':'bg-transparent text-white border-[#444]'}`}
          >
            <span className="absolute left-2 text-xs font-bold">{!ownerClosed?'ON':''}</span>
            <span className="absolute right-2 text-xs font-bold">{ownerClosed?'OFF':''}</span>
            <span className={`inline-block h-6 w-6 rounded-full bg-white shadow transform transition ${!ownerClosed?'translate-x-12':'translate-x-1'}`}></span>
          </button>
          <span className="text-sm text-muted">{!ownerClosed?'Open':'Closed by owner'}</span>
        </div>
        <div className="flex gap-2 mt-2">
          <button className="btn" onClick={()=>{refreshStatus();refreshOverrides();}}>Refresh</button>
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
        <div className="section-title">New Orders</div>
        <ul className="flex flex-col gap-2 max-h-[280px] overflow-auto">
          {(orders||[]).map((o)=> (
            <li key={o.id} className="row">
              <span>#{o.id}</span>
              <span className="flex items-center gap-2">
                <span className="font-bold">₹{o.total}</span>
                <span>{o.customer?.name}</span>
                <span className="text-muted text-xs">{new Date(o.createdAt).toLocaleTimeString()}</span>
                <button className="px-2 py-1 rounded-md bg-[#2a2a2a] border border-[#3a3a3a]" onClick={()=>refundOrder(o.id, o.total)}>Refund</button>
              </span>
            </li>
          ))}
        </ul>
      </div>
      )}
    </section>
  );
}
