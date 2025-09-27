// Generated on 2025-09-27T15:25:00.400351 by ChatGPT
/* ============================================================
   INÍCIO DO MÓDULO — pcalc.bootstrap.js
   Responsável por: estado global, helpers básicos (getKnown),
   botões (Flop/Turn/River/Clear), render inicial e start.
   ============================================================ */
(function(g){
  const PC = g.PCALC || (g.PCALC = {});

  // ---- Estado base ----
  PC.state = PC.state || { selected: [], prevBoardLen: 0, stageJustSet: null };

  // ---- Helpers básicos ----
  PC.getKnown = function getKnown(){
    const byId = Object.fromEntries((PC.makeDeck?.() || []).map(c => [PC.cardId(c), c]));
    const ids = PC.state.selected || [];
    const hand  = ids.slice(0,2).map(id => byId[id]).filter(Boolean);
    const board = ids.slice(2,7).map(id => byId[id]).filter(Boolean);
    return { hand, board };
  };

  function updateStageChange(oldLen, newLen){
    if(newLen>=3 && oldLen<3) PC.state.stageJustSet='Flop definido';
    else if(newLen>=4 && oldLen<4) PC.state.stageJustSet='Turn definido';
    else if(newLen>=5 && oldLen<5) PC.state.stageJustSet='River definido';
    PC.state.prevBoardLen = newLen;
  }
  PC.__updateStageChange = updateStageChange;

  // ---- Seleção de cartas ----
  PC.toggleCard = function toggleCard(id){
    const idx = PC.state.selected.indexOf(id);
    if(idx>=0) PC.state.selected.splice(idx,1);
    else{ if(PC.state.selected.length>=7) return; PC.state.selected.push(id); }
    const newLen = Math.max(0, PC.state.selected.length-2);
    updateStageChange(PC.state.prevBoardLen, newLen);
    PC.renderDeck?.();
    PC.safeRecalc?.();
  };

  // ---- Sorteio utilitário ----
  function pickRandom(n, excludeIds){
    const deck = PC.makeDeck?.() || [];
    const ex = new Set(excludeIds);
    const pool = deck.filter(c=>!ex.has(PC.cardId(c)));
    const out=[];
    for(let i=0;i<n && pool.length>0;i++){
      const j = Math.floor(Math.random()*pool.length);
      out.push(pool[j]); pool.splice(j,1);
    }
    return out;
  }
  PC.__pickRandom = pickRandom;

  // ---- Botões ----
  function wireStageButtons(){
    const btnFlop = document.getElementById('btnFlop');
    const btnTurn = document.getElementById('btnTurn');
    const btnRiver= document.getElementById('btnRiver');
    const btnClear= document.getElementById('btnClear');

    if(btnFlop) btnFlop.onclick = ()=>{
      if(PC.state.selected.length<2){ alert('Selecione 2 cartas.'); return; }
      const need=[2,3,4].filter(i=>!PC.state.selected[i]);
      if(!need.length){ alert('Flop já definido.'); return; }
      const oldLen = Math.max(0, PC.state.selected.length-2);
      const add=pickRandom(need.length, PC.state.selected).map(PC.cardId);
      const before=PC.state.selected.slice(0,2), after=PC.state.selected.slice(2);
      for(let i=0;i<need.length;i++) after.splice(need[i]-2, 0, add[i]);
      PC.state.selected = before.concat(after);
      const newLen = Math.max(0, PC.state.selected.length-2);
      updateStageChange(oldLen, newLen);
      PC.renderDeck?.(); PC.safeRecalc?.();
    };
    if(btnTurn) btnTurn.onclick = ()=>{
      if(PC.state.selected.length<5){ alert('Defina o flop.'); return; }
      if(PC.state.selected[5]){ alert('Turn já definido.'); return; }
      const oldLen = Math.max(0, PC.state.selected.length-2);
      const add=pickRandom(1, PC.state.selected).map(PC.cardId)[0];
      PC.state.selected.splice(5,0,add);
      const newLen = Math.max(0, PC.state.selected.length-2);
      updateStageChange(oldLen, newLen);
      PC.renderDeck?.(); PC.safeRecalc?.();
    };
    if(btnRiver) btnRiver.onclick = ()=>{
      if(PC.state.selected.length<6){ alert('Defina o turn.'); return; }
      if(PC.state.selected[6]){ alert('River já definido.'); return; }
      const oldLen = Math.max(0, PC.state.selected.length-2);
      const add=pickRandom(1, PC.state.selected).map(PC.cardId)[0];
      PC.state.selected.splice(6,0,add);
      const newLen = Math.max(0, PC.state.selected.length-2);
      updateStageChange(oldLen, newLen);
      PC.renderDeck?.(); PC.safeRecalc?.();
    };
    if(btnClear) btnClear.onclick = ()=>{
      PC.state.selected=[]; updateStageChange(PC.state.prevBoardLen, 0); PC.renderDeck?.(); PC.safeRecalc?.();
    };
  }
  PC.__wireStageButtons = wireStageButtons;

  // ---- Start ----
  function __pcalc_start_app__(){
    PC.state.prevBoardLen = Math.max(0, PC.state.selected.length-2);
    PC.renderDeck?.();
    wireStageButtons();
  }
  g.__pcalc_start_app__ = __pcalc_start_app__;

  document.addEventListener('DOMContentLoaded', ()=>{
    // aguardando start via __pcalc_start_app__ (pelo login-guard, se houver)
  });
})(window);
/* FIM DO MÓDULO — pcalc.bootstrap.js */
