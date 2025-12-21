import React, { useEffect, useMemo, useState, useLayoutEffect } from "react";
import { getMenu } from "../utils/menu.js";
import { BACKEND_URL } from "../config.js";

const BEST_SELLER_IDS = [
  "octopus",
  "chicken_meifoon",
  "grilled_teriyaki_chicken",
  "penne_alfredo_veg",
  "pesto_pasta_veg",
  "green_mafia",
  "red_velvet_chicken",
  "grilled_fish_lemon_butter",
  "thukpa_chicken"
];

const IMAGE_MAP = {
  octopus: "https://iili.io/fzFX0ge.jpg",
  chicken_meifoon: "https://iili.io/fzFVbFn.jpg",
  grilled_teriyaki_chicken: "https://iili.io/fzFhiwx.jpg",
  penne_alfredo_veg: "https://iili.io/fzFGgiF.jpg",
  pesto_pasta_veg: "https://iili.io/fzCIdQa.jpg",
  green_mafia: "https://iili.io/fzCulLu.jpg",
  red_velvet_chicken: "https://iili.io/fzCuypS.jpg",
  grilled_fish_lemon_butter: "https://iili.io/fzCR9cv.jpg",
  thukpa_chicken: "https://iili.io/fzCRDe2.jpg"
};

function img(id){
  try{
    const k = "hc_img_"+id;
    const v = localStorage.getItem(k);
    return v || IMAGE_MAP[id] || null;
  }catch(e){
    return IMAGE_MAP[id] || null;
  }
}

