import React, { useEffect } from "react";

export default function Splash({onContinue}){
  useEffect(()=>{
    const t=setTimeout(()=>onContinue(),1800);
    return ()=>clearTimeout(t);
  },[onContinue]);

  const glow = { textShadow: "0 0 22px rgba(245,200,74,0.6), 0 0 8px rgba(245,200,74,0.5)" };

  return (
    <section onClick={onContinue} className="min-h-screen w-full relative overflow-hidden flex flex-col items-center justify-center bg-[#0b0b0b] text-white">
      <style>{`@keyframes hcDot{0%{opacity:.3}50%{opacity:1}100%{opacity:.3}}`}</style>
      <div className="absolute inset-0 pointer-events-none" style={{background:"radial-gradient(800px circle at 20% 20%, rgba(245,200,74,0.08), transparent 60%), radial-gradient(600px circle at 80% 30%, rgba(245,200,74,0.06), transparent 55%)"}}/>
      <div className="text-center">
        <div className="text-5xl md:text-6xl font-extrabold tracking-wide">
          <span className="text-white">Hoy</span>
          <span className="text-[#f5c84a]" style={glow}>Choy</span>
          <span className="text-white"> Café</span>
        </div>
        <div className="mt-3 text-sm md:text-base text-[#cfcfcf]">Golpo, Ghorua Flavour & Good Vibes</div>
      </div>

      <div className="mt-6 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-[#f5c84a]" style={{animation:"hcDot 1.2s infinite", animationDelay:"0s"}}></span>
        <span className="w-2 h-2 rounded-full bg-[#f5c84a]/70" style={{animation:"hcDot 1.2s infinite", animationDelay:"0.2s"}}></span>
        <span className="w-2 h-2 rounded-full bg-[#f5c84a]/50" style={{animation:"hcDot 1.2s infinite", animationDelay:"0.4s"}}></span>
      </div>
    </section>
  );
}
