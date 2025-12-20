import React from "react";

export default function About({onBack}){
  return (
    <main className="max-w-[600px] mx-auto px-4 pb-6 pt-[calc(env(safe-area-inset-top)+8px)] md:pt-6">
      <button className="chip" onClick={onBack}>← Back to Menu</button>
      <h1 className="text-3xl font-extrabold mt-4">
        <span>Hoy</span>
        <span className="text-[#f5c84a]" style={{textShadow:"0 0 22px rgba(245,200,74,0.6), 0 0 8px rgba(245,200,74,0.5)"}}>Choy</span>
        <span> Café</span>
      </h1>
      <div className="mt-2 text-[#cfcfcf]">Savor the fusion of flavors in the heart of Sarupathar.</div>

      <div className="mt-4 bg-[#0f0f0f] border border-[#222] rounded-2xl p-4 flex flex-col gap-3">
        <p>Welcome to HOYCHOY CAFÉ, the heart of Sarupathar.</p>
        <p>Located Near Railway Gate, Sarupathar (Pin: 785601), our café was born from a simple dream: to create a cozy space where people can enjoy great food, warm conversations, and unforgettable moments.</p>
        <p>Every dish we serve carries passion, creativity, and a touch of Axomiya hospitality. From comforting classics to our signature experiments, HoyChoy Café is built to make you feel at home the moment you walk in.</p>
        <p>What started small is now a place loved by many, all because of your endless support.</p>
        <p className="font-semibold text-white">HoyChoy Café: A dream turned into a destination.</p>
      </div>

      <div className="mt-4 bg-[#0f0f0f] border border-[#222] rounded-2xl p-4">
        <ul className="flex flex-col gap-3 text-[#cfcfcf]">
          <li className="flex items-start gap-3">
            <span>📍</span>
            <div>
              <div className="text-white font-semibold">Address</div>
              <div>Near Railway Gate, Sarupathar – 785601</div>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <span>📞</span>
            <div>
              <div className="text-white font-semibold">For Queries</div>
              <div>+91 86388 64806</div>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <span>✉️</span>
            <div>
              <div className="text-white font-semibold">Email</div>
              <div><a href="mailto:hoychoycafe@gmail.com" className="hover:text-white">hoychoycafe@gmail.com</a></div>
            </div>
          </li>
        </ul>
      </div>
    </main>
  );
}
