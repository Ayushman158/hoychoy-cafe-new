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
function loadBackendOverrides(){try{ return JSON.parse(localStorage.getItem(OV_REMOTE_KEY)||"null"); }catch{ return null; }}
function saveBackendOverrides(v){localStorage.setItem(OV_REMOTE_KEY, JSON.stringify(v));}

export async function fetchBackendOverridesAndCache(){
  try{
    const res = await fetch(`${BACKEND_URL}/api/menu-overrides`);
    const data = await res.json();
    if(res.ok){ saveBackendOverrides(data||{}); return data||{}; }
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

export function getMenu(){
  const remote = loadRemote();
  const base = remote || data;
  const overLocal = loadMenuOverrides();
  const overBackend = loadBackendOverrides() || {};
  const over = {
    removed: Array.isArray(overLocal.removed)?overLocal.removed:(Array.isArray(overBackend.removed)?overBackend.removed:[]),
    edited: (overLocal.edited && typeof overLocal.edited==='object')?overLocal.edited:(overBackend.edited||{}),
    added: Array.isArray(overLocal.added)&&overLocal.added.length?overLocal.added:(Array.isArray(overBackend.added)?overBackend.added:[]),
    availability: (overLocal.availability && typeof overLocal.availability==='object')?overLocal.availability:(overBackend.availability||{})
  };
  const removed = Array.isArray(over.removed) ? new Set(over.removed) : new Set();
  const edited = over.edited && typeof over.edited === "object" ? over.edited : {};
  const added = Array.isArray(over.added) ? over.added : [];
  const availability = over.availability && typeof over.availability === "object" ? over.availability : {};

  let items = (base.items||data.items)
    .filter(it => !removed.has(it.id))
    .map(it => edited[it.id] ? { ...it, ...edited[it.id] } : it)
    .map(it => availability[it.id] != null ? { ...it, available: !!availability[it.id] } : it);

  items = items.concat(added);

  const addedCats = added.map(a => a.category).filter(Boolean);
  const categories = Array.from(new Set([...(base.categories||data.categories||[]), ...addedCats]));

  return { categories, items };
}

export function makeIdFromName(name){
  return name.toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 40);
}
