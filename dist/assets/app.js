// ---------------------------- App Script ----------------------------
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,8);

const ASSET_CATEGORIES = {
  'Cash & Bank': ['Cash', 'Checking Account', 'Savings Account', 'Fixed Deposit'],
  'Investments': ['Stocks', 'Bonds', 'Mutual Funds', 'Crypto', 'ETFs'],
  'Property': ['Real Estate', 'Vehicle', 'Art & Collectibles'],
  'Other Assets': ['Other']
};

const LIABILITY_CATEGORIES = {
  'Loans': ['Mortgage', 'Car Loan', 'Personal Loan', 'Student Loan'],
  'Taxes': ['Income Tax', 'Property Tax'],
  'Bills': ['Utility Bills', 'Phone Bills', 'Internet Bills'],
  'Other Debts': ['Other']
};

const DEFAULT_DATA = {
  meta: { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  settings: { currency: 'USD', theme: 'dark', includeCreditInNetworth: false },
  assets: [],
  creditCards: [],
  liabilities: [],
  transactions: [],
};

const STORAGE_KEY = 'finance_notebook_v1';
function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return structuredClone(DEFAULT_DATA);
    const parsed = JSON.parse(raw);
    return Object.assign(structuredClone(DEFAULT_DATA), parsed);
  }catch(e){ console.error('Failed to load state',e); return structuredClone(DEFAULT_DATA); }
}
let state = loadState();

function saveState(){ state.meta.updatedAt = new Date().toISOString(); localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); renderAll(); }
const debouncedSave = (()=>{ let t=null; return ()=>{ clearTimeout(t); t=setTimeout(saveState,300); } })();

// ----------------- Utilities -----------------
function fmtNumber(n){ const cur = (state.settings && state.settings.currency) || 'USD'; try{ return new Intl.NumberFormat(undefined, {style:'currency',currency:cur}).format(n||0); }catch(e){ return (n||0).toFixed(2) + ' ' + cur; } }
function sum(arr,fn){return arr.reduce((s,i)=>s+(fn?fn(i):i),0)}

// ----------------- Calculations -----------------
function totalAssets(){ return sum(state.assets, a => Number(a.value||0)); }
function totalLiabilities(){ const liab = sum(state.liabilities, l => Number(l.amount||0)); const cardBalances = sum(state.creditCards, c => Number(c.balance||0)); return liab + cardBalances; }
function unusedCredit(){ return sum(state.creditCards, c => Math.max(0,(Number(c.limit||0) - Number(c.balance||0)))); }
function netWorth(){ let nw = totalAssets() - totalLiabilities(); if(state.settings.includeCreditInNetworth){ nw += unusedCredit(); } return nw; }
function creditUtilization(){ const totalLimit = sum(state.creditCards, c=>Number(c.limit||0)); const totalBalance = sum(state.creditCards, c=>Number(c.balance||0)); if(totalLimit<=0) return 0; return totalBalance/totalLimit*100; }

function monthlyTotals(year,month){ const incomes = state.transactions.filter(t=>t.type==='income' && inMonth(t.date,year,month)); const expenses = state.transactions.filter(t=>t.type==='expense' && inMonth(t.date,year,month)); return { income: sum(incomes, t=>Number(t.amount||0)), expense: sum(expenses, t=>Number(t.amount||0)) }; }
function inMonth(dateIso, year, month){ if(!dateIso) return false; const d = new Date(dateIso); return d.getFullYear()===year && d.getMonth()===month; }

// ----------------- Rendering -----------------
function renderAll(){ applyTheme(); renderSidebar(); renderDashboard(); renderTransactions(); renderAssets(); renderCards(); renderLiabilities(); renderSettings(); }

function applyTheme(){ const t = state.settings.theme || 'dark'; document.documentElement.setAttribute('data-theme', t); }

function renderSidebar(){ const el = document.getElementById('sidebar-networth'); if(el) el.textContent = fmtNumber(netWorth()); }

