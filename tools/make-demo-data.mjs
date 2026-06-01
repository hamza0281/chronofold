// Generates three realistic demo JSONL files for Chronofold.
// Run: node tools/make-demo-data.mjs
import { writeFileSync } from 'node:fs';

// ── BANKING ───────────────────────────────────────────────────────────────
const bankUsers = [
  'Rahul_Sharma','Priya_Patel','Amit_Verma','Sneha_Gupta','Rohit_Singh',
  'Anjali_Mehta','Vikram_Joshi','Kavya_Nair','Arjun_Kumar','Pooja_Agarwal',
  'Suresh_Reddy','Meera_Iyer','Deepak_Yadav','Nisha_Tiwari','Karan_Malhotra',
  'Divya_Bose','Rajesh_Pillai','Sunita_Chauhan','Manish_Saxena','Ritu_Kapoor',
];
const bankLines = [];
// Opening deposits — everyone starts with a balance
bankUsers.forEach((u, i) => bankLines.push({ type:'deposit', user:u, amount: 10000 + i * 2500 }));
// Realistic day-to-day transactions
const bankTxns = [
  { type:'transfer', from:'Rahul_Sharma',   to:'Priya_Patel',    amount:5000  },
  { type:'transfer', from:'Amit_Verma',     to:'Sneha_Gupta',    amount:12500 },
  { type:'transfer', from:'Rohit_Singh',    to:'Anjali_Mehta',   amount:3200  },
  { type:'transfer', from:'Vikram_Joshi',   to:'Kavya_Nair',     amount:8750  },
  { type:'transfer', from:'Arjun_Kumar',    to:'Pooja_Agarwal',  amount:15000 },
  { type:'deposit',  user:'Suresh_Reddy',   amount:25000 },
  { type:'withdraw', user:'Meera_Iyer',     amount:7500  },
  { type:'transfer', from:'Deepak_Yadav',   to:'Nisha_Tiwari',   amount:4200  },
  { type:'withdraw', user:'Karan_Malhotra', amount:9000  },
  { type:'deposit',  user:'Divya_Bose',     amount:18000 },
  { type:'transfer', from:'Rajesh_Pillai',  to:'Sunita_Chauhan', amount:6300  },
  { type:'transfer', from:'Manish_Saxena',  to:'Ritu_Kapoor',    amount:11000 },
  { type:'deposit',  user:'Rahul_Sharma',   amount:5000  },
  { type:'transfer', from:'Priya_Patel',    to:'Amit_Verma',     amount:2000  },
  { type:'withdraw', user:'Rohit_Singh',    amount:1500  },
  { type:'transfer', from:'Anjali_Mehta',   to:'Vikram_Joshi',   amount:4500  },
  { type:'transfer', from:'Kavya_Nair',     to:'Arjun_Kumar',    amount:3300  },
  { type:'deposit',  user:'Pooja_Agarwal',  amount:7200  },
  { type:'transfer', from:'Suresh_Reddy',   to:'Meera_Iyer',     amount:5500  },
  { type:'withdraw', user:'Deepak_Yadav',   amount:2800  },
  { type:'transfer', from:'Nisha_Tiwari',   to:'Karan_Malhotra', amount:1800  },
  { type:'transfer', from:'Divya_Bose',     to:'Rajesh_Pillai',  amount:9500  },
  { type:'deposit',  user:'Sunita_Chauhan', amount:14000 },
  { type:'transfer', from:'Manish_Saxena',  to:'Rahul_Sharma',   amount:3700  },
  { type:'transfer', from:'Ritu_Kapoor',    to:'Priya_Patel',    amount:2200  },
  { type:'deposit',  user:'Amit_Verma',     amount:8800  },
  { type:'transfer', from:'Sneha_Gupta',    to:'Rohit_Singh',    amount:6100  },
  { type:'withdraw', user:'Anjali_Mehta',   amount:3000  },
  { type:'transfer', from:'Vikram_Joshi',   to:'Kavya_Nair',     amount:5200  },
  { type:'deposit',  user:'Arjun_Kumar',    amount:20000 },
  // ── INTENTIONAL BAD DATA (so the dashboard shows rejections) ──
  // Overdraft attempt
  { type:'withdraw', user:'Ritu_Kapoor',    amount:9999999 },
  // Self-transfer
  { type:'transfer', from:'Rahul_Sharma',   to:'Rahul_Sharma',   amount:100   },
  // Unknown user
  { type:'withdraw', user:'Ghost_User',     amount:100   },
  // Negative amount
  { type:'deposit',  user:'Priya_Patel',    amount:-500  },
  // Missing recipient
  { type:'transfer', from:'Amit_Verma',     amount:1000  },
];
bankTxns.forEach(t => bankLines.push(t));
// One corrupt JSON line in the middle
bankLines.splice(25, 0, '{"type":"transfer","from":"Arjun_Kumar","to":');
writeFileSync('demo-banking-real.jsonl', bankLines.map(l => typeof l === 'string' ? l : JSON.stringify(l)).join('\n') + '\n');
console.log(`✓ demo-banking-real.jsonl  (${bankLines.length} events, 5 intentional rejections, 1 corrupt line)`);

