import React, { useEffect } from "react";

export default function Splash({onContinue}){
  useEffect(()=>{
    const t=setTimeout(()=>onContinue(),1800);
    return ()=>clearTimeout(t);
  },[onContinue]);

  const glow = { textShadow: "0 0 22px rgba(245,200,74,0.6), 0 0 8px rgba(245,200,74,0.5)" };

  return (
    <section onClick={onContinue} className="min-h-screen w-full relative overflow-hidden flex flex-col items-center justify-center bg-[#0b0b0b] text-white">
      <style>{`
        @keyframes hcDot{0%{opacity:.3}50%{opacity:1}100%{opacity:.3}}
        @keyframes hcFade{0%{opacity:0; transform:translateY(8px) scale(.98)}100%{opacity:1; transform:translateY(0) scale(1)}}
        @keyframes hcShimmer{0%{background-position:-200px 0}100%{background-position:200px 0}}
        @media (prefers-reduced-motion: reduce){
          .hc-anim{animation:none}
        }
      `}</style>
      <div className="absolute inset-0 pointer-events-none" style={{background:"radial-gradient(800px circle at 20% 20%, rgba(245,200,74,0.08), transparent 60%), radial-gradient(600px circle at 80% 30%, rgba(245,200,74,0.06), transparent 55%)"}}/>
      <div className="text-center hc-anim" style={{animation:"hcFade 300ms ease-out"}}>
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

      <div className="mt-10 w-full max-w-[640px] px-6">
        <div className="text-[#bdbdbd] text-xs mb-2">Getting things ready…</div>
        <div className="grid grid-cols-1 gap-3">
          {[1,2,3].map((i)=> (
            <div key={i} className="rounded-xl overflow-hidden bg-[#111] border border-[#1d1d1d]">
              <div className="h-[70px]" style={{
                backgroundImage:"linear-gradient(90deg, rgba(255,255,255,0.04) 0, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 100%)",
                backgroundSize:"200px 100%",
                animation:"hcShimmer 1200ms linear infinite"
              }}></div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
