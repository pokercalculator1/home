// pcalc-app.js
import {
  PCalcState, makeDeck, RANKS, SUITS, cardId, fmtRank,
  SUIT_CLASS, SUIT_GLYPH, evalBest
} from './pcalc-core.js';
import { renderPreflopPanel, chenPercent, chenScore } from './pcalc-chen.js';
import { renderOuts } from './pcalc-outs.js';
import { suggestAction, decisionClass, shouldGlow, eqPctPreflop } from './pcalc-suggest.js';
import { TTS } from './pcalc-tts.js';

// ==== NOVO: checagem leve do módulo PF (preflop_rank.js) ====
function hasPF(){
  return typeof window !== 'undefined' && window.PF && typeof PF.normalize2 === 'function';
}

const deckEl = document.getElementById('deck');
let stageJustSet = null;

// Utilitários de estágio
function stageFromBoardLen(n){
  return n<3 ? 'Pré-flop' : (n===3 ? 'Pós-flop' : (n===4 ? 'Pós-turn' : 'Pós-river'));
}
function updateStageChange(oldLen, newLen){
  if(newLen>=3 && oldLen<3) stageJustSet='Flop definido';
  else if(newLen>=4 && oldLen<4) stageJustSet='Turn definido';
  else if(newLen>=5 && oldLen<5) stageJustSet='River definido';
  PCalcState.setPrevBoardLen(newLen);
}

// Slots (mantido simples aqui)
function renderSlots(){ /* seus slots custom se aplicam; omitido intencionalmente */ }

// Deck
function renderDeck(){
  if(!deckEl) return;
  const selected = PCalcState.getSelected();
  deckEl.innerHTML='';
  for(const s of SUITS){
    for(const r of RANKS){
      const id=`${r}${s}`;
      const el=document.createElement('div');
      el.className = `cell ${SUIT_CLASS[s]} ${selected.includes(id)?'sel':''}`;
      el.dataset.id=id; el.title=`${fmtRank(r)}${SUIT_GLYPH[s]}`;
      el.innerHTML = `<div style="font-weight:600">${fmtRank(r)}</div><div class="mut">${SUIT_GLYPH[s]}</div>`;
      el.addEventListener('click',()=>{
        const oldLen = Math.max(0, PCalcState.getSelected().length-2);
        PCalcState.toggleCard(id);
        const newLen = Math.max(0, PCalcState.getSelected().length-2);
        updateStageChange(oldLen,newLen);
      });
      deckEl.appendChild(el);
    }
  }
  renderSlots();
  renderEverything();
}

// Categoria feita do herói
function renderHeroMade(){
  const el=document.getElementById('handCat'); if(!el) return;
  const {hand,board}=PCalcState.getKnown();
  if(hand.length<2){ el.textContent='Selecione sua mão'; return; }
  const ev = evalBest(hand.concat(board));
  const txt = ['Carta Alta','Par','Dois Pares','Trinca','Straight','Flush','Full House','Quadra','Straight Flush','Royal Flush'][ev.cat] || '—';
  el.textContent = txt;
}

// Monte Carlo simples para pós-flop
function simulateEquity(hand,board,nOpp=1,trials=5000){
  const missing=5-board.length;
  if(missing<0) return {win:0,tie:0,lose:100};
  const base=makeDeck().filter(c=>!PCalcState.getSelected().includes(cardId(c)));
  let win=0,tie=0,lose=0;
  for(let t=0;t<trials;t++){
    const pool=base.slice();
    const need=2*nOpp+missing;
    for(let i=0;i<need;i++){
      const j=i+Math.floor(Math.random()*(pool.length-i));
      [pool[i],pool[j]]=[pool[j],pool[i]];
    }
    let k=0;
    const opps=[]; for(let o=0;o<nOpp;o++) opps.push([pool[k++],pool[k++]]);
    const extra=[]; for(let m=0;m<missing;m++) extra.push(pool[k++]);
    const full=board.concat(extra);

    const hero=evalBest(hand.concat(full));
    let best='hero',bestEv=hero,winners=['hero'];
    for(let o=0;o<nOpp;o++){
      const ev=evalBest(opps[o].concat(full));
      const d = compare(ev,bestEv);
      if(d>0){ best=`opp${o}`; bestEv=ev; winners=[`opp${o}`]; }
      else if(d===0){ winners.push(`opp${o}`); }
    }
    if(best==='hero' && winners.length===1) win++;
    else if(winners.includes('hero')) tie++;
    else lose++;
  }
  const tot=win+tie+lose||1;
  return {win:win/tot*100, tie:tie/tot*100, lose:lose/tot*100};
}
function compare(a,b){
  if(a.cat!==b.cat) return a.cat-b.cat;
  const l=Math.max(a.kick.length,b.kick.length);
  for(let i=0;i<l;i++){
    const va=a.kick[i]||0, vb=b.kick[i]||0;
    if(va!==vb) return va-vb;
  }
  return 0;
}