function renderDashboard(){ const curEl = document.getElementById('currentCurrency'); if(curEl) curEl.textContent = state.settings.currency || 'USD'; const nwEl = document.getElementById('kpi-networth'); if(nwEl) nwEl.textContent = fmtNumber(netWorth()); const now = new Date(); const m = monthlyTotals(now.getFullYear(), now.getMonth()); const incomeEl = document.getElementById('kpi-income'); const expenseEl = document.getElementById('kpi-expense'); if(incomeEl) incomeEl.textContent = fmtNumber(m.income); if(expenseEl) expenseEl.textContent = fmtNumber(m.expense); const ta = document.getElementById('totalAssets'); if(ta) ta.textContent = fmtNumber(totalAssets()); const tl = document.getElementById('totalLiabilities'); if(tl) tl.textContent = fmtNumber(totalLiabilities()); const cu = document.getElementById('creditUtil'); if(cu) cu.textContent = creditUtilization().toFixed(1) + '%';

  const recent = state.transactions.slice().sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,8);
  const rv = recent.map(t=>`<div style="display:flex;justify-content:space-between;padding:6px 0"><div><strong>${t.category}</strong><div class="muted-sm">${t.note||''}</div></div><div style="text-align:right">${fmtNumber(t.amount)}<div class="muted-sm">${new Date(t.date).toLocaleDateString()}</div></div></div>`).join('');
  const recentEl = document.getElementById('recentTransactions'); if(recentEl) recentEl.innerHTML = rv || '<div class="muted-sm">No transactions yet</div>';

  drawNetworthChart(); drawExpensePie();
}

function renderTransactions(){ const container = document.getElementById('transactionsTable'); if(!container) return; const rows = state.transactions.slice().sort((a,b)=>new Date(b.date)-new Date(a.date)).map(t=>{ return `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px dashed rgba(255,255,255,0.02)"><div style="flex:1"><div><strong>${t.category}</strong> <span class="muted-sm">${t.note||''}</span></div><div class="muted-sm">${new Date(t.date).toLocaleDateString()}</div></div><div style="width:140px;text-align:right">${fmtNumber(t.amount)}</div><div style="width:140px;text-align:right"><button class="btn secondary" data-act="edit-txn" data-id="${t.id}">Edit</button><button class="btn" style="margin-left:6px" data-act="del-txn" data-id="${t.id}">Delete</button></div></div>`; }).join(''); container.innerHTML = rows || '<div class="muted-sm">No transactions recorded</div>'; }

function renderAssets() {
  const c = document.getElementById('assetsTable');
  if (!c) return;

  // Group assets by main category and subcategory
  const grouped = {};
  state.assets.forEach(a => {
    if (!grouped[a.mainCategory]) {
      grouped[a.mainCategory] = {};
    }
    if (!grouped[a.mainCategory][a.subCategory]) {
      grouped[a.mainCategory][a.subCategory] = [];
    }
    grouped[a.mainCategory][a.subCategory].push(a);
  });

  let html = '';
  Object.entries(grouped).forEach(([mainCat, subCats]) => {
    // Main category header
    html += `<div class="category-header">${mainCat}</div>`;
    
    Object.entries(subCats).forEach(([subCat, assets]) => {
      // Subcategory header
      html += `<div class="subcategory-header">${subCat}</div>`;
      
      // Assets in this subcategory
      assets.forEach(a => {
        html += `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px dashed rgba(255,255,255,0.02);margin-left:20px;">
          <div style="flex:1">
            <div><strong>${a.name}</strong></div>
          </div>
          <div style="width:140px;text-align:right">${fmtNumber(a.value)}</div>
          <div style="width:110px;text-align:right">
            <button class="btn secondary" data-act="edit-asset" data-id="${a.id}">Edit</button>
            <button class="btn" data-act="del-asset" data-id="${a.id}">Delete</button>
          </div>
        </div>`;
      });
    });
  });

  c.innerHTML = html || '<div class="muted-sm">No assets added</div>';
}

function renderCards(){ const c = document.getElementById('cardsTable'); if(!c) return; const rows = state.creditCards.map(card=>{ const avail = Number(card.limit||0) - Number(card.balance||0); const util = card.limit>0 ? (Number(card.balance||0)/Number(card.limit))*100 : 0; return `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px dashed rgba(255,255,255,0.02)"><div style="flex:1"><div><strong>${card.name}</strong> <span class="muted-sm">limit ${fmtNumber(card.limit)}</span></div><div class="muted-sm">Available ${fmtNumber(avail)} • Util ${util.toFixed(1)}% • AER ${card.aer||'—'}% • Due day ${card.dueDay||'—'}</div></div><div style="width:140px;text-align:right">${fmtNumber(card.balance)}</div><div style="width:140px;text-align:right"><button class="btn secondary" data-act="edit-card" data-id="${card.id}">Edit</button><button class="btn" data-act="del-card" data-id="${card.id}">Delete</button></div></div>`; }).join(''); c.innerHTML = rows || '<div class="muted-sm">No credit cards</div>'; }

