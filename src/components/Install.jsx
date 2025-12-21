import React, { useEffect, useState } from "react";

export default function Install(){
  const [platform,setPlatform]=useState('unknown');
  const [canPrompt,setCanPrompt]=useState(false);

  useEffect(()=>{
    try{
      const ua = navigator.userAgent || "";
      const isiOS = /iPhone|iPad|iPod/.test(ua);
      const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
      const isAndroid = /Android/i.test(ua);
      if(isAndroid){ setPlatform('android'); }
      else if(isiOS && isSafari){ setPlatform('ios'); }
      else { setPlatform('desktop'); }
    }catch{ setPlatform('unknown'); }
  },[]);

  useEffect(()=>{
    const check=()=> setCanPrompt(!!window.__bip);
    check();
    const handler=(e)=>{ window.__bip=e; check(); };
    window.addEventListener('beforeinstallprompt', handler);
    return ()=> window.removeEventListener('beforeinstallprompt', handler);
  },[]);

  function install(){
    const bip = window.__bip;
    if(bip){ bip.prompt(); }
  }

  return (
    <section className="max-w-[600px] mx-auto px-4 pt-[calc(env(safe-area-inset-top)+8px)] md:pt-0 pb-10">
      <h1 className="text-2xl font-bold">Install HoyChoy Café</h1>
      <div className="text-[#cfcfcf] mt-1">Add the app to your home screen for quick access.</div>

      {platform==='android' && (
        <div className="card mt-4">
          <div className="section-title">Android</div>
          <div className="text-sm text-[#cfcfcf]">Install the PWA on Android.</div>
          <button className={`btn btn-primary w-full mt-3 ${canPrompt?'':'btn-disabled'}`} onClick={install} disabled={!canPrompt}>Install App</button>
          {!canPrompt && (
            <div className="text-xs text-[#bdbdbd] mt-2">If the button is disabled, use your browser menu: Install app / Add to Home Screen.</div>
          )}
        </div>
      )}

      {platform==='ios' && (
        <div className="card mt-4">
          <div className="section-title">iPhone / iPad</div>
          <div className="text-sm text-[#cfcfcf]">Install from Safari’s Share menu.</div>
          <ol className="list-decimal pl-5 mt-2 text-sm text-[#e5e5e5]">
            <li>Open this page in Safari</li>
            <li>Tap Share</li>
            <li>Select “Add to Home Screen”</li>
          </ol>
        </div>
      )}

      {platform!=='android' && platform!=='ios' && (
        <div className="card mt-4">
          <div className="section-title">Desktop</div>
          <div className="text-sm text-[#cfcfcf]">Use your browser’s install option (e.g., Install app or Create shortcut).</div>
        </div>
      )}

      <div className="mt-6 text-xs text-[#bdbdbd]">Tip: QR codes at the café link to this page for quick setup.</div>
    </section>
  );
}

