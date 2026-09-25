import React, { useEffect, useMemo, useState, useLayoutEffect, useRef } from "react";
import { getMenu, getBackendOverrides } from "../utils/menu.js";
import { BACKEND_URL } from "../config.js";

const BEST_SELLER_IDS = [
  "octopus_chilli",
  "meifoon_chicken",
  "grilled_fish_lemon_butter",
  "grilled_teriyaki_chicken",
  "pesto_pasta_veg",
  "penne_alfredo_veg",
  "the_mafias_meal"
];

const IMAGE_MAP = {
  octopus_chilli: "https://iili.io/fzFX0ge.jpg",
  meifoon_chicken: "https://iili.io/fzFVbFn.jpg",
  grilled_fish_lemon_butter: "https://iili.io/fzCR9cv.jpg",
  grilled_teriyaki_chicken: "https://iili.io/fzFhiwx.jpg",
  pesto_pasta_veg: "https://iili.io/fzCIdQa.jpg",
  penne_alfredo_veg: "https://iili.io/fzFGgiF.jpg",
  the_mafias_meal: "https://iili.io/fzCulLu.jpg"
};

function getItemImage(id, item, overrides){
  if(item && item.image) return item.image;
  if(overrides && overrides.images && overrides.images[id]) return overrides.images[id];
  try{
    const k = "hc_img_"+id;
    const v = localStorage.getItem(k);
    if(v) return v;
  }catch(e){}
  return IMAGE_MAP[id] || null;
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
  const DEFAULT_CLOSING_MSG = 'Sorry, our restaurant is closed today. Online orders are available 12:00–9:00 PM.';
  const [closingMsg,setClosingMsg]=useState("");
  const headerRef = useRef(null);
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
  const [overrides, setOverrides] = useState(() => getBackendOverrides());
  const [menuVersion, setMenuVersion] = useState(0);
  const base = useMemo(() => getMenu(overrides), [overrides, menuVersion]);
  const categories=[
    ...Array.from(new Set((base.categories||[]).map(c=>
      c.startsWith("Appetizers")?"Appetizers":c
    )))
  ];
  const featuredIds = useMemo(() => {
    if (Array.isArray(overrides?.featured) && overrides.featured.length > 0) {
      return overrides.featured;
    }
    return BEST_SELLER_IDS;
  }, [overrides]);

  const bestSellers=useMemo(()=>{
    let list=(base.items||[]).filter(i=>featuredIds.includes(i.id));
    list.sort((a,b)=>featuredIds.indexOf(a.id) - featuredIds.indexOf(b.id));
    if(filters.length){
      list=list.filter(i=> (filters.includes('veg')&&i.veg) || (filters.includes('nonveg')&&!i.veg));
    }
    return list;
  },[base, featuredIds, filters]);
  const items=useMemo(()=>{
    const q=query.trim();
    return (base.items||[]).filter(i=>{
      if (!q && featuredIds.includes(i.id)) return false;
      const okF= !filters.length || ((filters.includes('veg')&&i.veg) || (filters.includes('nonveg')&&!i.veg));
      const okC = q ? true : (!cat || i.category===cat || (
        cat==="Appetizers" && (i.category==="Appetizers (Veg)"||i.category==="Appetizers (Non-Veg)")
      ));
      const okQ = matchesQuery(i, q);
      return okF&&okC&&okQ;
    });
  },[base, filters, cat, query, featuredIds]);

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
      try{
        const d = await fetchBackendOverridesAndCache();
        if(d){
          setClosingMsg(String(d.closingMessage||""));
          setOverrides(d);
          setMenuVersion(v=>v+1);
        }
      }
      catch{}
    }
    load();
    const onUpdated = (e)=>{
      if(e && e.detail){
        setOverrides(e.detail);
        setMenuVersion(v=>v+1);
      }
    };
    window.addEventListener('hc_menu_updated', onUpdated);
    return ()=> window.removeEventListener('hc_menu_updated', onUpdated);
  },[]);

  function add(id){
    setCart(c=>({...c,[id]:(c[id]||0)+1}));
    setJustAdded(id);
    setTimeout(()=>setJustAdded(null),1000);
  }
  function dec(id){
    setCart(c=>{
      const v = (c[id]||0)-1;
      const n = {...c};
      if(v<=0) delete n[id];
      else n[id]=v;
      return n;
    });
  } 
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
              <span>{closingMsg || (overrides?.storeSettings?.openingHours ? `Sorry, we're closed right now. Online orders are available ${overrides.storeSettings.openingHours}.` : DEFAULT_CLOSING_MSG)}</span>
            </div>
          )}
          {!statusLoading && appOpen && overrides?.storeSettings?.announcement && (
            <div className="mt-3 p-2 border border-[#f5c84a]/30 rounded-xl bg-[#f5c84a]/10 text-[#f5c84a] text-sm">
              {overrides.storeSettings.announcement}
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
          <div className="mt-3">
            <select
              className="w-full bg-[#111] border border-[#222] rounded-xl p-2"
              value={cat||''}
              onChange={e=>{ const v=e.target.value; setCat(v||null); }}
            >
              <option value="">All Categories</option>
              {categories.map(c=> (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
        {!query.trim() && bestSellers.length > 0 && (
        <div className="mt-2 mb-4">
          <div className="overflow-x-auto flex gap-3 snap-x snap-mandatory pb-3 px-1 scrollbar-thin">
            {bestSellers.map(item=> {
              const imgUrl = getItemImage(item.id, item, overrides);
              const inCartQty = cart[item.id] || 0;
              return (
                <div key={item.id} className="min-w-[240px] max-w-[260px] rounded-2xl border border-[#262626] hover:border-[#f5c84a]/40 bg-gradient-to-b from-[#181818] to-[#101010] overflow-hidden snap-start shadow-xl flex flex-col justify-between transition-all duration-200">
                  <div className="relative">
                    {imgUrl ? (
                      <img
                        src={imgUrl}
                        alt={item.name}
                        className="w-full h-36 object-cover"
                        onError={(e)=>{ e.currentTarget.style.display='none'; }}
                      />
                    ) : (
                      <div className="w-full h-36 bg-gradient-to-br from-[#222] via-[#181818] to-[#101010] flex flex-col items-center justify-center p-3 text-center border-b border-[#222]">
                        <div className="mb-1.5">{item.veg ? <VegIcon /> : <NonVegIcon />}</div>
                        <span className="text-[10px] text-muted font-semibold uppercase tracking-wider">{item.category}</span>
                      </div>
                    )}
                    <div className="absolute top-2 left-2 right-2 flex items-center justify-between pointer-events-none">
                      <span className="bg-black/80 backdrop-blur-md text-[10px] font-bold px-2 py-0.5 rounded-full text-[#f5c84a] border border-[#f5c84a]/30">
                        Spotlight
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full backdrop-blur-md ${item.available ? 'bg-[#182618] text-success border border-[#2e5e2e]' : 'bg-[#261818] text-error border border-[#5e2e2e]'}`}>
                        {item.available ? 'In Stock' : 'Out'}
                      </span>
                    </div>
                  </div>
                  <div className="p-3 flex flex-col gap-2 flex-1 justify-between">
                    <div>
                      <div className="flex items-center gap-1.5 mb-0.5">
                        {item.veg ? <VegIcon /> : <NonVegIcon />}
                        <span className="font-bold text-sm text-white truncate">{item.name}</span>
                      </div>
                      <div className="text-[11px] text-muted">{item.category}</div>
                    </div>
                    <div className="pt-2 border-t border-[#222] flex items-center justify-between gap-2 mt-auto">
                      <span className="text-base font-extrabold text-[#f5c84a]">₹{item.price}</span>
                      {item.available ? (
                        inCartQty > 0 ? (
                          <div className="flex items-center bg-[#222] border border-[#333] rounded-lg p-0.5">
                            <button type="button" className="w-6 h-6 flex items-center justify-center text-xs font-bold text-white hover:bg-[#333] rounded" onClick={()=>dec(item.id)}>−</button>
                            <span className="w-5 text-center text-xs font-bold text-[#f5c84a]">{inCartQty}</span>
                            <button type="button" className="w-6 h-6 flex items-center justify-center text-xs font-bold text-white hover:bg-[#333] rounded" onClick={()=>add(item.id)}>+</button>
                          </div>
                        ) : (
                          <button type="button" className="btn btn-primary text-xs px-3 py-1 font-bold shadow-md hover:scale-105 active:scale-95 transition-all" onClick={()=>add(item.id)}>
                            {justAdded === item.id ? "✓ Added" : "+ Add"}
                          </button>
                        )
                      ) : (
                        <span className="text-xs text-error font-medium">Out of Stock</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        )}

      <ul className="flex flex-col gap-2">
        {items.map(item=> {
          const imgUrl = getItemImage(item.id, item, overrides);
          const inCartQty = cart[item.id] || 0;
          return (
            <li key={item.id} className="card flex items-center justify-between p-3">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                {imgUrl ? (
                  <img
                    src={imgUrl}
                    alt={item.name}
                    className="w-16 h-16 rounded-xl object-cover flex-shrink-0 border border-[#222]"
                    onError={(e)=>{ e.currentTarget.style.display='none'; }}
                  />
                ) : (
                  <div className="w-16 h-16 rounded-xl bg-[#181818] border border-[#222] flex items-center justify-center flex-shrink-0">
                    {item.veg ? <VegIcon /> : <NonVegIcon />}
                  </div>
                )}
                <div className="flex flex-col gap-0.5 min-w-0">
                  <div className="font-bold text-sm text-white flex items-center gap-1.5 truncate">
                    {item.veg ? <VegIcon /> : <NonVegIcon />}
                    <span className="truncate">{item.name}</span>
                  </div>
                  <div className="text-xs font-extrabold text-[#f5c84a]">₹{item.price}</div>
                  <div className="flex items-center gap-2 text-[11px] text-muted">
                    <span className="truncate">{item.category}</span>
                    <span>•</span>
                    <span className={item.available ? 'text-success' : 'text-error'}>
                      {item.available ? "Available" : "Out of Stock"}
                    </span>
                  </div>
                </div>
              </div>
              <div className="ml-3 flex-shrink-0">
                {item.available ? (
                  inCartQty > 0 ? (
                    <div className="flex items-center bg-[#222] border border-[#333] rounded-lg p-0.5">
                      <button type="button" className="w-6 h-6 flex items-center justify-center text-xs font-bold text-white hover:bg-[#333] rounded" onClick={()=>dec(item.id)}>−</button>
                      <span className="w-5 text-center text-xs font-bold text-[#f5c84a]">{inCartQty}</span>
                      <button type="button" className="w-6 h-6 flex items-center justify-center text-xs font-bold text-white hover:bg-[#333] rounded" onClick={()=>add(item.id)}>+</button>
                    </div>
                  ) : (
                    <button type="button" className="btn btn-primary text-xs px-3 py-1 font-bold shadow-md hover:scale-105 active:scale-95 transition-all" onClick={()=>add(item.id)}>
                      {justAdded === item.id ? "✓ Added" : "+ Add"}
                    </button>
                  )
                ) : (
                  <button disabled className="btn btn-disabled text-xs px-3 py-1">Out</button>
                )}
              </div>
            </li>
          );
        })}
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