function renderLiabilities() {
  const c = document.getElementById('liabilitiesTable');
  if (!c) return;

  // Group liabilities by main category and subcategory
  const grouped = {};
  state.liabilities.forEach(l => {
    if (!grouped[l.mainCategory]) {
      grouped[l.mainCategory] = {};
    }
    if (!grouped[l.mainCategory][l.subCategory]) {
      grouped[l.mainCategory][l.subCategory] = [];
    }
    grouped[l.mainCategory][l.subCategory].push(l);
  });

  let html = '';
  Object.entries(grouped).forEach(([mainCat, subCats]) => {
    // Main category header
    html += `<div class="category-header">${mainCat}</div>`;
    
    Object.entries(subCats).forEach(([subCat, liabilities]) => {
      // Subcategory header
      html += `<div class="subcategory-header">${subCat}</div>`;
      
      // Liabilities in this subcategory
      liabilities.forEach(l => {
        html += `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px dashed rgba(255,255,255,0.02);margin-left:20px;">
          <div style="flex:1">
            <div><strong>${l.name}</strong></div>
            <div class="muted-sm">Due ${l.dueDate||'—'}</div>
          </div>
          <div style="width:140px;text-align:right">${fmtNumber(l.amount)}</div>
          <div style="width:110px;text-align:right">
            <button class="btn secondary" data-act="edit-liability" data-id="${l.id}">Edit</button>
            <button class="btn" data-act="del-liability" data-id="${l.id}">Delete</button>
          </div>
        </div>`;
      });
    });
  });

  c.innerHTML = html || '<div class="muted-sm">No liabilities</div>';
}

function renderSettings(){ const cur = document.getElementById('settingCurrency'); if(cur) cur.value = state.settings.currency || 'USD'; const theme = document.getElementById('settingTheme'); if(theme) theme.value = state.settings.theme || 'dark'; const inc = document.getElementById('settingIncludeCredit'); if(inc) inc.checked = !!state.settings.includeCreditInNetworth; }

// ----------------- Charts (lightweight) -----------------
function drawNetworthChart(){ const canvas = document.getElementById('networthChart'); if(!canvas) return; const ctx = canvas.getContext('2d'); ctx.clearRect(0,0,canvas.width,canvas.height); const now = new Date(); const months = []; for(let i=11;i>=0;i--){ const d = new Date(now.getFullYear(), now.getMonth()-i,1); months.push({label: d.toLocaleString(undefined,{month:'short'}), year:d.getFullYear(), month:d.getMonth()}); }
  const points = months.map(m => { const cutoff = new Date(m.year, m.month+1, 1); const assetTotal = totalAssets(); const liabilityTotal = totalLiabilities(); const cum = state.transactions.filter(t=> new Date(t.date) < cutoff).reduce((s,t)=> s + (t.type==='income'?Number(t.amount): -Number(t.amount)), 0); return assetTotal - liabilityTotal + cum; });
  const min = Math.min(...points) * 1.05; const max = Math.max(...points) * 1.05; const w = canvas.width; const h = canvas.height; 
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const textColor = isLight ? 'rgba(15,23,36,0.8)' : 'rgba(255,255,255,0.6)';
  const gridColor = isLight ? 'rgba(15,23,36,0.1)' : 'rgba(255,255,255,0.06)';
  const pointColor = isLight ? '#4f46e5' : 'white';
  
  ctx.strokeStyle = gridColor; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(30,h-30); ctx.lineTo(w-10,h-30); ctx.stroke(); ctx.beginPath(); ctx.moveTo(30,10); ctx.lineTo(30,h-30); ctx.stroke(); ctx.fillStyle = textColor; ctx.font='11px Inter, system-ui'; months.forEach((m,i)=>{ const x = 30 + (i/(months.length-1))*(w-50); ctx.fillText(m.label, x-10, h-10); }); ctx.beginPath(); points.forEach((p,i)=>{ const x = 30 + (i/(points.length-1))*(w-50); const y = h-30 - ((p - min) / (max-min || 1))*(h-50); if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); }); ctx.strokeStyle = 'rgba(79,70,229,0.95)'; ctx.lineWidth=2; ctx.stroke(); points.forEach((p,i)=>{ const x = 30 + (i/(points.length-1))*(w-50); const y = h-30 - ((p - min) / (max-min || 1))*(h-50); ctx.beginPath(); ctx.arc(x,y,3,0,Math.PI*2); ctx.fillStyle=pointColor; ctx.fill(); }); }

