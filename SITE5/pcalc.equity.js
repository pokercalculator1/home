// Generated on 2025-09-27T15:25:00.400351 by ChatGPT
/* ============================================================
   INÍCIO DO MÓDULO — pcalc.equity.js
   Painel de Equidade, cálculo (MC/exato no turn) e sugestão
   ============================================================ */
(function (g) {
  const PC = g.PCALC || (g.PCALC = {});
  const PF = PC.__PF__;

  function renderHeroMade(){
    const el=document.getElementById('handCat'); if(!el) return;
    const {hand,board}=PC.getKnown();
    if(hand.length<2){ el.textContent='Selecione sua mão'; return; }
    const ev=PC.evalBest(hand.concat(board));
    el.textContent = PC.CAT_NAME[ev.cat] || '—';
  }

  function simulateEquity(hand,board,nOpp=1,trials=5000){
    const missing=5-board.length;
    if(missing<0) return {win:0,tie:0,lose:100};
    const base=PC.makeDeck().filter(c=>!PC.state.selected.includes(PC.cardId(c)));
    let win=0,tie=0,lose=0;
    for(let t=0;t<trials;t++){
      const pool=base.slice();
      const need=2*nOpp+missing;
      for(let i=0;i<need;i++){ const j=i+Math.floor(Math.random()*(pool.length-i)); const tmp=pool[i]; pool[i]=pool[j]; pool[j]=tmp; }
      let idx=0; const opps=[];
      for(let k=0;k<nOpp;k++){ opps.push([pool[idx++],pool[idx++]]); }
      const extra=[]; for(let k=0;k<missing;k++){ extra.push(pool[idx++]); }
      const full=board.concat(extra);
      const hero=PC.evalBest(hand.concat(full));
      let best='hero', bestEv=hero, winners=['hero'];
      for(let k=0;k<nOpp;k++){ const ev=PC.evalBest(opps[k].concat(full)); const cmp=PC.cmpEval(ev,bestEv);
        if(cmp>0){ best=`opp${k}`; bestEv=ev; winners=[`opp${k}`]; }
        else if(cmp===0){ winners.push(`opp${k}`); }
      }
      if(best==='hero' && winners.length===1) win++;
      else if(winners.includes('hero')) tie++; else lose++;
    }
    const tot=win+tie+lose||1;
    return {win:win/tot*100, tie:tie/tot*100, lose:lose/tot*100};
  }

  function exactTurnEquity(hand, board){
    if(board.length!==4) return null;
    const remainingAll = PC.makeDeck().filter(c=>!PC.state.selected.includes(PC.cardId(c)));
    let win=0, tie=0, lose=0;
    for(let i=0;i<remainingAll.length;i++){
      const river = remainingAll[i];
      const finalBoard = board.concat([river]);
      const heroEv = PC.evalBest(hand.concat(finalBoard));
      const pool = []; for(let k=0;k<remainingAll.length;k++){ if(k!==i) pool.push(remainingAll[k]); }
      for(let a=0;a<pool.length-1;a++){ const ca=pool[a];
        for(let b=a+1;b<pool.length;b++){ const cb=pool[b];
          const oppEv = PC.evalBest([ca,cb].concat(finalBoard));
          const cmp = PC.cmpEval(heroEv, oppEv);
          if(cmp>0) win++; else if(cmp<0) lose++; else tie++;
        }
      }
    }
    const tot = win+tie+lose || 1;
    return {win:win/tot*100, tie:tie/tot*100, lose:lose/tot*100, _method:'exact-turn'};
  }

  function calcEquity(){
    const {hand,board}=PC.getKnown();
    if(hand.length<2){ return; }
    const box=document.getElementById('equityBox');
    if(!box || !box.dataset.wired){ renderEquityPanel(); }
    const oppSel=document.getElementById('eqOpp');
    const trialsSel=document.getElementById('eqTrials');
    if(!oppSel || !trialsSel) return;
    const opp=parseInt(oppSel.value,10);
    const trials=parseInt(trialsSel.value,10);
    const st=document.getElementById('eqStatus');
    const useExactTurn = (board.length===4 && opp===1);
    if(st) st.textContent= useExactTurn ? 'Calculando (exato no turn)...' : 'Calculando...';

    // Se flop incompleto (1 ou 2 cartas), não sugerir ainda
    const partialFlop = (board.length === 1 || board.length === 2);

    const res = (function(){
      if(board.length===4 && opp===1) return exactTurnEquity(hand,board);
      const mc = simulateEquity(hand,board,opp,trials); mc._method='mc'; return mc;
    })();

    const bar=document.getElementById('eqBarWin');
    if(bar) bar.style.width=`${res.win.toFixed(1)}%`;
    const br=document.getElementById('eqBreak');
    if(br) br.innerHTML=`<small><b>Win:</b> ${res.win.toFixed(1)}%</small>\n                  <small><b>Tie:</b> ${res.tie.toFixed(1)}%</small>\n                  <small><b>Lose:</b> ${res.lose.toFixed(1)}%</small>`;

    if(st){ st.textContent = res._method==='exact-turn' ? `Exato (turn) vs ${opp} oponente` : `Monte Carlo vs ${opp} oponente(s) • ${trials.toLocaleString()} amostras`; }

    const out = document.getElementById('suggestOut');
    if (partialFlop) {
      if (out) {
        out.innerHTML = `\n          <div class=\"decision\">\n            <div class=\"decision-title info\">Aguarde o flop completo</div>\n            <div class=\"decision-detail\">Selecione as 3 cartas do flop para sugerir ação.</div>\n          </div>\n        `;
      }\n      if(box) PF.renderPreflopRankLineInto(box);\n      return;\n    }

    const eqPct = (res.win + res.tie/2);
    let sugg = PC.suggestAction?.(eqPct, hand, board, opp) || { title: 'CHECK', detail: 'heurístico' };
    const cls  = PC.decisionClass?.(sugg.title) || 'neutral';
    const glow = PC.shouldGlow?.(cls);

    if(out){ out.innerHTML = `\n        <div class=\"decision ${glow ? 'glow' : ''}\">\n          <div class=\"decision-title ${cls}\">${sugg.title}</div>\n          <div class=\"decision-detail\">${sugg.detail}</div>\n        </div>\n      `; }

    if(g.TTS?.state?.enabled){ if(PC.state.stageJustSet){ g.TTS.speak(`${PC.state.stageJustSet}. Sugestão: ${sugg.title}`); PC.state.stageJustSet = null; } else { g.TTS.speak(`Sugestão: ${sugg.title}`); } }

    // OVERRIDE GTO APENAS NO FLOP e só quando as 3 cartas já estão definidas
    if (board.length === 3 && g.PCALC?.GTO?.suggestFlopLikeGTO) {
      g.PCALC.GTO.suggestFlopLikeGTO({ spot:'SRP_BTNvsBB_100bb', hero: hand, board }).then((gto)=>{
        if(!gto?.ok) return;
        const act = (gto.action || 'check').toUpperCase();
        const pct = Math.round((gto.freqs?.[gto.action] || 0) * 100);
        const bucket = (gto.bucketId||'').replace('__',' · ');
        const feature = gto.feature || '';
        const clsGto = PC.decisionClass?.(act) || 'neutral';
        const glowG  = PC.shouldGlow?.(clsGto);
        if(document.getElementById('suggestOut')){
          document.getElementById('suggestOut').innerHTML = `\n            <div class=\"decision ${glowG ? 'glow' : ''}\">\n              <div class=\"decision-title ${clsGto}\">${act}</div>\n              <div class=\"decision-detail\">GTO-like (${pct}%) · ${bucket} · ${feature}</div>\n            </div>\n          `;
        }\n      }).catch(()=>{});\n    }

    if(box) PF.renderPreflopRankLineInto(box);
  }

  function renderEquityPanel(){
    const box=document.getElementById('equityBox'); if(!box) return;
    const {hand,board}=PC.getKnown(); const len=board.length;
    if(hand.length===2 && len<=5){
      const stage = len<3?'Pré-flop':(len===3?'Pós-flop':(len===4?'Pós-turn':'Pós-river'));
      box.style.display='block';
      if(!box.dataset.wired){
        box.innerHTML=`\n          <h3>${stage}: Equidade até o showdown</h3>\n          <div class=\"labels\" style=\"align-items:center;margin-top:6px;gap:6px;flex-wrap:wrap\">\n            <span class=\"lbl\">Oponentes:\n              <select id=\"eqOpp\" style=\"background:#0b1324;color:#e5e7eb;border:none;outline:0\">\n                ${Array.from({length:8},(_,i)=>`<option value=\"${i+1}\" ${i===1?'selected':''}>${i+1}</option>`).join('')}\n              </select>\n            </span>\n            <span class=\"lbl\">Amostras:\n              <select id=\"eqTrials\" style=\"background:#0b1324;color:#e5e7eb;border:none;outline:0\">\n                <option value=\"3000\">3k</option>\n                <option value=\"5000\" selected>5k</option>\n                <option value=\"10000\">10k</option>\n              </select>\n            </span>\n            <span class=\"lbl\">\n              <label style=\"display:flex;gap:6px;align-items:center;cursor:pointer\">\n                <input id=\"ttsEnable\" type=\"checkbox\" checked>\n                <span>Voz</span>\n              </label>\n            </span>\n            <span class=\"lbl\">Voz:\n              <select id=\"ttsVoice\" style=\"max-width:160px;background:#0b1324;color:#e5e7eb;border:none;outline:0\"></select>\n            </span>\n            <button class=\"btn\" id=\"btnEqCalc\">↻ Recalcular</button>\n          </div>\n          <div id=\"eqStatus\" class=\"mut\" style=\"margin-top:8px\"></div>\n          <!-- A LINHA DE RANK PRÉ-FLOP (JSON) será inserida AQUI (antes da barra) quando for pré-flop -->\n          <div class=\"bar\" style=\"margin-top:8px\"><i id=\"eqBarWin\" style=\"width:0%\"></i></div>\n          <div style=\"display:flex;gap:8px;margin-top:6px\" id=\"eqBreak\"></div>\n          <div class=\"hint\" id=\"suggestOut\" style=\"margin-top:10px\"></div>\n        `;
        box.dataset.wired='1';\n        document.getElementById('btnEqCalc').onclick=calcEquity;\n        document.getElementById('eqOpp').onchange=calcEquity;\n        document.getElementById('eqTrials').onchange=calcEquity;\n        const hasTTS = !!(g.TTS) && ('speechSynthesis' in g);\n        const enableEl=document.getElementById('ttsEnable');\n        const voiceSel=document.getElementById('ttsVoice');\n        if(hasTTS){\n          g.TTS.populateVoices?.();\n          speechSynthesis.onvoiceschanged = g.TTS.populateVoices || null;\n          g.TTS.state = g.TTS.state || {}; g.TTS.state.enabled = true; enableEl.checked = true;\n          enableEl.onchange = (e)=>{ g.TTS.state.enabled = e.target.checked; if(g.TTS.state.enabled) g.TTS.speak?.('Voz ativada'); };\n          voiceSel.onchange = (e)=>{ const name=e.target.value; const v = speechSynthesis.getVoices().find(v=>v.name===name); if(v) g.TTS.state.voice=v; };\n        }else{ enableEl.disabled=true; voiceSel.disabled=true; voiceSel.innerHTML = '<option>(sem suporte no navegador)</option>'; }\n      }else{ box.querySelector('h3').textContent=`${stage}: Equidade até o showdown`; }\n      PF.renderPreflopRankLineInto(box);\n      PF.startPFWatchdog();\n      calcEquity();\n    }else{\n      box.style.display='none'; box.innerHTML=''; delete box.dataset.wired;\n    }\n  }\n\n  function safeRecalc(){ try{ calcEquity(); }catch(e){} }\n\n  PC.renderEquityPanel = renderEquityPanel;\n  PC.calcEquity = calcEquity;\n  PC.safeRecalc = safeRecalc;\n  PC.renderHeroMade = renderHeroMade;\n})(window);\n/* FIM DO MÓDULO — pcalc.equity.js */\n
