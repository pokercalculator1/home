// Generated on 2025-09-27T15:25:00.400351 by ChatGPT
/* ============================================================
   INÍCIO DO MÓDULO — pcalc.ui.js
   UI: deck/slots, nuts + overlay (Top5 pré/pós‑flop)
   ============================================================ */
(function (g) {
  const PC = g.PCALC || (g.PCALC = {});
  const { RANKS, SUITS, SUIT_CLASS, SUIT_GLYPH, fmtRank, cardId, makeDeck, evalBest, cmpEval, CAT_NAME } = PC;
  const PF = PC.__PF__;
  const LEAD = PC.__LEAD__ || {};

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
        el.addEventListener('click',()=>PC.toggleCard(id));
        deckEl.appendChild(el);
      }
    }
    renderSlots();
    renderNuts();
    PC.renderHeroMade?.();
    PC.computeAndRenderOuts?.();
    PC.renderEquityPanel?.();

    wiredNuts=false; wireNutsOverlayOnce(); hideNutsOverlay();
    PC.safeRecalc?.();
  }

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
    if(board.length<3){ paint(n0,{r:14,s:'s'}); paint(n1,{r:14,s:'h'}); if(ncat) ncat.textContent='Par de Ases'; return; }
    const res=computeNutsPair();
    if(!res){ clear(n0); clear(n1); if(ncat) ncat.textContent=''; return; }
    const [c1,c2]=res.pair; paint(n0,c1); paint(n1,c2);
    if(ncat) ncat.textContent = (CAT_NAME[res.ev.cat]||'');
  }

  function computeTop5PostflopLeaderboard(){
    const data = LEAD.computePostflopLeaderboard?.();
    if(!data) return null;
    const rows = data.top5.map((it, idx)=>({
      left: `${idx+1}) ${it.detail}`,
      right: `(${it.count} combos)`,
      examples: it.examples
    }));
    const hero = data.hero;
    return { rows, hero };
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
    el.style.position='absolute'; el.style.top=`${top}px`; el.style.left=`${left}px`; el.style.zIndex='9999';
  }
  function showNutsOverlay(){
    const {board}=PC.getKnown();
    const anchor=document.querySelector('.nutsline');
    if(!anchor) return;
    hideNutsOverlay();
    const wrap=document.createElement('div');
    wrap.id='nutsOverlay';
    wrap.style.cssText='background:#0b1324;border:1px solid #334155;border-radius:10px;box-shadow:0 12px 30px rgba(0,0,0,.35);padding:8px 10px;min-width:280px;color:#e5e7eb;font-size:14px';
    const title=document.createElement('div');
    title.className='mut'; title.style.cssText='margin-bottom:6px;font-weight:600';
    const isPreflop = board.length<3;
    title.textContent = isPreflop ? 'Top 5 mãos (pré-flop, JSON)' : 'Top 5 mãos possíveis (board atual)';
    wrap.appendChild(title);
    const list=document.createElement('div');

    if(isPreflop){
      const rows = PF.computeTop5PreflopPF() || PF.computeTop5PreflopChen();
      if(rows && rows.length){
        rows.forEach((it,idx)=>{
          const row=document.createElement('div'); row.style.cssText='display:flex;justify-content:space-between;gap:10px;padding:4px 0';
          const left=document.createElement('div'); left.textContent=`${idx+1}) ${it.label}`;
          const right=document.createElement('div'); right.className='mut'; right.textContent=it.right;
          row.appendChild(left); row.appendChild(right); list.appendChild(row);
        });
      }else{ const row=document.createElement('div'); row.className='mut'; row.textContent='—'; list.appendChild(row); }
    }else{
      const data = computeTop5PostflopLeaderboard();
      if(data && data.rows.length){
        data.rows.forEach((it)=>{
          const row=document.createElement('div'); row.style.cssText='display:flex;flex-direction:column;gap:2px;padding:6px 0;border-bottom:1px dashed #22304b';
          const head=document.createElement('div'); head.style.cssText='display:flex;justify-content:space-between;gap:10px';
          const left=document.createElement('div'); left.textContent=it.left;
          const right=document.createElement('div'); right.className='mut'; right.textContent=it.right;
          head.appendChild(left); head.appendChild(right); row.appendChild(head);
          if(it.examples?.length){ const ex=document.createElement('div'); ex.className='mut'; ex.style.cssText='font-size:12px'; ex.textContent = `Exemplos: ${it.examples.slice(0,5).join('  |  ')}`; row.appendChild(ex); }
          list.appendChild(row);
        });
        const heroBlock=document.createElement('div'); heroBlock.style.cssText='margin-top:8px;padding-top:6px;border-top:1px solid #22304b';
        const heroTitle=document.createElement('div'); heroTitle.style.cssText='font-weight:600;margin-bottom:4px'; heroTitle.textContent='Sua mão (neste board):'; heroBlock.appendChild(heroTitle);
        const heroLine=document.createElement('div'); const d = data.hero.desc; heroLine.innerHTML = `${d.name} — ${d.detail}`; heroBlock.appendChild(heroLine);
        const heroPos=document.createElement('div'); heroPos.className='mut'; heroPos.style.cssText='margin-top:4px';
        heroPos.textContent = `Posição: ${data.hero.classPosition} de ${data.hero.classTotal} classes • Combos que vencem/empatam/perdem: ${data.hero.betterCombos}/${data.hero.tieCombos}/${data.hero.worseCombos}`;
        heroBlock.appendChild(heroPos); list.appendChild(heroBlock);
      }else{ const row=document.createElement('div'); row.className='mut'; row.textContent='—'; list.appendChild(row); }
    }
    wrap.appendChild(list);
    wrap.addEventListener('mouseenter', ()=>{ nutsHover=true; if(overlayTimer){clearTimeout(overlayTimer); overlayTimer=null;} });
    wrap.addEventListener('mouseleave', ()=>{ nutsHover=false; overlayTimer=setTimeout(()=>{ if(!nutsHover) hideNutsOverlay(); }, 180); });
    positionOverlayNear(anchor, wrap); nutsOverlay=wrap;
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

  PC.renderSlots = renderSlots;
  PC.renderDeck  = renderDeck;
  PC.renderNuts  = renderNuts;
  PC.wireNutsOverlayOnce = wireNutsOverlayOnce;
  PC.hideNutsOverlay = () => { if(nutsOverlay){ nutsOverlay.remove(); nutsOverlay=null; } };
})(window);
/* FIM DO MÓDULO — pcalc.ui.js */