// ── CRYPTO / STABLECOIN ───────────────────────────────────────────────────
const wallets = [
  '0xAlice','0xBob','0xCarol','0xDave','0xEve',
  '0xFrank','0xGrace','0xHank','0xIvy','0xJack',
  '0xKate','0xLeo','0xMia','0xNick','0xOlivia',
];
const cryptoLines = [];
// Initial mints (tokens created)
wallets.forEach((w, i) => cryptoLines.push({ type:'mint', user:w, amount: 1000 + i * 500 }));
// Transfers and burns
const cryptoTxns = [
  { type:'transfer', from:'0xAlice',  to:'0xBob',    amount:200  },
  { type:'transfer', from:'0xBob',    to:'0xCarol',  amount:150  },
  { type:'burn',     user:'0xCarol',  amount:100  },
  { type:'mint',     user:'0xDave',   amount:2000 },
  { type:'transfer', from:'0xDave',   to:'0xEve',    amount:800  },
  { type:'transfer', from:'0xEve',    to:'0xFrank',  amount:300  },
  { type:'burn',     user:'0xFrank',  amount:200  },
  { type:'mint',     user:'0xGrace',  amount:1500 },
  { type:'transfer', from:'0xGrace',  to:'0xHank',   amount:600  },
  { type:'transfer', from:'0xHank',   to:'0xIvy',    amount:400  },
  { type:'burn',     user:'0xIvy',    amount:150  },
  { type:'mint',     user:'0xJack',   amount:3000 },
  { type:'transfer', from:'0xJack',   to:'0xKate',   amount:1200 },
  { type:'transfer', from:'0xKate',   to:'0xLeo',    amount:500  },
  { type:'burn',     user:'0xLeo',    amount:300  },
  { type:'transfer', from:'0xMia',    to:'0xNick',   amount:700  },
  { type:'transfer', from:'0xNick',   to:'0xOlivia', amount:250  },
  { type:'mint',     user:'0xAlice',  amount:5000 },
  { type:'transfer', from:'0xAlice',  to:'0xJack',   amount:2500 },
  { type:'burn',     user:'0xJack',   amount:1000 },
  { type:'transfer', from:'0xBob',    to:'0xMia',    amount:300  },
  { type:'transfer', from:'0xCarol',  to:'0xDave',   amount:200  },
  { type:'mint',     user:'0xEve',    amount:800  },
  { type:'transfer', from:'0xFrank',  to:'0xGrace',  amount:400  },
  { type:'transfer', from:'0xHank',   to:'0xKate',   amount:350  },
  // ── INTENTIONAL BAD DATA ──
  // Burn more than balance
  { type:'burn',     user:'0xOlivia', amount:999999 },
  // Mint zero
  { type:'mint',     user:'0xBob',    amount:0     },
  // Transfer to self
  { type:'transfer', from:'0xAlice',  to:'0xAlice', amount:100  },
  // Unknown wallet burn
  { type:'burn',     user:'0xUnknown',amount:50    },
];
cryptoTxns.forEach(t => cryptoLines.push(t));
cryptoLines.splice(20, 0, '{"type":"mint","user":"0xDave","amount":');
writeFileSync('demo-crypto-real.jsonl', cryptoLines.map(l => typeof l === 'string' ? l : JSON.stringify(l)).join('\n') + '\n');
console.log(`✓ demo-crypto-real.jsonl   (${cryptoLines.length} events, 4 intentional rejections, 1 corrupt line)`);

