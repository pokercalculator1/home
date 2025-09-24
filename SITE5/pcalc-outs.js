// pcalc-outs.js
(function(g){
  const PCALC = g.PCALC;
  const { CAT, CAT_NAME, makeDeck, cardId, evalBest, fmtRank, SUIT_CLASS, SUIT_GLYPH } = PCALC;

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

  PCALC.computeOuts=function(){
    const {hand,board}=PCALC.getKnown();
    const stage=nextStreet(board.length);
    const remaining = makeDeck().filter(c=>!PCALC.state.selected.includes(cardId(c)));
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
  };

  PCALC.renderOuts=function(){
    const outEl=document.getElementById('outs');
    const infoEl=document.getElementById('ctxInfo');
    const hint=document.getElementById('stateHint');
    if(!outEl) return;

    try{ PCALC.renderPreflopPanel(); }catch(e){}

    const res=PCALC.computeOuts();
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
  };
  PCALC.computeAndRenderOuts=function(){ PCALC.renderOuts(); };
})(window);