// ==== NOVO: utilitário para obter a tag pré-flop ("AKs","QJo","77") via PF ====
function getPreflopTag(){
  if(!hasPF()) return null;
  const sel = PCalcState.getSelected();
  if(!sel || sel.length<2) return null;
  const [c1,c2] = sel;
  // ids padrão: "Ah","Kd","Tc" etc.
  if(!c1 || !c2 || c1.length<2 || c2.length<2) return null;
  const r1=c1[0].toUpperCase(), s1=c1[1].toLowerCase();
  const r2=c2[0].toUpperCase(), s2=c2[1].toLowerCase();
  try{
    return PF.normalize2(r1,s1,r2,s2); // "AKs","QJo","77"
  }catch(e){
    console.warn('[PF] normalize2 falhou:', e);
    return null;
  }
}

// ==== NOVO: renderização do bloco de ranking pré-flop (mostra só antes do flop) ====
function renderPreflopRankLine(container){
  if(!container) return;
  const {hand,board}=PCalcState.getKnown();
  if(hand.length<2 || board.length>=3) {
    const old = container.querySelector('#preflopRankLine');
    if(old) old.remove();
    return;
  }

  // cria o bloco se não existir
  let line = container.querySelector('#preflopRankLine');
  if(!line){
    line = document.createElement('div');
    line.id = 'preflopRankLine';
    line.className = 'mut';
    line.style.marginTop = '6px';
    container.insertBefore(line, container.firstChild); // fica em cima da barra
  }

  if(hasPF()){
    const tag = getPreflopTag();
    if(tag){
      const info = PF.describe(tag); // {hand, rank, tier}
      if(info?.rank){
        line.innerHTML = `<b>Pré-flop:</b> ${info.hand} • <b>Rank</b> ${info.rank}/169 • ${info.tier}`;
      }else{
        line.textContent = 'Pré-flop: (ranking indisponível para esta mão)';
      }
    }else{
      line.textContent = 'Pré-flop: (selecione 2 cartas para ver o rank)';
    }
  }else{
    line.textContent = 'Pré-flop: ranking 1–169 indisponível (arquivo preflop_rank.js não carregado).';
  }
}

// Painel de equidade + sugestão
function renderEquityPanel(){
  const box=document.getElementById('equityBox');
  if(!box) return;
  const {hand,board}=PCalcState.getKnown();
  const len=board.length;

  if(hand.length===2 && len<=5){
    const stage = stageFromBoardLen(len);
    box.style.display='block';
    if(!box.dataset.wired){
      box.innerHTML=`
        <h3>${stage}: Equidade até o showdown</h3>
        <div class="labels" style="align-items:center;margin-top:6px;gap:6px;flex-wrap:wrap">
          <span class="lbl">Oponentes:
            <select id="eqOpp" style="background:#0b1324;color:#e5e7eb;border:none;outline:0">
              ${Array.from({length:8},(_,i)=>`<option value="${i+1}">${i+1}</option>`).join('')}
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
        <!-- NOVO: linha de ranking pré-flop aparece aqui antes da barra -->
        <div class="bar" style="margin-top:8px"><i id="eqBarWin" style="width:0%"></i></div>
        <div style="display:flex;gap:8px;margin-top:6px" id="eqBreak"></div>
        <div class="hint" id="suggestOut" style="margin-top:10px"></div>
      `;
      box.dataset.wired='1';

      document.getElementById('btnEqCalc').onclick=calcEquity;
      document.getElementById('eqOpp').onchange=calcEquity;
      document.getElementById('eqTrials').onchange=calcEquity;

      if('speechSynthesis' in window){
        TTS.populateVoices();
        speechSynthesis.onvoiceschanged = TTS.populateVoices;
        TTS.state.enabled = true;
        document.getElementById('ttsEnable').onchange = e=>{
          TTS.state.enabled = e.target.checked;
          if(TTS.state.enabled) TTS.speak('Voz ativada');
        };
        document.getElementById('ttsVoice').onchange = e=>{
          const name=e.target.value;
          const v = speechSynthesis.getVoices().find(v=>v.name===name);
          if(v) TTS.state.voice=v;
        };
      }else{
        const enableEl = document.getElementById('ttsEnable');
        const voiceSel = document.getElementById('ttsVoice');
        enableEl.disabled=true; voiceSel.disabled=true;
        voiceSel.innerHTML = '<option>(sem suporte no navegador)</option>';
      }
    }else{
      box.querySelector('h3').textContent=`${stage}: Equidade até o showdown`;
    }

    // NOVO: renderizar linha de ranking pré-flop quando ainda não há 3 cartas na mesa
    renderPreflopRankLine(box);

    calcEquity();
  }else{
    box.style.display='none';
    box.innerHTML='';
    delete box.dataset.wired;
  }
}

