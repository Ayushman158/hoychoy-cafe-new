import React from "react";
import { OWNER_PHONE } from "../config.js";

export default function Footer(){
  const year = new Date().getFullYear();
  return (
    <footer className="max-w-[600px] mx-auto px-6 py-10 pb-24 text-sm">
      <div className="mb-6 flex items-center gap-2 text-white">
        <span className="text-lg font-extrabold">
          <span>Hoy</span>
          <span className="text-[#f5c84a]" style={{textShadow:"0 0 22px rgba(245,200,74,0.6), 0 0 8px rgba(245,200,74,0.5)"}}>Choy</span>
          <span> Café</span>
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 bg-[#0f0f0f] border border-[#222] rounded-2xl p-6">
        <div>
          <div className="font-semibold text-white mb-3">Policies</div>
          <ul className="flex flex-col gap-2 text-[#cfcfcf]">
            <li><a href="/privacy" className="hover:text-white">Privacy Policy</a></li>
            <li><a href="/terms" className="hover:text-white">Terms & Conditions</a></li>
            <li><a href="/refund" className="hover:text-white">Refund & Cancellation</a></li>
            <li><a href="/shipping" className="hover:text-white">Delivery / Shipping</a></li>
          </ul>
        </div>
        <div>
          <div className="font-semibold text-white mb-3">About</div>
          <ul className="flex flex-col gap-2 text-[#cfcfcf]">
            <li><a href="/about" className="hover:text-white">About HoyChoy Café</a></li>
          </ul>
        </div>
        <div>
          <div className="font-semibold text-white mb-3">Get in touch</div>
          <ul className="flex flex-col gap-2 text-[#cfcfcf]">
            <li><a href={`https://api.whatsapp.com/send?phone=${OWNER_PHONE}`} className="hover:text-white">WhatsApp</a></li>
            <li><a href="https://www.instagram.com/hoychoy_cafe/" target="_blank" rel="noreferrer" className="hover:text-white">Instagram</a></li>
            <li><a href="mailto:hoychoycafe@gmail.com" className="hover:text-white">Email</a></li>
            <li><a href="https://maps.google.com" target="_blank" rel="noreferrer" className="hover:text-white">Location</a></li>
          </ul>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between text-[#8f8f8f]">
        <span>© {year} HoyChoy Café</span>
        <div className="flex items-center gap-4">
          <a href="/terms" className="hover:text-white">Terms</a>
        </div>
      </div>
    </footer>
  );
}
