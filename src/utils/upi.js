export function buildUpiIntent(pa, am, pn, tn, tr){
  const params = new URLSearchParams();
  params.set("pa", pa);
  if(pn) params.set("pn", pn);
  if(am) params.set("am", String(am));
  params.set("cu", "INR");
  if(tn) params.set("tn", tn);
  if(tr) params.set("tr", tr);
  return `upi://pay?${params.toString()}`;
}
