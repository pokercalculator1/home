// Generated on 2025-09-27T15:25:00.400351 by ChatGPT
/* ============================================================
   INÍCIO DO MÓDULO — pcalc.leaderboard.js
   Pós‑flop: descrição de mãos e Top5 por classes
   ============================================================ */
(function (g) {
  const PC = g.PCALC || (g.PCALC = {});
  const { makeDeck, cardId, evalBest, cmpEval, CAT, CAT_NAME } = PC;

  function keyFromEval(ev){ return JSON.stringify({ c: ev.cat, k: ev.kick }); }
  function describeEval(ev){
    const name = CAT_NAME[ev.cat] || '—';
    const r2c = (r)=> (r==null ? '' : (r===14?'A':r===13?'K':r===12?'Q':r===11?'J':r===10?'T':String(r)));
    const k = ev.kick || [];
    let detail = '';
    switch(ev.cat){
      case CAT.ROYAL: detail = 'Royal Flush'; break;
      case CAT.SFLUSH: { const hi=r2c(k[0]); detail = hi ? `Straight Flush (alto ${hi})` : 'Straight Flush'; break; }
      case CAT.QUADS: { const quad=r2c(k[0]); const kick=r2c(k[1]); detail = quad?`Quadra de ${quad}`:'Quadra'; if(kick) detail += ` (kicker ${kick})`; break; }
      case CAT.FULL:  { const t=r2c(k[0]); const p=r2c(k[1]); detail=(t&&p)?`Full House (${t} cheio de ${p})`:'Full House'; break; }
      case CAT.FLUSH: { const hi=r2c(k[0]); detail = hi?`Flush (alto ${hi})`:'Flush'; break; }
      case CAT.STRAIGHT: { const hi=r2c(k[0]); detail = hi?`Sequência (alto ${hi})`:'Sequência'; break; }
      case CAT.TRIPS: { const t=r2c(k[0]); const ks=[r2c(k[1]), r2c(k[2])].filter(Boolean); detail = t?`Trinca de ${t}`:'Trinca'; if(ks.length) detail += ` (kickers ${ks.join(', ')})`; break; }
      case CAT.TWO:   { const a=r2c(k[0]), b=r2c(k[1]); const kick=r2c(k[2]); detail=(a&&b)?`Dois Pares (${a} & ${b})`:'Dois Pares'; if(kick) detail += `, kicker ${kick}`; break; }
      case CAT.ONE:   { const p=r2c(k[0]); const ks=[r2c(k[1]),r2c(k[2]),r2c(k[3])].filter(Boolean); detail=p?`Par de ${p}`:'Par'; if(ks.length) detail+=` (kickers ${ks.join(', ')})`; break; }
      case CAT.HIGH:  { const hi=r2c(k[0]); detail = hi?`Carta Alta ${hi}`:'Carta Alta'; break; }
      default: detail = name || '—';
    }
    return { name, detail };
  }
  function listOpponentHoles(deadIds){
    const dead = new Set(deadIds);
    const deck = makeDeck().filter(c=>!dead.has(cardId(c)));
    const holes=[];
    for(let i=0;i<deck.length-1;i++) for(let j=i+1;j<deck.length;j++) holes.push([deck[i], deck[j]]);
    return holes;
  }
  function computePostflopLeaderboard(){
    const { hand, board } = PC.getKnown();
    if(board.length < 3) return null;
    const deadIds = []; for(const c of hand) deadIds.push(cardId(c)); for(const c of board) deadIds.push(cardId(c));
    const oppHoles = listOpponentHoles(deadIds);
    const heroEv = evalBest(hand.concat(board));
    const groups = new Map();
    let betterCombos=0, tieCombos=0, worseCombos=0;
    for(const [a,b] of oppHoles){
      const ev = evalBest([a,b].concat(board));
      const key = keyFromEval(ev);
      let g = groups.get(key); if(!g){ g={ ev, count:0, examples:[] }; groups.set(key,g); }
      g.count++; if(g.examples.length<5) g.examples.push(cardId(a)+','+cardId(b));
      const cmp = cmpEval(ev, heroEv);
      if(cmp>0) betterCombos++; else if(cmp<0) worseCombos++; else tieCombos++;
    }
    const arr=[...groups.values()]; arr.sort((x,y)=> -cmpEval(x.ev, y.ev));
    let heroClassPos=1; for(const g of arr){ if(cmpEval(g.ev, heroEv)>0) heroClassPos++; else break; }
    const heroClassesTotal = arr.length;
    const top5 = arr.slice(0,5).map(g=>{ const d=describeEval(g.ev); return { name: d.name, detail: d.detail, count: g.count, examples: g.examples }; });
    return { top5, hero: { eval: heroEv, desc: describeEval(heroEv), classPosition: heroClassPos, classTotal: heroClassesTotal, betterCombos, tieCombos, worseCombos } };
  }

  PC.__LEAD__ = { describeEval, computePostflopLeaderboard };
})(window);
/* FIM DO MÓDULO — pcalc.leaderboard.js */
