Claro, aqui está o script completo com a função duplicada `wireNutsOverlayOnce` removida. A única alteração foi apagar a segunda definição da função que estava no final do arquivo, mantendo o código mais limpo e corrigindo o problema.

```javascript
// pcalc-app.js
(function(g){
  const PC = g.PCALC;
  const { RANKS, SUITS, SUIT_CLASS, SUIT_GLYPH, fmtRank, cardId, makeDeck, evalBest, cmpEval, CAT, CAT_NAME } = PC;

  // ===== Helpers de ranks/labels (DECLARADOS ANTES DE QUALQUER USO) =====
  const RANK_CHAR = r=>r===14?'A':r===13?'K':r===12?'Q':r===11?'J':r===10?'T':String(r);
  const RANK_PRINT = RANK_CHAR;
  function pairLabelHuman(c1, c2){
    const hi = Math.max(c1.r,c2.r), lo = Math.min(c1.r,c2.r);
    const suited = (c1.s===c2.s) ? 's' : 'o';
    return `${RANK_PRINT(hi)}${RANK_PRINT(lo)}${suited}`;
  }
  function normalizeHand2(h){
    if(!h || h.length<2) return '';
    const ranks = h.map(c=>c.r).sort((a,b)=>b-a);
    const suited = (h[0].s===h[1].s);
    const a=RANK_PRINT(ranks[0]), b=RANK_PRINT(ranks[1]);
    return (a===b) ? (a+a) : (a+b+(suited?'s':'o'));
  }

  // ===== Estado/UI base =====
  let nutsOverlay=null, nutsHover=false, overlayTimer=null, wiredNuts=false;
  const deckEl = document.getElementById('deck');

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
    renderEquityPanel();

    wiredNuts=false; wireNutsOverlayOnce(); hideNutsOverlay();
    safeRecalc();
  }

  function updateStageChange(oldLen, newLen){
    if(newLen>=3 && oldLen<3) PC.state.stageJustSet='Flop definido';
    else if(newLen>=4 && oldLen<4) PC.state.stageJustSet='Turn definido';
    else if(newLen>=5 && oldLen<5) PC.state.stageJustSet='River definido';
    PC.state.prevBoardLen = newLen;
  }

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

  // ==== Botões ====
  const btnFlop = document.getElementById('btnFlop');
  const btnTurn = document.getElementById('btnTurn');
  const btnRiver= document.getElementById('btnRiver');
  const btnClear= document.getElementById('btnClear');

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
    PC.state.selected=[]; updateStageChange(PC.state.prevBoardLen, 0); renderDeck(); safeRecalc();
  };

  // ==== Render mão herói ====
  function renderHeroMade(){
    const el=document.getElementById('handCat'); if(!el) return;
    const {hand,board}=PC.getKnown();
    if(hand.length<2){ el.textContent='Selecione sua mão'; return; }
    const ev=evalBest(hand.concat(board));
    el.textContent = CAT_NAME[ev.cat] || '—';
  }

  // ==== Monte Carlo simulação de equidade ====
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

  // ==== Equidade exata no turn ====
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

  // ==== Ranking absoluto pós-flop com chaves lógicas (todas categorias) ====
  function rankAbsolutePostflop(board){
    const deck = makeDeck();
    const exclude = new Set(board.map(cardId)); // ABSOLUTO: remove só o board
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
            key = `ST-${ev.ranks[0]}`; // maior carta da sequência
            label = `Sequência até ${RANK_CHAR(ev.ranks[0])}`;
            break;
          case CAT.FLUSH:
            key = `FL-${ev.ranks[0]}`; // maior carta do flush
            label = `Flush ${RANK_CHAR(ev.ranks[0])} high`;
            break;
          case CAT.FULL:
            key = `FH-${ev.ranks[0]}-${ev.ranks[1]}`; // trio+par
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
          bestByKey.set(key,{ev,label});
        }
      }
    }

    const arr=[...bestByKey.values()];
    arr.sort((x,y)=> -cmpEval(x.ev,y.ev));
    return arr;
  }

  // ==== Ranking 169 pré-flop canônico (sem duplicatas) ====
  function rankPreflop169(){
    const order = [14,13,12,11,10,9,8,7,6,5,4,3,2]; // A..2
    const chenScore = PC.chenScore; // se existir
    const out = [];
    for (let i = 0; i < order.length; i++){
      for (let j = 0; j < order.length; j++){
        const hi = order[i], lo = order[j];
        if (i === j){
          const norm = `${RANK_PRINT(hi)}${RANK_PRINT(hi)}`;
          const s = chenScore ? chenScore({pair:hi}) : (10 + (hi-2)/2);
          out.push({ norm, chen:s });
        } else if (i < j){
          const normS = `${RANK_PRINT(hi)}${RANK_PRINT(lo)}s`;
          const s1 = chenScore ? chenScore({hi,lo,suited:true}) : (6 + (hi+lo)/30 + 1.5);
          out.push({ norm:normS, chen:s1 });
        } else {
          const normO = `${RANK_PRINT(hi)}${RANK_PRINT(lo)}o`;
          const s2 = chenScore ? chenScore({hi,lo,suited:false}) : (6 + (hi+lo)/30);
          out.push({ norm:normO, chen:s2 });
        }
      }
    }
    out.sort((a,b)=> b.chen - a.chen);
    return out; // 169 únicas
  }

  // ==== Render “melhor mão” básica (cards + label principal) ====
  function computeNutsPair(){
    const {board}=PC.getKnown();
    if(board.length<3) return null;
    const remaining = makeDeck().filter(c=>!PC.state.selected.includes(cardId(c)));
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

    const {board}=PC.getKnown();
    if(board.length<3){
      paint(n0,{r:14,s:'s'}); paint(n1,{r:14,s:'h'});
      if(ncat) ncat.textContent='A Melhor Mão: Par de Ases';
      return;
    }
    const res=computeNutsPair();
    if(!res){ clear(n0); clear(n1); if(ncat) ncat.textContent=''; return; }
    const [c1,c2]=res.pair; paint(n0,c1); paint(n1,c2);
    if(ncat) ncat.textContent = (CAT_NAME[res.ev.cat]||'');
  }

  // ==== Overlay Top 5 + destaque da sua mão (pré e pós-flop) ====
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
  function showNutsOverlay(anchor){
  const {hand, board} = PC.getKnown();
  if(!anchor){
    anchor = document.querySelector('.nutsline') || document.getElementById('nutsCat') || document.getElementById('n0');
    if(!anchor) return;
  }
  hideNutsOverlay();

  const isPreflop = board.length<3;
  const wrap=document.createElement('div');
  wrap.id='nutsOverlay';
  wrap.style.cssText='background:#0b1324;border:1px solid #334155;border-radius:12px;box-shadow:0 16px 36px rgba(0,0,0,.45);padding:10px 12px;min-width:240px;color:#cbd5e1;font-size:13px';

  const title=document.createElement('div');
  title.className='mut';
  title.style.cssText='margin-bottom:8px;font-weight:700;color:#e5e7eb';
  title.textContent = isPreflop ? 'Ranking (169) • Top 5' : 'Melhores mãos absolutas • Top 5';
  wrap.appendChild(title);

  const list=document.createElement('div');

  if(isPreflop){
    const table169 = rankPreflop169();
    const heroNorm = (hand.length===2) ? normalizeHand2(hand) : null;

    table169.slice(0,5).forEach((it,idx)=>{
      const isHero = (heroNorm && it.norm===heroNorm);
      const row=document.createElement('div');
      row.style.cssText=`display:flex;justify-content:space-between;gap:10px;padding:3px 0;border-radius:8px;${isHero?'background:#1f2937;color:#fff;':''}`;
      row.innerHTML = `<div>${idx+1}) ${it.norm}${isHero?' <span style="opacity:.9">— você</span>':''}</div><div class="mut">${Math.round((it.chen/20)*100)}%</div>`;
      list.appendChild(row);
    });

    if(heroNorm){
      const heroIdx = table169.findIndex(it=>it.norm===heroNorm);
      if(heroIdx>=0 && heroIdx>=5){
        const sep=document.createElement('div');
        sep.className='mut'; sep.style.cssText='padding:4px 0 2px;font-size:12px;opacity:.8';
        sep.textContent='…';
        list.appendChild(sep);

        const hero=table169[heroIdx];
        const row=document.createElement('div');
        row.style.cssText='display:flex;justify-content:space-between;gap:10px;padding:3px 0;border-radius:8px;background:#1f2937;color:#fff';
        row.innerHTML = `<div>${heroIdx+1}) ${hero.norm} <span style="opacity:.9">— você</span></div><div class="mut">${Math.round((hero.chen/20)*100)}%</div>`;
        list.appendChild(row);
      }
    }
  }else{
    const abs = rankAbsolutePostflop(board);
    const top5 = abs.slice(0,5);
    const heroEv = (hand.length===2) ? evalBest(hand.concat(board)) : null;

    let heroRank = null;
    if(heroEv){
      for(let i=0;i<abs.length;i++){
        const cmp = cmpEval(heroEv, abs[i].ev);
        if(cmp>=0){ heroRank = i+1; break; }
      }
      if(heroRank===null) heroRank = abs.length;
    }

    top5.forEach((it,idx)=>{
      const thisRank = idx+1;
      const isHeroHere = (heroRank===thisRank);
      const row=document.createElement('div');
      row.style.cssText=`display:flex;justify-content:space-between;gap:10px;padding:4px 0;border-radius:8px;${isHeroHere?'background:#1f2937;color:#fff;':''}`;
      row.innerHTML = `<div>${thisRank}) ${it.label}${isHeroHere?' <span style="opacity:.9">— você</span>':''}</div><div class="mut">${CAT_NAME[it.ev.cat]||''}</div>`;
      list.appendChild(row);
    });

    if(heroEv && heroRank>5){
      const sep=document.createElement('div');
      sep.className='mut'; sep.style.cssText='padding:4px 0 2px;font-size:12px;opacity:.8';
      sep.textContent='…';
      list.appendChild(sep);

      const labelHero = pairLabelHuman(hand[0], hand[1]);
      const row=document.createElement('div');
      row.style.cssText='display:flex;justify-content:space-between;gap:10px;padding:4px 0;border-radius:8px;background:#1f2937;color:#fff';
      row.innerHTML = `<div>${heroRank}) ${labelHero} <span style="opacity:.9">— você</span></div><div class="mut">${CAT_NAME[heroEv.cat]||''}</div>`;
      list.appendChild(row);
    }
  }

  wrap.appendChild(list);

  wrap.addEventListener('mouseenter', ()=>{ nutsHover=true; if(overlayTimer){clearTimeout(overlayTimer); overlayTimer=null;} });
  wrap.addEventListener('mouseleave', ()=>{ nutsHover=false; overlayTimer=setTimeout(()=>{ if(!nutsHover) hideNutsOverlay(); }, 180); });

  positionOverlayNear(anchor, wrap);
  nutsOverlay=wrap;
}

  function wireNutsOverlayOnce(){
    if(wiredNuts) return;
    const anchor =
      document.querySelector('.nutsline') ||
      document.getElementById('nutsCat') ||
      document.getElementById('n0');
    if(!anchor) return;

    wiredNuts = true;
    anchor.style.cursor = 'pointer';
    anchor.addEventListener('click', (e)=>{ e.stopPropagation(); if(nutsOverlay) hideNutsOverlay(); else showNutsOverlay(anchor); });
    anchor.addEventListener('mouseenter', ()=>{ showNutsOverlay(anchor); });
    anchor.addEventListener('mouseleave', ()=>{ overlayTimer=setTimeout(()=>{ if(!nutsHover) hideNutsOverlay(); }, 180); });
    document.addEventListener('click', (e)=>{ if(nutsOverlay && !nutsOverlay.contains(e.target) && !anchor.contains(e.target)) hideNutsOverlay(); });
  }

  // ==== Painel de equidade ====
  function renderEquityPanel(){
    const box=document.getElementById('equityBox');
    if(!box) return;

    const {hand,board}=PC.getKnown();
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
                ${Array.from({length:8},(_,i)=>`<option value="${i+1}" ${i===1?'selected':''}>${i+1}</option>`).join('')}
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

        const hasTTS = !!(g.TTS) && ('speechSynthesis' in g);
        const enableEl=document.getElementById('ttsEnable');
        const voiceSel=document.getElementById('ttsVoice');

        if(hasTTS){
          g.TTS.populateVoices();
          speechSynthesis.onvoiceschanged = g.TTS.populateVoices;
          g.TTS.state.enabled = true;
          enableEl.checked = true;

          enableEl.onchange = (e)=>{
            g.TTS.state.enabled = e.target.checked;
            if(g.TTS.state.enabled) g.TTS.speak('Voz ativada');
          };
          voiceSel.onchange = (e)=>{
            const name=e.target.value;
            const v = speechSynthesis.getVoices().find(v=>v.name===name);
            if(v) g.TTS.state.voice=v;
          };
        }else{
          enableEl.disabled=true;
          voiceSel.disabled=true;
          voiceSel.innerHTML = '<option>(sem suporte no navegador)</option>';
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
    const {hand,board}=PC.getKnown();
    if(hand.length<2){ return; }

    const oppSel=document.getElementById('eqOpp');
    const trialsSel=document.getElementById('eqTrials');
    if(!oppSel || !trialsSel) return;

    const opp=parseInt(oppSel.value,10);
    const trials=parseInt(trialsSel.value,10);
    const st=document.getElementById('eqStatus');

    const useExactTurn = (board.length===4 && opp===1);
    if(st) st.textContent= useExactTurn ? 'Calculando (exato no turn)...' : 'Calculando...';

    const res = (function(){
      if(board.length===4 && opp===1) return exactTurnEquity(hand,board);
      const mc = simulateEquity(hand,board,opp,trials); mc._method='mc'; return mc;
    })();

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

    // Não sugerir com flop parcial (1–2 cartas)
    const out   = document.getElementById('suggestOut');
    const partialFlop = (board.length === 1 || board.length === 2);
    if (partialFlop) {
      if (out) {
        out.innerHTML = `
          <div class="decision">
            <div class="decision-title info">Aguarde o flop completo</div>
            <div class="decision-detail">Selecione as 3 cartas do flop para sugerir ação.</div>
          </div>
        `;
      }
      return;
    }

    // Equidade SEMPRE por simulação (pré e pós-flop)
    const eqPct = (res.win + res.tie/2);

    const sugg = PC.suggestAction(eqPct, hand, board, opp);
    const cls   = PC.decisionClass(sugg.title);
    const glow  = PC.shouldGlow(cls);

    if(out){
      out.innerHTML = `
        <div class="decision ${glow ? 'glow' : ''}">
          <div class="decision-title ${cls}">${sugg.title}</div>
          <div class="decision-detail">${sugg.detail}</div>
        </div>
      `;
    }

    if(g.TTS?.state?.enabled){
      if(PC.state.stageJustSet){
        g.TTS.speak(`${PC.state.stageJustSet}. Sugestão: ${sugg.title}`);
        PC.state.stageJustSet = null;
      }else{
        g.TTS.speak(`Sugestão: ${sugg.title}`);
      }
    }
  }

  function safeRecalc(){ try{ calcEquity(); }catch(e){} }

  // ==== Start app ====
  function __pcalc_start_app__(){
    PC.state.prevBoardLen = Math.max(0, PC.state.selected.length-2);
    renderDeck();
  }
  g.__pcalc_start_app__ = __pcalc_start_app__;

  document.addEventListener('DOMContentLoaded', ()=>{
    // aguardando start via __pcalc_start_app__ (login-guard)
  });
})(window);
