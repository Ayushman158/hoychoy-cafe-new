function CheckCircleIcon(){
  return (
    <svg viewBox="0 0 24 24" className="w-10 h-10 mx-auto" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" className="text-primary"/>
      <path d="M9 12l2 2 4-4" className="text-primary"/>
    </svg>
  );
}
function UserIcon(){
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="8" r="4"/>
      <path d="M4 20c0-4 4-6 8-6s8 2 8 6"/>
    </svg>
  );
}
function PhoneIcon(){
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.07-8.64A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.8 12.8 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8 9c1.5 3 3.5 5 6 6l.36-.36a2 2 0 0 1 2.11-.45 12.8 12.8 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
    </svg>
  );
}
function MapPinIcon(){
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 10c0 6-9 12-9 12S3 16 3 10a9 9 0 1 1 18 0z"/>
      <circle cx="12" cy="10" r="3"/>
    </svg>
  );
}

import React from "react";
export default function Success({orderId,summary,onBack}){
  return (
    <section className="max-w-[600px] mx-auto px-4 pt-[calc(env(safe-area-inset-top)+8px)] md:pt-0">
      <div className="mt-5"><CheckCircleIcon /></div>
      <div className="text-center font-bold text-2xl mt-2">Order Placed Successfully</div>
      <div className="text-center text-muted text-sm mt-2">Payment will be verified automatically via PhonePe gateway. We’ll notify you when confirmed.</div>
      <div className="text-center mt-2">Order ID: <span className="text-primary font-bold">#{orderId}</span></div>
      <div className="card mt-4">
        <div className="section-title">Order Summary</div>
        <div className="flex flex-col gap-2">
          <div className="row"><span className="flex items-center gap-2"><UserIcon /><span>Name</span></span><span>{summary.name}</span></div>
          <div className="row"><span className="flex items-center gap-2"><PhoneIcon /><span>Phone</span></span><span>{summary.phone}</span></div>
          <div className="row"><span className="flex items-center gap-2"><MapPinIcon /><span>Delivery Address</span></span><span>{summary.address}</span></div>
        </div>
        <div className="border-t border-[#222] my-2"/>
        <ul className="flex flex-col gap-2">
          {summary.items.map(({item,qty})=> (
            <li key={item.id} className="row"><div>{item.name} × {qty}</div><div>₹{item.price}</div></li>
          ))}
        </ul>
        <div className="row font-bold mt-2"><span>Total Amount</span><span className="price">₹{summary.total}</span></div>
      </div>
      <button className="btn btn-primary w-full mb-6" onClick={onBack}>Back to Menu</button>
    </section>
  );
}