export default function Menu({cart, setCart, onProceed}){
  const [filters,setFilters]=useState([]);
  const [cat,setCat]=useState(null);
  const [menuOpen,setMenuOpen]=useState(false);
  const [justAdded,setJustAdded]=useState(null);
  const [query,setQuery]=useState("");
  const [appOpen,setAppOpen]=useState(true);
  const [appReason,setAppReason]=useState('OPEN');
  const [statusLoading,setStatusLoading]=useState(true);
  const DEFAULT_CLOSING_MSG = '😔 Sorry, our restaurant is closed today. Online orders are available 12:00–9:00 PM.';
  const [closingMsg,setClosingMsg]=useState("");
  const headerRef = React.useRef(null);
  const [headerH,setHeaderH] = useState(0);
  useLayoutEffect(()=>{
    const update=()=>{ if(headerRef.current){ setHeaderH(headerRef.current.offsetHeight||0); } };
    update();
    window.addEventListener('resize', update);
    return ()=> window.removeEventListener('resize', update);
  },[statusLoading,filters,cat,query,appOpen,appReason]);

  const VegIcon = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" strokeWidth="2">
    <rect
      x="3"
      y="3"
      width="18"
      height="18"
      rx="3"
      stroke="currentColor"
      className="text-success"
    />
    <circle
      cx="12"
      cy="12"
      r="4"
      fill="currentColor"
      className="text-success"
    />
  </svg>
);
const NonVegIcon = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" strokeWidth="2">
    <rect
      x="3"
      y="3"
      width="18"
      height="18"
      rx="3"
      stroke="currentColor"
      className="text-error"
    />
    <circle
      cx="12"
      cy="12"
      r="4"
      fill="currentColor"
      className="text-error"
    />
  </svg>
);
  const base=getMenu();
  const categories=[
    ...Array.from(new Set((base.categories||[]).map(c=>
      c.startsWith("Appetizers")?"Appetizers":c
    )))
  ];
  const bestSellers=useMemo(()=>{
    let list=(base.items||[]).filter(i=>BEST_SELLER_IDS.includes(i.id));
    if(filters.length){
      list=list.filter(i=> (filters.includes('veg')&&i.veg) || (filters.includes('nonveg')&&!i.veg));
    }
    return list;
  },[filters]);
  const items=useMemo(()=>{
    const q=query.trim();
    return (base.items||[]).filter(i=>{
      if (!q && BEST_SELLER_IDS.includes(i.id)) return false;
      const okF= !filters.length || ((filters.includes('veg')&&i.veg) || (filters.includes('nonveg')&&!i.veg));
      const okC= !cat || i.category===cat || (
        cat==="Appetizers" && (i.category==="Appetizers (Veg)"||i.category==="Appetizers (Non-Veg)")
      );
      const okQ = matchesQuery(i, q);
      return okF&&okC&&okQ;
    });
  },[filters,cat,query]);

  const count=Object.values(cart).reduce((s,x)=>s+x,0);
  const total=items.reduce((s,i)=>s+(cart[i.id]?cart[i.id]*i.price:0),0);
  const cartTotal=Object.entries(cart).reduce((s,[id,q])=>{const it=(base.items||[]).find(x=>x.id===id);return s+(it?it.price*q:0);},0);

  useEffect(()=>{localStorage.setItem("hc_cart",JSON.stringify(cart));},[cart]);

  useEffect(()=>{
    async function load(){
      try{ const r=await fetch(`${BACKEND_URL}/api/app-status`); const d=await r.json(); if(r.ok){ setAppOpen(!!d.open); setAppReason(d.reason||'OPEN'); } }
      catch{}
      finally{ setStatusLoading(false); }
    }
    load();
  },[]);

  useEffect(()=>{
    async function load(){
      try{ const r=await fetch(`${BACKEND_URL}/api/menu-overrides`); const d=await r.json(); if(r.ok){ setClosingMsg(String(d.closingMessage||"")); } }
      catch{}
    }
    load();
  },[]);

  function add(id){
  console.log('Adding item to cart:', id);
  console.log('Current cart:', cart);setCart(c=>({...c,[id]:(c[id]||0)+1}));setJustAdded(id);setTimeout(()=>setJustAdded(null),1000);} 
  function handleProceed(){ if(Object.values(cart).reduce((s,x)=>s+x,0)>0) onProceed(); }
  

  return (
    <main className="max-w-[600px] mx-auto px-5 md:px-4 pb-40" style={{paddingTop: 'calc(env(safe-area-inset-top, 0px) + '+headerH+'px)'}}>
        <div className="hc-safe-buffer" aria-hidden="true"></div>
        <div ref={headerRef} className="fixed left-0 right-0 z-[50] bg-[#0f0f0f] pt-4 pb-3 border-b border-[#222] px-5 md:px-4" style={{top:'env(safe-area-inset-top, 0px)'}}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-2xl font-extrabold">
              <span>Hoy</span>
              <span className="text-[#f5c84a]" style={{textShadow:"0 0 22px rgba(245,200,74,0.6), 0 0 8px rgba(245,200,74,0.5)"}}>Choy</span>
              <span> Café</span>
            </span>
            <div className="relative">
              <button onClick={()=>setMenuOpen(o=>!o)} className="w-10 h-10 flex items-center justify-center rounded-full bg-[#1a1a1a] border border-[#333] text-[#f5c84a] shadow-lg hover:bg-[#2a2a2a] transition">
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 6h18M3 12h18M3 18h18"/>
                </svg>
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[49]" onClick={()=>setMenuOpen(false)}></div>
                  <div className="fixed right-0 top-0 bottom-0 w-64 bg-[#0f0f0f] border-l border-[#222] z-[50] p-4 flex flex-col">
                    <div className="flex items-center justify-end mb-4">
                      <button onClick={()=>setMenuOpen(false)} className="px-2 py-1 rounded-lg border border-[#222]">✕</button>
                    </div>
                    <a href="/" className="block px-2 py-2 rounded hover:bg-[#1a1a1a]">Main Menu</a>
                    <a href="/about" className="block px-2 py-2 rounded hover:bg-[#1a1a1a]">About</a>
                    <a href="/reserve" className="block px-2 py-2 rounded hover:bg-[#1a1a1a]">Reservations</a>
                    <button
                      className="text-left block px-2 py-2 rounded hover:bg-[#1a1a1a]"
                      onClick={()=>{
                        const bip = window.__bip;
                        if(bip){ bip.prompt(); } else {
                          const ua = navigator.userAgent || "";
                          const isiOS = /iPhone|iPad|iPod/.test(ua);
                          const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
                          if(isiOS && isSafari){ alert("Tap Share, then 'Add to Home Screen' to install."); } else { alert("Use browser menu: Install app or Add to Home Screen."); }
                        }
                        setMenuOpen(false);
                      }}
                    >Install App</button>
                    
                  </div>
                </>
              )}
            </div>
          </div>
          {statusLoading && (
            <div className="mt-3 p-2 border border-[#222] rounded-xl bg-[#1a1a1a] text-[#bdbdbd]">Checking restaurant status…</div>
          )}
          {!statusLoading && !appOpen && appReason==='CLOSED_BY_OWNER' && (
            <div className="mt-3 p-2 border border-[#222] rounded-xl bg-[#1a1a1a] text-[#f5c84a]">
              <span>{closingMsg || DEFAULT_CLOSING_MSG}</span>
            </div>
          )}

          <div className="mt-3">
            <input
              className="w-full bg-[#111] border border-[#222] rounded-xl p-2"
              placeholder="Search items"
              value={query}
              onChange={e=>setQuery(e.target.value)}
            />
          </div>
          <div className="flex gap-2 mt-3 items-center">
            {['veg','nonveg'].map(f=>{
              const active = filters.includes(f);
              const toggle=()=>setFilters(s=> active? s.filter(x=>x!==f) : [...s,f]);
              return (
                <button key={f} onClick={toggle} className={`chip ${active?'chip-active':''} ${f==='veg'?'text-success':f==='nonveg'?'text-error':''}`} data-filter={f}>
                  <span className="inline-flex items-center gap-2">
                    {f==='veg'?<VegIcon />:<NonVegIcon />}
                    <span>{f==='veg'?"Veg":"Non-Veg"}</span>
                    {active && <span>×</span>}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="flex gap-2 overflow-auto mt-3 pb-2">
            {categories.map(c=> (
              <button key={c} onClick={()=>setCat(cat===c?null:c)} className={`chip ${cat===c?'chip-active':''}`}>
                <span className="inline-flex items-center gap-2">
                  <span>{c}</span>
                  {cat===c && <span>×</span>}
                </span>
              </button>
            ))}
          </div>
        </div>
        {!query.trim() && (
        <div className="mt-4">
          <div className="text-xl font-bold">Best Sellers</div>
          <div className="mt-2 overflow-x-auto flex gap-3 snap-x snap-mandatory pb-2">
            {bestSellers.map(item=> (
              <div key={item.id} className="min-w-[260px] rounded-xl border border-[#222] bg-[#111] overflow-hidden snap-start">
                <div className="relative">
                  {img(item.id) && (
                    <img src={img(item.id)} alt={item.name} className="w-full h-40 object-cover" />
                  )}
                  <div className="absolute left-2 right-2 top-2 flex items-center">
                    <div className="bg-black/70 text-white text-sm px-2 py-1 rounded inline-flex items-center gap-2">
                      {item.veg?<VegIcon />:<NonVegIcon />}
                      <span>{item.name}</span>
                    </div>
                  </div>
                </div>
                <div className="p-2 flex items-center justify-between">
                  <span className="font-semibold">₹{item.price}</span>
                  <button disabled={!item.available} className={`btn ${item.available?'btn-primary':''} ${item.available?'':'btn-disabled'} mt-1`} onClick={()=>add(item.id)}>
                    {item.available?(justAdded===item.id?"✓ Added":"Add"):"Out"}
                  </button>
                </div>
                <div className="px-2 pb-2 flex items-center gap-2 text-xs">
                  <span className={`inline-block w-2 h-2 rounded-full ${item.available?'bg-success':'bg-error'}`}></span>
                  <span>{item.available?"Available":"Out of Stock"}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        )}

      <ul className="flex flex-col gap-2">
        {items.map(item=> (
          <li key={item.id} className="card flex items-center justify-between">
            <div className="flex items-center gap-3">
              {img(item.id) && (
                <img src={img(item.id)} alt={item.name} className="w-20 h-20 rounded-lg object-cover" />
              )}
              <div className="flex flex-col gap-1">
                <div className="font-semibold flex items-center gap-2">
                  {item.veg?<VegIcon />:<NonVegIcon />}
                  <span>{item.name}</span>
                </div>
                <div className="text-muted">₹{item.price}</div>
                <div className="flex items-center gap-2 text-xs">
                  <span className={`inline-block w-2 h-2 rounded-full ${item.available?'bg-success':'bg-error'}`}></span>
                  <span>{item.available?"Available":"Out of Stock"}</span>
                </div>
              </div>
            </div>
            <button disabled={!item.available} className={`btn ${item.available?'btn-primary':''} ${item.available?'':'btn-disabled'}`} onClick={()=>add(item.id)}>
              {item.available?(justAdded===item.id?"✓ Added":"Add"):"Out"}
            </button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={handleProceed}
        disabled={appReason==='CLOSED_BY_OWNER' || count===0}
        className={`fixed right-3 z-30 rounded-full px-3 py-2 font-bold flex items-center gap-2 shadow-xl ${(appReason==='CLOSED_BY_OWNER' || count===0) ? 'opacity-60 cursor-not-allowed bg-[#333] text-[#999]' : 'bg-primary text-black'}`}
        style={{bottom: 'calc(160px + env(safe-area-inset-bottom, 0px))'}}
      >
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="9" cy="20" r="1"/><circle cx="17" cy="20" r="1"/>
          <path d="M3 3h2l3 12h10l3-8H6"/>
        </svg>
        <span>{count}</span>
      </button>
      <div className="fixed left-0 right-0 bottom-0 bg-gradient-to-b from-black/20 to-bg p-3 border-t border-[#222]">
        <div className="row font-bold">
          <span>Total</span><span className="price">₹{cartTotal}</span>
        </div>
        <button className={`btn w-full mt-2 ${(appReason==='CLOSED_BY_OWNER' || cartTotal===0) ? 'btn-disabled' : 'btn-primary'}`} disabled={appReason==='CLOSED_BY_OWNER' || cartTotal===0} onClick={handleProceed}>Proceed to Checkout</button>
        {cartTotal>0 && (
          <button className="btn w-full mt-2" type="button" onClick={()=>{ setCart({}); try{ localStorage.removeItem('hc_cart'); }catch{} }}>Clear Cart</button>
        )}
      </div>
    </main>
  );
}
  function norm(s){
    try{ return String(s||'').toLowerCase(); }catch{ return ''; }
  }
  function tokens(s){
    const t = norm(s).split(/[^a-z0-9]+/).filter(Boolean);
    return t.map(x=> x.endsWith('s') ? x.slice(0,-1) : x);
  }
  function matchesQuery(i, q){
    if(!q) return true;
    const qt = tokens(q);
    const nameT = tokens(i.name);
    const catT = tokens(i.category);
    return qt.every(w=> nameT.includes(w) || catT.includes(w));
  }