function drawExpensePie(){ const canvas = document.getElementById('expensePie'); if(!canvas) return; const ctx = canvas.getContext('2d'); ctx.clearRect(0,0,canvas.width,canvas.height); const w = canvas.width; const h = canvas.height; const r = Math.min(w,h)/2 - 10; const cx = w/2; const cy = h/2; const expenses = state.transactions.filter(t=>t.type==='expense'); const categorySums = {}; expenses.forEach(e=>{ categorySums[e.category] = (categorySums[e.category]||0) + Number(e.amount||0); }); const entries = Object.entries(categorySums); 
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const textColor = isLight ? 'rgba(15,23,36,0.8)' : 'rgba(255,255,255,0.9)';
  const emptyColor = isLight ? 'rgba(15,23,36,0.04)' : 'rgba(255,255,255,0.04)';

  if(entries.length===0){ ctx.fillStyle=emptyColor; ctx.font='13px Inter'; ctx.fillText('No expenses yet', cx-40, cy); return; } const total = entries.reduce((s,[k,v])=>s+v,0); let start = -Math.PI/2; const colors = ['#7c3aed','#06b6d4','#f97316','#10b981','#ef4444','#eab308','#3b82f6']; entries.forEach(([k,v],i)=>{ const slice = v/total * Math.PI*2; ctx.beginPath(); ctx.moveTo(cx,cy); ctx.arc(cx,cy,r,start,start+slice); ctx.closePath(); ctx.fillStyle = colors[i%colors.length]; ctx.fill(); const mid = start + slice/2; const lx = cx + Math.cos(mid)*(r+18); const ly = cy + Math.sin(mid)*(r+18); ctx.fillStyle=textColor; ctx.font='11px Inter'; ctx.fillText(k + ' ' + Math.round(v/total*100) + '%', lx-20, ly); start += slice; }); }

