/* multiway.js — wetness + penalização multiway + util potOdds */
(function (g) {
  'use strict';
  const CFG = { ALPHA: 0.08, BETA: 0.5, MULTIWAY_FLOOR: 0.5 };
  const RANK_MAP = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'T':10,'J':11,'Q':12,'K':13,'A':14 };
  function parseCard2(str){ if(!str||str.length<2) return null; const r=str[0].toUpperCase(), s=str[1].toLowerCase(); return {r,rank:RANK_MAP[r],suit:s}; }
  function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
  function boardWetnessScore(flop){
    try{
      if(!Array.isArray(flop)||flop.length<3) return 0;
      const c = flop.map(parseCard2).filter(Boolean); if(c.length<3) return 0;
      const ranks = c.map(x=>x.rank).sort((a,b)=>a-b);
      const suits = c.map(x=>x.suit);
      const distinct = new Set(ranks).size;
      const suitCount = suits.reduce((m,s)=>(m[s]=(m[s]||0)+1,m),{});
      const counts = Object.values(suitCount);
      const mono = counts.includes(3), two = counts.includes(2);
      let score = 0;
      if (mono) score+=35; else if (two) score+=20;
      const g1=ranks[1]-ranks[0], g2=ranks[2]-ranks[1], maxG=Math.max(g1,g2);
      const seq = (g1===1 && g2===1), oneTwo=( [g1,g2].sort().join()==="1,2" );
      if (seq) score+=25; else if (oneTwo) score+=18; else if (maxG>=3) score+=0;
      const need=new Set();
      for(let add=2; add<=14; add++){ const arr=[...ranks,add].sort((a,b)=>a-b); for(let i=0;i<2;i++){ const w=arr.slice(i,i+4); const span=w[3]-w[0]; if(span<=3){ need.add(add); break; } } }
      const n=need.size; if(n>=8) score+=20; else if(n>=5) score+=12; else if(n>=3) score+=6;
      const paired = (distinct<=2); if(paired) score-=10;
      const broad = ranks.filter(r=>r>=10).length; if(broad===3) score+=10;
      const lowConn = (!seq && ranks[2]<=9 && maxG===1); if(lowConn) score+=6;
      return clamp(score,0,100);
    }catch{return 0;}
  }
  function adjustedEquity(eq, opps, wetScore, A=CFG.ALPHA, B=CFG.BETA, FLOOR=CFG.MULTIWAY_FLOOR){
    if (!(eq>=0)) return 0;
    const multi = Math.max(FLOOR, 1 - A*Math.max(0,(opps||1)-1));
    const wet = 1 - B * Math.max(0, Math.min(1, (wetScore||0)/100));
    return Math.max(0, Math.min(1, eq*multi*wet));
  }
  function potOdds(pot, toCall){
    pot=Number(pot||0); toCall=Number(toCall||0);
    if(toCall<=0) return 0; return Math.max(0, Math.min(1, toCall/(pot+toCall)));
  }
  g.PCALC = g.PCALC || {}; g.PCALC.Multiway = { config: CFG, boardWetnessScore, adjustedEquity, potOdds };
})(window);
