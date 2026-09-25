import React, { useEffect, useState } from "react";
import { BACKEND_URL, OWNER_PHONE, MERCHANT_NAME } from "../config";

export default function PaymentStatus(){
  const [status,setStatus]=useState('PENDING');
  const [txnId,setTxnId]=useState('');
  const [error,setError]=useState('');
  const [autoSent,setAutoSent]=useState(false);
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get('merchantTransactionId');
  const localId = localStorage.getItem('pp_last_txn')||'';
  const id = fromQuery || localId;

  useEffect(()=>{
    async function check(){
      if(!id){setError('Missing transaction id');return;}
      try{
        // Try SDK order status first (merchantOrderId)
        let resp = await fetch(`${BACKEND_URL}/api/order-status/${id}`);
        let data = await resp.json();
        if(!resp.ok){
          // Fallback to REST payment status (merchantTransactionId)
          resp = await fetch(`${BACKEND_URL}/api/payment-status/${id}`);
          data = await resp.json();
          if(!resp.ok){ setError('Could not verify payment'); return; }
        }
        setStatus(data.status||'PENDING');
        setTxnId(data.transactionId||id);
        if(data.status==='SUCCESS' || data.status==='COMPLETED' || data.status==='PAID') localStorage.setItem('pp_paid','SUCCESS');
        else localStorage.setItem('pp_paid', data.status||'PENDING');
      }catch(e){setError('Network error while verifying payment');}
    }
    check();
  },[id]);

  useEffect(()=>{
    if(!autoSent && (status==='SUCCESS' || status==='COMPLETED' || status==='PAID')){
      sendWhatsapp();
      setAutoSent(true);
    }
  },[status]);

  async function sendWhatsapp(){
    const custRaw = localStorage.getItem('hc_cust');
    const cust = custRaw?JSON.parse(custRaw):null;
    if(!cust){alert('Order details missing');return;}
    const orderId = id;
    try{
      const items = (cust.items||[]).map(({item,qty})=>({id:item.id,name:item.name,qty,price:item.price}));
      await fetch(`${BACKEND_URL}/api/order`,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({orderId, transactionId: txnId || id, customer:{name:cust.name,phone:cust.phone,address:cust.address,note:cust.note||'',geo:cust.geo||null,manualLink:cust.manualLink||''}, items, total:(cust.grandTotal||cust.total)})
      });
    }catch{}
    const lines=[];
    lines.push(`🟢 *New Order - ${MERCHANT_NAME}*`);
    lines.push("");
    lines.push("📋 *Order Details:*");
    (cust.items||[]).forEach(({item,qty})=>lines.push(`• ${item.name} ×${qty} - ₹${item.price}`));
    lines.push("");
    lines.push(`💰 *Subtotal:* ₹${cust.total}`);
    if(cust.gst!=null) lines.push(`🧾 *GST (5%):* ₹${cust.gst}`);
    if(cust.deliveryFee!=null) lines.push(`🚚 *Delivery Fee:* ₹${cust.deliveryFee}`);
    lines.push(`💳 *Grand Total:* ₹${cust.grandTotal||cust.total}`);
    if(cust.note){ lines.push(""); lines.push(`📝 *Order Notes:* ${cust.note}`); }
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
    lines.push(`🆔 *PhonePe Transaction ID:* ${txnId}`);
    lines.push("✅ *Payment Status:* VERIFIED");
    lines.push("");
    lines.push(`🆔 *Order ID:* #${orderId}`);
    lines.push("---");
    const msg = lines.join("\n");
    // Use the number the owner set in the admin panel, not the one baked into the code.
    let storePhone = OWNER_PHONE;
    try{ storePhone = JSON.parse(localStorage.getItem("hc_menu_backend_overrides")||"{}")?.storeSettings?.contactPhone || OWNER_PHONE; }catch{}
    const url = `https://api.whatsapp.com/send?phone=${storePhone}&text=${encodeURIComponent(msg)}`;
    window.location.href = url;
  }

  return (
    <section className="max-w-[600px] mx-auto px-4">
      <div className="card mt-6">
        <div className="section-title">PhonePe Payment Status</div>
        {error && <div className="text-error">{error}</div>}
        {!error && (
          <div className="flex flex-col gap-2">
            <div className="row"><span>Status</span><span className="font-bold">{status}</span></div>
            <div className="row"><span>Transaction ID</span><span className="font-bold">{txnId || id}</span></div>
          </div>
        )}
        {(status==='SUCCESS' || status==='COMPLETED' || status==='PAID') && (
          <button className="btn btn-primary w-full mt-3" onClick={sendWhatsapp}>Submit Order</button>
        )}
        {status!=='SUCCESS' && !error && (
          <div className="text-muted text-xs mt-2">If payment shows pending, please wait a moment and refresh.</div>
        )}
      </div>
    </section>
  );
}