// ----------------- Actions & Forms -----------------
function initUI(){
  document.querySelectorAll('.nav button').forEach(btn=>btn.addEventListener('click', e=>{ document.querySelectorAll('.nav button').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); const tab = btn.dataset.tab; document.querySelectorAll('.tab').forEach(t=>t.style.display='none'); const el = document.getElementById('tab-'+tab); if(el) el.style.display='block'; if(window.innerWidth<=900) toggleSidebar(false); }));
  const burger = document.getElementById('burger'); if(burger) burger.addEventListener('click', ()=> toggleSidebar());

  const quickForm = document.getElementById('quickAddForm'); if(quickForm) quickForm.addEventListener('submit', e=>{ e.preventDefault(); const type = document.getElementById('quickType').value; const category = document.getElementById('quickCategory').value || (type==='income'?'Salary':'Misc'); const amount = Number(document.getElementById('quickAmount').value) || 0; const date = document.getElementById('quickDate').value || new Date().toISOString().slice(0,10); const t = { id: uid(), type, category, amount, date, accountId: null, note: '' }; state.transactions.push(t); debouncedSave(); document.getElementById('quickAmount').value=''; document.getElementById('quickCategory').value=''; });
  const clearQuick = document.getElementById('clearQuick'); if(clearQuick) clearQuick.addEventListener('click', ()=>{ document.getElementById('quickAmount').value=''; document.getElementById('quickCategory').value=''; });

  // transaction form
  const openAddTransaction = document.getElementById('openAddTransaction'); if(openAddTransaction) openAddTransaction.addEventListener('click', ()=>{ const wrap = document.getElementById('transactionFormWrap'); if(wrap) wrap.style.display='block'; const form = document.getElementById('transactionForm'); if(form) form.reset(); const id = document.getElementById('txnId'); if(id) id.value=''; buildAccountOptions(); const title = document.getElementById('transactionFormTitle'); if(title) title.textContent='New Transaction'; });
  const cancelTxn = document.getElementById('cancelTxn'); if(cancelTxn) cancelTxn.addEventListener('click', ()=>{ const wrap = document.getElementById('transactionFormWrap'); if(wrap) wrap.style.display='none'; });

  const txnForm = document.getElementById('transactionForm'); if(txnForm) txnForm.addEventListener('submit', e=>{ e.preventDefault(); const id = document.getElementById('txnId').value; const type = document.getElementById('txnType').value; const category = document.getElementById('txnCategory').value; const amount = Number(document.getElementById('txnAmount').value||0); const date = document.getElementById('txnDate').value; const accountVal = document.getElementById('txnAccount').value; const note = document.getElementById('txnNote').value; if(!accountVal){ alert('Select an account (asset/card/liability) to apply this transaction.'); return; } const txn = { id: id || uid(), type, category, amount, date, accountId: accountVal, note };
    const applyToAccount = (accountVal, type, amount) =>{
      const [kind, accId] = accountVal.split(':');
      if(kind==='asset'){
        const a = state.assets.find(x=>x.id===accId); if(!a) return; if(type==='expense') a.value = Number(a.value||0) - amount; else a.value = Number(a.value||0) + amount;
      }else if(kind==='card'){
        const c = state.creditCards.find(x=>x.id===accId); if(!c) return; if(type==='expense') c.balance = Number(c.balance||0) + amount; else c.balance = Number(c.balance||0) - amount;
      }else if(kind==='liab'){
        const l = state.liabilities.find(x=>x.id===accId); if(!l) return; if(type==='expense') l.amount = Number(l.amount||0) + amount; else l.amount = Number(l.amount||0) - amount;
      }
    };

    if(id){ const idx = state.transactions.findIndex(t=>t.id===id); if(idx>=0){ const old = state.transactions[idx]; if(old.accountId) reverseApply(old.accountId, old.type, Number(old.amount||0)); state.transactions[idx]=txn; applyToAccount(accountVal, type, amount); } }
    else { state.transactions.push(txn); applyToAccount(accountVal, type, amount); }
    debouncedSave(); const wrap = document.getElementById('transactionFormWrap'); if(wrap) wrap.style.display='none'; });

  const transactionsTable = document.getElementById('transactionsTable'); if(transactionsTable) transactionsTable.addEventListener('click', e=>{ const act = e.target.dataset.act; const id = e.target.dataset.id; if(!act) return; if(act==='edit-txn'){ const t = state.transactions.find(x=>x.id===id); if(!t) return; document.getElementById('txnId').value = t.id; document.getElementById('txnType').value = t.type; document.getElementById('txnCategory').value = t.category; document.getElementById('txnAmount').value = t.amount; document.getElementById('txnDate').value = t.date.slice(0,10); buildAccountOptions(); setTimeout(()=>{ const sel = document.getElementById('txnAccount'); for(let i=0;i<sel.options.length;i++){ if(sel.options[i].value===t.accountId){ sel.selectedIndex=i; break; } } },50); document.getElementById('txnNote').value = t.note || ''; const wrap = document.getElementById('transactionFormWrap'); if(wrap) wrap.style.display='block'; const title = document.getElementById('transactionFormTitle'); if(title) title.textContent='Edit Transaction'; }
    if(act==='del-txn'){ if(confirm('Delete transaction?')){ const t = state.transactions.find(x=>x.id===id); if(t && t.accountId){ reverseApply(t.accountId, t.type, Number(t.amount||0)); } state.transactions = state.transactions.filter(x=>x.id!==id); debouncedSave(); } } });

  // Assets, Cards, Liabilities controls (wire up minimal parts present in index)
  const openAddAsset = document.getElementById('openAddAsset'); if(openAddAsset) openAddAsset.addEventListener('click', ()=>{ const wrap = document.getElementById('assetFormWrap'); if(wrap) wrap.style.display='block'; const form = document.getElementById('assetForm'); if(form) form.reset(); const id = document.getElementById('assetId'); if(id) id.value=''; });
  const cancelAsset = document.getElementById('cancelAsset'); if(cancelAsset) cancelAsset.addEventListener('click', ()=>{ const wrap = document.getElementById('assetFormWrap'); if(wrap) wrap.style.display='none'; });
  function populateAssetCategories() {
  const mainCategory = document.getElementById('assetMainCategory');
  const subCategory = document.getElementById('assetSubCategory');
  if (!mainCategory || !subCategory) return;

  // Clear and populate main categories
  mainCategory.innerHTML = '<option value="">Select Category</option>';
  Object.keys(ASSET_CATEGORIES).forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    mainCategory.appendChild(opt);
  });

  // Handle main category change
  mainCategory.onchange = () => {
    const selected = mainCategory.value;
    subCategory.innerHTML = '<option value="">Select Subcategory</option>';
    if (selected && ASSET_CATEGORIES[selected]) {
      ASSET_CATEGORIES[selected].forEach(subCat => {
        const opt = document.createElement('option');
        opt.value = subCat;
        opt.textContent = subCat;
        subCategory.appendChild(opt);
      });
      subCategory.disabled = false;
    } else {
      subCategory.disabled = true;
    }
  };
}

