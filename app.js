const OWNER_PHONE="919876543210";
const UPI_ID="hoychoycafe@upi";

const state={menu:[],cart:{},filter:"all",category:"all",geo:null,orderId:null};

const el=(id)=>document.getElementById(id);

fetch("data/menu.json").then(r=>r.json()).then(data=>{state.menu=data.items;renderCategories(data.categories);renderMenu();restoreCart();updateTotals();setupUI();initQR();});

function renderCategories(cats){const wrap=el("categoryTabs");wrap.innerHTML="";const allBtn=document.createElement("button");allBtn.className="chip active";allBtn.textContent="All";allBtn.dataset.cat="all";wrap.appendChild(allBtn);cats.forEach(c=>{const b=document.createElement("button");b.className="chip";b.textContent=c;b.dataset.cat=c;wrap.appendChild(b);});wrap.addEventListener("click",(e)=>{const t=e.target.closest("button");if(!t)return;wrap.querySelectorAll(".chip").forEach(x=>x.classList.remove("active"));t.classList.add("active");state.category=t.dataset.cat;renderMenu();});}

function renderMenu(){const list=el("menuList");list.innerHTML="";const f=state.filter;const cat=state.category;state.menu.filter(m=>{const okF=f==="all"||(f==="veg"&&m.veg)||(f==="nonveg"&&!m.veg);const okC=cat==="all"||m.category===cat;return okF&&okC;}).forEach(item=>{const li=document.createElement("li");li.className="menu-item";const meta=document.createElement("div");meta.className="menu-meta";const title=document.createElement("div");title.className="menu-title";title.textContent=item.name;const price=document.createElement("div");price.className="menu-price";price.textContent=`₹${item.price}`;const stat=document.createElement("div");stat.className="status-dot";const dot=document.createElement("span");dot.className=`dot ${item.available?"available":"unavailable"}`;const label=document.createElement("span");label.textContent=item.available?"Available":"Out of Stock";stat.append(dot,label);meta.append(title,price,stat);
  const btn=document.createElement("button");btn.className="btn primary";btn.textContent=item.available?"Add":"Out";btn.disabled=!item.available;btn.addEventListener("click",()=>{addToCart(item.id);btn.textContent="✓ Added";setTimeout(()=>btn.textContent="Add",1000);});
  li.append(meta,btn);list.appendChild(li);});}

document.querySelector(".filters").addEventListener("click",(e)=>{const b=e.target.closest("button");if(!b)return;document.querySelectorAll(".filters .chip").forEach(x=>x.classList.remove("active"));b.classList.add("active");state.filter=b.dataset.filter;renderMenu();});

function addToCart(id){if(!state.cart[id])state.cart[id]=1;else state.cart[id]+=1;persistCart();updateTotals();}
function removeFromCart(id){if(!state.cart[id])return;state.cart[id]-=1;if(state.cart[id]<=0)delete state.cart[id];persistCart();updateTotals();renderCart();}
function persistCart(){localStorage.setItem("hc_cart",JSON.stringify(state.cart));}
function restoreCart(){const raw=localStorage.getItem("hc_cart");if(raw)state.cart=JSON.parse(raw);}
function cartItems(){return Object.entries(state.cart).map(([id,q])=>{const item=state.menu.find(x=>x.id===id);return {item,qty:q};}).filter(x=>x.item);}
function cartTotal(){return cartItems().reduce((s,x)=>s+x.item.price*x.qty,0);} 
function updateTotals(){const count=Object.values(state.cart).reduce((s,x)=>s+x,0);el("cartCount").textContent=count;el("menuTotal").textContent=`₹${cartTotal()}`;el("checkoutTotal").textContent=`₹${cartTotal()}`;const proceed=el("btnProceed");proceed.disabled=count===0;}

el("btnProceed").addEventListener("click",()=>{showView("checkout");renderCart();});
el("btnBackToMenu").addEventListener("click",()=>showView("menu"));
el("btnBackToMenu2").addEventListener("click",()=>showView("menu"));

function renderCart(){const ul=el("cartItems");ul.innerHTML="";cartItems().forEach(({item,qty})=>{const li=document.createElement("li");li.className="cart-row";const left=document.createElement("div");left.textContent=item.name;const right=document.createElement("div");right.className="qty";const dec=document.createElement("button");dec.className="step";dec.textContent="-";dec.addEventListener("click",()=>removeFromCart(item.id));const q=document.createElement("span");q.textContent=qty;const inc=document.createElement("button");inc.className="step";inc.textContent="+";inc.addEventListener("click",()=>{addToCart(item.id);renderCart();});const p=document.createElement("span");p.textContent=`₹${item.price}`;right.append(dec,q,inc,p);li.append(left,right);ul.appendChild(li);});updateTotals();}

