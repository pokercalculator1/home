// pcalc-core.js (Corrigido com Kickers para Par/Trinca/Carta Alta)
(function(g){
  const PCALC = g.PCALC = g.PCALC || {};

  PCALC.RANKS=[2,3,4,5,6,7,8,9,10,11,12,13,14];
  PCALC.RSTR={11:'J',12:'Q',13:'K',14:'A'};
  PCALC.SUITS=['s','h','d','c'];
  PCALC.SUIT_GLYPH={s:'\u2660', h:'\u2665', d:'\u2666', c:'\u2663'};
  PCALC.SUIT_CLASS={s:'s',h:'h',d:'d',c:'c'};
  PCALC.fmtRank=r=>PCALC.RSTR[r]||String(r);
  PCALC.cardId=c=>`${c.r}${c.s}`;
  PCALC.makeDeck=function(){ const d=[]; for(const s of PCALC.SUITS){ for(const r of PCALC.RANKS){ d.push({r,s}); } } return d; };

  PCALC.state = { selected:[], prevBoardLen:0, stageJustSet:null };

  PCALC.getKnown = function(){
    const byId = Object.fromEntries(PCALC.makeDeck().map(c=>[PCALC.cardId(c),c]));
    const cards = PCALC.state.selected.map(id=>byId[id]);
    return { hand:cards.slice(0,2), board:cards.slice(2), byId };
  };

  PCALC.CAT={HIGH:0,PAIR:1,TWO:2,TRIPS:3,STRAIGHT:4,FLUSH:5,FULL:6,QUADS:7,STRAIGHT_FLUSH:8,ROYAL:9};
  PCALC.CAT_NAME={ [PCALC.CAT.HIGH]:'Carta Alta',[PCALC.CAT.PAIR]:'Par',[PCALC.CAT.TWO]:'Dois Pares',[PCALC.CAT.TRIPS]:'Trinca',[PCALC.CAT.STRAIGHT]:'Straight',[PCALC.CAT.FLUSH]:'Flush',[PCALC.CAT.FULL]:'Full House',[PCALC.CAT.QUADS]:'Quadra',[PCALC.CAT.STRAIGHT_FLUSH]:'Straight Flush',[PCALC.CAT.ROYAL]:'Royal Flush' };

  function straightHigh(set){
    const u=[...set].sort((a,b)=>b-a);
    if(u.includes(14)) u.push(1);
    let run=1,b=null;
    for(let i=0;i<u.length-1;i++){
      if(u[i]-1===u[i+1]){
        run++;
        if(run>=5){
          b = u[i+1]+4;
          return b; // FIX 1: Retorno imediato
        }
      }
      else run=1;
    }
    return b;
  }

  PCALC.evalBest=function(cards){
    const bySuit={s:[],h:[],d:[],c:[]}, count={};
    for(const c of cards){ bySuit[c.s].push(c); count[c.r]=(count[c.r]||0)+1; }
    for(const k in bySuit) bySuit[k].sort((a,b)=>b.r-a.r);

    let sfH=null,sfS=null;
    for(const s of PCALC.SUITS){
      if(bySuit[s].length>=5){
        const high=straightHigh(new Set(bySuit[s].map(c=>c.r)));
        if(high){ sfH=Math.max(sfH||0,high); sfS=s; }
      }
    }
    if(sfH){ return (sfH===14) ? {cat:PCALC.CAT.ROYAL,kick:[14],s:sfS} : {cat:PCALC.CAT.STRAIGHT_FLUSH,kick:[sfH],s:sfS}; }

    let quad=null;
    for(const r of PCALC.RANKS){ if(count[r]===4){ quad=r; break; } }
    if(quad){
      const kick = Math.max(...cards.filter(c=>c.r!==quad).map(c=>c.r));
      return {cat:PCALC.CAT.QUADS, kick:[quad, kick]};
    }

    const trips=[], pairs=[];
    for(const r of PCALC.RANKS.slice().reverse()){
      if(count[r]>=3) trips.push(r);
      else if(count[r]>=2) pairs.push(r);
    }
    if(trips.length){
      if(trips.length>=2) return {cat:PCALC.CAT.FULL, kick:[trips[0], trips[1]]};
      if(pairs.length)   return {cat:PCALC.CAT.FULL, kick:[trips[0], pairs[0]]};
    }

    for(const s of PCALC.SUITS){
      if(bySuit[s].length>=5){
        return {cat:PCALC.CAT.FLUSH, kick:bySuit[s].slice(0,5).map(c=>c.r)};
      }
    }

    const sH = straightHigh(new Set(cards.map(c=>c.r)));
    if(sH) return {cat:PCALC.CAT.STRAIGHT, kick:[sH]};

    // ===== CORREÇÃO KICKERS (TRINCA) =====
    if(trips.length) {
      const tripRank = trips[0];
      const kickers = cards.filter(c => c.r !== tripRank).map(c => c.r).sort((a,b) => b-a);
      return {cat:PCALC.CAT.TRIPS, kick:[tripRank, kickers[0], kickers[1]]}; // Retorna trinca + 2 kickers
    }
    
    // ===== CORREÇÃO KICKERS (PAR) =====
    if(pairs.length>=2) {
      const pair1 = pairs[0];
      const pair2 = pairs[1];
      const kick = Math.max(...cards.filter(c => c.r !== pair1 && c.r !== pair2).map(c => c.r));
      return {cat:PCALC.CAT.TWO,   kick:[pair1, pair2, kick]}; // Retorna 2 pares + 1 kicker
    }
    if(pairs.length===1) {
      const pairRank = pairs[0];
      const kickers = cards.filter(c => c.r !== pairRank).map(c => c.r).sort((a,b) => b-a);
      return {cat:PCALC.CAT.PAIR,  kick:[pairRank, kickers[0], kickers[1], kickers[2]]}; // Retorna par + 3 kickers
    }
    
    // ===== CORREÇÃO KICKERS (CARTA ALTA) =====
    const kickers = cards.map(c => c.r).sort((a,b) => b-a);
    return {cat:PCALC.CAT.HIGH, kick:kickers.slice(0, 5)}; // Retorna 5 kickers
  };

  PCALC.cmpEval=function(a,b){
    if(a.cat!==b.cat) return a.cat-b.cat;
    const l=Math.max(a.kick.length,b.kick.length);
    for(let i=0;i<l;i++){
      const va=a.kick[i]||0, vb=b.kick[i]||0;
      if(va!==vb) return va-vb;
    }
    return 0;
  };
})(window);