const assetForm = document.getElementById('assetForm'); 
if(assetForm) {
  assetForm.addEventListener('submit', e=>{ 
    e.preventDefault(); 
    const id = document.getElementById('assetId').value;
    const mainCategory = document.getElementById('assetMainCategory').value;
    const subCategory = document.getElementById('assetSubCategory').value;
    const obj = { 
      id: id||uid(), 
      name: document.getElementById('assetName').value,
      mainCategory,
      subCategory, 
      value: Number(document.getElementById('assetValue').value||0) 
    }; 
    if(id){ 
      const ix = state.assets.findIndex(a=>a.id===id); 
      if(ix>=0) state.assets[ix]=obj; 
    } else state.assets.push(obj); 
    debouncedSave(); 
    const wrap = document.getElementById('assetFormWrap'); 
    if(wrap) wrap.style.display='none'; 
  });

  // Initialize categories when form is shown
  const openAddAsset = document.getElementById('openAddAsset'); 
  if(openAddAsset) {
    openAddAsset.addEventListener('click', () => {
      populateAssetCategories();
    });
  }
};
  const assetsTable = document.getElementById('assetsTable'); 
  if(assetsTable) assetsTable.addEventListener('click', e=>{ 
    const act = e.target.dataset.act; 
    const id = e.target.dataset.id; 
    if(!act) return; 
    if(act==='edit-asset'){ 
      const a = state.assets.find(x=>x.id===id); 
      if(!a) return;
      document.getElementById('assetId').value = a.id;
      document.getElementById('assetName').value = a.name;
      document.getElementById('assetValue').value = a.value;
      
      // Populate categories
      populateAssetCategories();
      
      // Set selected values after a short delay to ensure options are populated
      setTimeout(() => {
        const mainCategory = document.getElementById('assetMainCategory');
        const subCategory = document.getElementById('assetSubCategory');
        if (mainCategory) {
          mainCategory.value = a.mainCategory || '';
          mainCategory.dispatchEvent(new Event('change'));
        }
        if (subCategory) {
          setTimeout(() => {
            subCategory.value = a.subCategory || '';
          }, 50);
        }
      }, 50);

      const wrap = document.getElementById('assetFormWrap');
      if(wrap) wrap.style.display='block';
      const title = document.getElementById('assetFormTitle');
      if(title) title.textContent='Edit Asset';
    }
    if(act==='del-asset'){
      if(confirm('Delete asset?')){
        state.assets = state.assets.filter(x=>x.id!==id);
        debouncedSave();
      }
    }
  });

  // Cards
  const openAddCard = document.getElementById('openAddCard'); if(openAddCard) openAddCard.addEventListener('click', ()=>{ const wrap = document.getElementById('cardFormWrap'); if(wrap) wrap.style.display='block'; const form = document.getElementById('cardForm'); if(form) form.reset(); const id = document.getElementById('cardId'); if(id) id.value=''; });
  const cancelCard = document.getElementById('cancelCard'); if(cancelCard) cancelCard.addEventListener('click', ()=>{ const wrap = document.getElementById('cardFormWrap'); if(wrap) wrap.style.display='none'; });
  const cardForm = document.getElementById('cardForm'); if(cardForm) cardForm.addEventListener('submit', e=>{ e.preventDefault(); const id = document.getElementById('cardId').value; const obj = { id: id||uid(), name: document.getElementById('cardName').value, limit: Number(document.getElementById('cardLimit').value||0), balance: Number(document.getElementById('cardBalance').value||0), aer: Number(document.getElementById('cardAER').value||0), dueDay: Number(document.getElementById('cardDueDay').value||0) }; if(id){ const ix = state.creditCards.findIndex(c=>c.id===id); if(ix>=0) state.creditCards[ix]=obj; } else state.creditCards.push(obj); debouncedSave(); const wrap = document.getElementById('cardFormWrap'); if(wrap) wrap.style.display='none'; });
  const cardsTable = document.getElementById('cardsTable'); if(cardsTable) cardsTable.addEventListener('click', e=>{ const act = e.target.dataset.act; const id = e.target.dataset.id; if(!act) return; if(act==='edit-card'){ const a = state.creditCards.find(x=>x.id===id); if(!a) return; document.getElementById('cardId').value=a.id; document.getElementById('cardName').value=a.name; document.getElementById('cardLimit').value=a.limit; document.getElementById('cardBalance').value=a.balance; document.getElementById('cardAER').value=a.aer||''; document.getElementById('cardDueDay').value=a.dueDay||''; const wrap = document.getElementById('cardFormWrap'); if(wrap) wrap.style.display='block'; const title = document.getElementById('cardFormTitle'); if(title) title.textContent='Edit Card'; } if(act==='del-card'){ if(confirm('Delete card?')){ state.creditCards = state.creditCards.filter(x=>x.id!==id); debouncedSave(); } } });

  // Liabilities
  const openAddLiability = document.getElementById('openAddLiability'); if(openAddLiability) openAddLiability.addEventListener('click', ()=>{ const wrap = document.getElementById('liabilityFormWrap'); if(wrap) wrap.style.display='block'; const form = document.getElementById('liabilityForm'); if(form) form.reset(); const id = document.getElementById('liabilityId'); if(id) id.value=''; });
  const cancelLiability = document.getElementById('cancelLiability'); if(cancelLiability) cancelLiability.addEventListener('click', ()=>{ const wrap = document.getElementById('liabilityFormWrap'); if(wrap) wrap.style.display='none'; });
  function populateLiabilityCategories() {
  const mainCategory = document.getElementById('liabilityMainCategory');
  const subCategory = document.getElementById('liabilitySubCategory');
  if (!mainCategory || !subCategory) return;

  // Clear and populate main categories
  mainCategory.innerHTML = '<option value="">Select Category</option>';
  Object.keys(LIABILITY_CATEGORIES).forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    mainCategory.appendChild(opt);
  });

  // Handle main category change
  mainCategory.onchange = () => {
    const selected = mainCategory.value;
    subCategory.innerHTML = '<option value="">Select Subcategory</option>';
    if (selected && LIABILITY_CATEGORIES[selected]) {
      LIABILITY_CATEGORIES[selected].forEach(subCat => {
        const opt = document.createElement('option');
        opt.value = subCat;
        opt.textContent = subCat;
        subCategory.appendChild(opt);
      });
      subCategory.disabled = false;
    } else {
      subCategory.disabled = true;
    }
  };
}

