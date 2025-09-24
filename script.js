
(function(){

  // =============== LOGIN GUARD v3 (carrega de JSON) ===============
  // Estrutura aceita em users.json:
  // {
  //   "Dirciano": "2025-10-25",
  //   "Guest":    "31/12/2025",
  //   "Maria": { "exp": "2026-01-10", "valor": "R$ 29,90", "plano": "Mensal" }
  // }

  const AUTH_URL   = 'users.json'; // <-- ajuste o caminho do seu JSON
  const TICK_MS    = 10000;        // revalidação a cada 10s (e recarrega o JSON)
  const SESS_KEY   = 'pcalc_session';
  const OVERLAY_ID = 'pcalc-login-overlay';
  const BADGE_ID   = 'pcalc-user-badge';

  // cache em memória do JSON carregado
  let USER_MAP = {};        // { username: { exp:"AAAA-MM-DD|DD/MM/AAAA", ...extras } }
  let _lastFetchOk = false;

  // ============== Utilidades de data / sessão ==============
  function parseExpiry(str){
    if(!str) return null;
    const s = String(str).trim();
    let d = null;
    if(/^\d{2}\/\d{2}\/\d{4}$/.test(s)){ // DD/MM/AAAA
      const [dd,mm,yy] = s.split('/').map(Number);
      d = new Date(yy, mm-1, dd, 23,59,59,999);
    }else if(/^\d{4}-\d{2}-\d{2}$/.test(s)){ // AAAA-MM-DD
      const [yy,mm,dd] = s.split('-').map(Number);
      d = new Date(yy, mm-1, dd, 23,59,59,999);
    }
    return isNaN(d?.getTime()) ? null : d;
  }
  function now(){ return new Date(); }

  function sessGet(){
    try{ return JSON.parse(localStorage.getItem(SESS_KEY)||'null'); }catch(e){ return null; }
  }
  function sessSet(u, exp, extra){
    const obj = { u, exp, extra: extra||null, t: Date.now() };
    localStorage.setItem(SESS_KEY, JSON.stringify(obj));
    return obj;
  }
  function sessClear(){ localStorage.removeItem(SESS_KEY); }

  // ============== Carregar JSON (sem cache) ==============
  async function fetchWhitelist(){
    try{
      const url = `${AUTH_URL}${AUTH_URL.includes('?') ? '&' : '?'}_=${Date.now()}`;
      const res = await fetch(url, { cache:'no-store' });
      if(!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      // Normaliza: aceita string ou objeto
      const norm = {};
      for(const [user, val] of Object.entries(data||{})){
        if(val && typeof val === 'object'){
          const {exp, ...extra} = val;
          norm[user] = { exp: exp || null, ...extra };
        }else{
          norm[user] = { exp: val || null };
        }
      }
      USER_MAP = norm;
      _lastFetchOk = true;
    }catch(err){
      console.error('[AUTH] Erro ao carregar JSON:', err);
      _lastFetchOk = false;
    }
  }

  function listAllowedUsers(){
    return Object.keys(USER_MAP).sort();
  }
  function getUserRecord(u){
    const rec = USER_MAP[u];
    if(!rec) return null;
    return rec && typeof rec === 'object' ? rec : {exp: rec};
  }

  function isUserAllowed(u){
    if(!u) return false;
    return !!USER_MAP[u];
  }
  function isSessionValid(){
    const s = sessGet();
    if(!s || !s.u || !s.exp) return false;
    // usuário ainda existe no JSON?
    const rec = getUserRecord(s.u);
    if(!rec) return false;

    const d = parseExpiry(s.exp);
    if(!d) return false;
    return now() <= d;
  }

  // ============== UI: Badge / Overlay ==============
  function ensureBadge(){
    if(!isSessionValid()) { removeBadge(); return; }
    let badge = document.getElementById(BADGE_ID);
    const s = sessGet();
    if(!badge){
      badge = document.createElement('div');
      badge.id = BADGE_ID;
      badge.style.cssText = 'position:fixed;right:10px;top:10px;background:#0b1324;color:#cbd5e1;border:1px solid #334155;border-radius:10px;padding:6px 10px;font-size:12px;z-index:99999';
      document.body.appendChild(badge);
    }
    const extra = s?.extra;
    const extraBits = [];
    if(extra?.plano) extraBits.push(`plano: ${extra.plano}`);
    if(extra?.valor) extraBits.push(`valor: ${extra.valor}`);

    badge.innerHTML = `👤 <b style="color:#e5e7eb">${s.u}</b> • expira: ${s.exp}
                       ${extraBits.length?`<br><span class="mut" style="color:#9ca3af">${extraBits.join(' • ')}</span>`:''}
                       <div style="display:flex;gap:8px;margin-top:4px;align-items:center">
                         <span id="pcalc-logout" style="color:#93c5fd;cursor:pointer;text-decoration:underline">sair</span>
                         <span class="mut" style="font-size:11px;color:${_lastFetchOk?'#86efac':'#fca5a5'}" title="status do JSON">JSON: ${_lastFetchOk?'ok':'erro'}</span>
                       </div>`;
    const logoutEl = document.getElementById('pcalc-logout');
    if(logoutEl){
      logoutEl.onclick = (e)=>{
        e.preventDefault();
        sessClear();
        removeBadge();
        showOverlay(); // volta a pedir login imediatamente
      };
    }
  }
  function removeBadge(){
    const b = document.getElementById(BADGE_ID);
    if(b) b.remove();
  }

  function overlayHtml(){
    const allowed = listAllowedUsers();
    return `
      <div style="background:#111827;border:1px solid #1f2937;border-radius:14px;box-shadow:0 12px 30px rgba(0,0,0,.35);padding:18px;max-width:360px;width:92%">
        <h3 style="margin:0 0 8px;color:#e5e7eb;font-size:18px">Entrar</h3>
        <div style="color:#94a3b8;margin-bottom:10px">Informe seu usuário (precisa estar no arquivo JSON) para liberar a calculadora.</div>
        <label style="display:block;color:#cbd5e1;font-size:13px;margin-bottom:6px">Usuário</label>
        <input id="pcalcLoginUser" type="text" placeholder="ex.: Dirciano" style="width:100%;background:#0b1324;color:#e5e7eb;border:1px solid #334155;border-radius:10px;padding:8px">
        <div style="display:flex;gap:8px;margin-top:12px;align-items:center">
          <button id="pcalcLoginBtn" class="btn" style="background:#2563eb;border-color:#2563eb;color:#fff;border:1px solid #2563eb;border-radius:10px;padding:8px 10px;cursor:pointer">Entrar</button>
          <button id="pcalcLoginClear" class="btn" style="background:#0b1324;color:#e5e7eb;border:1px solid #334155;border-radius:10px;padding:8px 10px;cursor:pointer">Limpar sessão</button>
          <button id="pcalcReloadJson" class="btn" style="background:#0b1324;color:#e5e7eb;border:1px solid #334155;border-radius:10px;padding:8px 10px;cursor:pointer">Recarregar JSON</button>
        </div>
        <div id="pcalcLoginErr" style="color:#fca5a5;margin-top:8px;min-height:18px"></div>
        <div style="color:#94a3b8;margin-top:8px;font-size:12px">
          Usuários (JSON): ${allowed.length? allowed.join(', ') : '—'}
        </div>
      </div>
    `;
  }
  function showOverlay(){
    let ov = document.getElementById(OVERLAY_ID);
    if(ov){ ov.innerHTML = overlayHtml(); wireOverlay(ov); return ov; }
    ov = document.createElement('div');
    ov.id = OVERLAY_ID;
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(2,6,23,.78);backdrop-filter:blur(2px);display:grid;place-items:center;z-index:100000';
    ov.innerHTML = overlayHtml();
    document.body.appendChild(ov);
    wireOverlay(ov);
    return ov;
  }
  function wireOverlay(ov){
    const inp = ov.querySelector('#pcalcLoginUser');
    const btn = ov.querySelector('#pcalcLoginBtn');
    const clr = ov.querySelector('#pcalcLoginClear');
    const rld = ov.querySelector('#pcalcReloadJson');
    const err = ov.querySelector('#pcalcLoginErr');

    async function doLogin(){
      const u = (inp.value||'').trim();
      if(!u){ err.textContent='Informe o usuário.'; return; }
      if(!isUserAllowed(u)){ err.textContent='Usuário não encontrado no JSON.'; return; }
      const rec = getUserRecord(u);
      const exp = rec?.exp;
      const d = parseExpiry(exp);
      if(!d){ err.textContent='Data de expiração inválida (JSON).'; return; }
      if(now()>d){ err.textContent=`Acesso expirado em ${exp}.`; return; }
      sessSet(u, exp, rec);
      err.textContent='';
      hideOverlay();
      ensureBadge();
      if(typeof __pcalc_start_app__ === 'function' && !window.__PCALC_APP_STARTED__){
        window.__PCALC_APP_STARTED__ = true;
        __pcalc_start_app__();
      }
    }
    btn.addEventListener('click', doLogin);
    inp.addEventListener('keydown', (e)=>{ if(e.key==='Enter') doLogin(); });
    clr.addEventListener('click', ()=>{ sessClear(); err.textContent='Sessão apagada.'; });
    rld.addEventListener('click', async ()=>{
      err.textContent='Recarregando JSON...';
      await fetchWhitelist();
      err.textContent = _lastFetchOk ? 'JSON recarregado.' : 'Falha ao recarregar JSON.';
      // atualiza lista de usuários exibida
      showOverlay();
    });
  }
  function hideOverlay(){
    const ov = document.getElementById(OVERLAY_ID);
    if(ov) ov.remove();
  }

  // ============== Loop de guarda ==============
  async function guardTick(){
    await fetchWhitelist();

    const valid = isSessionValid();
    if(valid){
      hideOverlay();
      ensureBadge();
      // >>> AUTO-START pós-tick (se ainda não iniciou)
      if(typeof __pcalc_start_app__ === 'function' && !window.__PCALC_APP_STARTED__){
        window.__PCALC_APP_STARTED__ = true;
        __pcalc_start_app__();
      }
    }else{
      showOverlay();
      removeBadge();
    }
  }

  async function authInit(){
    // carrega JSON antes de checar sessão
    await fetchWhitelist();
    // checa imediatamente
    const valid = isSessionValid();
    if(valid){
      hideOverlay();
      ensureBadge();
      // >>> AUTO-START no carregamento (F5 friendly)
      if(typeof __pcalc_start_app__ === 'function' && !window.__PCALC_APP_STARTED__){
        window.__PCALC_APP_STARTED__ = true;
        __pcalc_start_app__();
      }
    }else{
      showOverlay();
    }
    // agenda verificações + recarga do JSON
    setInterval(guardTick, TICK_MS);
  }

  // =============== FIM LOGIN GUARD v3 ===============


  // ========= Helpers / Constantes =========
  const RANKS=[2,3,4,5,6,7,8,9,10,11,12,13,14];
  const RSTR={11:'J',12:'Q',13:'K',14:'A'};
  const SUITS=['s','h','d','c'];
  const SUIT_GLYPH={s:'\u2660', h:'\u2665', d:'\u2666', c:'\u2663'};
  const SUIT_CLASS={s:'s',h:'h',d:'d',c:'c'};
  const fmtRank=r=>RSTR[r]||String(r);
  const cardId=c=>`${c.r}${c.s}`;
  function makeDeck(){ const d=[]; for(const s of SUITS){ for(const r of RANKS){ d.push({r,s}); } } return d; }

  // ========= Estado =========
  let selected=[];
  let prevBoardLen = 0;
  let stageJustSet = null;

  function getKnown(){
    const byId = Object.fromEntries(makeDeck().map(c=>[cardId(c),c]));
    const cards = selected.map(id=>byId[id]);
    return { hand:cards.slice(0,2), board:cards.slice(2), byId };
  }

  // ========= Overlay (Top-5) =========
  let nutsOverlay=null, nutsHover=false, overlayTimer=null, wiredNuts=false;

  // ========= UI: Deck & Slots =========
  const deckEl = document.getElementById('deck');

  function renderSlots(){
    const ids=[...selected];
    const byId = Object.fromEntries(makeDeck().map(c=>[cardId(c),c]));
    const map=['h0','h1','b0','b1','b2','b3','b4','n0','n1'];
    map.forEach((sid)=>{
      const el=document.getElementById(sid);
      if(!el) return;
      const idx=['h0','h1','b0','b1','b2','b3','b4'].indexOf(sid);
      let id=null; if(idx>=0) id=ids[idx];
      if(id){
        const c=byId[id];
        el.classList.add('filled');
        el.innerHTML = `<div class="${SUIT_CLASS[c.s]}" style="text-align:center">
          <div style="font-weight:700;font-size:18px">${fmtRank(c.r)}</div>
          <div style="font-size:18px">${SUIT_GLYPH[c.s]}</div>
        </div>`;
      }else{
        el.classList.remove('filled');
        el.textContent='';
      }
    });
  }

  function renderDeck(){
    if(!deckEl) return; // proteção
    deckEl.innerHTML='';
    for(const s of SUITS){
      for(const r of RANKS){
        const id=`${r}${s}`;
        const el=document.createElement('div');
        el.className = `cell ${SUIT_CLASS[s]} ${selected.includes(id)?'sel':''}`;
        el.dataset.id=id; el.title=`${fmtRank(r)}${SUIT_GLYPH[s]}`;
        el.innerHTML = `<div style="font-weight:600">${fmtRank(r)}</div><div class="mut">${SUIT_GLYPH[s]}</div>`;
        el.addEventListener('click',()=>toggleCard(id));
        deckEl.appendChild(el);
      }
    }
    renderSlots();
    renderNuts();
    renderHeroMade();
    computeAndRenderOuts();
    renderEquityPanel();

    wiredNuts=false; wireNutsOverlayOnce(); hideNutsOverlay();
  }

  function updateStageChange(oldLen, newLen){
    if(newLen>=3 && oldLen<3) stageJustSet='Flop definido';
    else if(newLen>=4 && oldLen<4) stageJustSet='Turn definido';
    else if(newLen>=5 && oldLen<5) stageJustSet='River definido';
    prevBoardLen = newLen;
  }

  function toggleCard(id){
    const idx=selected.indexOf(id);
    if(idx>=0){ selected.splice(idx,1); }
    else{
      if(selected.length>=7) return;
      selected.push(id);
    }
    const newLen = Math.max(0, selected.length-2);
    updateStageChange(prevBoardLen, newLen);
    renderDeck();
  }

  // ========= Botões sorteio / limpar =========
  function pickRandom(n, excludeIds){
    const deck = makeDeck();
    const ex = new Set(excludeIds);
    const pool = deck.filter(c=>!ex.has(cardId(c)));
    const out=[];
    for(let i=0;i<n && pool.length>0;i++){
      const j = Math.floor(Math.random()*pool.length);
      out.push(pool[j]);
      pool.splice(j,1);
    }
    return out;
  }
  const btnFlop = document.getElementById('btnFlop');
  const btnTurn = document.getElementById('btnTurn');
  const btnRiver= document.getElementById('btnRiver');
  const btnClear= document.getElementById('btnClear');

  if(btnFlop) btnFlop.onclick = ()=>{
    if(selected.length<2){ alert('Selecione 2 cartas.'); return; }
    const need=[2,3,4].filter(i=>!selected[i]);
    if(!need.length){ alert('Flop já definido.'); return; }
    const oldLen = Math.max(0, selected.length-2);
    const add=pickRandom(need.length, selected).map(cardId);
    const before=selected.slice(0,2), after=selected.slice(2);
    for(let i=0;i<need.length;i++) after.splice(need[i]-2, 0, add[i]);
    selected = before.concat(after);
    const newLen = Math.max(0, selected.length-2);
    updateStageChange(oldLen, newLen);
    renderDeck();
  };
  if(btnTurn) btnTurn.onclick = ()=>{
    if(selected.length<5){ alert('Defina o flop.'); return; }
    if(selected[5]){ alert('Turn já definido.'); return; }
    const oldLen = Math.max(0, selected.length-2);
    const add=pickRandom(1, selected).map(cardId)[0];
    selected.splice(5,0,add);
    const newLen = Math.max(0, selected.length-2);
    updateStageChange(oldLen, newLen);
    renderDeck();
  };
  if(btnRiver) btnRiver.onclick = ()=>{
    if(selected.length<6){ alert('Defina o turn.'); return; }
    if(selected[6]){ alert('River já definido.'); return; }
    const oldLen = Math.max(0, selected.length-2);
    const add=pickRandom(1, selected).map(cardId)[0];
    selected.splice(6,0,add);
    const newLen = Math.max(0, selected.length-2);
    updateStageChange(oldLen, newLen);
    renderDeck();
  };
  if(btnClear) btnClear.onclick = ()=>{
    selected=[]; updateStageChange(prevBoardLen, 0); renderDeck();
  };

  // ========= Avaliador de mão =========
  const CAT={HIGH:0,PAIR:1,TWO:2,TRIPS:3,STRAIGHT:4,FLUSH:5,FULL:6,QUADS:7,STRAIGHT_FLUSH:8,ROYAL:9};
  const CAT_NAME={ [CAT.HIGH]:'Carta Alta',[CAT.PAIR]:'Par',[CAT.TWO]:'Dois Pares',[CAT.TRIPS]:'Trinca',[CAT.STRAIGHT]:'Straight',[CAT.FLUSH]:'Flush',[CAT.FULL]:'Full House',[CAT.QUADS]:'Quadra',[CAT.STRAIGHT_FLUSH]:'Straight Flush',[CAT.ROYAL]:'Royal Flush' };

  function evalBest(cards){
    const bySuit={s:[],h:[],d:[],c:[]}, count={};
    for(const c of cards){ bySuit[c.s].push(c); count[c.r]=(count[c.r]||0)+1; }
    for(const k in bySuit) bySuit[k].sort((a,b)=>b.r-a.r);

    function straightHigh(set){
      const u=[...set].sort((a,b)=>b-a);
      if(u.includes(14)) u.push(1);
      let run=1,b=null;
      for(let i=0;i<u.length-1;i++){
        if(u[i]-1===u[i+1]){ run++; if(run>=5) b=u[i+1]+4; }
        else run=1;
      }
      return b;
    }

    // Straight Flush / Royal
    let sfH=null,sfS=null;
    for(const s of SUITS){
      if(bySuit[s].length>=5){
        const high=straightHigh(new Set(bySuit[s].map(c=>c.r)));
        if(high){ sfH=Math.max(sfH||0,high); sfS=s; }
      }
    }
    if(sfH){ return (sfH===14) ? {cat:CAT.ROYAL,kick:[14],s:sfS} : {cat:CAT.STRAIGHT_FLUSH,kick:[sfH],s:sfS}; }

    // Quads
    let quad=null;
    for(const r of RANKS){ if(count[r]===4){ quad=r; break; } }
    if(quad){
      const kick = Math.max(...cards.filter(c=>c.r!==quad).map(c=>c.r));
      return {cat:CAT.QUADS, kick:[quad, kick]};
    }

    // Full House
    const trips=[], pairs=[];
    for(const r of RANKS.slice().reverse()){
      if(count[r]>=3) trips.push(r);
      else if(count[r]>=2) pairs.push(r);
    }
    if(trips.length){
      if(trips.length>=2) return {cat:CAT.FULL, kick:[trips[0], trips[1]]};
      if(pairs.length)   return {cat:CAT.FULL, kick:[trips[0], pairs[0]]};
    }

    // Flush
    for(const s of SUITS){
      if(bySuit[s].length>=5){
        return {cat:CAT.FLUSH, kick:bySuit[s].slice(0,5).map(c=>c.r)};
      }
    }

    // Straight
    const sH = straightHigh(new Set(cards.map(c=>c.r)));
    if(sH) return {cat:CAT.STRAIGHT, kick:[sH]};

    // Trips / Two Pair / Pair
    if(trips.length)       return {cat:CAT.TRIPS, kick:[trips[0]]};
    if(pairs.length>=2)    return {cat:CAT.TWO,   kick:[pairs[0], pairs[1]]};
    if(pairs.length===1)   return {cat:CAT.PAIR,  kick:[pairs[0]]};

    return {cat:CAT.HIGH, kick:[]};
  }
  function cmpEval(a,b){
    if(a.cat!==b.cat) return a.cat-b.cat;
    const l=Math.max(a.kick.length,b.kick.length);
    for(let i=0;i<l;i++){
      const va=a.kick[i]||0, vb=b.kick[i]||0;
      if(va!==vb) return va-vb;
    }
    return 0;
  }

  // ========= Chen (pré-flop) =========
  const CHEN_BASE={14:10,13:8,12:7,11:6,10:5,9:4.5,8:4,7:3.5,6:3,5:2.5,4:2,3:1.5,2:1};
  function chenScore(c1,c2){
    const r1=c1.r,r2=c2.r,s1=c1.s,s2=c2.s;
    const hi=Math.max(r1,r2), lo=Math.min(r1,r2);
    let score=CHEN_BASE[hi];
    if(r1===r2){ score=Math.max(5,score*2); return {score,pair:true,suited:false,gap:0,bonusSmall:false}; }
    const suited=(s1===s2);
    if(suited) score+=2;
    const gap=hi-lo-1;
    if(gap===0) score+=1; else if(gap===2) score-=1; else if(gap===3) score-=2; else if(gap>=4) score-=5;
    const bonusSmall=(hi<12&&gap<=1);
    if(bonusSmall) score+=1;
    return {score,pair:false,suited,gap,bonusSmall};
  }
  const chenPercent=s=>Math.max(0,Math.min(100,(s/20)*100));
  const preflopLabel=p=>p>=85?'Premium':p>=70?'Forte':p>=55?'Marginal':'Fraca';

  function renderPreflopPanel(){
    const box=document.getElementById('preflopBox');
    if(!box) return; // proteção
    const {hand,board}=getKnown();
    if(hand.length===2 && board.length<3){
      const cs=chenScore(hand[0],hand[1]);
      const pct=chenPercent(cs.score);
      const lab=preflopLabel(pct);
      const handHTML = hand.map(c=>`<span class="cardtag"><b class="${SUIT_CLASS[c.s]}">${fmtRank(c.r)}${SUIT_GLYPH[c.s]}</b></span>`).join(' ');
      box.style.display='block';
      box.innerHTML = `
        <h3>Pré-flop: Força (Chen)</h3>
        <div class="cards">${handHTML}</div>
        <div class="bar" style="margin-top:8px"><i style="width:${pct.toFixed(1)}%"></i></div>
        <div style="display:flex;justify-content:space-between;margin-top:6px">
          <small><b>${pct.toFixed(1)}%</b> (Chen ${cs.score.toFixed(1)}/20)</small>
          <small><b>${lab}</b></small>
        </div>
        <div class="labels" style="margin-top:6px">
          ${cs.pair?'<span class="lbl">Par</span>':''}
          ${cs.suited?'<span class="lbl">Suited +2</span>':''}
          ${!cs.pair?`<span class="lbl">Gap: ${cs.gap}</span>`:''}
          ${cs.bonusSmall?'<span class="lbl">Bônus straight +1</span>':''}
        </div>`;
    } else {
      box.style.display='none';
      box.innerHTML='';
    }
  }

  // ========= Outs =========
  function nextStreet(boardLen){ if(boardLen===3) return 'turn'; if(boardLen===4) return 'river'; return null; }

  function computeByRiverCountsExact(hand, board, remaining){
    const targets=[CAT.PAIR,CAT.TWO,CAT.TRIPS,CAT.STRAIGHT,CAT.FLUSH,CAT.FULL,CAT.QUADS,CAT.STRAIGHT_FLUSH,CAT.ROYAL];
    const n = remaining.length;
    const totalPairs = n*(n-1)/2;
    const byRiverCounts = Object.fromEntries(targets.map(t=>[t,0]));
    for(let i=0;i<n-1;i++){
      const ci = remaining[i];
      for(let j=i+1;j<n;j++){
        const cj = remaining[j];
        const ev = evalBest(hand.concat(board,[ci,cj]));
        const cat = ev.cat;
        if(byRiverCounts.hasOwnProperty(cat)) byRiverCounts[cat]++;
      }
    }
    return { byRiverCounts, totalPairs };
  }

  function computeOuts(){
    const {hand,board}=getKnown();
    const stage=nextStreet(board.length);
    const remaining = makeDeck().filter(c=>!selected.includes(cardId(c)));
    const targets=[CAT.PAIR,CAT.TWO,CAT.TRIPS,CAT.STRAIGHT,CAT.FLUSH,CAT.FULL,CAT.QUADS,CAT.STRAIGHT_FLUSH,CAT.ROYAL];
    const outsExact=Object.fromEntries(targets.map(t=>[t,new Set()]));

    let ctxText='';
    if(stage==='turn') ctxText='Próximo card: TURN (após o flop).';
    else if(stage==='river') ctxText='Próximo card: RIVER (após o turn).';

    if(!stage){
      return {stage:null, ctxText, totalRemain:remaining.length, outsExact, byRiverCounts:null, totalPairs:0};
    }

    for(const c of remaining){
      const ev = evalBest(hand.concat(board,[c]));
      const cat = ev.cat;
      if(outsExact[cat]) outsExact[cat].add(cardId(c));
    }

    let byRiverCounts=null, totalPairs=0;
    if(stage==='turn'){
      const r = computeByRiverCountsExact(hand, board, remaining);
      byRiverCounts = r.byRiverCounts;
      totalPairs = r.totalPairs;
    }

    return {stage, ctxText, totalRemain:remaining.length, outsExact, byRiverCounts, totalPairs};
  }

  function renderOuts(){
    const outEl=document.getElementById('outs');
    const infoEl=document.getElementById('ctxInfo');
    const hint=document.getElementById('stateHint');
    if(!outEl) return; // proteção

    try{ renderPreflopPanel(); }catch(e){}

    const res=computeOuts();
    if(infoEl) infoEl.textContent=res.ctxText||'';
    if(hint) hint.style.display = res.stage? 'none':'block';

    outEl.innerHTML='';
    const total = res.totalRemain;
    const order=[CAT.PAIR,CAT.TWO,CAT.TRIPS,CAT.STRAIGHT,CAT.FLUSH,CAT.FULL,CAT.QUADS,CAT.STRAIGHT_FLUSH,CAT.ROYAL];

    for(const t of order){
      const s=res.outsExact[t];
      const count=s.size;
      const pctNext= total ? (count/total*100) : 0;

      const box=document.createElement('div');
      box.className='out';
      box.innerHTML = `<h3>${CAT_NAME[t]}</h3>
        <div class="bar"><i style="width:${pctNext.toFixed(2)}%"></i></div>
        <div style="display:flex;justify-content:space-between;margin-top:6px">
          <small><b>${count}</b> outs de ${total} (${pctNext.toFixed(2)}%)</small>
          <small>${res.stage?'' : '<span class="mut">(aguardando flop para calcular)</span>'}</small>
        </div>`;

      const extra=document.createElement('div');
      extra.style.cssText='margin-top:4px;color:#cbd5e1;font-size:12px;display:flex;gap:14px;flex-wrap:wrap';
      if(res.stage==='turn'){
        let pr=0;
        if(res.totalPairs){
          const by = res.byRiverCounts?.[t] || 0;
          pr = by / res.totalPairs * 100;
        }
        extra.innerHTML = `<span><b>Turn:</b> ${pctNext.toFixed(1)}%</span><span><b>Até o river:</b> ${pr.toFixed(1)}%</span>`;
      } else if(res.stage==='river'){
        extra.innerHTML = `<span><b>River:</b> ${pctNext.toFixed(1)}%</span>`;
      }
      box.appendChild(extra);

      const list=document.createElement('div');
      list.className='cards';

      if(count && res.stage){
        const arr=[...s].sort((a,b)=>{
          const ra=parseInt(a), rb=parseInt(b);
          return rb-ra || a.charCodeAt(a.length-1)-b.charCodeAt(b.length-1);
        });
        for(const id of arr){
          const r=parseInt(id), su=id[id.length-1];
          const span=document.createElement('span');
          span.className='cardtag';
          span.innerHTML = `<span class="${SUIT_CLASS[su]}" style="font-weight:700">${fmtRank(r)}${SUIT_GLYPH[su]}</span>`;
          list.appendChild(span);
        }
      }else{
        const span=document.createElement('span');
        span.className='mut';
        span.textContent = res.stage? 'Sem outs.' : 'Defina o flop para ver outs.';
        list.appendChild(span);
      }

      box.appendChild(list);
      outEl.appendChild(box);
    }
  }
  function computeAndRenderOuts(){ renderOuts(); }

  // ========= Equidade (MC + exato no turn HU) =========
  function simulateEquity(hand,board,nOpp=1,trials=5000){
    const missing=5-board.length;
    if(missing<0) return {win:0,tie:0,lose:100};
    const base=makeDeck().filter(c=>!selected.includes(cardId(c)));
    let win=0,tie=0,lose=0;

    for(let t=0;t<trials;t++){
      const pool=base.slice();
      const need=2*nOpp+missing;
      for(let i=0;i<need;i++){
        const j=i+Math.floor(Math.random()*(pool.length-i));
        const tmp=pool[i]; pool[i]=pool[j]; pool[j]=tmp;
      }
      let idx=0;
      const opps=[];
      for(let k=0;k<nOpp;k++){ opps.push([pool[idx++],pool[idx++]]); }
      const extra=[];
      for(let k=0;k<missing;k++){ extra.push(pool[idx++]); }
      const full=board.concat(extra);

      const hero=evalBest(hand.concat(full));
      let best='hero',bestEv=hero,winners=['hero'];
      for(let k=0;k<nOpp;k++){
        const ev=evalBest(opps[k].concat(full));
        const cmp=cmpEval(ev,bestEv);
        if(cmp>0){ best=`opp${k}`; bestEv=ev; winners=[`opp${k}`]; }
        else if(cmp===0){ winners.push(`opp${k}`); }
      }
      if(best==='hero' && winners.length===1) win++;
      else if(winners.includes('hero')) tie++;
      else lose++;
    }
    const tot=win+tie+lose||1;
    return {win:win/tot*100, tie:tie/tot*100, lose:lose/tot*100};
  }

  function exactTurnEquity(hand, board){
    if(board.length!==4) return null;
    const remainingAll = makeDeck().filter(c=>!selected.includes(cardId(c)));
    let win=0, tie=0, lose=0;
    for(let i=0;i<remainingAll.length;i++){
      const river = remainingAll[i];
      const finalBoard = board.concat([river]);
      const heroEv = evalBest(hand.concat(finalBoard));
      const pool = [];
      for(let k=0;k<remainingAll.length;k++){ if(k!==i) pool.push(remainingAll[k]); }
      for(let a=0;a<pool.length-1;a++){
        const ca = pool[a];
        for(let b=a+1;b<pool.length;b++){
          const cb = pool[b];
          const oppEv = evalBest([ca,cb].concat(finalBoard));
          const cmp = cmpEval(heroEv, oppEv);
          if(cmp>0) win++;
          else if(cmp<0) lose++;
          else tie++;
        }
      }
    }
    const tot = win+tie+lose || 1;
    return {win:win/tot*100, tie:tie/tot*100, lose:lose/tot*100, _method:'exact-turn'};
  }

  function computeEquity(hand, board, nOpp=1, trials=5000){
    if(board.length===4 && nOpp===1){
      return exactTurnEquity(hand, board);
    }
    const mc = simulateEquity(hand,board,nOpp,trials);
    mc._method = 'mc';
    return mc;
  }

  // ========= SUGESTÃO =========
  function suggestAction(eqPct, hand, board, opp){
    const st = board.length<3 ? 'pre' : (board.length===3?'flop':(board.length===4?'turn':'river'));
    if(st==='pre'){
      const cs = chenScore(hand[0], hand[1]).score;
      if(cs >= 11) return {title:'APOSTE POR VALOR (AUMENTE)', detail:'2.5 – 3 BB (mão premium)'};
      if(cs >= 9)  return {title:'AUMENTO PEQUENO', detail:'2 – 2.5 BB (mão forte)'};
      if(cs >= 7)  return {title:'PAGAR OU ABRIR POTE', detail:'ou DESISTA se mesa/posição ruim'};
      return {title:'DESISTA', detail:'mão fraca pré-flop'};
    }
    const outsRes = computeOuts();
    const outsStraight = outsRes.outsExact?.[CAT.STRAIGHT]?.size || 0;
    const outsFlush    = outsRes.outsExact?.[CAT.FLUSH]?.size    || 0;
    const strongDraw = (outsFlush >= 9) || (outsStraight >= 8);
    const weakDraw   = (!strongDraw && outsStraight >= 4);
    const mult = (opp >= 2);

    if(eqPct > 65) return {title:'APOSTE POR VALOR', detail:'66% – 100% pot (ajuste vs vilão)'};
    if(eqPct >= 40 && eqPct <= 65) return {title:'CONTROLE O POTE', detail:'Check / Bet pequeno (≤ 33% pot)'};
    if(eqPct >= 20 && eqPct < 40){
      if(strongDraw) return {title:'SEMI-BLEFE', detail:'~ 60% pot (draw forte)'};
      if(!mult && weakDraw && eqPct >= 22) return {title:'SEMI-BLEFE leve (HU)', detail:'30% – 40% pot (gutshot)'};
      return {title:'CHECK', detail:'Sem valor suficiente para apostar'};
    }
    return {title:'CHECK OU DESISTA', detail:'Blefe puro só com muito fold equity (~75% pot) — risco alto'};
  }

  // ====== Decisão: classes/efeito ======
  function decisionClass(title){
    const t = (title || '').toUpperCase();
    if (t.includes('APOSTE') || t.includes('VALOR') || t.includes('AUMENTE')) return 'ok';
    if (t.includes('SEMI-BLEFE')) return 'warn';
    if (t.includes('CHECK OU DESISTA') || t.includes('DESISTA') || t.includes('FOLD')) return 'danger';
    if (t.includes('CONTROLE') || t.includes('CHECK') || t.includes('POT CONTROL')) return 'info';
    return 'info';
  }
  let _lastDecisionClass = null;
  function shouldGlow(cls){
    const glow = (_lastDecisionClass && _lastDecisionClass !== cls);
    _lastDecisionClass = cls;
    return glow;
  }

  // ========= Painel de Equidade + Voz =========
  function renderEquityPanel(){
    const box=document.getElementById('equityBox');
    if(!box) return; // proteção

    const {hand,board}=getKnown();
    const len=board.length;

    if(hand.length===2 && len<=5){
      const stage = len<3?'Pré-flop':(len===3?'Pós-flop':(len===4?'Pós-turn':'Pós-river'));
      box.style.display='block';
      if(!box.dataset.wired){
        box.innerHTML=`
          <h3>${stage}: Equidade até o showdown</h3>
          <div class="labels" style="align-items:center;margin-top:6px;gap:6px;flex-wrap:wrap">
            <span class="lbl">Oponentes:
              <select id="eqOpp" style="background:#0b1324;color:#e5e7eb;border:none;outline:0">
                ${Array.from({length:8},(_,i)=>`<option value="${i+1}">${i+1}</option>`).join('')}
              </select>
            </span>
            <span class="lbl">Amostras:
              <select id="eqTrials" style="background:#0b1324;color:#e5e7eb;border:none;outline:0">
                <option value="3000">3k</option>
                <option value="5000" selected>5k</option>
                <option value="10000">10k</option>
              </select>
            </span>
            <span class="lbl">
              <label style="display:flex;gap:6px;align-items:center;cursor:pointer">
                <input id="ttsEnable" type="checkbox" checked>
                <span>Voz</span>
              </label>
            </span>
            <span class="lbl">Voz:
              <select id="ttsVoice" style="max-width:160px;background:#0b1324;color:#e5e7eb;border:none;outline:0"></select>
            </span>
            <button class="btn" id="ttsTest">🔊 Testar</button>
            <button class="btn" id="btnEqCalc">↻ Recalcular</button>
          </div>
          <div id="eqStatus" class="mut" style="margin-top:8px"></div>
          <div class="bar" style="margin-top:8px"><i id="eqBarWin" style="width:0%"></i></div>
          <div style="display:flex;gap:8px;margin-top:6px" id="eqBreak"></div>
          <div class="hint" id="suggestOut" style="margin-top:10px"></div>
        `;
        box.dataset.wired='1';

        document.getElementById('btnEqCalc').onclick=calcEquity;
        document.getElementById('eqOpp').onchange=calcEquity;
        document.getElementById('eqTrials').onchange=calcEquity;

        const hasTTS = !!(window.TTS) && ('speechSynthesis' in window);
        const enableEl=document.getElementById('ttsEnable');
        const voiceSel=document.getElementById('ttsVoice');
        const testBtn=document.getElementById('ttsTest');

        if(hasTTS){
          window.TTS.populateVoices();
          speechSynthesis.onvoiceschanged = window.TTS.populateVoices;
          window.TTS.state.enabled = true;
          enableEl.checked = true;

          enableEl.onchange = (e)=>{
            window.TTS.state.enabled = e.target.checked;
            if(window.TTS.state.enabled) window.TTS.speak('Voz ativada');
          };
          voiceSel.onchange = (e)=>{
            const name=e.target.value;
            const v = speechSynthesis.getVoices().find(v=>v.name===name);
            if(v) window.TTS.state.voice=v;
          };
          testBtn.onclick = ()=> window.TTS.speak('Sugestão: aposte por valor');
        }else{
          enableEl.disabled=true;
          voiceSel.disabled=true;
          voiceSel.innerHTML = '<option>(sem suporte no navegador)</option>';
          testBtn.disabled=true;
        }
      }else{
        box.querySelector('h3').textContent=`${stage}: Equidade até o showdown`;
      }
      calcEquity();
    }else{
      box.style.display='none';
      box.innerHTML='';
      delete box.dataset.wired;
    }
  }

  function calcEquity(){
    const {hand,board}=getKnown();
    const opp=parseInt(document.getElementById('eqOpp').value,10);
    const trials=parseInt(document.getElementById('eqTrials').value,10);
    const st=document.getElementById('eqStatus');

    const useExactTurn = (board.length===4 && opp===1);
    if(st) st.textContent= useExactTurn ? 'Calculando (exato no turn)...' : 'Calculando...';

    const res = computeEquity(hand,board,opp,trials);

    const bar=document.getElementById('eqBarWin');
    if(bar) bar.style.width=`${res.win.toFixed(1)}%`;
    const br=document.getElementById('eqBreak');
    if(br) br.innerHTML=`<small><b>Win:</b> ${res.win.toFixed(1)}%</small>
                  <small><b>Tie:</b> ${res.tie.toFixed(1)}%</small>
                  <small><b>Lose:</b> ${res.lose.toFixed(1)}%</small>`;

    if(st){
      if(res._method==='exact-turn'){
        st.textContent=`Exato (turn) vs ${opp} oponente`;
      }else{
        st.textContent=`Monte Carlo vs ${opp} oponente(s) • ${trials.toLocaleString()} amostras`;
      }
    }

    const eqPct = board.length<3 ? chenPercent(chenScore(hand[0],hand[1]).score)
                                 : (res.win + res.tie/2);
    const sugg = suggestAction(eqPct, hand, board, opp);
    const out   = document.getElementById('suggestOut');
    const cls   = decisionClass(sugg.title);
    const glow  = shouldGlow(cls);

    if(out){
      out.innerHTML = `
        <div class="decision ${glow ? 'glow' : ''}">
          <div class="decision-title ${cls}">${sugg.title}</div>
          <div class="decision-detail">${sugg.detail}</div>
        </div>
      `;
    }

    if(window.TTS?.state?.enabled){
      if(stageJustSet){
        window.TTS.speak(`${stageJustSet}. Sugestão: ${sugg.title}`);
        stageJustSet = null;
      }else{
        window.TTS.speak(`Sugestão: ${sugg.title}`);
      }
    }
  }

  // ========= Nuts =========
  function computeNutsPair(){
    const {board}=getKnown();
    if(board.length<3) return null;
    const remaining = makeDeck().filter(c=>!selected.includes(cardId(c)));
    let bestPair=null, bestEv=null;
    for(let i=0;i<remaining.length;i++){
      for(let j=i+1;j<remaining.length;j++){
        const a=remaining[i], b=remaining[j];
        const ev = evalBest([a,b].concat(board));
        if(!bestEv || cmpEval(ev,bestEv)>0){ bestEv=ev; bestPair=[a,b]; }
      }
    }
    return bestPair? {pair:bestPair, ev:bestEv}: null;
  }
  function renderNuts(){
    const n0=document.getElementById('n0'), n1=document.getElementById('n1'), ncat=document.getElementById('nutsCat');
    function clear(el){ if(!el) return; el.classList.remove('filled'); el.textContent=''; }
    function paint(el,c){ if(!el) return; el.classList.add('filled'); el.innerHTML = `<div class="${SUIT_CLASS[c.s]}" style="text-align:center"><div style="font-weight:700;font-size:18px">${fmtRank(c.r)}</div><div style="font-size:18px">${SUIT_GLYPH[c.s]}</div></div>`; }

    const {board}=getKnown();
    if(board.length<3){
      paint(n0,{r:14,s:'s'}); paint(n1,{r:14,s:'h'});
      if(ncat) ncat.textContent='Par de Ases';
      return;
    }
    const res=computeNutsPair();
    if(!res){ clear(n0); clear(n1); if(ncat) ncat.textContent=''; return; }
    const [c1,c2]=res.pair; paint(n0,c1); paint(n1,c2);
    if(ncat) ncat.textContent = (CAT_NAME[res.ev.cat]||'');
  }

  // ========= "Sua mão está formando…" =========
  function renderHeroMade(){
    const el=document.getElementById('handCat'); if(!el) return;
    const {hand,board}=getKnown();
    if(hand.length<2){ el.textContent='Selecione sua mão'; return; }
    const ev=evalBest(hand.concat(board));
    el.textContent = CAT_NAME[ev.cat] || '—';
  }

  // ========= Top-5 Overlay =========
  const RANK_CHAR=r=>r===14?'A':r===13?'K':r===12?'Q':r===11?'J':r===10?'T':String(r);
  function pairKeyByRank(r1,r2){ const hi=Math.max(r1,r2), lo=Math.min(r1,r2); return `${hi}-${lo}`; }
  function pairLabelByRank(r1,r2){ const hi=Math.max(r1,r2), lo=Math.min(r1,r2); return `${RANK_CHAR(hi)}${RANK_CHAR(lo)}`; }

  function computeTop5PreflopChen(){
    const all=[];
    for(let i=0;i<RANKS.length;i++){
      for(let j=i;j<RANKS.length;j++){
        const r1=RANKS[j], r2=RANKS[i];
        const chenS = chenScore({r:r1,s:'s'},{r:r2,s:'s'}).score;
        const chenO = chenScore({r:r1,s:'s'},{r:r2,s:'h'}).score;
        const best = Math.max(chenS, chenO);
        all.push({label:pairLabelByRank(r1,r2), score:best});
      }
    }
    all.sort((a,b)=>b.score-a.score);
    return all.slice(0,5).map(x=>({label:x.label, right:`Chen ${x.score.toFixed(1)}/20`}));
  }

  function computeTop5Postflop(){
    const {board}=getKnown();
    const remaining = makeDeck().filter(c=>!selected.includes(cardId(c)));
    const bestByKey = new Map();
    for(let i=0;i<remaining.length;i++){
      for(let j=i+1;j<remaining.length;j++){
        const a=remaining[i], b=remaining[j];
        const key = pairKeyByRank(a.r,b.r);
        const ev = evalBest([a,b].concat(board));
        const cur = bestByKey.get(key);
        if(!cur || cmpEval(ev, cur.ev)>0){
          bestByKey.set(key,{ev,label:pairLabelByRank(a.r,b.r)});
        }
      }
    }
    const arr=[...bestByKey.values()];
    arr.sort((x,y)=> -cmpEval(x.ev,y.ev));
    return arr.slice(0,5).map(x=>({label:x.label, right:(CAT_NAME[x.ev.cat]||'')}));
  }

  function hideNutsOverlay(){ if(nutsOverlay){ nutsOverlay.remove(); nutsOverlay=null; } if(overlayTimer){ clearTimeout(overlayTimer); overlayTimer=null; } }
  function positionOverlayNear(anchor, el){
    const r=anchor.getBoundingClientRect();
    const top=r.bottom + window.scrollY + 6;
    let left=r.left + window.scrollX;
    document.body.appendChild(el);
    const w=el.getBoundingClientRect().width;
    const maxLeft=window.scrollX + window.innerWidth - w - 8;
    if(left>maxLeft) left = Math.max(8, maxLeft);
    el.style.position='absolute';
    el.style.top=`${top}px`;
    el.style.left=`${left}px`;
    el.style.zIndex='9999';
  }
  function showNutsOverlay(){
    const {board}=getKnown();
    const anchor=document.querySelector('.nutsline');
    if(!anchor) return;
    hideNutsOverlay();

    const isPreflop = board.length<3;
    const titleText = isPreflop ? 'Top 5 mãos (pré-flop)' : 'Top 5 mãos (ranks)';
    const rows = isPreflop ? computeTop5PreflopChen() : computeTop5Postflop();

    const wrap=document.createElement('div');
    wrap.id='nutsOverlay';
    wrap.style.cssText='background:#0b1324;border:1px solid #334155;border-radius:10px;box-shadow:0 12px 30px rgba(0,0,0,.35);padding:8px 10px;min-width:180px;';
    const title=document.createElement('div');
    title.className='mut';
    title.style.cssText='margin-bottom:6px;font-weight:600';
    title.textContent=titleText;
    wrap.appendChild(title);

    const list=document.createElement('div');
    if(rows.length){
      rows.forEach((it,idx)=>{
        const row=document.createElement('div');
        row.style.cssText='display:flex;justify-content:space-between;gap:10px;padding:4px 0';
        const left=document.createElement('div'); left.textContent=`${idx+1}) ${it.label}`;
        const right=document.createElement('div'); right.className='mut'; right.textContent=it.right;
        row.appendChild(left); row.appendChild(right);
        list.appendChild(row);
      });
    }else{
      const row=document.createElement('div'); row.className='mut'; row.textContent='—';
      list.appendChild(row);
    }
    wrap.appendChild(list);

    wrap.addEventListener('mouseenter', ()=>{ nutsHover=true; if(overlayTimer){clearTimeout(overlayTimer); overlayTimer=null;} });
    wrap.addEventListener('mouseleave', ()=>{ nutsHover=false; overlayTimer=setTimeout(()=>{ if(!nutsHover) hideNutsOverlay(); }, 180); });

    positionOverlayNear(anchor, wrap);
    nutsOverlay=wrap;
  }
  function wireNutsOverlayOnce(){
    if(wiredNuts) return;
    const anchor=document.querySelector('.nutsline');
    if(!anchor) return;
    wiredNuts=true;
    anchor.addEventListener('click', (e)=>{ e.stopPropagation(); if(nutsOverlay) hideNutsOverlay(); else showNutsOverlay(); });
    anchor.addEventListener('mouseenter', ()=>{ showNutsOverlay(); });
    anchor.addEventListener('mouseleave', ()=>{ overlayTimer=setTimeout(()=>{ if(!nutsHover) hideNutsOverlay(); }, 180); });
    document.addEventListener('click', (e)=>{ if(nutsOverlay && !nutsOverlay.contains(e.target) && !anchor.contains(e.target)) hideNutsOverlay(); });
  }

  // ========= Inicialização controlada por Login =========
  function __pcalc_start_app__(){
    prevBoardLen = Math.max(0, selected.length-2);
    renderDeck();
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    // Só chamamos authInit(); ele mesmo dá o auto-start quando a sessão está válida.
    authInit();
  });

})();