// Cálculo da equidade + sugestão (pré e pós-flop)
function calcEquity(){
  const {hand,board}=PCalcState.getKnown();
  if(hand.length<2) return;

  const opp=parseInt(document.getElementById('eqOpp').value,10);
  const trials=parseInt(document.getElementById('eqTrials').value,10);
  const st=document.getElementById('eqStatus');

  if(st) st.textContent='Calculando...';

  const isPre = board.length<3;
  const preWin = isPre ? eqPctPreflop(hand) : null;
  const res = isPre
    ? { win: preWin, tie:0, lose: 100 - preWin }
    : simulateEquity(hand,board,opp,trials);

  // Atualiza barra e breakdown
  const bar=document.getElementById('eqBarWin');
  if(bar) bar.style.width=`${res.win.toFixed(1)}%`;
  const br=document.getElementById('eqBreak');
  if(br) br.innerHTML=`<small><b>Win:</b> ${res.win.toFixed(1)}%</small>
                <small><b>Tie:</b> ${res.tie.toFixed(1)}%</small>
                <small><b>Lose:</b> ${res.lose.toFixed(1)}%</small>`;

  if(st) st.textContent=`${isPre ? 'Chen (pré-flop)' : 'Monte Carlo'} • ${isPre ? 'sem simulação' : trials.toLocaleString()+' amostras'}`;

  // Sugestão
  const eqPct = isPre ? res.win : (res.win + res.tie/2);
  const sugg = suggestAction(eqPct, hand, board, opp);
  const out   = document.getElementById('suggestOut');
  const cls   = decisionClass(sugg.title);
  const glow  = shouldGlow(cls);
  if(out){
    out.innerHTML = `<div class="decision ${glow ? 'glow' : ''}">
        <div class="decision-title ${cls}">${sugg.title}</div>
        <div class="decision-detail">${sugg.detail}</div>
      </div>`;
  }

  // NOVO: manter a linha de ranking atualizada quando usuário mexer em cartas da mão
  const box=document.getElementById('equityBox');
  if(box && isPre) renderPreflopRankLine(box);

  // Voz
  if(TTS.state?.enabled){
    if(stageJustSet){ TTS.speak(`${stageJustSet}. Sugestão: ${sugg.title}`); stageJustSet = null; }
    else{ TTS.speak(`Sugestão: ${sugg.title}`); }
  }
}

// utilitário para comprar cartas aleatórias sem repetir selecionadas
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

// Botões
function wireButtons(){
  const btnFlop = document.getElementById('btnFlop');
  const btnTurn = document.getElementById('btnTurn');
  const btnRiver= document.getElementById('btnRiver');
  const btnClear= document.getElementById('btnClear');

  btnFlop && (btnFlop.onclick = ()=>{
    const sel = PCalcState.getSelected();
    if(sel.length<2){ alert('Selecione 2 cartas.'); return; }
    const need=[2,3,4].filter(i=>!sel[i]);
    if(!need.length){ alert('Flop já definido.'); return; }
    const add=pickRandom(need.length, sel).map(cardId);
    const before=sel.slice(0,2), after=sel.slice(2);
    for(let i=0;i<need.length;i++) after.splice(need[i]-2, 0, add[i]);
    const oldLen = Math.max(0, sel.length-2);
    PCalcState.setSelected(before.concat(after));
    const newLen = Math.max(0, PCalcState.getSelected().length-2);
    updateStageChange(oldLen,newLen);
  });

  btnTurn && (btnTurn.onclick = ()=>{
    const sel = PCalcState.getSelected();
    if(sel.length<5){ alert('Defina o flop.'); return; }
    if(sel[5]){ alert('Turn já definido.'); return; }
    const oldLen = Math.max(0, sel.length-2);
    const add=pickRandom(1, sel).map(cardId)[0];
    const nx = sel.slice(); nx.splice(5,0,add);
    PCalcState.setSelected(nx);
    const newLen = Math.max(0, nx.length-2);
    updateStageChange(oldLen,newLen);
  });

  btnRiver && (btnRiver.onclick = ()=>{
    const sel = PCalcState.getSelected();
    if(sel.length<6){ alert('Defina o turn.'); return; }
    if(sel[6]){ alert('River já definido.'); return; }
    const oldLen = Math.max(0, sel.length-2);
    const add=pickRandom(1, sel).map(cardId)[0];
    const nx = sel.slice(); nx.splice(6,0,add);
    PCalcState.setSelected(nx);
    const newLen = Math.max(0, nx.length-2);
    updateStageChange(oldLen,newLen);
  });

  btnClear && (btnClear.onclick = ()=>{
    const oldLen = Math.max(0, PCalcState.getSelected().length-2);
    PCalcState.clear();
    updateStageChange(oldLen, 0);
  });
}

function renderEverything(){
  renderPreflopPanel();   // seu painel pré-flop (Chen etc.)
  renderOuts();           // outs
  renderHeroMade();       // categoria feita atual
  renderEquityPanel();    // painel de equidade + (NOVO) linha de rank 1–169 no pré-flop
}

// Re-render em mudanças de estado
PCalcState.on('pcalc:state-changed', ()=>{ renderDeck(); });

// Bootstrap
window.__pcalc_start_app__ = function(){
  renderDeck();
  wireButtons();
  renderEverything();
};
