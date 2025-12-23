import React, { useEffect, useMemo, useState } from "react";
import data from "../data/menu.json";
import { UPI_ID, MERCHANT_NAME, BACKEND_URL, CAFE_LAT, CAFE_LNG } from "../config";
import { generateOrderId } from "../utils/order";
import { buildUpiIntent } from "../utils/upi";

export default function Checkout({cart, setCart, onBack, onSubmit}){
  const items=useMemo(()=>Object.entries(cart).map(([id,q])=>{const it=data.items.find(x=>x.id===id);return it?{item:it,qty:q}:null;}).filter(Boolean),[cart]);
  const total = items.reduce((s, x) => s + x.item.price * x.qty, 0);
  const [name,setName]=useState("");
  const [phone,setPhone]=useState("");
  const [address,setAddress]=useState("");
  const [note,setNote]=useState("");
  const [paying,setPaying]=useState(false);
  const [geo,setGeo]=useState(null);
  const [manualLink,setManualLink]=useState("");
  const [geoError,setGeoError]=useState("");
  const [resolvedCoord,setResolvedCoord]=useState(null);
  const [resolving,setResolving]=useState(false);
  const [resolveMsg,setResolveMsg]=useState("");
  const coord = useMemo(()=>{
    return geo || resolvedCoord || parseManualCoords(manualLink);
  },[geo,resolvedCoord,manualLink]);
  const distance = useMemo(()=>{
    if(!coord) return null;
    return Number(haversine(CAFE_LAT, CAFE_LNG, coord.lat, coord.lng).toFixed(2));
  },[coord]);
  const valid=name.trim()&&phone.replace(/\D/g,"").length===10&&address.trim()&&((!!geo)||isValidManualLink(manualLink));
  const upiIntent = buildUpiIntent(UPI_ID, total, MERCHANT_NAME, "Order at HoyChoy Café", `HC-${Date.now()}`);
  const [copied,setCopied]=useState(false);
  const [agree,setAgree]=useState(true);
  const [showDetails,setShowDetails]=useState(false);
  const [couponCode,setCouponCode]=useState("");
  const [coupon,setCoupon]=useState(null);
  const discountPct = useMemo(()=>{
    const p = Number(coupon?.percent||0);
    return (p>0 && p<=100) ? p : 0;
  },[coupon]);

  useEffect(()=>{localStorage.setItem("hc_cart",JSON.stringify(cart));},[cart]);

  function dec(id){setCart(c=>{const v=(c[id]||0)-1;const n={...c};if(v<=0) delete n[id]; else n[id]=v;return n;});}
  function inc(id){console.log('Incrementing item in cart:', id);console.log('Current cart:', cart);setCart(c=>({...c,[id]:(c[id]||0)+1}));}
  function clearCart(){ setCart({}); try{ localStorage.removeItem('hc_cart'); }catch{} }

  async function capture(){
    setGeoError("");
    if(!navigator.geolocation){setGeoError("Geolocation not supported");return;}
    try{
      const perm = navigator.permissions&&await navigator.permissions.query({name:"geolocation"});
      if(perm&&perm.state==="denied"){setGeoError("Location permission denied. Enable it in browser settings.");return;}
    }catch{}
    navigator.geolocation.getCurrentPosition(
      (p)=>{setGeo({lat:p.coords.latitude,lng:p.coords.longitude});},
      (err)=>{setGeoError("Could not capture location. Please use manual link.");},
      {enableHighAccuracy:true,timeout:10000,maximumAge:0}
    );
  }

  function isValidManualLink(str){
    const s=str.trim();
    if(!s) return false;
    const coord=/^\s*-?\d{1,2}\.\d+\s*,\s*-?\d{1,3}\.\d+\s*$/;
    if(coord.test(s)) return true;
    try{
      const u=new URL(s);
      const host=u.hostname.toLowerCase();
      const path=u.pathname.toLowerCase();
      if(host.includes('google.com')||host.includes('maps.google.com')||host.includes('maps.app.goo.gl')||host.includes('goo.gl')){
        return true;
      }
      return /google\.com\/maps/.test(host+path);
    }catch{return false}
  }

  function parseManualCoords(str){
    try{
      const s=str.trim();
      const m=s.match(/^\s*(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)\s*$/);
      if(m) return {lat:Number(m[1]),lng:Number(m[2])};
      const u=new URL(s);
      const q=u.searchParams.get('q')||u.searchParams.get('ll')||u.searchParams.get('query');
      const mm=q&&q.match(/^\s*(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)\s*$/);
      if(mm) return {lat:Number(mm[1]),lng:Number(mm[2])};
      const atMatch = u.pathname.match(/@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/);
      if(atMatch) return {lat:Number(atMatch[1]),lng:Number(atMatch[2])};
      return null;
    }catch{return null}
  }

  function haversine(lat1,lon1,lat2,lon2){
    const toRad=(v)=>v*Math.PI/180;
    const R=6371;
    const dLat=toRad(lat2-lat1);
    const dLon=toRad(lon2-lon1);
    const a=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
    const c=2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
    return R*c;
  }

  function calculateDeliveryFee(){
    if(total===0) return 0;
    if(distance==null) return 60;
    const d = Number(distance);
    if(d<=5) return 60;
    if(d<=8) return 80;
    if(d<=10) return 120;
    if(d<=12) return 150;
    if(d<=15) return 180;
    return null;
  }

  const discountedSubtotal = Math.max(0, Math.round(total * (1 - discountPct/100)));
  const gst = Math.round(discountedSubtotal*0.05);
  const deliveryFee = calculateDeliveryFee();
  const deliveryAvailable = deliveryFee!=null;
  const grandTotal = discountedSubtotal + gst + (deliveryAvailable?deliveryFee:0);
  const minCheckTotal = deliveryAvailable ? total + deliveryFee : 0;
  const canOrder = deliveryAvailable && minCheckTotal >= 200;

  function submit(){onSubmit({name,phone,address,note,geo,manualLink:manualLink.trim(),total,items,gst,deliveryFee,grandTotal, coupon: coupon?.code||null, discountPct});}

  async function applyCoupon(){
    try{
      const code = couponCode.trim();
      if(!code){ setCoupon(null); return; }
      const r = await fetch(`${BACKEND_URL}/api/coupon/${encodeURIComponent(code)}`);
      const d = await r.json();
      if(r.ok && d && d.ok && d.percent>0){
        setCoupon({ code: d.code, percent: Number(d.percent) });
      }else{
        setCoupon(null);
        alert('Invalid or disabled coupon');
      }
    }catch{ setCoupon(null); alert('Could not validate coupon'); }
  }

  async function payNow(){
    if(paying) return;
    if(!canOrder){
      alert('Minimum order is ₹200. Please add more items before paying.');
      return;
    }
    if(!valid){
      alert('Please fill in name, 10‑digit phone, address, and location to continue.');
      return;
    }
    setPaying(true);
    const orderId = `HC-${generateOrderId()}-${Date.now()}`;
    const redirectUrl = `${window.location.origin}/?merchantTransactionId=${orderId}`;
    const callbackUrl = `${BACKEND_URL}/api/payment-callback`;
    const snapshotItems = items.map(({item,qty})=>({id:item.id,name:item.name,qty,price:item.price}));
    const snapshot = { items: snapshotItems, customer:{name,phone,address,note,geo,manualLink:manualLink.trim()}, total, gst, deliveryFee, grandTotal };
    const resp = await fetch(`${BACKEND_URL}/api/initiate-payment`,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({amount:grandTotal, orderId, customerPhone:phone, customerName:name, redirectUrl, callbackUrl, snapshot})
    });
    const data = await resp.json();
    if(!resp.ok || !data.redirectUrl){
      alert('Could not start PhonePe payment. Please try again.');
      setPaying(false);
      return;
    }
    localStorage.setItem('pp_last_txn', orderId);
    localStorage.setItem('hc_cust', JSON.stringify({name,phone,address,note,geo,manualLink:manualLink.trim(),items,total,gst,deliveryFee,grandTotal}));
    const tokenUrl = data.redirectUrl;
    const cb = (response)=>{
      if(response==='USER_CANCEL'){ return; }
      window.location.href = `/?merchantTransactionId=${orderId}`;
    };
    if(window && window.PhonePeCheckout && window.PhonePeCheckout.transact){
      window.PhonePeCheckout.transact({ tokenUrl, callback: cb, type: 'IFRAME' });
    }else{
      window.location.href = tokenUrl;
    }
    setTimeout(()=>{
      try{
        const stillHere = !document.hidden && window.location.href===tokenUrl;
        if(stillHere){ window.location.href = `/?merchantTransactionId=${orderId}`; }
      }catch{}
    }, 6000);
  }

  async function resolveManual(){
    setResolving(true);
    setResolveMsg("");
    try{
      const local = parseManualCoords(manualLink);
      if(local){
        setResolvedCoord(local);
        setResolveMsg("✓ Location updated");
        setResolving(false);
        return;
      }
      if(isValidManualLink(manualLink)){
        const r = await fetch(`${BACKEND_URL}/api/resolve-maps`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:manualLink})});
        const d = await r.json();
        if(r.ok && d.coord){
          setResolvedCoord(d.coord);
          setResolveMsg("✓ Location updated");
        }else{
          setResolveMsg("We couldn’t read that map link. Please try copying the full link.");
        }
      }else{
        setResolveMsg("Please enter a map link or coordinates like 27.2348,94.1101");
      }
    }catch{
      setResolveMsg("We couldn’t update your location. Please check your connection and try again.");
    }
    setResolving(false);
  }

  useEffect(()=>{
    setResolvedCoord(null);
    const local = parseManualCoords(manualLink);
    if(local){ setResolvedCoord(local); return; }
    async function resolve(){
      try{
        if(isValidManualLink(manualLink)){
          const r = await fetch(`${BACKEND_URL}/api/resolve-maps`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:manualLink})});
          const d = await r.json();
          if(r.ok && d.coord) setResolvedCoord(d.coord);
        }
      }catch{}
    }
    resolve();
  },[manualLink]);


  return (
    <section className="max-w-[600px] mx-auto px-4 pt-[calc(env(safe-area-inset-top)+8px)] md:pt-0">
      <div className="flex items-center gap-2 mt-3"><button className="btn" onClick={onBack}>←</button><div className="font-bold">Cart & Checkout</div></div>
      <div className="card mt-3">
        <div className="section-title flex items-center justify-between">
          <span>Your Order</span>
          {items.length>0 && (
            <button className="px-2 py-1 text-sm text-white/80 hover:text-white underline underline-offset-2" type="button" onClick={clearCart} aria-label="Clear Cart">Clear Cart</button>
          )}
        </div>
        <ul className="flex flex-col gap-2">
          {items.map(({item,qty})=> (
            <li key={item.id} className="row">
              <div>{item.name}</div>
              <div className="flex items-center gap-2">
                <button className="px-2 py-1 rounded-md bg-[#2a2a2a] border border-[#3a3a3a]" onClick={()=>dec(item.id)}>-</button>
                <span>{qty}</span>
                <button className="px-2 py-1 rounded-md bg-[#2a2a2a] border border-[#3a3a3a]" onClick={()=>inc(item.id)}>+</button>
                <span>₹{item.price}</span>
              </div>
            </li>
          ))}
        </ul>
        <div className="border-t border-[#222] my-2"/>
        <div className="row font-bold"><span>Grand Total</span><span className="price">₹{grandTotal}</span></div>
        <button className="px-2 py-1 text-sm mt-2 underline underline-offset-4" type="button" onClick={()=>setShowDetails(s=>!s)}>{showDetails? 'Hide price breakdown' : 'View bill details'}</button>
        {showDetails && (
          <div className="mt-2">
            <div className="row"><span>Subtotal</span><span className="price">₹{total}</span></div>
            {discountPct>0 && <div className="row"><span>Coupon ({discountPct}% off)</span><span className="price">-₹{Math.max(0, total - discountedSubtotal)}</span></div>}
            <div className="row"><span>GST (5%)</span><span className="price">₹{gst}</span></div>
            {total>0 && canOrder && <div className="row"><span>Delivery Fee</span><span className="price">₹{deliveryFee}</span></div>}
          </div>
        )}
      </div>

      <div className="card mt-3">
        <div className="section-title">Apply Coupon</div>
        <div className="flex flex-col sm:flex-row gap-2">
          <input className="w-full sm:flex-1 min-w-0 bg-[#111] border border-[#222] rounded-xl p-2" placeholder="Enter coupon code" value={couponCode} onChange={e=>setCouponCode(e.target.value)} />
          <button className="btn w-full sm:w-auto" type="button" onClick={applyCoupon}>Apply</button>
          {coupon && <button className="btn w-full sm:w-auto" type="button" onClick={()=>{ setCoupon(null); setCouponCode(''); }}>Remove</button>}
        </div>
        {coupon && <div className="text-success text-xs mt-2">Applied {coupon.code} • {discountPct}% off</div>}
      </div>

      <div className="card mt-3">
        <div className="section-title">Customer Details</div>
        <label className="flex flex-col gap-1 my-2"><span>Name *</span><input className="bg-[#111] border border-[#222] rounded-xl p-2" value={name} onChange={e=>setName(e.target.value)} />{!name.trim()&&<span className="text-error text-xs mt-1">Name is required</span>}</label>
        <label className="flex flex-col gap-1 my-2"><span>Phone Number *</span><input className="bg-[#111] border border-[#222] rounded-xl p-2" value={phone} onChange={e=>setPhone(e.target.value.replace(/[^\d]/g,''))} />{(phone&&phone.replace(/\D/g,"").length!==10)&&<span className="text-error text-xs mt-1">Enter 10-digit phone</span>}</label>
        <label className="flex flex-col gap-1 my-2"><span>Delivery Address *</span><textarea className="bg-[#111] border border-[#222] rounded-xl p-2 min-h-[80px]" value={address} onChange={e=>setAddress(e.target.value)} />{!address.trim()&&<span className="text-error text-xs mt-1">Address is required</span>}</label>
        <label className="flex flex-col gap-1 my-2"><span>Order Notes (optional)</span><textarea className="bg-[#111] border border-[#222] rounded-xl p-2 min-h-[60px]" value={note} onChange={e=>setNote(e.target.value)} placeholder="e.g., Please add less salt / ring the doorbell once" /></label>
        <div className="flex flex-col gap-2">
          <div>Share your exact location</div>
          <button className="btn w-full" onClick={capture}>Use my current location</button>
          <div className="text-success text-xs">{geo?"✓ Location captured":""}</div>
          {geoError && <div className="text-error text-xs">{geoError}</div>}
          {!geo && <label className="flex flex-col gap-1"><span>Paste a Google Maps link or enter coordinates *</span>
            <input className="bg-[#111] border border-[#222] rounded-xl p-2" value={manualLink} onChange={e=>setManualLink(e.target.value)} placeholder="Paste a map link or type 27.2348,94.1101" />
            {!isValidManualLink(manualLink) && <span className="text-error text-xs">Please enter your Google Maps link</span>}
            <button className="btn mt-2" type="button" onClick={resolveManual} disabled={resolving}>{resolving?"Calculating...":"Calculate Delivery Fee"}</button>
            {resolveMsg && <span className={`text-xs mt-1 ${resolveMsg.startsWith("✓")?"text-success":"text-error"}`}>{resolveMsg}{distance!=null?` • Distance: ${distance} km`:""}</span>}
          </label>}
        </div>
        <div className="text-muted text-xs mt-1">We use your location only for this order.</div>
      </div>

      <div className="card mt-3">
        <div className="section-title">PhonePe Payment</div>
        <label className="flex items-center gap-2 mt-1 text-sm">
          <input type="checkbox" className="w-4 h-4" checked={agree} onChange={e=>setAgree(e.target.checked)} />
          <span>I agree to the <a href="/terms" className="text-[#f5c84a] underline">Terms & Conditions</a></span>
        </label>
        {!deliveryAvailable && <div className="text-error text-xs mb-2">Delivery not available beyond 15 km</div>}
        {!canOrder && deliveryAvailable && <div className="text-error text-xs mb-2">Minimum order is ₹200 including delivery</div>}
        {!valid && <div className="text-error text-xs mb-2">Please fill in required details to pay</div>}
        <button className={`btn btn-primary w-full ${(!valid||paying)?'btn-disabled':''}`} onClick={payNow} disabled={!valid || paying}>{paying?'Starting…':`Pay ₹${grandTotal}`}</button>
        <div className="text-muted text-xs mt-2">You will be redirected to PhonePe to complete payment.</div>
      </div>
      <div className="mt-4 mb-6">
        <button className={`btn w-full btn-disabled`} disabled>Submit Order (enabled after payment)</button>
        <div className="text-muted text-xs mt-2">Complete PhonePe payment to submit your order.</div>
      </div>
    </section>
  );
}
