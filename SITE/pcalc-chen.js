// pcalc-chen.js
import { PCalcState, SUIT_CLASS, SUIT_GLYPH, fmtRank } from './pcalc-core.js';

const CHEN_BASE={14:10,13:8,12:7,11:6,10:5,9:4.5,8:4,7:3.5,6:3,5:2.5,4:2,3:1.5,2:1};
export function chenScore(c1,c2){
  const r1=c1.r,r2=c2.r,s1=c1.s,s2=c2.s;
  const hi=Math.max(r1,r2), lo=Math.min(r1,r2);
  let score=CHEN_BASE[hi];
  if(r1===r2){ score=Math.max(5,score*2); return {score,pair:true,suited:false,gap:0,bonusSmall:false}; }
  const suited=(s1===s2); if(suited) score+=2;
  const gap=hi-lo-1;
  if(gap===0) score+=1; else if(gap===2) score-=1; else if(gap===3) score-=2; else if(gap>=4) score-=5;
  const bonusSmall=(hi<12&&gap<=1); if(bonusSmall) score+=1;
  return {score,pair:false,suited,gap,bonusSmall};
}
export const chenPercent = s => Math.max(0,Math.min(100,(s/20)*100));
export const preflopLabel = p => p>=85?'Premium':p>=70?'Forte':p>=55?'Marginal':'Fraca';

export function renderPreflopPanel(){
  const box=document.getElementById('preflopBox');
  if(!box) return;
  const {hand,board}=PCalcState.getKnown();
  if(hand.length===2 && board.length<3){
    const cs=chenScore(hand[0],hand[1]);
    const pct=chenPercent(cs.score);
    const lab=preflopLabel(pct);
    const handHTML = hand.map(c=>`<span class="cardtag"><b class="${SUIT_CLASS[c.s]}">${fmtRank(c.r)}${SUIT_GLYPH[c.s]}</b></span>`).join(' ');
    box.style.display='block';
    box.innerHTML = `
      <h3>Pré-flop: Força (Chen)</h3>
      <div class="cards">${handHTML}</div>
      <div class="bar" style="margin-top:8px"><i style="width:${pct.toFixed(1)}%"></i></div>
      <div style="display:flex;justify-content:space-between;margin-top:6px">
        <small><b>${pct.toFixed(1)}%</b> (Chen ${cs.score.toFixed(1)}/20)</small>
        <small><b>${lab}</b></small>
      </div>
      <div class="labels" style="margin-top:6px">
        ${cs.pair?'<span class="lbl">Par</span>':''}
        ${cs.suited?'<span class="lbl">Suited +2</span>':''}
        ${!cs.pair?`<span class="lbl">Gap: ${cs.gap}</span>`:''}
        ${cs.bonusSmall?'<span class="lbl">Bônus straight +1</span>':''}
      </div>`;
  } else {
    box.style.display='none';
    box.innerHTML='';
  }
}
