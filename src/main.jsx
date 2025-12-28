import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  window.__bip = e;
});

window.addEventListener('appinstalled', ()=>{ window.__bip = null; });
const rootEl = document.getElementById("root");
if(rootEl){
  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(()=>{});
  });
}