// ── INVENTORY / WAREHOUSE ─────────────────────────────────────────────────
const products = [
  'iPhone_15_Pro','Samsung_S24','MacBook_Air_M3','Dell_XPS_15','iPad_Pro',
  'Sony_WH1000XM5','AirPods_Pro','Logitech_MX_Keys','Razer_DeathAdder','LG_OLED_55',
  'Nike_Air_Max','Adidas_Ultraboost','Levi_501_Jeans','Zara_Jacket','H&M_Tshirt',
];
const inventoryLines = [];
// Initial stock
products.forEach((p, i) => inventoryLines.push({ type:'mint', user:p, amount: 50 + i * 10 }));
// Sales, restocks, returns
const inventoryTxns = [
  { type:'withdraw', user:'iPhone_15_Pro',      amount:5  },
  { type:'withdraw', user:'Samsung_S24',         amount:3  },
  { type:'mint',     user:'MacBook_Air_M3',      amount:20 },
  { type:'withdraw', user:'Dell_XPS_15',         amount:8  },
  { type:'withdraw', user:'iPad_Pro',            amount:12 },
  { type:'mint',     user:'Sony_WH1000XM5',      amount:30 },
  { type:'withdraw', user:'AirPods_Pro',         amount:15 },
  { type:'withdraw', user:'Logitech_MX_Keys',    amount:7  },
  { type:'mint',     user:'Razer_DeathAdder',    amount:25 },
  { type:'withdraw', user:'LG_OLED_55',          amount:2  },
  { type:'withdraw', user:'Nike_Air_Max',        amount:20 },
  { type:'mint',     user:'Adidas_Ultraboost',   amount:40 },
  { type:'withdraw', user:'Levi_501_Jeans',      amount:18 },
  { type:'withdraw', user:'Zara_Jacket',         amount:10 },
  { type:'mint',     user:'H&M_Tshirt',          amount:100},
  { type:'withdraw', user:'H&M_Tshirt',          amount:35 },
  { type:'withdraw', user:'iPhone_15_Pro',       amount:10 },
  { type:'mint',     user:'iPhone_15_Pro',       amount:50 },
  { type:'withdraw', user:'Samsung_S24',         amount:6  },
  { type:'withdraw', user:'AirPods_Pro',         amount:20 },
  { type:'mint',     user:'iPad_Pro',            amount:15 },
  { type:'withdraw', user:'Nike_Air_Max',        amount:30 },
  { type:'withdraw', user:'Adidas_Ultraboost',   amount:25 },
  { type:'mint',     user:'Dell_XPS_15',         amount:10 },
  { type:'withdraw', user:'MacBook_Air_M3',      amount:5  },
  // ── INTENTIONAL BAD DATA ──
  // Sell more than stock
  { type:'withdraw', user:'LG_OLED_55',          amount:9999 },
  // Negative restock
  { type:'mint',     user:'Razer_DeathAdder',    amount:-10  },
  // Unknown product
  { type:'withdraw', user:'Unknown_Product',     amount:5    },
  // Zero quantity
  { type:'withdraw', user:'Zara_Jacket',         amount:0    },
];
inventoryTxns.forEach(t => inventoryLines.push(t));
inventoryLines.splice(18, 0, '{"type":"withdraw","user":"Nike_Air_Max",');
writeFileSync('demo-inventory-real.jsonl', inventoryLines.map(l => typeof l === 'string' ? l : JSON.stringify(l)).join('\n') + '\n');
console.log(`✓ demo-inventory-real.jsonl (${inventoryLines.length} events, 4 intentional rejections, 1 corrupt line)`);

console.log('\nDone! Upload any of these files to Chronofold.');
