// pcalc-core.js (ESM)
export const RANKS = [2,3,4,5,6,7,8,9,10,11,12,13,14];
export const SUITS = ['s','h','d','c'];
export const RSTR  = {11:'J',12:'Q',13:'K',14:'A'};
export const SUIT_GLYPH = {s:'\u2660', h:'\u2665', d:'\u2666', c:'\u2663'};
export const SUIT_CLASS = {s:'s',h:'h',d:'d',c:'c'};
export const fmtRank = r => RSTR[r] || String(r);
export const cardId  = c => `${c.r}${c.s}`;
export const makeDeck = () => { const d=[]; for(const s of SUITS){ for(const r of RANKS){ d.push({r,s}); } } return d; };

const bus = new EventTarget();
let selected = [];
let prevBoardLen = 0;

export const PCalcState = {
  getSelected: () => selected.slice(),
  setSelected: (arr) => { selected = arr.slice(); fire('state-changed'); },
  toggleCard: (id) => { const i = selected.indexOf(id); if(i>=0) selected.splice(i,1); else if(selected.length<7) selected.push(id); fire('state-changed'); },
  clear: () => { selected = []; fire('state-changed'); },
  on: (type, fn) => bus.addEventListener(type, fn),
  off: (type, fn) => bus.removeEventListener(type, fn),
  getKnown: () => {
    const byId = Object.fromEntries(makeDeck().map(c=>[cardId(c),c]));
    const cards = selected.map(id=>byId[id]).filter(Boolean);
    return { hand: cards.slice(0,2), board: cards.slice(2), byId };
  },
  getPrevBoardLen: () => prevBoardLen,
  setPrevBoardLen: (n) => { prevBoardLen = n; },
};
function fire(name, detail){ bus.dispatchEvent(new CustomEvent(`pcalc:${name}`, {detail})); }

export const CAT = {HIGH:0,PAIR:1,TWO:2,TRIPS:3,STRAIGHT:4,FLUSH:5,FULL:6,QUADS:7,STRAIGHT_FLUSH:8,ROYAL:9};
export const CAT_NAME = {
  [CAT.HIGH]:'Carta Alta',[CAT.PAIR]:'Par',[CAT.TWO]:'Dois Pares',[CAT.TRIPS]:'Trinca',
  [CAT.STRAIGHT]:'Straight',[CAT.FLUSH]:'Flush',[CAT.FULL]:'Full House',
  [CAT.QUADS]:'Quadra',[CAT.STRAIGHT_FLUSH]:'Straight Flush',[CAT.ROYAL]:'Royal Flush'
};

function straightHigh(set){
  const u=[...set].sort((a,b)=>b-a);
  if(u.includes(14)) u.push(1);
  let run=1, best=null;
  for(let i=0;i<u.length-1;i++){
    if(u[i]-1===u[i+1]){ run++; if(run>=5) best=u[i+1]+4; }
    else run=1;
  }
  return best;
}

export function evalBest(cards){
  const bySuit={s:[],h:[],d:[],c:[]}, count={};
  for(const c of cards){ bySuit[c.s].push(c); count[c.r]=(count[c.r]||0)+1; }
  for(const k in bySuit) bySuit[k].sort((a,b)=>b.r-a.r);

  let sfH=null, sfS=null;
  for(const s of SUITS){
    if(bySuit[s].length>=5){
      const high=straightHigh(new Set(bySuit[s].map(c=>c.r)));
      if(high){ sfH=Math.max(sfH||0,high); sfS=s; }
    }
  }
  if(sfH) return (sfH===14)? {cat:CAT.ROYAL,kick:[14],s:sfS} : {cat:CAT.STRAIGHT_FLUSH,kick:[sfH],s:sfS};

  for(const r of RANKS){ if(count[r]===4){
    const kick = Math.max(...cards.filter(c=>c.r!==r).map(c=>c.r));
    return {cat:CAT.QUADS, kick:[r,kick]};
  }}

  const trips=[], pairs=[];
  for(const r of RANKS.slice().reverse()){
    if(count[r]>=3) trips.push(r);
    else if(count[r]>=2) pairs.push(r);
  }
  if(trips.length){
    if(trips.length>=2) return {cat:CAT.FULL, kick:[trips[0], trips[1]]};
    if(pairs.length)    return {cat:CAT.FULL, kick:[trips[0], pairs[0]]};
  }

  for(const s of SUITS){
    if(bySuit[s].length>=5) return {cat:CAT.FLUSH, kick:bySuit[s].slice(0,5).map(c=>c.r)};
  }
  const sH = straightHigh(new Set(cards.map(c=>c.r)));
  if(sH) return {cat:CAT.STRAIGHT,kick:[sH]};

  if(trips.length)     return {cat:CAT.TRIPS,kick:[trips[0]]};
  if(pairs.length>=2)  return {cat:CAT.TWO,  kick:[pairs[0],pairs[1]]};
  if(pairs.length===1) return {cat:CAT.PAIR, kick:[pairs[0]]};

  return {cat:CAT.HIGH, kick:[]};
}

export function cmpEval(a,b){
  if(a.cat!==b.cat) return a.cat-b.cat;
  const l=Math.max(a.kick.length,b.kick.length);
  for(let i=0;i<l;i++){
    const va=a.kick[i]||0, vb=b.kick[i]||0;
    if(va!==vb) return va-vb;
  }
  return 0;
}
