const CONFIGURED_BASE = (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '').replace(/\/api$/i, '');

export const api = async (path, options={}) => {
  const base = CONFIGURED_BASE;
  if(!base && path.startsWith('/api/')) {
    throw new Error('Backend API URL is not configured. Set VITE_API_BASE_URL in the frontend Vercel project.');
  }
  const headers = {'Content-Type':'application/json', ...(options.headers||{})};
  const token = localStorage.getItem('authToken');
  if(token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${base}${path}`, {...options, headers});
  const text = await res.text();
  let data; try { data = text ? JSON.parse(text) : {}; } catch { data = {error:text}; }
  if(!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
};
let razorpayLoadPromise;
export const loadRazorpay = () => {
  if (window.Razorpay) return Promise.resolve(true);
  if (razorpayLoadPromise) return razorpayLoadPromise;
  razorpayLoadPromise = new Promise(resolve => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.dataset.razorpayCheckout = 'true';
    script.onload = () => resolve(Boolean(window.Razorpay));
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  }).then(loaded => {
    if (!loaded) razorpayLoadPromise = null;
    return loaded;
  });
  return razorpayLoadPromise;
};
