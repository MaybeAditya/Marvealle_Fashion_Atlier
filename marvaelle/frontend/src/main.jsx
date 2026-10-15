import React,{createContext,useCallback,useContext,useEffect,useMemo,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter,useLocation,useNavigate,Link} from 'react-router-dom';
import {Menu,Search,ShoppingBag,UserRound,ArrowRight,Plus,Minus,Trash2,ChevronLeft,ChevronRight,Mail,MapPin,X,LogOut,Package,ShieldCheck,AlertCircle,CheckCircle2,Info as InfoIcon} from 'lucide-react';
import {products,money} from './data';
import {api,loadRazorpay} from './api';
import './styles.css';


const ModalContext=createContext(null);
function ModalProvider({children}){
  const [modal,setModal]=useState(null);
  const dialogRef=useRef(null);
  const showModal=useCallback((message,options={})=>setModal({
    title:options.title||'A note from Marvaelle',
    message:String(message||'Please try again.'),
    tone:['success','info','error'].includes(options.tone)?options.tone:'error',
    confirmLabel:options.confirmLabel||'Understood'
  }),[]);
  const closeModal=useCallback(()=>setModal(null),[]);
  useEffect(()=>{
    if(!modal)return undefined;
    const previousFocus=document.activeElement;
    const previousOverflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    const focusableSelector='button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
    const focusable=()=>Array.from(dialogRef.current?.querySelectorAll(focusableSelector)||[]).filter(element=>!element.hasAttribute('hidden'));
    const firstFocusable=focusable()[0];
    firstFocusable?.focus();
    const onKeyDown=event=>{
      if(event.key==='Escape'){closeModal();return;}
      if(event.key!=='Tab')return;
      const items=focusable();
      if(!items.length){event.preventDefault();return;}
      const first=items[0],last=items[items.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    };
    window.addEventListener('keydown',onKeyDown);
    return ()=>{
      window.removeEventListener('keydown',onKeyDown);
      document.body.style.overflow=previousOverflow;
      if(previousFocus instanceof HTMLElement&&previousFocus.isConnected)previousFocus.focus();
    };
  },[modal,closeModal]);
  const Icon=modal?.tone==='success'?CheckCircle2:modal?.tone==='info'?InfoIcon:AlertCircle;
  return <ModalContext.Provider value={{showModal}}>{children}{modal&&<div className="modal-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)closeModal()}}><section ref={dialogRef} className="notice-modal" role="alertdialog" aria-modal="true" aria-labelledby="notice-modal-title" aria-describedby="notice-modal-message"><button className="notice-modal-close" type="button" onClick={closeModal} aria-label="Close dialog"><X size={18}/></button><div className={'notice-modal-icon '+modal.tone}><Icon size={22}/></div><p className="eyebrow">Édition de Marvaelle</p><h2 id="notice-modal-title">{modal.title}</h2><p id="notice-modal-message">{modal.message}</p><button type="button" className="button dark-button full" onClick={closeModal}>{modal.confirmLabel}</button></section></div>}</ModalContext.Provider>;
}
function useModal(){const context=useContext(ModalContext);if(!context)throw new Error('useModal must be used inside ModalProvider');return context;}

const cartKey='marvaelle_cart';
const pendingPaymentKey='marvaelle_pending_payment';
const productSlug=name=>String(name||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');

// PostgreSQL is the source of truth for availability. The product catalogue keeps
// descriptive data and prices; /api/products supplies live quantities by product ID.
const InventoryContext=createContext(null);
function InventoryProvider({children}){
  const [stockById,setStockById]=useState(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');

  const refreshInventory=useCallback(async()=>{
    setLoading(true);
    try{
      const result=await api('/api/products');
      if(!result||typeof result!=='object'||Array.isArray(result)){
        throw new Error('The inventory endpoint returned an unexpected response.');
      }
      const normalized={};
      for(const [id,value] of Object.entries(result)){
        const quantity=Number(value);
        if(!Number.isFinite(quantity)||quantity<0){
          throw new Error('The inventory endpoint returned an invalid quantity.');
        }
        normalized[String(id)]=Math.floor(quantity);
      }
      setStockById(normalized);
      setError('');
      return true;
    }catch(err){
      // Keep the last successful snapshot (or local defaults on first load), but
      // visibly warn operators/customers that displayed stock may be stale.
      setError(err?.message||'Live inventory could not be loaded.');
      return false;
    }finally{
      setLoading(false);
    }
  },[]);

  useEffect(()=>{void refreshInventory()},[refreshInventory]);
  const inventoryProducts=useMemo(()=>products.map(product=>{
    if(stockById===null) return product;
    const liveQuantity=stockById[String(product.id)];
    // A missing product_stock row means no sellable inventory for that product.
    return {...product,stock:Number.isFinite(liveQuantity)?Math.max(0,liveQuantity):0};
  }),[stockById]);

  return <InventoryContext.Provider value={{products:inventoryProducts,loading,error,refreshInventory}}>{children}</InventoryContext.Provider>;
}
function useInventory(){
  const value=useContext(InventoryContext);
  if(!value) throw new Error('useInventory must be used inside InventoryProvider');
  return value;
}
function InventoryNotice(){
  const {loading,error,refreshInventory}=useInventory();
  if(!loading&&!error) return null;
  return <div className={'inventory-notice '+(error?'inventory-notice-error':'')} role="status">
    <span>{error?'Live stock could not be synchronized. Displayed availability may be outdated.':'Checking live product availability…'}</span>
    {error&&<button type="button" onClick={()=>void refreshInventory()} disabled={loading}>Retry</button>}
  </div>;
}
const getCart=()=>{try{const value=JSON.parse(localStorage.getItem(cartKey)||'[]');if(!Array.isArray(value))return [];return value.filter(item=>item&&item.id!==undefined&&item.id!==null).map(item=>({...item,id:String(item.id),size:String(item.size||'M'),color:String(item.color||(products.find(product=>String(product.id)===String(item.id))?.colors?.[0]?.name)||'As shown'),quantity:Math.max(1,Math.floor(Number(item.quantity)||1)),price:Number.isFinite(Number(item.price))?Number(item.price):0}));}catch{return [];}};
const saveCart=c=>{localStorage.setItem(cartKey,JSON.stringify(c)); window.dispatchEvent(new Event('cartchange'));};
const addToCart=(p,qty=1,size='M',color='As shown')=>{if(!p||p.archived||!Number.isInteger(qty)||qty<1||p.stock<1)throw new Error('This piece is not currently available.');const selectedColor=String(color||'As shown');const selectedSize=String(size||'M');const c=getCart();const i=c.findIndex(x=>String(x.id)===String(p.id)&&x.size===selectedSize&&x.color===selectedColor);const current=i>=0?Number(c[i].quantity)||0:0;const next=Math.min(current+qty,p.stock);if(next<1)throw new Error('This piece is not currently available.');if(i>=0)c[i]={...c[i],id:String(p.id),name:p.name,price:p.price,quantity:next,size:selectedSize,color:selectedColor,image:p.image};else c.push({id:String(p.id),name:p.name,price:p.price,quantity:Math.min(qty,p.stock),size:selectedSize,color:selectedColor,image:p.image});saveCart(c)};
const removeFromCart=(id,size,color='As shown')=>saveCart(getCart().filter(x=>!(String(x.id)===String(id)&&x.size===size&&x.color===String(color||'As shown'))));
function useCart(){const [cart,setCart]=useState(getCart());useEffect(()=>{const f=()=>setCart(getCart());window.addEventListener('cartchange',f);return()=>window.removeEventListener('cartchange',f)},[]);return [cart,(c)=>saveCart(c)]}

function Header(){const [open,setOpen]=useState(false);const [cart]=useCart();const nav=useNavigate();const totalQty=cart.reduce((a,b)=>a+b.quantity,0);return <><header className="header"><div className="header-inner"><button className="icon mobile" onClick={()=>setOpen(!open)}><Menu size={20}/></button><Link to="/" className="brand">ÉDITION DE MARVAELLE</Link><nav className={open?'nav open':'nav'}><Link to="/collection/men" onClick={()=>setOpen(false)}>Men</Link><Link to="/collection/women" onClick={()=>setOpen(false)}>Women</Link><Link to="/about" onClick={()=>setOpen(false)}>Journal</Link></nav><div className="header-actions"><Link className="icon desktop" to="/search"><Search size={18}/></Link><Link className="icon" to="/account"><UserRound size={18}/></Link><Link className="bag" to="/cart"><ShoppingBag size={18}/><span>{totalQty}</span></Link></div></div></header></>}
function Footer(){
  const {showModal}=useModal();
  const [email,setEmail]=useState('');
  const [busy,setBusy]=useState(false);
  const submitNewsletter=async event=>{
    event.preventDefault();
    if(busy)return;
    const normalizedEmail=email.trim().toLowerCase();
    if(!normalizedEmail){showModal('Enter your email address to join the Marvaelle release list.',{title:'Email address required'});return;}
    setBusy(true);
    try{
      await api('/api/newsletter/subscribe',{method:'POST',body:JSON.stringify({email:normalizedEmail})});
      setEmail('');
      showModal('Thank you for joining us. Your email has been saved to the Marvaelle release list.',{title:'You’re on the list',tone:'success',confirmLabel:'Lovely'});
    }catch(error){
      showModal(error?.message||'We could not save your subscription just now. Please try again.',{title:'Subscription could not be saved'});
    }finally{setBusy(false);}
  };
  return <footer className="footer"><div className="footer-grid"><div><div className="brand footer-brand">ÉDITION DE MARVAELLE</div><p className="muted">Objects for a considered wardrobe.<br/>Designed in small editions.</p></div><div><p className="eyebrow">Explore</p><Link to="/collection/men">Men</Link><Link to="/collection/women">Women</Link><Link to="/about">The Atelier</Link></div><div><p className="eyebrow">Client service</p><Link to="/shipping">Shipping</Link><Link to="/refunds">Returns</Link><Link to="/contact">Contact</Link></div><div><p className="eyebrow">Stay close</p><p className="muted">Private releases, studio notes and new arrivals.</p><form className="newsletter" onSubmit={submitNewsletter} aria-label="Join the Marvaelle email list"><label className="sr-only" htmlFor="newsletter-email">Email address</label><input id="newsletter-email" type="email" name="email" autoComplete="email" maxLength={254} placeholder="Email address" value={email} onChange={event=>setEmail(event.target.value)} required aria-describedby="newsletter-note"/><button type="submit" disabled={busy} aria-label="Join the email list" title={busy?'Saving subscription':'Join the email list'}><ArrowRight size={17}/></button></form><p id="newsletter-note" className="newsletter-note" aria-live="polite">{busy?'Adding your email…':'Occasional notes, only when there is something worth sharing.'}</p></div></div><div className="footer-bottom"><span>© 2026 Édition de Marvaelle</span><span>Made for the long term.</span></div></footer>;
}
function Layout({children}){return <><Header/><InventoryNotice/><main>{children}</main><Footer/></>}
function ProductCard({p}){
  const archived=Boolean(p.archived);
  const tag=archived?'ARCHIVE':p.stock<1?'SOLD OUT':null;
  return <Link to={`/product/${encodeURIComponent(p.id)}`} className={'product-card '+(archived?'archived':'')} aria-label={`View ${p.name}`}>
    <div className="product-image">{tag&&<span className="tag">{tag}</span>}<img src={p.image} alt={p.name}/><div className="quick">{archived?'Archived':p.stock>0?'View piece':'View details'} <ArrowRight size={14}/></div></div>
    <div className="product-meta"><div><h3>{p.name}</h3><p>{archived?'Archive':p.stock>0?`${p.category} · ${p.stock} in stock`:`${p.category} · currently unavailable`}</p></div><strong>{money(p.price)}</strong></div>
  </Link>;
}
function Home(){const {products:liveProducts}=useInventory();const featured=liveProducts.filter(p=>!p.archived).slice(0,4);return <Layout><section className="hero"><img src="/images/hero-background.jpg"/><div className="hero-overlay"/><div className="hero-content"><p className="eyebrow light">Edition 01 / 2026</p><h1>Quiet forms.<br/><em>Strong presence.</em></h1><p>Modern tailoring and tactile materials, made in considered editions.</p><Link className="button light-button" to="/collection/women">Explore the collection <ArrowRight size={16}/></Link></div><div className="hero-caption">The new atelier collection</div></section><section className="intro section"><div className="intro-copy"><p className="eyebrow">The Marvaelle approach</p><h2>Clothing with an architectural point of view.</h2></div><p className="lead">We make fewer pieces, with more intention. Sculptural silhouettes, natural textures and a restrained palette built to move between seasons.</p></section><section className="section collection-preview"><div className="section-head"><div><p className="eyebrow">Selected pieces</p><h2>Current collection</h2></div><Link className="text-link" to="/collection/women">View all <ArrowRight size={15}/></Link></div><div className="product-grid">{featured.map(p=><ProductCard key={p.id} p={p}/>)}</div></section><section className="editorial"><div className="editorial-copy"><p className="eyebrow">Material study / 01</p><h2>Texture is the first language.</h2><p>Raw jute, crushed silk, Italian wool and wide-wale corduroy — materials chosen for how they age, not how they photograph on day one.</p><Link className="text-link light-link" to="/about">Read our journal <ArrowRight size={15}/></Link></div></section></Layout>}
function Collection({category}){const {products:liveProducts}=useInventory();const [showArchive,setShowArchive]=useState(false);const list=liveProducts.filter(p=>p.category===category&&(showArchive||!p.archived));return <Layout><section className="collection-hero"><p className="eyebrow">Edition / 2026</p><h1>{category==='men'?'Men':'Women'}’s collection</h1><p>{category==='men'?'Structured tailoring, soft knits and precise proportion.':'Fluid silk, sculptural layers and tactile outerwear.'}</p></section><section className="section"><div className="toolbar"><span>{list.length} pieces</span><button className="filter" onClick={()=>setShowArchive(!showArchive)}>{showArchive?'Hide archive':'Include archive'}</button></div><div className="product-grid">{list.map(p=><ProductCard key={p.id} p={p}/>)}</div></section></Layout>}
function ProductPage(){
  // This app uses a pathname switch in App rather than <Routes>/<Route>, so
  // useParams() is empty here. Read the product key from the actual URL path.
  const location=useLocation();
  const {products:liveProducts}=useInventory();
  const encodedKey=location.pathname.startsWith('/product/')?location.pathname.slice('/product/'.length):'';
  let routeKey=encodedKey;
  try{routeKey=decodeURIComponent(encodedKey)}catch{}
  const p=liveProducts.find(product=>String(product.id)===routeKey)
    ||liveProducts.find(product=>productSlug(product.name)===productSlug(routeKey));
  const [active,setActive]=useState(0);
  const [size,setSize]=useState('M');
  const [qty,setQty]=useState(1);
  const [selectedColor,setSelectedColor]=useState('');
  const nav=useNavigate();
  const {showModal}=useModal();
  useEffect(()=>{setActive(0);setSize('M');setQty(1);setSelectedColor('')},[location.pathname]);
  const colors=p?.colors?.length?p.colors:(p?[{name:p.color||'As shown',hex:'#d8d2c6'}]:[]);
  const color=colors.find(option=>option.name===selectedColor)?.name||colors[0]?.name||'As shown';
  if(!p)return <Layout><Empty title="Piece not found" text={`We could not match “${routeKey||'this address'}” to a catalogue item. Try opening it from the collection again.`} action="Return to collection" href="/collection/women"/></Layout>;
  const archived=Boolean(p.archived);
  const available=!archived&&p.stock>0;
  const add=()=>{try{addToCart(p,qty,size,color);nav('/cart')}catch(error){showModal(error.message,{title:'Unable to add this piece'})}};
  return <Layout><div className="product-page section"><div className="gallery"><div className="thumbs">{(p.images||[p.image]).map((im,i)=><button type="button" className={i===active?'active':''} onClick={()=>setActive(i)} key={im}><img src={im} alt={`${p.name} view ${i+1}`}/></button>)}</div><div className="main-image"><img src={(p.images||[p.image])[active]||p.image} alt={p.name}/></div></div><div className="product-detail"><p className="eyebrow">{p.category} / Marvaelle</p><h1>{p.name}</h1><div className="detail-price">{money(p.price)}</div><p className="inventory-availability">{archived?'Archived collection piece':p.stock>0?`${p.stock} piece${p.stock===1?'':'s'} currently available`:'Currently sold out'}</p><p className="description">{p.description||'A considered piece from the Marvaelle collection.'}</p><div className="rule"/><p className="label">Size</p><div className="sizes" role="group" aria-label="Choose a size">{['XS','S','M','L','XL'].map(s=><button type="button" className={size===s?'selected':''} aria-pressed={size===s} onClick={()=>setSize(s)} key={s}>{s}</button>)}</div><div className="colour-picker"><p className="label">Colour <span className="selected-colour">— {color}</span></p><div className="colour-options" role="group" aria-label="Choose a colour">{colors.map(option=><button type="button" key={option.name} className={'colour-option '+(color===option.name?'selected':'')} aria-pressed={color===option.name} onClick={()=>setSelectedColor(option.name)}><span className="colour-swatch" style={{backgroundColor:option.hex||'#d8d2c6'}}/><span>{option.name}</span></button>)}</div></div><div className="purchase-row"><div className="quantity"><button type="button" aria-label="Decrease quantity" disabled={!available||qty<=1} onClick={()=>setQty(Math.max(1,qty-1))}><Minus size={14}/></button><span>{qty}</span><button type="button" aria-label="Increase quantity" disabled={!available||qty>=p.stock} onClick={()=>setQty(Math.min(p.stock,qty+1))}><Plus size={14}/></button></div><button type="button" disabled={!available} className="button dark-button" onClick={add}>{archived?'Archived':p.stock>0?'Add to bag':'Sold out'} <ShoppingBag size={16}/></button></div><div className="service-notes"><div><ShieldCheck size={17}/><span>Secure checkout</span></div><div><Package size={17}/><span>Complimentary shipping</span></div><div><Mail size={17}/><span>Private client support</span></div></div></div></div></Layout>;
}
function Cart(){
  const [cart,setCart]=useCart();
  const {products:catalog}=useInventory();
  const nav=useNavigate();
  const {showModal}=useModal();
  const byId=useMemo(()=>new Map(catalog.map(p=>[String(p.id),p])),[catalog]);
  const items=cart.map(item=>{
    const product=byId.get(String(item.id));
    return {...item,name:product?.name||item.name,price:product?.price??item.price,image:product?.image||item.image,stock:product?.stock??0,archived:!product||Boolean(product.archived)};
  });
  const total=items.reduce((sum,item)=>sum+(Number(item.price)||0)*(Number(item.quantity)||0),0);
  const unavailable=items.some(item=>item.archived||item.stock<1||item.quantity>item.stock);
  const changeQuantity=(item,delta)=>{
    const product=byId.get(String(item.id));
    if(!product||product.archived||product.stock<1)return;
    const next=Math.max(1,Math.min(product.stock,Number(item.quantity)+delta));
    setCart(cart.map(current=>String(current.id)===String(item.id)&&current.size===item.size&&current.color===item.color?{...current,quantity:next,name:product.name,price:product.price,image:product.image}:current));
  };
  if(!cart.length)return <Layout><Empty title="Your bag is empty" text="There is nothing here yet. Explore the current collection." action="Explore collection" href="/collection/women"/></Layout>;
  return <Layout><section className="section cart-page"><div className="page-title"><p className="eyebrow">Your selection</p><h1>Shopping bag</h1></div><div className="cart-layout"><div className="cart-items">{items.map(item=><div className="cart-item" key={item.id+item.size+item.color}><img src={item.image} alt={item.name}/><div className="cart-info"><div><p className="eyebrow">{item.size} / {item.color} / {item.quantity} piece{item.quantity>1?'s':''}</p><h3>{item.name}</h3><strong>{money(item.price)}</strong><p className="inventory-availability">{item.archived?'Archived or no longer listed':item.stock<1?'Sold out':item.quantity>item.stock?`Only ${item.stock} currently available`:`${item.stock} in stock`}</p></div><button type="button" className="remove" onClick={()=>removeFromCart(item.id,item.size,item.color)}><Trash2 size={15}/> Remove</button><div className="quantity"><button type="button" aria-label="Decrease quantity" disabled={item.archived||item.stock<1||item.quantity<=1} onClick={()=>changeQuantity(item,-1)}><Minus size={13}/></button><span>{item.quantity}</span><button type="button" aria-label="Increase quantity" disabled={item.archived||item.stock<1||item.quantity>=item.stock} onClick={()=>changeQuantity(item,1)}><Plus size={13}/></button></div></div></div>)}</div><aside className="summary"><p className="eyebrow">Summary</p><div className="summary-line"><span>Subtotal</span><strong>{money(total)}</strong></div><div className="summary-line"><span>Shipping</span><span>Complimentary</span></div><div className="rule"/><div className="summary-total"><span>Total</span><strong>{money(total)}</strong></div>{unavailable&&<p className="cart-warning" role="status">Remove archived or unavailable items, or reduce quantities to match stock, before checkout.</p>}<button type="button" disabled={unavailable} className="button dark-button full" onClick={()=>nav('/checkout')}>Continue to checkout <ArrowRight size={16}/></button><p className="micro">Taxes and delivery details are calculated at checkout.</p></aside></div></section></Layout>;
}
function Checkout(){
  const [cart]=useCart();
  const {products:catalog,refreshInventory}=useInventory();
  const [form,setForm]=useState({name:'',address:'',city:'',pincode:'',phone:''});
  const [busy,setBusy]=useState(false);
  const [pendingConfirmation,setPendingConfirmation]=useState(()=>{
    try{return JSON.parse(sessionStorage.getItem(pendingPaymentKey)||'null')}catch{return null}
  });
  const nav=useNavigate();
  const {showModal}=useModal();
  const byId=useMemo(()=>new Map(catalog.map(p=>[String(p.id),p])),[catalog]);
  const items=cart.map(item=>{
    const product=byId.get(String(item.id));
    return {...item,name:product?.name||item.name,price:product?.price??item.price,image:product?.image||item.image,stock:product?.stock??0,archived:!product||Boolean(product.archived)};
  });
  const total=items.reduce((sum,item)=>sum+(Number(item.price)||0)*(Number(item.quantity)||0),0);
  const unavailable=items.some(item=>item.archived||item.stock<1||item.quantity>item.stock);
  useEffect(()=>{
    if(pendingConfirmation?.shipping){
      setForm(current=>({...current,...pendingConfirmation.shipping}));
    }
  },[]);
  const change=e=>setForm(current=>({...current,[e.target.name]:e.target.value}));
  const confirmPayment=async pending=>{
    setBusy(true);
    try{
      const confirmation=await api('/api/orders/confirm',{method:'POST',body:JSON.stringify({payment_id:pending.payment_id,order_id:pending.order_id,signature:pending.signature,cart:pending.cart,shipping:pending.shipping})});
      if(!confirmation?.success)throw new Error('The server did not confirm the order.');
      sessionStorage.removeItem(pendingPaymentKey);
      localStorage.removeItem(cartKey);
      window.dispatchEvent(new Event('cartchange'));
      await refreshInventory();
      nav('/success',{replace:true});
    }catch(error){
      setPendingConfirmation(pending);
      sessionStorage.setItem(pendingPaymentKey,JSON.stringify(pending));
      showModal(`Payment may have succeeded, but order confirmation is still pending. Do not pay again yet. Payment reference: ${pending.payment_id}. Use “Retry order confirmation” to try again. Details: ${error.message}`,{title:'Payment confirmation pending',tone:'info',confirmLabel:'I understand'});
      setBusy(false);
    }
  };
  const pay=async()=>{
    if(busy)return;
    if(pendingConfirmation)return confirmPayment(pendingConfirmation);
    if(Object.values(form).some(value=>!String(value).trim())){showModal('Please complete your delivery details.',{title:'Delivery details required'});return;}
    if(!/^\d{4,10}$/.test(form.pincode.trim())){showModal('Please enter a valid pincode.',{title:'Check your pincode'});return;}
    if(!/^[+]?[-()\s\d]{8,16}$/.test(form.phone.trim())){showModal('Please enter a valid phone number.',{title:'Check your phone number'});return;}
    if(unavailable){showModal('Your bag contains an archived, sold-out, or over-stock item. Return to your bag and update it before paying.',{title:'Your bag needs attention'});nav('/cart');return;}
    setBusy(true);
    try{
      const key=(import.meta.env.VITE_RAZORPAY_KEY_ID||'').trim();
      if(!key)throw new Error('Razorpay is not configured on the storefront. Set VITE_RAZORPAY_KEY_ID and redeploy.');
      const loaded=await loadRazorpay();
      if(!loaded)throw new Error('Razorpay Checkout could not load. Check your connection and retry.');
      const order=await api('/api/orders/create',{method:'POST',body:JSON.stringify({items:cart.map(item=>({id:String(item.id),quantity:Number(item.quantity),size:String(item.size||'M'),color:String(item.color||'As shown')}))})});
      if(!order?.id||!Number.isInteger(Number(order.amount))||Number(order.amount)<=0)throw new Error('The payment server returned an invalid order. Please contact support.');
      let paymentCallbackStarted=false;
      const razorpay=new window.Razorpay({key,amount:order.amount,currency:order.currency||'INR',name:'Édition de Marvaelle',description:'Marvaelle collection',order_id:order.id,prefill:{name:form.name,contact:form.phone},theme:{color:'#11110f'},modal:{ondismiss:()=>{if(!paymentCallbackStarted)setBusy(false)}},handler:async response=>{
        paymentCallbackStarted=true;
        const pending={payment_id:response?.razorpay_payment_id,order_id:response?.razorpay_order_id,signature:response?.razorpay_signature,cart:cart.map(item=>({id:String(item.id),quantity:Number(item.quantity),size:String(item.size||'M'),color:String(item.color||'As shown')})),shipping:{...form}};
        if(!pending.payment_id||!pending.order_id||!pending.signature){setBusy(false);showModal('Razorpay returned an incomplete payment response. Check your payment status before trying again.',{title:'Payment status needs checking',tone:'info'});return;}
        setPendingConfirmation(pending);
        sessionStorage.setItem(pendingPaymentKey,JSON.stringify(pending));
        await confirmPayment(pending);
      }});
      razorpay.on('payment.failed',response=>{
        setBusy(false);
        const reason=response?.error?.description||response?.error?.reason||'The payment did not complete.';
        showModal(`Payment failed: ${reason}`,{title:'Payment was not completed'});
      });
      razorpay.open();
    }catch(error){const raw=error?.message||'Checkout could not be started. Please try again.';const message=raw.includes('Payments are not configured on the backend')?'The payment service is not configured on the backend yet. In the backend Vercel project, add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET using matching Razorpay test credentials, then redeploy the backend. Also set VITE_RAZORPAY_KEY_ID to that same Key ID in the frontend project and redeploy. Razorpay Checkout cannot open until the backend successfully creates an order.':raw;showModal(message,{title:'Checkout could not start'});setBusy(false);}
  };
  if(!cart.length)return <Layout><Empty title="Your bag is empty" action="Return to collection" href="/collection/women"/></Layout>;
  return <Layout><section className="section checkout"><div className="page-title"><p className="eyebrow">Final step</p><h1>Checkout</h1></div><div className="checkout-grid"><div className="form-panel"><p className="eyebrow">Delivery details</p><div className="form-grid"><Field name="name" label="Full name" value={form.name} onChange={change}/><Field name="phone" label="Phone" type="tel" value={form.phone} onChange={change}/><Field wide name="address" label="Address" value={form.address} onChange={change}/><Field name="city" label="City" value={form.city} onChange={change}/><Field name="pincode" label="Pincode" inputMode="numeric" value={form.pincode} onChange={change}/></div><div className="secure-note"><ShieldCheck size={17}/> Your payment is processed securely by Razorpay.</div>{pendingConfirmation&&<p className="cart-warning" role="status">A payment was returned by Razorpay, but order confirmation is pending. Retry confirmation before starting another payment.</p>}</div><aside className="summary"><p className="eyebrow">Order summary</p>{items.map(item=><div className="summary-line" key={item.id+item.size+item.color}><span>{item.name} · {item.size} · {item.color} × {item.quantity}</span><span>{money(item.price*item.quantity)}</span></div>)}<div className="rule"/><div className="summary-total"><span>Total</span><strong>{money(total)}</strong></div>{unavailable&&!pendingConfirmation&&<p className="cart-warning" role="status">One or more items are unavailable. Update your bag before paying.</p>}<button type="button" disabled={busy||(!pendingConfirmation&&unavailable)} className="button dark-button full" onClick={pay}>{busy?(pendingConfirmation?'Confirming order…':'Opening secure checkout…'):pendingConfirmation?'Retry order confirmation':'Pay & place order'} <ArrowRight size={16}/></button></aside></div></section></Layout>;
}
function Field({label,wide,...props}){return <label className={wide?'field wide':'field'}><span>{label}</span><input required {...props}/></label>}
function SearchPage(){const {products:catalog}=useInventory();const [query,setQuery]=useState('');const normalized=query.trim().toLowerCase();const results=catalog.filter(product=>!product.archived&&(!normalized||`${product.name} ${product.category} ${product.description||''}`.toLowerCase().includes(normalized)));return <Layout><section className="collection-hero search-hero"><p className="eyebrow">Find your piece</p><h1>Search</h1><label className="search-field"><Search size={18}/><input autoFocus value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search pieces or categories" aria-label="Search current collection"/></label></section><section className="section"><div className="toolbar"><span>{results.length} {results.length===1?'piece':'pieces'}</span><span>Current collection</span></div>{results.length?<div className="product-grid">{results.map(product=><ProductCard key={product.id} p={product}/>)}</div>:<div className="empty-small">No pieces matched. Try a different name or category.</div>}</section></Layout>}
function GoogleButton(){
  const [status,setStatus]=useState('loading');
  const [message,setMessage]=useState('');
  const buttonRef=useRef(null);
  const nav=useNavigate();

  useEffect(()=>{
    let cancelled=false;
    let script=null;
    let onLoad=null;
    let onError=null;

    const fail=(text,nextStatus='error')=>{
      if(cancelled) return;
      setStatus(nextStatus);
      setMessage(text);
    };

    const initialize=(clientId)=>{
      if(cancelled) return;
      const googleId=window.google?.accounts?.id;
      if(!googleId){
        fail('Google sign-in could not load. Refresh the page and try again.');
        return;
      }
      try{
        googleId.initialize({
          client_id:clientId,
          callback:async response=>{
            if(!response?.credential){
              fail('Google did not return a sign-in credential. Please try again.');
              return;
            }
            setStatus('working');
            setMessage('');
            try{
              const data=await api('/api/auth/google',{
                method:'POST',
                body:JSON.stringify({credential:response.credential})
              });
              if(!data?.token) throw new Error('The server did not return a login session. Please try again.');
              localStorage.setItem('authToken',data.token);
              nav('/account',{replace:true});
            }catch(error){
              fail(error?.message||'Google sign-in failed. Please try again.');
            }
          }
        });
        const target=buttonRef.current;
        if(!target) return;
        target.replaceChildren();
        const availableWidth=Math.floor(target.getBoundingClientRect().width||360);
        googleId.renderButton(target,{
          theme:'outline',
          size:'large',
          shape:'rectangular',
          width:Math.max(200,Math.min(360,availableWidth)),
          text:'continue_with',
          logo_alignment:'left'
        });
        setStatus('ready');
        setMessage('');
      }catch(error){
        fail(error?.message||'Google sign-in could not be initialized.');
      }
    };

    const loadGoogleScript=(clientId)=>{
      if(cancelled) return;
      if(window.google?.accounts?.id){
        initialize(clientId);
        return;
      }
      const existing=document.querySelector('script[data-google-gsi]');
      script=existing||document.createElement('script');
      onLoad=()=>initialize(clientId);
      onError=()=>fail('Google sign-in script failed to load. Check your network or content blocker, then refresh.');
      script.addEventListener('load',onLoad,{once:true});
      script.addEventListener('error',onError,{once:true});
      if(!existing){
        script.src='https://accounts.google.com/gsi/client';
        script.async=true;
        script.defer=true;
        script.dataset.googleGsi='true';
        document.head.appendChild(script);
      }
    };

    // Ask the backend for the exact public client ID it validates. This avoids
    // having a separate VITE_GOOGLE_CLIENT_ID baked into the frontend build.
    api('/api/auth/google/config').then(config=>{
      if(cancelled) return;
      const clientId=typeof config?.client_id==='string'?config.client_id.trim():'';
      if(!config?.enabled||!clientId){
        fail('Google sign-in is not configured on the backend. Set GOOGLE_CLIENT_ID to your Google Web OAuth Client ID and redeploy the backend.','missing');
        return;
      }
      loadGoogleScript(clientId);
    }).catch(error=>{
      fail(`Google sign-in configuration could not be loaded. Check VITE_API_BASE_URL and the backend deployment. ${error?.message||''}`.trim());
    });

    return ()=>{
      cancelled=true;
      if(script&&onLoad) script.removeEventListener('load',onLoad);
      if(script&&onError) script.removeEventListener('error',onError);
    };
  },[nav]);

  return <section className="google-auth" aria-label="Google sign-in">
    <div className="or"><span>or</span></div>
    {status==='missing'
      ? <div className="google-config-warning" role="status"><strong>Google sign-in is not configured.</strong><span>{message}</span></div>
      : <>
          <div ref={buttonRef} className="google-button" aria-label="Continue with Google" />
          {status==='loading'&&<p className="google-status" role="status">Loading Google sign-in…</p>}
          {status==='working'&&<p className="google-status" role="status">Signing you in with Google…</p>}
          {message&&<p className="google-error" role="alert">{message}</p>}
        </>}
  </section>;
}
function Auth({mode='login'}){const isLogin=mode==='login';const [form,setForm]=useState({name:'',email:'',password:'',phone:'',country:'India'});const [busy,setBusy]=useState(false);const nav=useNavigate();const {showModal}=useModal();const change=e=>setForm({...form,[e.target.name]:e.target.value});const submit=async e=>{e.preventDefault();setBusy(true);try{const data=await api(isLogin?'/api/auth/login':'/api/auth/signup',{method:'POST',body:JSON.stringify(form)});if(data.token)localStorage.setItem('authToken',data.token);nav('/account')}catch(err){showModal(err.message,{title:isLogin?'Sign-in failed':'Account could not be created'})}finally{setBusy(false)}};return <Layout><section className="auth-page"><div className="auth-card"><p className="eyebrow">Private client area</p><h1>{isLogin?'Welcome back.':'Join Marvaelle.'}</h1><p className="muted">{isLogin?'Access your orders and account details.':'Create an account for order history and private releases.'}</p><form onSubmit={submit}>{!isLogin&&<Field name="name" label="Full name" value={form.name} onChange={change}/>}<Field name="email" label="Email" type="email" value={form.email} onChange={change}/><Field name="password" label="Password" type="password" value={form.password} onChange={change}/>{!isLogin&&<Field name="phone" label="Phone" value={form.phone} onChange={change}/>}<button className="button dark-button full" disabled={busy}>{busy?'Please wait…':isLogin?'Sign in':'Create account'}</button></form><GoogleButton/><div className="auth-switch">{isLogin?'New here?':'Already have an account?'} <Link to={isLogin?'/signup':'/login'}>{isLogin?'Create an account':'Sign in'}</Link></div></div></section></Layout>}
function Account(){const [profile,setProfile]=useState(null);const [orders,setOrders]=useState([]);const nav=useNavigate();useEffect(()=>{if(!localStorage.getItem('authToken'))return nav('/login');Promise.all([api('/api/profile'),api('/api/orders')]).then(([p,o])=>{setProfile(p);setOrders(o)}).catch(()=>{localStorage.removeItem('authToken');nav('/login')})},[]);const logout=()=>{localStorage.removeItem('authToken');nav('/')};return <Layout><section className="section account"><div className="page-title"><p className="eyebrow">Private client area</p><h1>My account</h1></div><div className="account-grid"><aside className="account-side"><div className="avatar">{profile?.name?.[0]||'M'}</div><h3>{profile?.name||'Loading…'}</h3><p>{profile?.email}</p><button className="text-button" onClick={logout}><LogOut size={15}/> Sign out</button></aside><div><p className="eyebrow">Order history</p>{orders.length?orders.map(o=><div className="order-card" key={o.id}><div><strong>Order #{o.id}</strong><span>{new Date(o.created_at).toLocaleDateString('en-IN')}</span></div><span className="status">{o.tracking_status||'Processing'}</span><strong>{money((o.total_amount||0)/100)}</strong></div>):<div className="empty-small">No orders yet.</div>}</div></div></section></Layout>}
function About(){return <Layout><section className="about-hero"><p className="eyebrow light">The atelier</p><h1>Less, but<br/><em>better considered.</em></h1></section><section className="section about-copy"><p className="eyebrow">Our point of view</p><h2>Marvaelle sits between utility and sculpture.</h2><div className="about-columns"><p>We believe a wardrobe should earn its place. Every silhouette begins with proportion, then material, then the details that make a piece feel inevitable.</p><p>Our collections are deliberately small. Natural fibres, restrained colours and a preference for construction over decoration give each piece a life beyond a single season.</p></div></section></Layout>}
function Info({title,children}){return <Layout><section className="section legal"><p className="eyebrow">Marvaelle</p><h1>{title}</h1>{children}</section></Layout>}
function Empty({title,text,action,href}){return <section className="empty"><div><p className="eyebrow">Marvaelle</p><h1>{title}</h1>{text&&<p className="muted">{text}</p>}{action&&<Link className="button dark-button" to={href}>{action}<ArrowRight size={16}/></Link>}</div></section>}
function Success(){return <Layout><Empty title="Thank you." text="Your order has been confirmed. We’re preparing your pieces for dispatch." action="Continue shopping" href="/"/></Layout>}
function Admin(){const [orders,setOrders]=useState([]);const [error,setError]=useState('');const {showModal}=useModal();const load=()=>api('/api/admin/orders').then(setOrders).catch(e=>setError(e.message));useEffect(()=>{if(!localStorage.getItem('authToken'))return setError('Please sign in first.');load()},[]);const update=async(id,status)=>{try{await api('/api/admin/orders/status',{method:'POST',body:JSON.stringify({order_id:id,status})});load()}catch(e){showModal(e.message,{title:'Order status could not be updated'})}};return <Layout><section className="section admin"><div className="page-title"><p className="eyebrow">Operations</p><h1>Orders</h1></div>{error?<Empty title="Access unavailable" text={error} action="Sign in" href="/login"/>:<div className="admin-table">{orders.map(o=><div className="admin-row" key={o.order_id}><div><strong>#{o.order_id}</strong><span>{o.created_at?new Date(o.created_at).toLocaleString('en-IN'):''}</span></div><div><span>{o.phone||'No phone'}</span><span>{o.address_line1||''}, {o.city||''} {o.pincode||''}</span></div><div>{(o.items||[]).map((i,index)=><span key={`${i.product_id}-${i.size||'M'}-${i.color||'As shown'}-${index}`}>{i.quantity} × {i.product_id} · {i.size||'M'} · {i.color||'As shown'}</span>)}</div><strong>{money((o.total_amount||0)/100)}</strong><select value={o.tracking_status||'Processing'} onChange={e=>update(o.order_id,e.target.value)}><option>Processing</option><option>Shipped</option><option>Delivered</option></select></div>)}</div>}</section></Layout>}

function App(){const loc=useLocation();if(loc.pathname==='/')return <Home/>;if(loc.pathname==='/search')return <SearchPage/>;if(loc.pathname==='/cart')return <Cart/>;if(loc.pathname==='/checkout')return <Checkout/>;if(loc.pathname==='/login')return <Auth/>;if(loc.pathname==='/signup')return <Auth mode="signup"/>;if(loc.pathname==='/account')return <Account/>;if(loc.pathname==='/admin')return <Admin/>;if(loc.pathname==='/about')return <About/>;if(loc.pathname==='/success')return <Success/>;if(loc.pathname==='/shipping')return <Info title="Shipping"><p>Complimentary standard shipping is available on all Marvaelle orders. Dispatch timing is shown at checkout and confirmed by email.</p><p>For questions about a delivery, contact our client service team with your order number.</p></Info>;if(loc.pathname==='/refunds')return <Info title="Returns & refunds"><p>Unused pieces may be returned in their original condition within the return window communicated with your order confirmation.</p><p>Contact client service before sending a return so we can provide the correct instructions.</p></Info>;if(loc.pathname==='/contact')return <Info title="Contact"><p>For private client support, email <a href="mailto:studio@marvaelle.com">studio@marvaelle.com</a>.</p></Info>;if(loc.pathname.startsWith('/collection/'))return <Collection category={loc.pathname.split('/')[2]}/>;if(loc.pathname.startsWith('/product/'))return <ProductPage/>;return <Layout><Empty title="Page not found" text="The requested page does not exist." action="Return home" href="/"/></Layout>}
createRoot(document.getElementById('root')).render(<ModalProvider><BrowserRouter><InventoryProvider><App/></InventoryProvider></BrowserRouter></ModalProvider>);