function setupUI(){el("btnCopyUpi").addEventListener("click",()=>{navigator.clipboard.writeText(UPI_ID);});el("btnDownloadQR").addEventListener("click",downloadQR);el("custName").addEventListener("input",validateForm);el("custPhone").addEventListener("input",validateForm);el("custAddress").addEventListener("input",validateForm);el("txnLast6").addEventListener("input",validateForm);el("btnGeo").addEventListener("click",captureGeo);el("btnSubmit").addEventListener("click",openConfirm);el("btnGoBack").addEventListener("click",()=>showView("checkout"));el("btnConfirmOrder").addEventListener("click",submitWhatsApp);el("upiIdLabel").textContent=UPI_ID;}

function validateForm(){const name=el("custName").value.trim();const phone=el("custPhone").value.replace(/\D/g,"");const addr=el("custAddress").value.trim();const txn=el("txnLast6").value.trim();const valid=name&&phone.length===10&&addr&&/^\d{6}$/.test(txn);el("btnSubmit").disabled=!valid;}

function captureGeo(){el("geoStatus").textContent="";if(!navigator.geolocation){el("geoStatus").textContent="Location unavailable";return;}navigator.geolocation.getCurrentPosition((pos)=>{const {latitude,longitude}=pos.coords;state.geo={lat:latitude,lng:longitude};const link=`https://maps.google.com/?q=${latitude},${longitude}`;el("geoStatus").innerHTML=`✓ Location captured - Ready for accurate delivery!`;el("geoStatus").dataset.link=link;},(err)=>{el("geoStatus").textContent="Could not capture location";});}

function openConfirm(){el("cName").textContent=el("custName").value.trim();el("cPhone").textContent=el("custPhone").value.trim();el("cTotal").textContent=`₹${cartTotal()}`;showView("confirm");}

function submitWhatsApp(){const name=el("custName").value.trim();const phone=el("custPhone").value.trim();const addr=el("custAddress").value.trim();const txn=el("txnLast6").value.trim();const orderId=generateOrderId();state.orderId=orderId;const lines=[];lines.push("🟢 *New Order - HoyChoy Café*");lines.push("");lines.push("📋 *Order Details:*");cartItems().forEach(({item,qty})=>{lines.push(`• ${item.name} ×${qty} - ₹${item.price}`);});lines.push("");lines.push(`💰 *Total Amount:* ₹${cartTotal()}`);lines.push("");lines.push("👤 *Customer Details:*");lines.push(`Name: ${name}`);lines.push(`Phone: ${phone}`);lines.push("");lines.push("📍 *Delivery Address:*");lines.push(addr);lines.push("");lines.push("📌 *Exact Location:*");const glink=state.geo?`https://maps.google.com/?q=${state.geo.lat},${state.geo.lng}`:"Not shared";lines.push(glink);lines.push("(Tap to open in Maps)");lines.push("");lines.push("💳 *UPI Transaction:*");lines.push(`Last 6 digits: ${txn}`);lines.push("");lines.push(`🆔 *Order ID:* #${orderId}`);lines.push("---");lines.push("_Please verify payment and confirm order_");const message=lines.join("\n");const url=`https://wa.me/${OWNER_PHONE}?text=${encodeURIComponent(message)}`;window.open(url,"_blank");fillSuccess();showView("success");}

function fillSuccess(){el("successOrderId").textContent(`#${state.orderId}`);el("sName").textContent=el("custName").value.trim();el("sPhone").textContent=el("custPhone").value.trim();el("sAddress").textContent=el("custAddress").value.trim();const ul=el("sItems");ul.innerHTML="";cartItems().forEach(({item,qty})=>{const li=document.createElement("li");li.className="cart-row";li.append(Object.assign(document.createElement("div"),{textContent:`${item.name} × ${qty}`}),Object.assign(document.createElement("div"),{textContent:`₹${item.price}`}));ul.appendChild(li);});el("sTotal").textContent=`₹${cartTotal()}`;}

function showView(v){document.querySelectorAll(".view").forEach(x=>x.classList.add("hidden"));el(`view-${v}`).classList.remove("hidden");}

function generateOrderId(){const chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";let s="";for(let i=0;i<6;i++)s+=chars[Math.floor(Math.random()*chars.length)];return s;}

function initQR(){const cv=el("qrCanvas");const ctx=cv.getContext("2d");ctx.fillStyle="#fff";ctx.fillRect(0,0,cv.width,cv.height);ctx.fillStyle="#000";ctx.fillRect(14,14,cv.width-28,cv.height-28);ctx.fillStyle="#fff";ctx.fillRect(34,34,cv.width-68,cv.height-68);ctx.fillStyle="#000";ctx.font="14px system-ui";ctx.fillText("UPI QR", cv.width/2-30, cv.height/2-8);ctx.fillText("Scan to Pay", cv.width/2-45, cv.height/2+12);el("qrLabel").textContent=`Scan to Pay ₹${cartTotal()}`;}

function downloadQR(){const link=document.createElement("a");link.download="upi-qr.png";link.href=el("qrCanvas").toDataURL("image/png");link.click();}