const liabilityForm = document.getElementById('liabilityForm'); 
if(liabilityForm) {
  liabilityForm.addEventListener('submit', e=>{ 
    e.preventDefault(); 
    const id = document.getElementById('liabilityId').value;
    const mainCategory = document.getElementById('liabilityMainCategory').value;
    const subCategory = document.getElementById('liabilitySubCategory').value;
    const obj = { 
      id: id||uid(), 
      name: document.getElementById('liabilityName').value,
      mainCategory,
      subCategory,
      amount: Number(document.getElementById('liabilityAmount').value||0),
      dueDate: document.getElementById('liabilityDue').value || null 
    }; 
    if(id){ 
      const ix = state.liabilities.findIndex(c=>c.id===id); 
      if(ix>=0) state.liabilities[ix]=obj; 
    } else state.liabilities.push(obj); 
    debouncedSave(); 
    const wrap = document.getElementById('liabilityFormWrap'); 
    if(wrap) wrap.style.display='none'; 
  });

  // Initialize categories when form is shown
  const openAddLiability = document.getElementById('openAddLiability'); 
  if(openAddLiability) {
    openAddLiability.addEventListener('click', () => {
      populateLiabilityCategories();
    });
  }
};
  const liabilitiesTable = document.getElementById('liabilitiesTable'); 
  if(liabilitiesTable) liabilitiesTable.addEventListener('click', e=>{ 
    const act = e.target.dataset.act; 
    const id = e.target.dataset.id; 
    if(!act) return; 
    if(act==='edit-liability'){ 
      const l = state.liabilities.find(x=>x.id===id); 
      if(!l) return;
      document.getElementById('liabilityId').value = l.id;
      document.getElementById('liabilityName').value = l.name;
      document.getElementById('liabilityAmount').value = l.amount;
      document.getElementById('liabilityDue').value = l.dueDate || '';
      
      // Populate categories
      populateLiabilityCategories();
      
      // Set selected values after a short delay to ensure options are populated
      setTimeout(() => {
        const mainCategory = document.getElementById('liabilityMainCategory');
        const subCategory = document.getElementById('liabilitySubCategory');
        if (mainCategory) {
          mainCategory.value = l.mainCategory || '';
          mainCategory.dispatchEvent(new Event('change'));
        }
        if (subCategory) {
          setTimeout(() => {
            subCategory.value = l.subCategory || '';
          }, 50);
        }
      }, 50);

      const wrap = document.getElementById('liabilityFormWrap');
      if(wrap) wrap.style.display='block';
      const title = document.getElementById('liabilityFormTitle');
      if(title) title.textContent='Edit Liability';
    }
    if(act==='del-liability'){
      if(confirm('Delete liability?')){
        state.liabilities = state.liabilities.filter(x=>x.id!==id);
        debouncedSave();
      }
    }
  });

  // export/import
  const downloadBackup = document.getElementById('downloadBackup'); if(downloadBackup) downloadBackup.addEventListener('click', ()=>downloadJSON());
  const exportJson = document.getElementById('exportJson'); if(exportJson) exportJson.addEventListener('click', ()=>downloadJSON());
  const exportBtn = document.getElementById('exportBtn'); if(exportBtn) exportBtn.addEventListener('click', ()=>downloadJSON());
  const filePicker = document.getElementById('filePicker'); if(filePicker) filePicker.addEventListener('change', async (e)=>{ if(!e.target.files || e.target.files.length===0) return; const file = e.target.files[0]; try{ const txt = await file.text(); const imported = JSON.parse(txt); if(!confirm('Importing will replace your current data. Continue?')) return; state = Object.assign(structuredClone(DEFAULT_DATA), imported); saveState(); alert('Import complete'); }catch(err){ alert('Failed to import file: '+err.message); } });
  const importBtn = document.getElementById('importBtn'); if(importBtn) importBtn.addEventListener('click', ()=>{ const btn = document.querySelector('[data-tab="import"]'); if(btn) btn.click(); });

  // settings
  const settingsForm = document.getElementById('settingsForm'); if(settingsForm) settingsForm.addEventListener('submit', e=>{ e.preventDefault(); const cur = (document.getElementById('settingCurrency').value || 'USD').toUpperCase(); state.settings.currency = cur; state.settings.theme = document.getElementById('settingTheme').value || 'dark'; state.settings.includeCreditInNetworth = document.getElementById('settingIncludeCredit').checked; debouncedSave(); alert('Settings saved and applied'); });

  // storage listener
  window.addEventListener('storage', (e)=>{ if(e.key===STORAGE_KEY){ state = loadState(); renderAll(); } });
}

