import React, { useEffect, useMemo, useState } from "react";
import Menu from "./components/Menu.jsx";
import Checkout from "./components/Checkout.jsx";
import Confirm from "./components/Confirm.jsx";
import Success from "./components/Success.jsx";
import PaymentStatus from "./components/PaymentStatus.jsx";
import Splash from "./components/Splash.jsx";
import { BACKEND_URL } from "./config.js";
import Privacy from "./components/Privacy.jsx";
import Terms from "./components/Terms.jsx";
import RefundCancellation from "./components/RefundCancellation.jsx";
import Shipping from "./components/Shipping.jsx";
import About from "./components/About.jsx";
import Footer from "./components/Footer.jsx";
import Reservation from "./components/Reservation.jsx";
import { OWNER_PHONE, MERCHANT_NAME } from "./config.js";
import { generateOrderId } from "./utils/order.js";
import { getMenu, fetchMenuRemoteAndCache, fetchBackendOverridesAndCache } from "./utils/menu.js";
import Admin from "./components/Admin.jsx";

export default function App(){
  const [view,setView]=useState("splash");
  const [returnTxn,setReturnTxn]=useState(null);
  const [policy,setPolicy]=useState(null);
  const [cart,setCart]=useState(()=>{try{const r=localStorage.getItem("hc_cart");return r?JSON.parse(r):{};}catch{return {}}});
  const [cust,setCust]=useState(null);
  const items=useMemo(()=>{const menu=getMenu();return Object.entries(cart).map(([id,q])=>{const it=menu.items.find(x=>x.id===id);return it?{item:it,qty:q}:null;}).filter(Boolean);},[cart]);
  const total=items.reduce((s,x)=>s+x.item.price*x.qty,0);

  useEffect(()=>{localStorage.setItem("hc_cart",JSON.stringify(cart));},[cart]);

  useEffect(()=>{ fetchMenuRemoteAndCache().catch(()=>{}); fetchBackendOverridesAndCache().catch(()=>{}); },[]);
  useEffect(()=>{
    let cancelled=false;
    (async()=>{
      try{
        const menuP = fetchMenuRemoteAndCache().catch(()=>{});
        const overridesP = fetchBackendOverridesAndCache().catch(()=>{});
        const statusP = fetch(`${BACKEND_URL}/api/app-status`).catch(()=>({}));
        await Promise.race([menuP, new Promise(res=>setTimeout(res,2500))]);
      }catch{}
      if(!cancelled){ setView(v=> (v==='splash' ? 'menu' : v)); }
    })();
    return ()=>{ cancelled=true; };
  },[]);
  useEffect(()=>{
    const params = new URLSearchParams(window.location.search);
    const id = params.get('merchantTransactionId');
    if(id){
      setReturnTxn(id);
      setView('payment');
    }
    const p = window.location.pathname.replace(/^\/+/,"");
    if(['privacy','terms','refund','shipping','about','reserve','admin'].includes(p)){
      setPolicy(p);
      setView('policy');
    }
  },[]);

  useEffect(()=>{
    const t = {
      menu: 'HoyChoy Café — Menu',
      checkout: 'HoyChoy Café — Cart & Checkout',
      confirm: 'HoyChoy Café — Confirm Order',
      payment: 'HoyChoy Café — Payment Status',
      splash: 'HoyChoy Café — Welcome',
      success: 'HoyChoy Café — Order Placed',
    }[view];
    let tp = t;
    if(view==='policy'){
      const map={
        privacy:'HoyChoy Café — Privacy Policy',
        terms:'HoyChoy Café — Terms & Conditions',
        refund:'HoyChoy Café — Refund & Cancellation',
        shipping:'HoyChoy Café — Shipping Policy',
        about:'HoyChoy Café — About',
        reserve:'HoyChoy Café — Reservations',
        admin:'HoyChoy Café — Admin'
      };
      tp = map[policy] || 'HoyChoy Café';
    }
    if(tp) document.title = tp;
  },[view,policy]);

  function proceed(){setView("checkout");}
  function backToMenu(){setView("menu");}
  function toConfirm(payload){setCust(payload);setView("confirm");}
  function skipSplash(){setView("menu");}
  async function toSuccess(){
    const orderId=generateOrderId();
    let lines=[];
    lines.push(`🟢 *New Order - ${MERCHANT_NAME}*`);
    lines.push("");
    lines.push("📋 *Order Details:*");
    items.forEach(({item,qty})=>lines.push(`• ${item.name} ×${qty} - ₹${item.price}`));
    lines.push("");
    lines.push(`💰 *Total Amount:* ₹${total}`);
    lines.push("");
    lines.push("👤 *Customer Details:*");
    lines.push(`Name: ${cust.name}`);
    lines.push(`Phone: ${cust.phone}`);
    lines.push("");
    lines.push("📍 *Delivery Address:*");
    lines.push(cust.address);
    lines.push("");
    lines.push("📌 *Exact Location:*");
    const glink=cust.geo?`https://maps.google.com/?q=${cust.geo.lat},${cust.geo.lng}`:(cust.manualLink||"Not shared");
    lines.push(glink);
    lines.push("(Tap to open in Maps)");
    lines.push("");
    lines.push("💳 *Payment: PhonePe UPI* (auto verification)");
    lines.push("");
    lines.push(`🆔 *Order ID:* #${orderId}`);
    lines.push("---");
    const msg = lines.join("\n");
    const url = `https://api.whatsapp.com/send?phone=${OWNER_PHONE}&text=${encodeURIComponent(msg)}`;
    window.location.href = url;
    setView("success");
    setCust(c=>({...c,orderId}));
  }

  function successBack(){setCart({});localStorage.removeItem("hc_cart");setView("menu");}

  if(view==="splash") return <Splash onContinue={skipSplash} />;
  if(view==="menu") return (<>
    <Menu cart={cart} setCart={setCart} onProceed={proceed}/>
    <Footer />
  </>);
  if(view==="checkout") return <Checkout cart={cart} setCart={setCart} onBack={backToMenu} onSubmit={toConfirm}/>;
  if(view==="confirm") return <Confirm name={cust.name} phone={cust.phone} total={total} onBack={()=>setView("checkout")} onConfirm={toSuccess}/>;
  if(view==="payment") return <PaymentStatus />;
  if(view==="policy"){
    const back=()=>{setPolicy(null);setView('menu');window.history.replaceState({},'', '/');};
    if(policy==='privacy') return <Privacy onBack={back}/>;
    if(policy==='terms') return <Terms onBack={back}/>;
    if(policy==='refund') return <RefundCancellation onBack={back}/>;
    if(policy==='shipping') return <Shipping onBack={back}/>;
    if(policy==='reserve') return (<>
      <Reservation onBack={back} />
      <Footer />
    </>);
    if(policy==='admin') return (<>
      <Admin />
      <Footer />
    </>);
    return (<>
      <About onBack={back}/>
      <Footer />
    </>);
  }
  return <Success orderId={cust.orderId} summary={{name:cust.name,phone:cust.phone,address:cust.address,items,total}} onBack={successBack}/>;
}
