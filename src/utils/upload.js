export async function uploadToFileIO(file){
  try{
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('https://file.io', { method: 'POST', body: fd });
    if(!res.ok) return null;
    const data = await res.json();
    return data?.link || null;
  }catch(e){
    return null;
  }
}