function toggleSidebar(force){ const sb = document.getElementById('sidebar'); if(!sb) return; if(force===undefined) sb.classList.toggle('open'); else if(force) sb.classList.add('open'); else sb.classList.remove('open'); }

// account options for transactions
function buildAccountOptions(){ const select = document.getElementById('txnAccount'); if(!select) return; select.innerHTML = ''; const addOpt = (label, value)=>{ const o = document.createElement('option'); o.value = value; o.textContent = label; select.appendChild(o); };
  if(state.assets.length) addOpt('--- Assets ---','opt-sep');
  state.assets.forEach(a=> addOpt(`${a.name} (asset) — ${fmtNumber(a.value)}`, `asset:${a.id}`));
  if(state.creditCards.length) addOpt('--- Credit Cards ---','opt-sep');
  state.creditCards.forEach(c=> addOpt(`${c.name} (card) — bal ${fmtNumber(c.balance)}`, `card:${c.id}`));
  if(state.liabilities.length) addOpt('--- Liabilities ---','opt-sep');
  state.liabilities.forEach(l=> addOpt(`${l.name} (liability) — ${fmtNumber(l.amount)}`, `liab:${l.id}`));
  if(select.options.length) select.selectedIndex = 0;
}

// reverse apply helper used when editing
function reverseApply(accountVal, type, amount){ const revType = type==='income' ? 'expense' : 'income'; const [kind, accId] = accountVal.split(':'); if(kind==='asset'){ const a = state.assets.find(x=>x.id===accId); if(!a) return; if(revType==='expense') a.value = Number(a.value||0) - amount; else a.value = Number(a.value||0) + amount; } else if(kind==='card'){ const c = state.creditCards.find(x=>x.id===accId); if(!c) return; if(revType==='expense') c.balance = Number(c.balance||0) + amount; else c.balance = Number(c.balance||0) - amount; } else if(kind==='liab'){ const l = state.liabilities.find(x=>x.id===accId); if(!l) return; if(revType==='expense') l.amount = Number(l.amount||0) + amount; else l.amount = Number(l.amount||0) - amount; } }

// download helper
function downloadJSON(filename = 'finance_backup.json'){ const blob = new Blob([JSON.stringify(state, null, 2)], {type:'application/json'}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url); }

// initial setup
document.addEventListener('DOMContentLoaded', ()=>{ initUI(); renderAll(); setInterval(()=>saveState(), 10000); });
