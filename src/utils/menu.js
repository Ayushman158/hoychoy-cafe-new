import data from "../data/menu.json";
import { supabase } from "./supabase";
import { BACKEND_URL } from "../config.js";

const KEY = "hc_menu_overrides";

export function loadMenuOverrides(){
  try{ return JSON.parse(localStorage.getItem(KEY) || "{}"); }catch{ return {}; }
}

export function saveMenuOverrides(over){
  localStorage.setItem(KEY, JSON.stringify(over));
}

export function resetMenuOverrides(){
  localStorage.removeItem(KEY);
}

const REMOTE_KEY = "hc_menu_remote";
function loadRemote(){try{ return JSON.parse(localStorage.getItem(REMOTE_KEY)||"null"); }catch{ return null; }}
function saveRemote(menu){localStorage.setItem(REMOTE_KEY, JSON.stringify(menu));}

const OV_REMOTE_KEY = "hc_menu_backend_overrides";
export function loadBackendOverrides(){try{ return JSON.parse(localStorage.getItem(OV_REMOTE_KEY)||"null"); }catch{ return null; }}
export function saveBackendOverrides(v){localStorage.setItem(OV_REMOTE_KEY, JSON.stringify(v));}

export async function fetchBackendOverridesAndCache(){
  try{
    const res = await fetch(`${BACKEND_URL}/api/menu-overrides`);
    const data = await res.json();
    if(res.ok){
      saveBackendOverrides(data||{});
      if(typeof window !== 'undefined'){
        window.dispatchEvent(new CustomEvent('hc_menu_updated', { detail: data }));
      }
      return data||{};
    }
    return null;
  }catch{ return null; }
}

export async function fetchMenuRemoteAndCache(){
  try{
    if(!supabase) return null;
    const { data: itemsRes, error: itemsErr } = await supabase.from('menu_items').select('*');
    if(itemsErr) throw itemsErr;
    const items = (itemsRes||[]).map(r=>({ id:r.id, name:r.name, price:Number(r.price||0), veg:!!r.veg, category:r.category||'Misc', available:!!r.available }));
    const categories = Array.from(new Set(items.map(i=>i.category))).sort();
    const payload = { items, categories };
    saveRemote(payload);
    return payload;
  }catch(e){ return null; }
}

export function getBackendOverrides(){
  return loadBackendOverrides() || {};
}

export function getFeaturedIds(customOverrides){
  const over = customOverrides || loadBackendOverrides() || {};
  if(Array.isArray(over.featured) && over.featured.length > 0){
    return over.featured;
  }
  return null;
}

export function getOverriddenImages(customOverrides){
  const over = customOverrides || loadBackendOverrides() || {};
  return over.images || {};
}

export function getMenu(customOverrides){
  const remote = loadRemote();
  const base = remote || data;
  const overBackend = customOverrides || loadBackendOverrides() || {};
  const overLocal = loadMenuOverrides();

  // Combine removed IDs (backend takes priority, union with local)
  const backendRemoved = Array.isArray(overBackend.removed) ? overBackend.removed : [];
  const localRemoved = Array.isArray(overLocal.removed) ? overLocal.removed : [];
  const removedSet = new Set([...backendRemoved, ...localRemoved]);

  // Combine edited properties: local can override, but backend takes precedence if valid
  const backendEdited = (overBackend.edited && typeof overBackend.edited === 'object') ? overBackend.edited : {};
  const localEdited = (overLocal.edited && typeof overLocal.edited === 'object') ? overLocal.edited : {};
  const mergedEdited = { ...localEdited, ...backendEdited };

  // Combine added items
  const backendAdded = Array.isArray(overBackend.added) ? overBackend.added : [];
  const localAdded = Array.isArray(overLocal.added) ? overLocal.added : [];
  const addedMap = new Map();
  [...localAdded, ...backendAdded].forEach(it => {
    if(it && it.id && !removedSet.has(it.id)){
      addedMap.set(it.id, it);
    }
  });

  // Combine availability
  const backendAvail = (overBackend.availability && typeof overBackend.availability === 'object') ? overBackend.availability : {};
  const localAvail = (overLocal.availability && typeof overLocal.availability === 'object') ? overLocal.availability : {};
  const mergedAvail = { ...localAvail, ...backendAvail };

  // Images
  const images = (overBackend && typeof overBackend.images === 'object') ? overBackend.images : {};

  let items = (base.items||data.items)
    .filter(it => !removedSet.has(it.id))
    .map(it => mergedEdited[it.id] ? { ...it, ...mergedEdited[it.id] } : it)
    .map(it => mergedAvail[it.id] != null ? { ...it, available: !!mergedAvail[it.id] } : it)
    .map(it => ({
      ...it,
      image: mergedEdited[it.id]?.image || images[it.id] || it.image || null
    }));

  const processedAdded = Array.from(addedMap.values()).map(it => ({
    ...it,
    image: mergedEdited[it.id]?.image || images[it.id] || it.image || null
  }));

  items = items.concat(processedAdded);

  const addedCats = Array.from(addedMap.values()).map(a => a.category).filter(Boolean);
  const categories = Array.from(new Set([...(base.categories||data.categories||[]), ...addedCats])).sort();

  return { categories, items };
}

export function makeIdFromName(name){
  return name.toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 40);
}

