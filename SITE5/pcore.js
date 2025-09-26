// pcore.js — núcleo mínimo para o pcalc-app.js e pcalc-gto.js
(function (g) {
  "use strict";
  const PC = g.PCALC || (g.PCALC = {});

  // ===== Estado =====
  PC.state = PC.state || { hero: [], board: [], pos: "", callers: 0, raiseBB: 0 };

  // ===== Constantes de categoria =====
  const CAT = {
    HIGH: 0, PAIR: 1, TWO_PAIR: 2, TRIPS: 3, STRAIGHT: 4,
    FLUSH: 5, FULL: 6, QUADS: 7, STRAIGHT_FLUSH: 8
  };
  PC.CAT = CAT;
  PC.CAT_NAME = {
    [CAT.HIGH]: "High Card",
    [CAT.PAIR]: "Pair",
    [CAT.TWO_PAIR]: "Two Pair",
    [CAT.TRIPS]: "Trips",
    [CAT.STRAIGHT]: "Straight",
    [CAT.FLUSH]: "Flush",
    [CAT.FULL]: "Full House",
    [CAT.QUADS]: "Quads",
    [CAT.STRAIGHT_FLUSH]: "Straight Flush"
  };

  // ===== Baralho =====
  const SUITS = ["s", "h", "d", "c"];
  const SUIT_ORDER = { s: 0, h: 1, d: 2, c: 3 };
  PC.makeDeck = function makeDeck() {
    const deck = [];
    for (let r = 2; r <= 14; r++) for (const s of SUITS) deck.push({ r, s });
    return deck;
  };
  const rChar = (r) => r===14?"A":r===13?"K":r===12?"Q":r===11?"J":r===10?"T":String(r);
  PC.cardToStr = (c) => rChar(c.r||c.rank) + (c.s||c.suit);
  PC.sortCardsDesc = (arr) => [...arr].sort((a,b)=>{
    const ra=(a.r||a.rank), rb=(b.r||b.rank); if(ra!==rb) return rb-ra;
    const sa=(a.s||a.suit), sb=(b.s||b.suit); return SUIT_ORDER[sa]-SUIT_ORDER[sb];
  });

  // ===== Avaliação de mão (melhor 5 de N, N<=7) =====
  function countBy(arr, get){
    const m = new Map(); for(const x of arr){ const k=get(x); m.set(k,(m.get(k)||0)+1); } return m;
  }
  function uniq(arr){ return [...new Set(arr)]; }
  function sortDesc(nums){ return [...nums].sort((a,b)=>b-a); }

  function isStraight(ranksSortedAsc) {
    // Ace-low
    const rs = ranksSortedAsc.includes(14) ? [...new Set(ranksSortedAsc.concat([1]))].sort((a,b)=>a-b) : ranksSortedAsc;
    let maxHi = 0;
    for (let i=0;i<=rs.length-5;i++){
      const w = rs.slice(i,i+5);
      if (new Set(w).size===5 && (w[4]-w[0]===4)) maxHi = Math.max(maxHi, w[4]===5?5:w[4]);
    }
    return maxHi; // 0 se não há straight; caso haja, retorna high do straight (5 para wheel)
  }

  function eval5(cards) {
    // cards: 5 objs {r,s}
    const ranks = cards.map(c=>c.r||c.rank).sort((a,b)=>a-b); // asc
    const suits = cards.map(c=>c.s||c.suit);
    const byRank = countBy(cards, c=>c.r||c.rank);
    const bySuit = countBy(cards, c=>c.s||c.suit);

    // flush?
    let flushSuit=null;
    for (const [s,c] of bySuit) if(c>=5){ flushSuit=s; break; }
    const straightHigh = isStraight(ranks);

    // straight flush?
    if (flushSuit){
      const rf = cards.filter(c=>(c.s||c.suit)===flushSuit).map(c=>c.r||c.rank).sort((a,b)=>a-b);
      const sfHigh = isStraight(rf);
      if (sfHigh) return { cat: CAT.STRAIGHT_FLUSH, ranks: [sfHigh] };
    }

    // quads / full / trips / pairs
    const groups = [...byRank.entries()].map(([r,c])=>({r, c})).sort((a,b)=> b.c - a.c || b.r - a.r);
    if (groups[0]?.c === 4) {
      const kicker = sortDesc(ranks.filter(r=>r!==groups[0].r))[0];
      return { cat: CAT.QUADS, ranks: [groups[0].r, kicker] };
    }
    if (groups[0]?.c === 3 && groups[1]?.c >= 2) {
      return { cat: CAT.FULL, ranks: [groups[0].r, groups[1].r] };
    }
    if (flushSuit){
      const top5 = sortDesc(cards.filter(c=> (c.s||c.suit)===flushSuit).map(c=>c.r||c.rank)).slice(0,5);
      return { cat: CAT.FLUSH, ranks: top5 };
    }
    if (straightHigh) return { cat: CAT.STRAIGHT, ranks: [straightHigh] };
    if (groups[0]?.c === 3) {
      const kickers = sortDesc(ranks.filter(r=>r!==groups[0].r)).slice(0,2);
      return { cat: CAT.TRIPS, ranks: [groups[0].r, ...kickers] };
    }
    if (groups[0]?.c === 2 && groups[1]?.c === 2) {
      const hi = Math.max(groups[0].r, groups[1].r);
      const lo = Math.min(groups[0].r, groups[1].r);
      const kicker = sortDesc(ranks.filter(r=>r!==hi && r!==lo))[0];
      return { cat: CAT.TWO_PAIR, ranks: [hi, lo, kicker] };
    }
    if (groups[0]?.c === 2) {
      const kickers = sortDesc(ranks.filter(r=>r!==groups[0].r)).slice(0,3);
      return { cat: CAT.PAIR, ranks: [groups[0].r, ...kickers] };
    }
    // high card
    return { cat: CAT.HIGH, ranks: sortDesc(ranks).slice(0,5) };
  }

  function* combosIdx(n, k){
    // gera combinações de índices [0..n-1] escolhendo k
    const idx = Array.from({length:k}, (_,i)=>i);
    yield idx.slice();
    while(true){
      let i = k-1;
      while(i>=0 && idx[i] === i + n - k) i--;
      if (i<0) return;
      idx[i]++;
      for(let j=i+1;j<k;j++) idx[j]=idx[j-1]+1;
      yield idx.slice();
    }
  }

  PC.evalBest = function evalBest(hero, board){
    const all = (hero||[]).concat(board||[]);
    if (all.length < 5) return null;
    const n = all.length;
    let best = null;
    for (const idx of combosIdx(n, 5)){
      const five = idx.map(i=>all[i]);
      const ev = eval5(five);
      if (!best || PC.cmpEval(ev, best) > 0) best = ev;
    }
    return best;
  };

  // ===== Comparador de avaliações =====
  PC.cmpEval = function cmpEval(a, b){
    if (!a && !b) return 0;
    if (!a) return -1;
    if (!b) return 1;
    if (a.cat !== b.cat) return a.cat - b.cat;
    const ar = a.ranks||[], br = b.ranks||[];
    for (let i=0;i<Math.max(ar.length, br.length);i++){
      const x = ar[i]||0, y = br[i]||0;
      if (x!==y) return x - y;
    }
    return 0;
  };

  // ===== Fallback simples para sugestão de flop =====
  PC.fallbackSuggestFlop = function fallbackSuggestFlop({hero=[], board=[]} = {}){
    const flop = board.slice(0,3);
    if (flop.length < 3) return { action:"", reason:"flop-incompleto" };
    const ev = PC.evalBest(hero, flop);
    if (!ev) return { action:"check", reason:"eval-indisponivel" };
    if (ev.cat >= CAT.TWO_PAIR) return { action:"bet33", reason:"fallback:value_nuts" };
    // draws simples
    const all = hero.concat(flop);
    const suitCounts = all.reduce((m,c)=> (m[c.s]=(m[c.s]||0)+1, m), {});
    const hasFD = Object.values(suitCounts).some(v=>v>=4);
    // OESD/Gutshot bem simples
    const rs = uniq(all.map(c=>c.r)).sort((a,b)=>a-b);
    const rsA = rs.includes(14) ? uniq(rs.concat([1])).sort((a,b)=>a-b) : rs;
    const hasOESD = (arr)=> {
      for(let i=0;i<arr.length-3;i++){ const w=arr.slice(i,i+4); if(w[3]-w[0]===3) return true; }
      return false;
    };
    const oesd = hasOESD(rs)||hasOESD(rsA);
    if (hasFD || oesd) return { action:"bet33", reason:"fallback:draw" };
    return { action:"check", reason:"fallback:default" };
  };

})(window);
