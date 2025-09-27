// Generated on 2025-09-27T15:25:00.400351 by ChatGPT
/* ============================================================
   INÍCIO DO MÓDULO — pcalc.preflop.js
   Pré‑flop: helpers JSON 169, linha de rank e watchdog
   ============================================================ */
(function (g) {
  const PC = g.PCALC || (g.PCALC = {});

  function hasPF() {
    return typeof g.PF !== 'undefined'
      && g.PF
      && typeof g.PF.normalize2 === 'function'
      && typeof g.PF.describe === 'function';
  }
  function rankNumToChar(n) {
    if (n == null) return '';
    if (typeof n === 'string') {
      const u = n.toUpperCase();
      if ('AKQJT98765432'.includes(u)) return u;
      if (u === '10') return 'T';
      return u[0] || '';
    }
    if (n === 14) return 'A';
    if (n === 13) return 'K';
    if (n === 12) return 'Q';
    if (n === 11) return 'J';
    if (n === 10) return 'T';
    return String(n);
  }
  function getPreflopTagFromHand() {
    if (!hasPF()) return null;
    const { hand } = PC.getKnown();
    if (!hand || hand.length < 2) return null;
    const r1 = rankNumToChar(hand[0].r);
    const r2 = rankNumToChar(hand[1].r);
    const s1 = String(hand[0].s || '').toLowerCase();
    const s2 = String(hand[1].s || '').toLowerCase();
    try {
      const tag = g.PF.normalize2(r1, s1, r2, s2);
      return tag;
    } catch (e) { console.warn('[PF] normalize2 falhou:', e); return null; }
  }
  function all169Tags() {
    const order = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'];
    const tags = [];
    for (let i=0;i<order.length;i++){
      for (let j=0;j<=i;j++){
        const hi=order[i], lo=order[j];
        if(hi===lo) tags.push(hi+lo);
        else { tags.push(hi+lo+'s'); tags.push(hi+lo+'o'); }
      }
    }
    return tags;
  }
  function computeTop5PreflopPF(){
    if(!hasPF()) return null;
    const rows = [];
    for(const t of all169Tags()){
      try{
        const info = g.PF.describe(t);
        if(info && typeof info.rank === 'number'){
          rows.push({ label: info.hand, rank: info.rank, tier: info.tier || '' });
        }
      }catch(_){}
    }
    if(!rows.length) return null;
    rows.sort((a,b)=>a.rank-b.rank);
    return rows.slice(0,5).map(it=>({ label: it.label, right: `Rank ${it.rank}` }));
  }
  function computeTop5PreflopChen(){
    const RANKS = PC.RANKS || [2,3,4,5,6,7,8,9,10,11,12,13,14];
    const RANK_CHAR = r=>r===14?'A':r===13?'K':r===12?'Q':r===11?'J':r===10?'T':String(r);
    const pairLabelByRank = (r1,r2)=>{ const hi=Math.max(r1,r2), lo=Math.min(r1,r2); return `${RANK_CHAR(hi)}${RANK_CHAR(lo)}`; };
    const all=[];
    for(let i=0;i<RANKS.length;i++){
      for(let j=i;j<RANKS.length;j++){
        const r1=RANKS[j], r2=RANKS[i];
        const score = (r1===r2? 10 + (r1-2)/2 : 6 + (r1+r2)/30);
        all.push({label:pairLabelByRank(r1,r2), score});
      }
    }
    all.sort((a,b)=>b.score-a.score);
    return all.slice(0,5).map(x=>({label:x.label, right:`Rank`}));
  }
  function renderPreflopRankLineInto(box){
    if(!box) return;
    const { hand, board } = PC.getKnown();
    if(board && board.length>=3){ const old = box.querySelector('#preflopRankLine'); if(old) old.remove(); return; }
    let line = box.querySelector('#preflopRankLine');
    if(!line){
      line = document.createElement('div'); line.id='preflopRankLine'; line.className='mut'; line.style.marginTop='6px';
      const bar = box.querySelector('.bar'); if(bar) box.insertBefore(line, bar); else box.insertBefore(line, box.firstChild);
    }
    if(!(hand && hand.length===2)){ line.textContent='Pré-flop: (selecione 2 cartas para ver o rank)'; return; }
    if(!hasPF()){ line.textContent='Pré-flop: ranking 1–169 indisponível (aguardando JSON)...'; return; }
    const tag = getPreflopTagFromHand(); let info = null; try{ if(tag) info=g.PF.describe(tag); }catch(e){}
    if(info?.rank) line.innerHTML = `<b>Pré-flop:</b> ${info.hand} • <b>Rank</b> ${info.rank}/169 • ${info.tier}`;
    else line.textContent='Pré-flop: (ranking indisponível para esta mão)';
  }
  let pfWatchdogTimer=null, pfWatchdogTries=0;
  function startPFWatchdog(){
    stopPFWatchdog(); pfWatchdogTries=0;
    pfWatchdogTimer = setInterval(()=>{
      pfWatchdogTries++;
      const box = document.getElementById('equityBox'); if(box) renderPreflopRankLineInto(box);
      if(hasPF()){
        const { hand, board } = PC.getKnown();
        if((!board || board.length<3) && hand && hand.length===2){
          const tag = getPreflopTagFromHand();
          try{ const info = tag ? g.PF.describe(tag) : null; if(info && typeof info.rank==='number'){ stopPFWatchdog(); } }catch(_){}
        }
      }
      if(pfWatchdogTries>=30) stopPFWatchdog();
    }, 500);
  }
  function stopPFWatchdog(){ if(pfWatchdogTimer){ clearInterval(pfWatchdogTimer); pfWatchdogTimer=null; } }
  g.addEventListener('PF:ready', ()=>{ try{ const box=document.getElementById('equityBox'); if(box) renderPreflopRankLineInto(box); stopPFWatchdog(); }catch(e){} });

  PC.__PF__ = { hasPF, rankNumToChar, getPreflopTagFromHand, computeTop5PreflopPF, computeTop5PreflopChen, renderPreflopRankLineInto, startPFWatchdog, stopPFWatchdog };
})(window);
/* FIM DO MÓDULO — pcalc.preflop.js */
