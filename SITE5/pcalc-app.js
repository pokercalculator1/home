// pcalc-app.js
(function(g){
  // ====== Dependências do engine global (PCALC) ======
  const PC = g.PCALC;
  const {
    RANKS, SUITS, SUIT_CLASS, SUIT_GLYPH,
    fmtRank, cardId, makeDeck,
    evalBest, cmpEval, CAT, CAT_NAME
  } = PC;

  // ====== Stubs de segurança (não quebrar caso não existam) ======
  if(typeof PC.computeAndRenderOuts!=='function'){
    PC.computeAndRenderOuts = function(){ /* no-op */ };
  }
  if(typeof g.renderEquityPanel!=='function'){
    g.renderEquityPanel = function(){ /* no-op */ };
  }
  if(typeof g.calcEquity!=='function'){
    g.calcEquity = function(){ /* no-op */ };
  }
  if(typeof PC.getKnown!=='function'){
    // Esperado: retorna { hand:[{r,s},{r,s}], board:[...] } com base no state.selected
    PC.getKnown = function(){
      const ids = PC.state.selected||[];
      const byId = Object.fromEntries(makeDeck().map(c=>[cardId(c), c]));
      const cardObjs = ids.map(id=>byId[id]).filter(Boolean);
      const hand = cardObjs.slice(0,2);
      const board = cardObjs.slice(2,7);
      return {hand,board};
    };
  }
  if(!PC.state) PC.state = { selected: [], prevBoardLen: 0 };

  // ====== Estado do overlay/lista de nuts ======
  let nutsOverlay=null, nutsHover=false, overlayTimer=null, wiredNuts=false;
  let nutsListEl = null;

  // ====== Elementos da UI base ======
  const deckEl = document.getElementById('deck');
  const btnFlop = document.getElementById('btnFlop');
  const btnTurn = document.getElementById('btnTurn');
  const btnRiver= document.getElementById('btnRiver');
  const btnClear= document.getElementById('btnClear');

  // ===== Helpers de Rank (char) =====
  const RANK_CHAR = r=>r===14?'A':r===13?'K':r===12?'Q':r===11?'J':r===10?'T':String(r);

  // =========================================================
  // Renderização dos slots (mão e board)
  // =========================================================
  function renderSlots(){
    const ids=[...PC.state.selected];
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

  // =========================================================
  // Baralho clicável
  // =========================================================
  function renderDeck(){
    if(!deckEl) return;
    deckEl.innerHTML='';
    for(const s of SUITS){
      for(const r of RANKS){
        const id=`${r}${s}`;
        const el=document.createElement('div');
        el.className = `cell ${SUIT_CLASS[s]} ${PC.state.selected.includes(id)?'sel':''}`;
        el.dataset.id=id; el.title=`${fmtRank(r)}${SUIT_GLYPH[s]}`;
        el.innerHTML = `<div style="font-weight:600">${fmtRank(r)}</div><div class="mut">${SUIT_GLYPH[s]}</div>`;
        el.addEventListener('click',()=>toggleCard(id));
        deckEl.appendChild(el);
      }
    }
    renderSlots();
    renderNuts();
    renderHeroMade();
    PC.computeAndRenderOuts();
    g.renderEquityPanel();

    wiredNuts=false; wireNutsOverlayOnce(); hideNutsOverlay();
    safeRecalc();
  }

  // =========================================================
  // Controle de estágio (flop/turn/river)
  // =========================================================
  function updateStageChange(oldLen, newLen){
    if(newLen>=3 && oldLen<3) PC.state.stageJustSet='Flop definido';
    else if(newLen>=4 && oldLen<4) PC.state.stageJustSet='Turn definido';
    else if(newLen>=5 && oldLen<5) PC.state.stageJustSet='River definido';
    PC.state.prevBoardLen = newLen;
  }

  // =========================================================
  // Seleção de carta no grid
  // =========================================================
  function toggleCard(id){
    const idx=PC.state.selected.indexOf(id);
    if(idx>=0){ PC.state.selected.splice(idx,1); }
    else{
      if(PC.state.selected.length>=7) return;
      PC.state.selected.push(id);
    }
    const newLen = Math.max(0, PC.state.selected.length-2);
    updateStageChange(PC.state.prevBoardLen, newLen);
    renderDeck();
    safeRecalc();
  }

  // =========================================================
  // Sorteio aleatório sem repetir
  // =========================================================
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

  // =========================================================
  // Botões Flop / Turn / River / Clear
  // =========================================================
  if(btnFlop) btnFlop.onclick = ()=>{
    if(PC.state.selected.length<2){ alert('Selecione 2 cartas.'); return; }
    const need=[2,3,4].filter(i=>!PC.state.selected[i]);
    if(!need.length){ alert('Flop já definido.'); return; }
    const oldLen = Math.max(0, PC.state.selected.length-2);
    const add=pickRandom(need.length, PC.state.selected).map(cardId);
    const before=PC.state.selected.slice(0,2), after=PC.state.selected.slice(2);
    for(let i=0;i<need.length;i++) after.splice(need[i]-2, 0, add[i]);
    PC.state.selected = before.concat(after);
    const newLen = Math.max(0, PC.state.selected.length-2);
    updateStageChange(oldLen, newLen);
    renderDeck();
    safeRecalc();
  };
  if(btnTurn) btnTurn.onclick = ()=>{
    if(PC.state.selected.length<5){ alert('Defina o flop.'); return; }
    if(PC.state.selected[5]){ alert('Turn já definido.'); return; }
    const oldLen = Math.max(0, PC.state.selected.length-2);
    const add=pickRandom(1, PC.state.selected).map(cardId)[0];
    PC.state.selected.splice(5,0,add);
    const newLen = Math.max(0, PC.state.selected.length-2);
    updateStageChange(oldLen, newLen);
    renderDeck();
    safeRecalc();
  };
  if(btnRiver) btnRiver.onclick = ()=>{
    if(PC.state.selected.length<6){ alert('Defina o turn.'); return; }
    if(PC.state.selected[6]){ alert('River já definido.'); return; }
    const oldLen = Math.max(0, PC.state.selected.length-2);
    const add=pickRandom(1, PC.state.selected).map(cardId)[0];
    PC.state.selected.splice(6,0,add);
    const newLen = Math.max(0, PC.state.selected.length-2);
    updateStageChange(oldLen, newLen);
    renderDeck();
    safeRecalc();
  };
  if(btnClear) btnClear.onclick = ()=>{
    const oldLen = Math.max(0, PC.state.selected.length-2);
    PC.state.selected=[];
    updateStageChange(oldLen, 0);
    renderDeck();
    safeRecalc();
  };

  // =========================================================
  // Mão feita do herói (categoria)
  // =========================================================
  function renderHeroMade(){
    const el=document.getElementById('handCat'); if(!el) return;
    const {hand,board}=PC.getKnown();
    if(hand.length<2){ el.textContent='Selecione sua mão'; return; }
    const ev=evalBest(hand.concat(board));
    el.textContent = CAT_NAME[ev.cat] || '—';
  }

  // =========================================================
  // Simulação Monte Carlo (genérica)
  // =========================================================
  function simulateEquity(hand,board,nOpp=1,trials=5000){
    const missing=5-board.length;
    if(missing<0) return {win:0,tie:0,lose:100};
    const base=makeDeck().filter(c=>!PC.state.selected.includes(cardId(c)));
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

  // =========================================================
  // Equidade exata no turn (1 oponente)
  // =========================================================
  function exactTurnEquity(hand, board){
    if(board.length!==4) return null;
    const remainingAll = makeDeck().filter(c=>!PC.state.selected.includes(cardId(c)));
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

  // =========================================================
  // Ranking absoluto pós-flop (chaves lógicas)
  // =========================================================
  function rankAbsolutePostflop(board){
    const deck = makeDeck();
    const exclude = new Set(board.map(cardId));
    const rem = deck.filter(c=>!exclude.has(cardId(c)));

    const bestByKey = new Map();

    for(let i=0;i<rem.length;i++){
      for(let j=i+1;j<rem.length;j++){
        const a=rem[i], b=rem[j];
        const ev = evalBest([a,b].concat(board));

        let key='', label='';
        switch(ev.cat){
          case CAT.HIGH:
            key = `HIGH-${ev.ranks[0]}`;
            label = `${RANK_CHAR(ev.ranks[0])} high`;
            break;
          case CAT.PAIR:
            key = `PAIR-${ev.ranks[0]}`;
            label = `Par de ${RANK_CHAR(ev.ranks[0])}`;
            break;
          case CAT.TWOPAIR:
            key = `2P-${ev.ranks[0]}-${ev.ranks[1]}`;
            label = `Dois pares ${RANK_CHAR(ev.ranks[0])}+${RANK_CHAR(ev.ranks[1])}`;
            break;
          case CAT.TRIPS:
            key = `TRIPS-${ev.ranks[0]}`;
            label = `Trinca de ${RANK_CHAR(ev.ranks[0])}`;
            break;
          case CAT.STRAIGHT:
            key = `ST-${ev.ranks[0]}`;
            label = `Sequência até ${RANK_CHAR(ev.ranks[0])}`;
            break;
          case CAT.FLUSH:
            key = `FL-${ev.ranks[0]}`;
            label = `Flush ${RANK_CHAR(ev.ranks[0])} high`;
            break;
          case CAT.FULL:
            key = `FH-${ev.ranks[0]}-${ev.ranks[1]}`;
            label = `Full house ${RANK_CHAR(ev.ranks[0])} over ${RANK_CHAR(ev.ranks[1])}`;
            break;
          case CAT.QUADS:
            key = `4K-${ev.ranks[0]}`;
            label = `Quadra de ${RANK_CHAR(ev.ranks[0])}`;
            break;
          case CAT.STFLUSH:
            key = ev.ranks[0]===14 ? `ROYAL` : `SF-${ev.ranks[0]}`;
            label = ev.ranks[0]===14 ? `Royal Flush` : `Straight flush até ${RANK_CHAR(ev.ranks[0])}`;
            break;
          default:
            key = JSON.stringify(ev.ranks);
            label = CAT_NAME[ev.cat]||'Mão';
        }

        const cur = bestByKey.get(key);
        if(!cur || cmpEval(ev, cur.ev)>0){
          // armazena também as 5 cartas vencedoras se disponíveis
          bestByKey.set(key,{ev,label});
        }
      }
    }

    const arr=[...bestByKey.values()];
    arr.sort((x,y)=> -cmpEval(x.ev,y.ev));
    return arr;
  }

  // =========================================================
  // ====== NUTS: lista + overlay (hover) ====================
  // =========================================================
  function ensureNutsOverlay(){
    if(nutsOverlay) return nutsOverlay;
    nutsOverlay = document.createElement('div');
    nutsOverlay.id = 'nuts-overlay';
    Object.assign(nutsOverlay.style, {
      position:'fixed', top:'0', left:'0',
      transform:'translate(-9999px,-9999px)',
      background:'rgba(20,20,20,0.97)', color:'#fff',
      border:'1px solid #444', borderRadius:'10px',
      padding:'10px 12px', zIndex:'99999',
      boxShadow:'0 8px 24px rgba(0,0,0,0.45)',
      pointerEvents:'none', minWidth:'220px', maxWidth:'320px'
    });
    document.body.appendChild(nutsOverlay);
    return nutsOverlay;
  }

  function handLabel2(c1,c2){
    const hi = Math.max(c1.r,c2.r), lo = Math.min(c1.r,c2.r);
    const suited = (c1.s===c2.s)?'s':'o';
    return `${RANK_CHAR(hi)}${RANK_CHAR(lo)}${suited}`;
  }

  function heroRankIndex(arr, hand, board){
    const heroEv = evalBest(hand.concat(board));
    let pos = 1;
    for(const item of arr){
      const cmp = cmpEval(item.ev, heroEv);
      if(cmp>0) pos++;
    }
    return pos;
  }

  function buildCardsHTML(cards, heroHand){
    const heroSet = new Set((heroHand||[]).map(c=>`${c.r}${c.s}`));
    return `
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${cards.map(c=>{
          const id=`${c.r}${c.s}`;
          const isHero = heroSet.has(id);
          const suitClass = SUIT_CLASS[c.s] || '';
          return `
            <div class="mini-card ${suitClass}" style="
                 width:36px;height:48px;border-radius:6px;border:1px solid #555;
                 display:flex;flex-direction:column;align-items:center;justify-content:center;
                 ${isHero?'outline:2px solid #ffd54f; outline-offset:-2px;':''}
            ">
              <div style="font-weight:700">${fmtRank(c.r)}</div>
              <div style="font-size:13px">${SUIT_GLYPH[c.s]}</div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function showNutsOverlay(ev, data){
    ensureNutsOverlay();
    nutsHover = true;
    const html = `
      <div style="font-size:12px;opacity:.85;margin-bottom:6px">Melhor mão desta classe</div>
      <div style="font-weight:700;margin-bottom:6px">${data.label}</div>
      ${buildCardsHTML(data.top5, data.heroHand)}
      <div style="margin-top:8px;font-size:13px;opacity:.9">
        Sua mão: <b>${data.heroLabel}</b><br/>
        Posição atual no board: <b>#${data.rankPos}</b>
      </div>
    `;
    nutsOverlay.innerHTML = html;

    const pad = 12;
    let x = ev.clientX + pad, y = ev.clientY + pad;
    const vw = window.innerWidth, vh = window.innerHeight;
    const rect = {w: 280, h: 180};
    if(x + rect.w > vw) x = ev.clientX - rect.w - pad;
    if(y + rect.h > vh) y = ev.clientY - rect.h - pad;

    nutsOverlay.style.transform = `translate(${Math.max(0,x)}px, ${Math.max(0,y)}px)`;
  }

  function hideNutsOverlay(){
    nutsHover = false;
    if(!nutsOverlay) return;
    nutsOverlay.style.transform = 'translate(-9999px,-9999px)';
  }

  function renderNuts(){
    if(!nutsListEl) nutsListEl = document.getElementById('nutsList');
    if(!nutsListEl) return;

    const {hand, board} = PC.getKnown();
    nutsListEl.innerHTML = '';

    if(board.length < 3){
      nutsListEl.innerHTML = '<div class="mut">Defina pelo menos o flop para ver as melhores mãos.</div>';
      return;
    }

    const arr = rankAbsolutePostflop(board); // [{ev,label}] do mais forte ao mais fraco
    const pos = (hand.length===2) ? heroRankIndex(arr, hand, board) : null;
    const heroLabel = (hand.length===2) ? handLabel2(hand[0], hand[1]) : '—';

    // Mostra top 10 classes (ajuste se quiser)
    const topN = Math.min(arr.length, 10);
    for(let i=0;i<topN;i++){
      const it = arr[i];

      // Tentativa de obter as 5 cartas vencedoras a partir do objeto de avaliação
      let top5 = null;
      if(it.ev && Array.isArray(it.ev.best) && it.ev.best.length===5){
        top5 = it.ev.best;
      }else if(it.ev && Array.isArray(it.ev.five) && it.ev.five.length===5){
        top5 = it.ev.five;
      }
      // Se ainda não tiver, como fallback, usa as 5 cartas do board (não é ideal, mas evita "sumir" o overlay)
      if(!top5) top5 = board.slice(0,5);

      const li = document.createElement('div');
      li.className = 'nuts-item';
      li.style.cssText = `
        display:flex; align-items:center; gap:8px; padding:6px 8px; border-radius:8px;
        cursor:default;
      `;
      li.innerHTML = `
        <div style="width:24px;text-align:right;opacity:.7">${i+1}.</div>
        <div style="flex:1">${it.label}</div>
      `;

      li.addEventListener('mouseenter',(e)=>{
        if(!top5) return;
        const data = {
          evObj: it.ev,
          label: it.label,
          top5,
          heroLabel,
          heroHand: hand || [],
          rankPos: pos ?? '—'
        };
        showNutsOverlay(e, data);
      });
      li.addEventListener('mousemove',(e)=>{
        if(!top5 || !nutsOverlay) return;
        showNutsOverlay(e, {
          evObj: it.ev, label: it.label, top5,
          heroLabel, heroHand: hand || [], rankPos: pos ?? '—'
        });
      });
      li.addEventListener('mouseleave', hideNutsOverlay);

      nutsListEl.appendChild(li);
    }
  }

  function wireNutsOverlayOnce(){
    if(wiredNuts) return;
    wiredNuts = true;
    // Listeners por item já são conectados em renderNuts()
  }

  // =========================================================
  // Recalcular com segurança
  // =========================================================
  function safeRecalc(){ try{ g.calcEquity(); }catch(e){} }

  // =========================================================
  // Inicialização controlada (chamada pelo login-guard)
  // =========================================================
  function __pcalc_start_app__(){
    PC.state.prevBoardLen = Math.max(0, PC.state.selected.length-2);
    renderDeck();
  }
  g.__pcalc_start_app__ = __pcalc_start_app__;

  document.addEventListener('DOMContentLoaded', ()=>{
    // aguardando start via __pcalc_start_app__ (login-guard)
  });

})(window);
