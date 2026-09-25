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
    // no-cache: revalidate every time, otherwise the 5s HTTP cache hides edits the admin just made.
    const res = await fetch(`${BACKEND_URL}/api/menu-overrides`, { cache: "no-cache" });
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

export function generateMenuCSV(items = [], featuredList = []) {
  const featSet = new Set(featuredList || []);
  const headers = ['id', 'name', 'category', 'price', 'veg', 'available', 'featured', 'image'];
  
  const escapeCsv = (val) => {
    if (val == null) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = [headers.join(',')];

  if (!items.length) {
    // Helpful template rows
    rows.push(['crispy_corn', 'Crispy Corn Salt & Pepper', 'Appetizers (Veg)', '180', 'true', 'true', 'false', ''].map(escapeCsv).join(','));
    rows.push(['chicken_lollipop_4', 'Chicken Lollipop (4 pcs)', 'Appetizers (Non-Veg)', '220', 'false', 'true', 'true', ''].map(escapeCsv).join(','));
    rows.push(['cold_coffee', 'Cold Coffee with Ice Cream', 'Beverages', '120', 'true', 'true', 'false', ''].map(escapeCsv).join(','));
  } else {
    items.forEach(it => {
      const isFeat = featSet.has(it.id);
      const row = [
        it.id || '',
        it.name || '',
        it.category || 'Misc',
        it.price != null ? it.price : 0,
        it.veg ? 'true' : 'false',
        it.available !== false ? 'true' : 'false',
        isFeat ? 'true' : 'false',
        it.image || ''
      ];
      rows.push(row.map(escapeCsv).join(','));
    });
  }

  return rows.join('\r\n');
}

export function downloadCSV(content, filename = 'hoychoy_menu.csv') {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function parseMenuCSV(text) {
  if (!text || !text.trim()) {
    return { error: 'The uploaded CSV file is empty.', items: [], errors: [] };
  }

  const lines = [];
  let currentRow = [];
  let currentVal = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          currentVal += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        currentVal += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentVal.trim());
        currentVal = '';
      } else if (char === '\r') {
        if (nextChar === '\n') i++;
        currentRow.push(currentVal.trim());
        if (currentRow.some(c => c !== '')) lines.push(currentRow);
        currentRow = [];
        currentVal = '';
      } else if (char === '\n') {
        currentRow.push(currentVal.trim());
        if (currentRow.some(c => c !== '')) lines.push(currentRow);
        currentRow = [];
        currentVal = '';
      } else {
        currentVal += char;
      }
    }
  }

  if (currentVal || currentRow.length > 0) {
    currentRow.push(currentVal.trim());
    if (currentRow.some(c => c !== '')) lines.push(currentRow);
  }

  if (lines.length < 2) {
    return { error: 'CSV file must contain a header row and at least one item row.', items: [], errors: [] };
  }

  const rawHeaders = lines[0].map(h => h.toLowerCase().replace(/[\s_-]+/g, ''));
  const findHeaderIdx = (patterns) => {
    return rawHeaders.findIndex(h => patterns.some(p => h === p || h.includes(p)));
  };

  const nameIdx = findHeaderIdx(['name', 'dish', 'itemname', 'title']);
  const priceIdx = findHeaderIdx(['price', 'rate', 'cost', 'amount']);
  const catIdx = findHeaderIdx(['category', 'cat', 'section', 'group']);
  const idIdx = findHeaderIdx(['id', 'itemid', 'code', 'slug']);
  const vegIdx = findHeaderIdx(['veg', 'isveg', 'vegetarian', 'diet']);
  const availIdx = findHeaderIdx(['available', 'instock', 'stock', 'isavailable']);
  const featIdx = findHeaderIdx(['featured', 'spotlight', 'showcase', 'highlight']);
  const imgIdx = findHeaderIdx(['image', 'photo', 'img', 'picture', 'url']);

  if (nameIdx === -1) {
    return { error: 'Could not find a "name" or "dish" column in CSV headers.', items: [], errors: [] };
  }

  const items = [];
  const errors = [];
  const usedIds = new Set();

  for (let r = 1; r < lines.length; r++) {
    const row = lines[r];
    const rawName = (nameIdx !== -1 && row[nameIdx] != null ? row[nameIdx] : '').trim();
    if (!rawName) continue; // skip blank name row

    const rawPrice = (priceIdx !== -1 && row[priceIdx] != null ? row[priceIdx] : '0').trim();
    const cleanPriceStr = rawPrice.replace(/[^0-9.]/g, '');
    const parsedPrice = parseFloat(cleanPriceStr);
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      errors.push(`Row ${r + 1}: Invalid price "${rawPrice}" for dish "${rawName}".`);
      continue;
    }

    let rawId = (idIdx !== -1 && row[idIdx] != null ? row[idIdx] : '').trim();
    if (!rawId) {
      rawId = makeIdFromName(rawName);
    }
    // Ensure unique ID within batch
    let finalId = rawId;
    let counter = 1;
    while (usedIds.has(finalId)) {
      finalId = `${rawId}_${counter++}`;
    }
    usedIds.add(finalId);

    const rawCat = (catIdx !== -1 && row[catIdx] != null ? row[catIdx] : '').trim() || 'Misc';
    
    // Veg parsing: default false unless matches true, 1, yes, y, veg, vegetarian
    const rawVeg = (vegIdx !== -1 && row[vegIdx] != null ? row[vegIdx] : '').toLowerCase().trim();
    const isVeg = ['true', '1', 'yes', 'y', 'veg', 'vegetarian'].includes(rawVeg);

    // Available parsing: default true unless matches false, 0, no, out
    const rawAvail = (availIdx !== -1 && row[availIdx] != null ? row[availIdx] : '').toLowerCase().trim();
    const isAvail = rawAvail === '' ? true : !['false', '0', 'no', 'out', 'outofstock'].includes(rawAvail);

    // Featured parsing: default false unless matches true, 1, yes, y, featured, spotlight
    const rawFeat = (featIdx !== -1 && row[featIdx] != null ? row[featIdx] : '').toLowerCase().trim();
    const isFeat = ['true', '1', 'yes', 'y', 'featured', 'spotlight'].includes(rawFeat);

    // Image parsing
    const rawImg = (imgIdx !== -1 && row[imgIdx] != null ? row[imgIdx] : '').trim();

    items.push({
      id: finalId,
      name: rawName,
      category: rawCat,
      price: parsedPrice,
      veg: isVeg,
      available: isAvail,
      featured: isFeat,
      image: rawImg
    });
  }

  return { items, errors };
}


