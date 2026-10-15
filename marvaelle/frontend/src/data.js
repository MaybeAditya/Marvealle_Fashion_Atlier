const catalogue = [
  {id:'7',name:'The Graphite Structural Suit',price:895,category:'men',image:'/images/grey-suit(1).jpeg',images:['/images/grey-suit(1).jpeg','/images/grey-suit (2).jpeg','/images/grey-suit (3).jpeg','/images/grey-suit (4).jpeg','/images/grey-suit (5).jpeg','/images/grey-suit (6).jpeg','/images/grey-suit (7).jpeg','/images/grey-suit (8).jpeg'],stock:5,description:'Inspired by brutalist architecture, this two-piece suit is tailored from cool-tone Italian wool. Featuring a sharp shoulder line and a tapered trouser.'},
  {id:'10',name:'The Sculptural Ivory Ensemble',price:495,category:'men',image:'/images/ivory-sculptural-top (1).jpeg',images:['/images/ivory-sculptural-top (1).jpeg','/images/ivory-sculptural-top (2).jpeg','/images/ivory-sculptural-top (3).jpeg','/images/ivory-sculptural-top (4).jpeg','/images/ivory-sculptural-top (5).jpeg','/images/ivory-sculptural-top (6).jpeg'],stock:3,description:'A testament to modern minimalism. An architecturally tailored asymmetrical top with high-waisted wide-leg trousers.'},
  {id:'12',archived:true,name:'The Distressed Charcoal Knit — Archive',price:345,category:'men',image:'/images/charcoal-knit.jpeg',images:['/images/charcoal-knit.jpeg'],stock:0,description:'Hand-finished heavy gauge wool sweater with intentional distressing.'},
  {id:'m-arch-1',archived:true,name:'Graphite Trousers — Archive',price:450,category:'men',image:'/images/grey-suit (3).jpeg',images:['/images/grey-suit (3).jpeg'],stock:0},
  {id:'m-arch-2',archived:true,name:'Ivory Asymmetric Vest — Archive',price:295,category:'men',image:'/images/ivory-sculptural-top (3).jpeg',images:['/images/ivory-sculptural-top (3).jpeg'],stock:0},
  {id:'m-arch-3',archived:true,name:'The Brutalist Greatcoat',price:1200,category:'men',image:'/images/grey-suit (5).jpeg',images:['/images/grey-suit (5).jpeg'],stock:0},
  {id:'9',name:'The Amalfi Rose Silk Gown',price:545,category:'women',image:'/images/pink-dress-walk (1).jpeg',images:['/images/pink-dress-walk (1).jpeg','/images/pink-dress-walk (2).jpeg','/images/pink-dress-walk (3).jpeg','/images/pink-dress-walk (4).jpeg','/images/pink-dress-walk (5).jpeg','/images/pink-dress-walk (6).jpeg','/images/pink-dress-walk (7).jpeg','/images/pink-dress-walk (8).jpeg'],stock:4,description:'Capturing the golden hour of the Italian coast. A floor-sweeping gown crafted from crushed silk chiffon in dusty rose.'},
  {id:'11',name:'The Sienna Corduroy Peacoat',price:625,category:'women',image:'/images/orange-corduroy-coat (1).jpeg',images:['/images/orange-corduroy-coat (1).jpeg','/images/orange-corduroy-coat (2).jpeg','/images/orange-corduroy-coat (3).jpeg','/images/orange-corduroy-coat (4).jpeg','/images/orange-corduroy-coat (5).jpeg','/images/orange-corduroy-coat (6).jpeg'],stock:8,description:'A statement piece in burnt sienna, cut from heavyweight wide-wale corduroy.'},
  {id:'6',name:'The Sculpted Jute Blazer',price:395,category:'women',image:'/images/Jute (1).jpeg',images:['/images/Jute (1).jpeg','/images/Jute (2).jpeg','/images/Jute (3).jpeg','/images/Jute (4).jpeg','/images/Jute (5).jpeg','/images/Jute (6).jpeg'],stock:6,description:'A masterclass in textural elegance, woven from raw organic jute fibers.'},
  {id:'5-w',name:'The Architect’s Linen Shirt',price:245,category:'women',image:'/images/linen-shirt.jpeg',images:['/images/linen-shirt.jpeg','/images/linen-shirt (1).jpeg','/images/linen-shirt (2).jpeg','/images/linen-shirt (4).jpeg','/images/linen-shirt (5).jpeg','/images/linen-shirt (6).jpeg'],stock:12,description:'Crafted from ethically sourced, high-gauge European linen. A study in minimalist luxury.'},
  {id:'14',archived:true,name:'The Ethereal Organza Blouse — Archive',price:285,category:'women',image:'/images/organza-blouse.jpeg',images:['/images/organza-blouse.jpeg'],stock:0,description:'Sheer ivory organza with a structured collar.'},
  {id:'w-arch-1',archived:true,name:'Midnight Velvet Jacket — Archive',price:495,category:'women',image:'/images/velvet-detail.jpeg',images:['/images/velvet-detail.jpeg'],stock:0},
  {id:'w-arch-2',archived:true,name:'Sienna Wide-Leg Trouser — Archive',price:325,category:'women',image:'/images/orange-corduroy-coat (3).jpeg',images:['/images/orange-corduroy-coat (3).jpeg'],stock:0},
  {id:'w-arch-3',archived:true,name:'Amalfi Silk Bodice — Archive',price:245,category:'women',image:'/images/pink-dress-walk (3).jpeg',images:['/images/pink-dress-walk (3).jpeg'],stock:0},
  {id:'w-arch-4',archived:true,name:'Raw Jute Waistcoat',price:295,category:'women',image:'/images/Jute (4).jpeg',images:['/images/Jute (4).jpeg'],stock:0}
 ];
const catalogueColors = {
  '7': [{name:'Graphite',hex:'#54565a'}],
  '10': [{name:'Ivory',hex:'#e7e0d3'}],
  '12': [{name:'Charcoal',hex:'#393a3b'}],
  'm-arch-1': [{name:'Graphite',hex:'#54565a'}],
  'm-arch-2': [{name:'Ivory',hex:'#e7e0d3'}],
  'm-arch-3': [{name:'Graphite',hex:'#54565a'}],
  '9': [{name:'Dusty rose',hex:'#c58d96'}],
  '11': [{name:'Burnt sienna',hex:'#9a4d2d'}],
  '6': [{name:'Natural jute',hex:'#b8a27d'}],
  '5-w': [{name:'Natural linen',hex:'#d9d0bc'}],
  '14': [{name:'Ivory',hex:'#e7e0d3'}],
  'w-arch-1': [{name:'Midnight',hex:'#29292c'}],
  'w-arch-2': [{name:'Burnt sienna',hex:'#9a4d2d'}],
  'w-arch-3': [{name:'Dusty rose',hex:'#c58d96'}],
  'w-arch-4': [{name:'Natural jute',hex:'#b8a27d'}]
};
export const products = catalogue.map(product=>({...product,colors:catalogueColors[product.id]||[{name:'As shown',hex:'#d8d2c6'}]}));
export const money = n => new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(n);
export const getProduct = id => products.find(p=>p.id===id);
