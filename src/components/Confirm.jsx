import React from "react";
function CheckCircleIcon(){
  return (
    <svg viewBox="0 0 24 24" className="w-8 h-8 mx-auto" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" className="text-primary"/>
      <path d="M9 12l2 2 4-4" className="text-primary"/>
    </svg>
  );
}

export default function Confirm({name,phone,total,onBack,onConfirm}){
  return (
    <section className="max-w-[600px] mx-auto px-4">
      <div className="card border-primary mt-8">
        <div className="text-center"><CheckCircleIcon /></div>
        <div className="text-center font-bold text-xl mt-2">Confirm Your Order?</div>
        <div className="flex flex-col gap-2 mt-3">
          <div className="row"><span>Name:</span><span>{name}</span></div>
          <div className="row"><span>Phone:</span><span>{phone}</span></div>
          <div className="row"><span>Total Amount:</span><span className="price">₹{total}</span></div>
        </div>
        <div className="flex gap-2 mt-3">
          <button className="btn" onClick={onBack}>Go Back</button>
          <button className="btn btn-primary" onClick={onConfirm}>Confirm Order</button>
        </div>
      </div>
    </section>
  );
}
