// pcalc-app.js — PF(JSON) no pré-flop (linha e hover c/ posição da sua mão), pós-flop Top5, watchdog e sem "kicker undefined"
(function(g){
  const PC = g.PCALC;
  const { RANKS, SUITS, SUIT_CLASS, SUIT_GLYPH, fmtRank, cardId, makeDeck, evalBest, cmpEval, CAT, CAT_NAME } = PC;

  // ========== Helpers PF (preflop169.json via preflop_rank.js) ==========
  function hasPF(){
    return typeof g.PF !== 'undefined'
      && g.PF
      && typeof g.PF.normalize2 === 'function'
      && typeof g.PF.describe === 'function';
  }
  function rankNumToChar(n){
    if(n==null) return '';
    if(typeof n === 'string'){
      const u = n.toUpperCase();
      if('AKQJT98765432'.includes(u)) return u;
      if(u === '10') return 'T';
      return u[0] || '';
    }
    if(n===14) return 'A';
    if(n===13) return 'K';
    if(n===12) return 'Q';
    if(n===11) return 'J';
    if(n===10) return 'T';
    return String(n);
  }
  function getPreflopTagFromHand(){
    if(!hasPF()) return null;
    const { hand } = PC.getKnown();
    if(!hand || hand.length < 2) return null;
    const r1 = rankNumToChar(hand[0].r);
    const r2 = rankNumToChar(hand[1].r);
    const s1 = String(hand[0].s || '').toLowerCase();
    const s2 = String(hand[1].s || '').toLowerCase();
    try{
      return g.PF.normalize2(r1, s1, r2, s2); // "AKs","QJo","77"
    }catch(e){
      console.warn('[PF] normalize2 falhou:', e);
      return null;
    }
  }

  // Gera todas as 169 mãos canônicas (AA, KK, ..., AKo, AKs)
  function all169Tags(){
    const order = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'];
    const tags = [];
    for(let i=0;i<order.length;i++){
      for(let j=0;j<=i;j++){
        const hi = order[i], lo = order[j];
        if(hi === lo){
          tags.push(hi+lo);      // par: "77"
        }else{
          tags.push(hi+lo+'s');  // suited
          tags.push(hi+lo+'o');  // offsuit
        }
      }
    }
    return tags; // 169
  }

  // Lista PF inteira (ordenada por rank) e devolve também top5 já preparado para overlay
  function rankAllPF(){
    if(!hasPF()) return null;
    const rows = [];
    for(const t of all169Tags()){
      try{
        const info = g.PF.describe(t); // {hand, rank, tier}
        if(info && typeof info.rank === 'number'){
          rows.push({ label: info.hand, rank: info.rank, tier: info.tier || '' });
        }
      }catch(e){}
    }
    if(!rows.length) return null;
    rows.sort((a,b)=>a.rank - b.rank); // 1 é melhor
    return rows;
  }
  function top5FromAllPF(all){
    return all.slice(0,5).map(it=>({ label: it.label, right: `Rank ${it.rank}` }));
  }

  // ========== Linha do Rank PF (só no pré-flop) ==========
  function renderPreflopRankLineInto(box){
    if(!box) return;
    const { hand, board } = PC.getKnown();

    // Se já existe flop (board >= 3), remove a linha (se existir) e sai
    if(board && board.length >= 3){
      const old = box.querySelector('#preflopRankLine');
      if(old) old.remove();
      return;
    }

    let line = box.querySelector('#preflopRankLine');
    if(!line){
      line = document.createElement('div');
      line.id = 'preflopRankLine';
      line.className = 'mut';
      line.style.marginTop = '6px';
      const bar = box.querySelector('.bar');
      if(bar) box.insertBefore(line, bar);
      else box.insertBefore(line, box.firstChild);
    }

    if(!(hand && hand.length===2)){
      line.textContent = 'Pré-flop: (selecione 2 cartas para ver o rank)';
      return;
    }

    if(!hasPF()){
      line.textContent = 'Pré-flop: ranking 1–169 indisponível (aguardando JSON)...';
      return;
    }

    const tag = getPreflopTagFromHand();
    let info = null;
    try{ if(tag) info = g.PF.describe(tag); }catch(e){ console.warn('[PF] describe falhou:', e); }

    if(info?.rank){
      line.innerHTML = `<b>Pré-flop:</b> ${info.hand} • <b>Rank</b> ${info.rank}/169 • ${info.tier}`;
    }else{
      line.textContent = 'Pré-flop: (ranking indisponível para esta mão)';
    }
  }

  // Watchdog: tenta atualizar o rank PF por até 15s (30 tentativas / 500ms)
  let pfWatchdogTimer = null;
  let pfWatchdogTries = 0;
  function startPFWatchdog(){
    stopPFWatchdog();
    pfWatchdogTries = 0;
    pfWatchdogTimer = setInterval(()=>{
      pfWatchdogTries++;
      const box = document.getElementById('equityBox');
      if(box) renderPreflopRankLineInto(box);

      if(hasPF()){
        const { hand, board } = PC.getKnown();
        if((!board || board.length<3) && hand && hand.length===2){
          const tag = getPreflopTagFromHand();
          try{
            const info = tag ? g.PF.describe(tag) : null;
            if(info && typeof info.rank === 'number'){ stopPFWatchdog(); }
          }catch(_){}
        }
      }
      if(pfWatchdogTries >= 30){ stopPFWatchdog(); }
    }, 500);
  }
  function stopPFWatchdog(){
    if(pfWatchdogTimer){ clearInterval(pfWatchdogTimer); pfWatchdogTimer = null; }
  }

  // Re-renderiza a linha de rank PF assim que o JSON terminar de carregar
  window.addEventListener('PF:ready', ()=>{
    try{
      const box = document.getElementById('equityBox');
      if(box) renderPreflopRankLineInto(box);
      stopPFWatchdog();
    }catch(e){}
  });

  // ========== Leaderboard pós-flop ==========
  function keyFromEval(ev){ return JSON.stringify({ c: ev.cat, k: ev.kick }); }
  function r2cSafe(r){ // robusto contra valores falsy/undefined
    if(r==null) return '';
    return (r===14?'A':r===13?'K':r===12?'Q':r===11?'J':r===10?'T':String(r));
  }
  function listClean(arr){ // remove vazios e "undefined"
    return (arr||[]).map(r2cSafe).filter(x=>x && x!=='undefined');
  }
  function describeEval(ev){
    // Sem "kicker undefined": só mostra o que existir.
    const name = CAT_NAME[ev.cat] || '—';
    const k = ev.kick || [];
    let detail = '';

    switch(ev.cat){
      case CAT.ROYAL:
        detail = 'Royal Flush';
        break;

      case CAT.SFLUSH: {
        const hi = r2cSafe(k[0]);
        detail = hi ? `Straight Flush (alto ${hi})` : 'Straight Flush';
        break;
      }

      case CAT.QUADS: {
        const quad = r2cSafe(k[0]);
        const kick = r2cSafe(k[1]);
        detail = quad ? `Quadra de ${quad}` : 'Quadra';
        if(kick) detail += ` (kicker ${kick})`;
        break;
      }

      case CAT.FULL: {
        const t = r2cSafe(k[0]);
        const p = r2cSafe(k[1]);
        if(t && p) detail = `Full House (${t} cheio de ${p})`;
        else detail = 'Full House';
        break;
      }

      case CAT.FLUSH: {
        const hi = r2cSafe(k[0]);
        detail = hi ? `Flush (alto ${hi})` : 'Flush';
        break;
      }

      case CAT.STRAIGHT: {
        const hi = r2cSafe(k[0]);
        detail = hi ? `Sequência (alto ${hi})` : 'Sequência';
        break;
      }

      case CAT.TRIPS: {
        const t = r2cSafe(k[0]);
        const ks = listClean([k[1], k[2]]);
        detail = t ? `Trinca de ${t}` : 'Trinca';
        if(ks.length) detail += ` (kickers ${ks.join(', ')})`;
        break;
      }

      case CAT.TWO: {
        const a = r2cSafe(k[0]), b = r2cSafe(k[1]);
        const kick = r2cSafe(k[2]);
        if(a && b) detail = `Dois Pares (${a} & ${b})`;
        else detail = 'Dois Pares';
        if(kick) detail += `, kicker ${kick}`;
        break;
      }

      case CAT.ONE: {
        const p = r2cSafe(k[0]);
        const ks = listClean([k[1], k[2], k[3]]);
        detail = p ? `Par de ${p}` : 'Par';
        if(ks.length) detail += ` (kickers ${ks.join(', ')})`;
        break;
      }

      case CAT.HIGH: {
        const hi = r2cSafe(k[0]);
        detail = hi ? `Carta Alta ${hi}` : 'Carta Alta';
        break;
      }

      default:
        detail = name || '—';
    }
    return { name, detail };
  }
  function listOpponentHoles(deadIds){
    const dead = new Set(deadIds);
    const deck = makeDeck().filter(c=>!dead.has(cardId(c)));
    const holes = [];
    for(let i=0;i<deck.length-1;i++){
      for(let j=i+1;j<deck.length;j++){
        holes.push([deck[i], deck[j]]);
      }
    }
    return holes;
  }
  function computePostflopLeaderboard(){
    const { hand, board } = PC.getKnown();
    if(board.length < 3) return null;

    const deadIds = [];
    for(const c of hand) deadIds.push(cardId(c));
    for(const c of board) deadIds.push(cardId(c));
    const oppHoles = listOpponentHoles(deadIds);

    const heroEv = evalBest(hand.concat(board));

    const groups = new Map();
    let betterCombos=0, tieCombos=0, worseCombos=0;

    for(const [a,b] of oppHoles){
      const ev = evalBest([a,b].concat(board));
      const key = keyFromEval(ev);
      let g = groups.get(key);
      if(!g){
        g = { ev, count:0, examples:[] };
        groups.set(key, g);
      }
      g.count++;
      if(g.examples.length < 5){
        g.examples.push(cardId(a)+','+cardId(b));
      }

      const cmp = cmpEval(ev, heroEv);
      if(cmp>0) betterCombos++;
      else if(cmp<0) worseCombos++;
      else tieCombos++;
    }

    const arr = [...groups.values()];
    arr.sort((x,y)=> -cmpEval(x.ev, y.ev));

    let heroClassPos = 1;
    for(const g of arr){
      if(cmpEval(g.ev, heroEv) > 0) heroClassPos++;
      else break;
    }
    const heroClassesTotal = arr.length;

    const top5 = arr.slice(0,5).map(g=>{
      const desc = describeEval(g.ev);
      return { name: desc.name, detail: desc.detail, count: g.count, examples: g.examples };
    });

    return {
      top5,
      hero: {
        eval: heroEv,
        desc: describeEval(heroEv),
        classPosition: heroClassPos,
        classTotal: heroClassesTotal,
        betterCombos, tieCombos, worseCombos
      }
    };
  }

  // ========== UI base ==========
  let nutsOverlay=null, nutsHover=false, overlayTimer=null, wiredNuts=false;
  const deckEl = document.getElementById('deck');

  function renderSlots(){
    const ids=[...PC.state.selected];
    const byId = Object.fromEntries(makeDeck().map(c=>[cardId(c),c]));
    const map=['h0','h1','b0','b1','b2','b3','b4','n0','n1'];
    map.forEach((sid)=>{
      const el=document.getElementById(sid);
      if(!el) return;
      const idx=['h0','h1','b0','b1','b2','b3','b4'].indexOf(sid);
      let id=null; if(idx>=0) id=ids[idx];
      if(id){
        const c=byId[id];
        el.classList.add('filled');
        el.innerHTML = `<div class="${SUIT_CLASS[c.s]}" style="text-align:center">
          <div style="font-weight:700;font-size:18px">${fmtRank(c.r)}</div>
          <div style="font-size:18px">${SUIT_GLYPH[c.s]}</div>
        </div>`;
      }else{
        el.classList.remove('filled');
        el.textContent='';
      }
    });
  }

  function renderDeck(){
    if(!deckEl) return;
    deckEl.innerHTML='';
    for(const s of SUITS){
      for(const r of RANKS){
        const id=`${r}${s}`;
        const el=document.createElement('div');
        el.className = `cell ${SUIT_CLASS[s]} ${PC.state.selected.includes(id)?'sel':''}`;
        el.dataset.id=id; el.title=`${fmtRank(r)}${SUIT_GLYPH[s]}`;
        el.innerHTML = `<div style="font-weight:600">${fmtRank(r)}</div><div class="mut">${SUIT_GLYPH[s]}</div>`;
        el.addEventListener('click',()=>toggleCard(id));
        deckEl.appendChild(el);
      }
    }
    renderSlots();
    renderNuts();
    renderHeroMade();
    PC.computeAndRenderOuts();
    renderEquityPanel();

    wiredNuts=false; wireNutsOverlayOnce(); hideNutsOverlay();
    safeRecalc();
  }

  function updateStageChange(oldLen, newLen){
    if(newLen>=3 && oldLen<3) PC.state.stageJustSet='Flop definido';
    else if(newLen>=4 && oldLen<4) PC.state.stageJustSet='Turn definido';
    else if(newLen>=5 && oldLen<5) PC.state.stageJustSet='River definido';
    PC.state.prevBoardLen = newLen;
  }

  function toggleCard(id){
    const idx=PC.state.selected.indexOf(id);
    if(idx>=0){ PC.state.selected.splice(idx,1); }
    else{
      if(PC.state.selected.length>=7) return;
      PC.state.selected.push(id);
    }
    const newLen = Math.max(0, PC.state.selected.length-2);
    updateStageChange(PC.state.prevBoardLen, newLen);
    renderDeck();
    safeRecalc();
  }

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
  const btnFlop = document.getElementById('btnFlop');
  const btnTurn = document.getElementById('btnTurn');
  const btnRiver= document.getElementById('btnRiver');
  const btnClear= document.getElementById('btnClear');

  if(btnFlop) btnFlop.onclick = ()=>{
    if(PC.state.selected.length<2){ alert('Selecione 2 cartas.'); return; }
    const need=[2,3,4].filter(i=>!PC.state.selected[i]);
    if(!need.length){ alert('Flop já definido.'); return; }
    const oldLen = Math.max(0, PC.state.selected.length-2);
    const add=pickRandom(need.length, PC.state.selected).map(cardId);
    const before=PC.state.selected.slice(0,2), after=PC.state.selected.slice(2);
    for(let i=0;i<need.length;i++) after.splice(need[i]-2, 0, add[i]);
    PC.state.selected = before.concat(after);
    const newLen = Math.max(0, PC.state.selected.length-2);
    updateStageChange(oldLen, newLen);
    renderDeck();
    safeRecalc();
  };
  if(btnTurn) btnTurn.onclick = ()=>{
    if(PC.state.selected.length<5){ alert('Defina o flop.'); return; }
    if(PC.state.selected[5]){ alert('Turn já definido.'); return; }
    const oldLen = Math.max(0, PC.state.selected.length-2);
    const add=pickRandom(1, PC.state.selected).map(cardId)[0];
    PC.state.selected.splice(5,0,add);
    const newLen = Math.max(0, PC.state.selected.length-2);
    updateStageChange(oldLen, newLen);
    renderDeck();
    safeRecalc();
  };
  if(btnRiver) btnRiver.onclick = ()=>{
    if(PC.state.selected.length<6){ alert('Defina o turn.'); return; }
    if(PC.state.selected[6]){ alert('River já definido.'); return; }
    const oldLen = Math.max(0, PC.state.selected.length-2);
    const add=pickRandom(1, PC.state.selected).map(cardId)[0];
    PC.state.selected.splice(6,0,add);
    const newLen = Math.max(0, PC.state.selected.length-2);
    updateStageChange(oldLen, newLen);
    renderDeck();
    safeRecalc();
  };
  if(btnClear) btnClear.onclick = ()=>{
    PC.state.selected=[]; updateStageChange(PC.state.prevBoardLen, 0); renderDeck(); safeRecalc();
  };

  function renderHeroMade(){
    const el=document.getElementById('handCat'); if(!el) return;
    const {hand,board}=PC.getKnown();
    if(hand.length<2){ el.textContent='Selecione sua mão'; return; }
    const ev=evalBest(hand.concat(board));
    el.textContent = CAT_NAME[ev.cat] || '—';
  }

  // ===== Equidade =====
  function simulateEquity(hand,board,nOpp=1,trials=5000){
    const missing=5-board.length;
    if(missing<0) return {win:0,tie:0,lose:100};
    const base=makeDeck().filter(c=>!PC.state.selected.includes(cardId(c)));
    let win=0,tie=0,lose=0;

    for(let t=0;t<trials;t++){
      const pool=base.slice();
      const need=2*nOpp+missing;
      for(let i=0;i<need;i++){
        const j=i+Math.floor(Math.random()*(pool.length-i));
        const tmp=pool[i]; pool[i]=pool[j]; pool[j]=tmp;
      }
      let idx=0;
      const opps=[];
      for(let k=0;k<nOpp;k++){ opps.push([pool[idx++],pool[idx++]]); }
      const extra=[];
      for(let k=0;k<missing;k++){ extra.push(pool[idx++]); }
      const full=board.concat(extra);

      const hero=evalBest(hand.concat(full));
      let best='hero',bestEv=hero,winners=['hero'];
      for(let k=0;k<nOpp;k++){
        const ev=evalBest(opps[k].concat(full));
        const cmp=cmpEval(ev,bestEv);
        if(cmp>0){ best=`opp${k}`; bestEv=ev; winners=[`opp${k}`]; }
        else if(cmp===0){ winners.push(`opp${k}`); } // empate conta tie
      }
      if(best==='hero' && winners.length===1) win++;
      else if(winners.includes('hero')) tie++;
      else lose++;
    }
    const tot=win+tie+lose||1;
    return {win:win/tot*100, tie:tie/tot*100, lose:lose/tot*100};
  }

  function exactTurnEquity(hand, board){
    if(board.length!==4) return null;
    const remainingAll = makeDeck().filter(c=>!PC.state.selected.includes(cardId(c)));
    let win=0, tie=0, lose=0;
    for(let i=0;i<remainingAll.length;i++){
      const river = remainingAll[i];
      const finalBoard = board.concat([river]);
      const heroEv = evalBest(hand.concat(finalBoard));
      const pool = [];
      for(let k=0;k<remainingAll.length;k++){ if(k!==i) pool.push(remainingAll[k]); }
      for(let a=0;a<pool.length-1;a++){
        const ca = pool[a];
        for(let b=a+1;b<pool.length;b++){
          const cb = pool[b];
          const oppEv = evalBest([ca,cb].concat(finalBoard));
          const cmp = cmpEval(heroEv, oppEv);
          if(cmp>0) win++;
          else if(cmp<0) lose++;
          else tie++;
        }
      }
    }
    const tot = win+tie+lose || 1;
    return {win:win/tot*100, tie:tie/tot*100, lose:lose/tot*100, _method:'exact-turn'};
  }

  function renderEquityPanel(){
    const box=document.getElementById('equityBox');
    if(!box) return;

    const {hand,board}=PC.getKnown();
    const len=board.length;

    if(hand.length===2 && len<=5){
      const stage = len<3?'Pré-flop':(len===3?'Pós-flop':(len===4?'Pós-turn':'Pós-river'));
      box.style.display='block';
      if(!box.dataset.wired){
        box.innerHTML=`
          <h3>${stage}: Equidade até o showdown</h3>
          <div class="labels" style="align-items:center;margin-top:6px;gap:6px;flex-wrap:wrap">
            <span class="lbl">Oponentes:
              <select id="eqOpp" style="background:#0b1324;color:#e5e7eb;border:none;outline:0">
                ${Array.from({length:8},(_,i)=>`<option value="${i+1}" ${i===1?'selected':''}>${i+1}</option>`).join('')}
              </select>
            </span>
            <span class="lbl">Amostras:
              <select id="eqTrials" style="background:#0b1324;color:#e5e7eb;border:none;outline:0">
                <option value="300000">30k</option>
                <option value="500000">50k</option>
                <option value="100000"selected>100k</option>
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
          <!-- A LINHA DE RANK PRÉ-FLOP (JSON) será inserida AQUI (antes da barra) quando for pré-flop -->
          <div class="bar" style="margin-top:8px"><i id="eqBarWin" style="width:0%"></i></div>
          <div style="display:flex;gap:8px;margin-top:6px" id="eqBreak"></div>
          <div class="hint" id="suggestOut" style="margin-top:10px"></div>
        `;
        box.dataset.wired='1';

        document.getElementById('btnEqCalc').onclick=calcEquity;
        document.getElementById('eqOpp').onchange=calcEquity;
        document.getElementById('eqTrials').onchange=calcEquity;

        const hasTTS = !!(g.TTS) && ('speechSynthesis' in g);
        const enableEl=document.getElementById('ttsEnable');
        const voiceSel=document.getElementById('ttsVoice');

        if(hasTTS){
          g.TTS.populateVoices();
          speechSynthesis.onvoiceschanged = g.TTS.populateVoices;
          g.TTS.state.enabled = true;
          enableEl.checked = true;

          enableEl.onchange = (e)=>{
            g.TTS.state.enabled = e.target.checked;
            if(g.TTS.state.enabled) g.TTS.speak('Voz ativada');
          };
          voiceSel.onchange = (e)=>{
            const name=e.target.value;
            const v = speechSynthesis.getVoices().find(v=>v.name===name);
            if(v) g.TTS.state.voice=v;
          };
        }else{
          enableEl.disabled=true;
          voiceSel.disabled=true;
          voiceSel.innerHTML = '<option>(sem suporte no navegador)</option>';
        }
      }else{
        box.querySelector('h3').textContent=`${stage}: Equidade até o showdown`;
      }

      // Tenta renderizar a linha PF imediatamente e inicia watchdog
      renderPreflopRankLineInto(box);
      startPFWatchdog();

      calcEquity();
    }else{
      box.style.display='none';
      box.innerHTML='';
      delete box.dataset.wired;
    }
  }

  function calcEquity(){
    const {hand,board}=PC.getKnown();
    if(hand.length<2){ return; }

    const oppSel=document.getElementById('eqOpp');
    const trialsSel=document.getElementById('eqTrials');
    if(!oppSel || !trialsSel) return;

    const opp=parseInt(oppSel.value,10);
    const trials=parseInt(trialsSel.value,10);
    const st=document.getElementById('eqStatus');

    const useExactTurn = (board.length===4 && opp===1);
    if(st) st.textContent= useExactTurn ? 'Calculando (exato no turn)...' : 'Calculando...';

    const res = (function(){
      if(board.length===4 && opp===1) return exactTurnEquity(hand,board);
      const mc = simulateEquity(hand,board,opp,trials); mc._method='mc'; return mc;
    })();

    const bar=document.getElementById('eqBarWin');
    if(bar) bar.style.width=`${res.win.toFixed(1)}%`;
    const br=document.getElementById('eqBreak');
    if(br) br.innerHTML=`<small><b>Win:</b> ${res.win.toFixed(1)}%</small>
                  <small><b>Tie:</b> ${res.tie.toFixed(1)}%</small>
                  <small><b>Lose:</b> ${res.lose.toFixed(1)}%</small>`;

    if(st){
      if(res._method==='exact-turn'){
        st.textContent=`Exato (turn) vs ${opp} oponente`;
      }else{
        st.textContent=`Monte Carlo vs ${opp} oponente(s) • ${trials.toLocaleString()} amostras`;
      }
    }

    // Não sugerir com flop parcial (1–2 cartas)
    const out   = document.getElementById('suggestOut');
    const partialFlop = (board.length === 1 || board.length === 2);
    if (partialFlop) {
      if (out) {
        out.innerHTML = `
          <div class="decision">
            <div class="decision-title info">Aguarde o flop completo</div>
            <div class="decision-detail">Selecione as 3 cartas do flop para sugerir ação.</div>
          </div>
        `;
      }
      const box=document.getElementById('equityBox');
      if(box) renderPreflopRankLineInto(box);
      return;
    }

    const eqPct = (res.win + res.tie/2);
    const sugg = PC.suggestAction(eqPct, hand, board, opp);
    const cls   = PC.decisionClass(sugg.title);
    const glow  = PC.shouldGlow(cls);

    if(out){
      out.innerHTML = `
        <div class="decision ${glow ? 'glow' : ''}">
          <div class="decision-title ${cls}">${sugg.title}</div>
          <div class="decision-detail">${sugg.detail}</div>
        </div>
      `;
    }

    if(g.TTS?.state?.enabled){
      if(PC.state.stageJustSet){
        g.TTS.speak(`${PC.state.stageJustSet}. Sugestão: ${sugg.title}`);
        PC.state.stageJustSet = null;
      }else{
        g.TTS.speak(`Sugestão: ${sugg.title}`);
      }
    }

    // Atualiza/Remove a linha PF conforme a street
    const box=document.getElementById('equityBox');
    if(box) renderPreflopRankLineInto(box);
  }

  function safeRecalc(){ try{ calcEquity(); }catch(e){} }

  // ========== Nuts + overlay ==========
  function computeNutsPair(){
    const {board}=PC.getKnown();
    if(board.length<3) return null;
    const remaining = makeDeck().filter(c=>!PC.state.selected.includes(cardId(c)));
    let bestPair=null, bestEv=null;
    for(let i=0;i<remaining.length;i++){
      for(let j=i+1;j<remaining.length;j++){
        const a=remaining[i], b=remaining[j];
        const ev = evalBest([a,b].concat(board));
        if(!bestEv || cmpEval(ev,bestEv)>0){ bestEv=ev; bestPair=[a,b]; }
      }
    }
    return bestPair? {pair:bestPair, ev:bestEv}: null;
  }
  function renderNuts(){
    const n0=document.getElementById('n0'), n1=document.getElementById('n1'), ncat=document.getElementById('nutsCat');
    function clear(el){ if(!el) return; el.classList.remove('filled'); el.textContent=''; }
    function paint(el,c){ if(!el) return; el.classList.add('filled'); el.innerHTML = `<div class="${SUIT_CLASS[c.s]}" style="text-align:center"><div style="font-weight:700;font-size:18px">${fmtRank(c.r)}</div><div style="font-size:18px">${SUIT_GLYPH[c.s]}</div></div>`; }

    const {board}=PC.getKnown();
    if(board.length<3){
      paint(n0,{r:14,s:'s'}); paint(n1,{r:14,s:'h'});
      if(ncat) ncat.textContent='Par de Ases';
      return;
    }
    const res=computeNutsPair();
    if(!res){ clear(n0); clear(n1); if(ncat) ncat.textContent=''; return; }
    const [c1,c2]=res.pair; paint(n0,c1); paint(n1,c2);
    if(ncat) ncat.textContent = (CAT_NAME[res.ev.cat]||'');
  }

  const RANK_CHAR=r=>r===14?'A':r===13?'K':r===12?'Q':r===11?'J':r===10?'T':String(r);
  function pairKeyByRank(r1,r2){ const hi=Math.max(r1,r2), lo=Math.min(r1,r2); return `${hi}-${lo}`; }
  function pairLabelByRank(r1,r2){ const hi=Math.max(r1,r2), lo=Math.min(r1,r2); return `${RANK_CHAR(hi)}${RANK_CHAR(lo)}`; }

  function computeTop5PreflopChen(){
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

  // Top 5 REAL pós-flop para overlay
  function computeTop5PostflopLeaderboard(){
    const data = computePostflopLeaderboard();
    if(!data) return null;
    const rows = data.top5.map((it, idx)=>({
      left: `${idx+1}) ${it.detail}`,
      right: `(${it.count} combos)`,
      examples: it.examples
    }));
    const hero = data.hero;
    return { rows, hero };
  }

  function hideNutsOverlay(){ if(nutsOverlay){ nutsOverlay.remove(); nutsOverlay=null; } if(overlayTimer){ clearTimeout(overlayTimer); overlayTimer=null; } }
  function positionOverlayNear(anchor, el){
    const r=anchor.getBoundingClientRect();
    const top=r.bottom + window.scrollY + 6;
    let left=r.left + window.scrollX;
    document.body.appendChild(el);
    const w=el.getBoundingClientRect().width;
    const maxLeft=window.scrollX + window.innerWidth - w - 8;
    if(left>maxLeft) left = Math.max(8, maxLeft);
    el.style.position='absolute';
    el.style.top=`${top}px`;
    el.style.left=`${left}px`;
    el.style.zIndex='9999';
  }
  function showNutsOverlay(){
    const {board}=PC.getKnown();
    const anchor=document.querySelector('.nutsline');
    if(!anchor) return;
    hideNutsOverlay();

    const wrap=document.createElement('div');
    wrap.id='nutsOverlay';
    wrap.style.cssText='background:#0b1324;border:1px solid #334155;border-radius:10px;box-shadow:0 12px 30px rgba(0,0,0,.35);padding:8px 10px;min-width:300px;color:#e5e7eb;font-size:14px';

    const title=document.createElement('div');
    title.className='mut';
    title.style.cssText='margin-bottom:6px;font-weight:600';
    const isPreflop = board.length<3;
    title.textContent = isPreflop ? 'Top 5 (pré-flop, JSON) + sua posição' : 'Top 5 mãos possíveis (board atual)';
    wrap.appendChild(title);

    const list=document.createElement('div');

    if(isPreflop){
      const all = rankAllPF(); // lista completa ordenada
      const rows = all ? top5FromAllPF(all) : computeTop5PreflopChen();
      if(rows && rows.length){
        rows.forEach((it,idx)=>{
          const row=document.createElement('div');
          row.style.cssText='display:flex;justify-content:space-between;gap:10px;padding:4px 0';
          const left=document.createElement('div'); 
          left.textContent=`${idx+1}) ${it.label}`;
          const right=document.createElement('div'); 
          right.className='mut'; 
          right.textContent=it.right;
          row.appendChild(left); row.appendChild(right);
          list.appendChild(row);
        });
      }else{
        const row=document.createElement('div'); row.className='mut'; row.textContent='—';
        list.appendChild(row);
      }

      // Sua mão e posição
      if(all && hasPF()){
        const tag = getPreflopTagFromHand();
        if(tag){
          // acha a posição na lista completa
          const pos = all.findIndex(x=>x.label.toUpperCase()===tag.toUpperCase());
          if(pos>=0){
            const rankN = all[pos].rank; // já é 1..169
            const tier  = all[pos].tier || '';
            const yourRow=document.createElement('div');
            yourRow.style.cssText='margin-top:8px;padding-top:6px;border-top:1px solid #22304b';

            if(rankN <= 5){
              // Já está no Top 5: destaque
              yourRow.innerHTML = `<div><b>⭐ Sua mão:</b> ${tag} — #${rankN}/169 ${tier ? `(${tier})` : ''} <span class="mut">(no Top 5)</span></div>`;
            }else{
              // Fora do Top 5: mostrar abaixo do Top 5
              yourRow.innerHTML = `<div><b>Sua mão:</b> ${tag} — <b>#${rankN}/169</b> ${tier ? `(${tier})` : ''}</div>`;
            }
            list.appendChild(yourRow);
          }
        }
      }
    }else{
      const data = computeTop5PostflopLeaderboard();
      if(data && data.rows.length){
        data.rows.forEach((it)=>{
          const row=document.createElement('div');
          row.style.cssText='display:flex;flex-direction:column;gap:2px;padding:6px 0;border-bottom:1px dashed #22304b';
          const head=document.createElement('div');
          head.style.cssText='display:flex;justify-content:space-between;gap:10px';
          const left=document.createElement('div'); left.textContent=it.left;
          const right=document.createElement('div'); right.className='mut'; right.textContent=it.right;
          head.appendChild(left); head.appendChild(right);
          row.appendChild(head);

          if(it.examples?.length){
            const ex=document.createElement('div');
            ex.className='mut';
            ex.style.cssText='font-size:12px';
            ex.textContent = `Exemplos: ${it.examples.slice(0,5).join('  |  ')}`;
            row.appendChild(ex);
          }
          list.appendChild(row);
        });

        const heroBlock=document.createElement('div');
        heroBlock.style.cssText='margin-top:8px;padding-top:6px;border-top:1px solid #22304b';
        const heroTitle=document.createElement('div');
        heroTitle.style.cssText='font-weight:600;margin-bottom:4px';
        heroTitle.textContent='Sua mão (neste board):';
        heroBlock.appendChild(heroTitle);

        const heroLine=document.createElement('div');
        const d = data.hero.desc;
        heroLine.innerHTML = `${d.name} — ${d.detail}`;
        heroBlock.appendChild(heroLine);

        const heroPos=document.createElement('div');
        heroPos.className='mut';
        heroPos.style.cssText='margin-top:4px';
        heroPos.textContent = `Posição: ${data.hero.classPosition} de ${data.hero.classTotal} classes • Combos que vencem/empatam/perdem: ${data.hero.betterCombos}/${data.hero.tieCombos}/${data.hero.worseCombos}`;
        heroBlock.appendChild(heroPos);

        list.appendChild(heroBlock);
      }else{
        const row=document.createElement('div'); row.className='mut'; row.textContent='—';
        list.appendChild(row);
      }
    }

    wrap.appendChild(list);

    wrap.addEventListener('mouseenter', ()=>{ nutsHover=true; if(overlayTimer){clearTimeout(overlayTimer); overlayTimer=null;} });
    wrap.addEventListener('mouseleave', ()=>{ nutsHover=false; overlayTimer=setTimeout(()=>{ if(!nutsHover) hideNutsOverlay(); }, 180); });

    positionOverlayNear(anchor, wrap);
    nutsOverlay=wrap;
  }
  function wireNutsOverlayOnce(){
    if(wiredNuts) return;
    const anchor=document.querySelector('.nutsline');
    if(!anchor) return;
    wiredNuts=true;
    anchor.addEventListener('click', (e)=>{ e.stopPropagation(); if(nutsOverlay) hideNutsOverlay(); else showNutsOverlay(); });
    anchor.addEventListener('mouseenter', ()=>{ showNutsOverlay(); });
    anchor.addEventListener('mouseleave', ()=>{ overlayTimer=setTimeout(()=>{ if(!nutsHover) hideNutsOverlay(); }, 180); });
    document.addEventListener('click', (e)=>{ if(nutsOverlay && !nutsOverlay.contains(e.target) && !anchor.contains(e.target)) hideNutsOverlay(); });
  }

  // ===== bootstrap =====
  function __pcalc_start_app__(){
    PC.state.prevBoardLen = Math.max(0, PC.state.selected.length-2);
    renderDeck();
  }
  g.__pcalc_start_app__ = __pcalc_start_app__;

  document.addEventListener('DOMContentLoaded', ()=>{
    // aguardando start via __pcalc_start_app__ (login-guard)
  });
})(window);


/* ================================
   PATCH v7 — Pré-flop 1M assíncrono + textos "1M"
   - Roda 1.000.000 em batches (padrão 50k) sem travar a aba
   - Mostra progresso e corrige rótulos pra "1M"
   - Não mexe no cálculo pós-flop (deixe seu "exato" como está)
   ================================= */
(function(g){
  const PC = g.PCALC || g.PC || {};
  if(!PC || typeof PC.makeDeck!=="function" || typeof PC.evalBest!=="function"){
    console.warn("[PATCH v7] PCALC ausente/incompleto — ignorado.");
    return;
  }

  // ===== Config =====
  const CFG = {
    TARGET: 1_000_000,   // total preflop
    BATCH:  50_000,      // tamanho do lote (ajuste se quiser)
    SELECT_ID: "eqTrials",     // seu <select id="eqTrials">
    BTN_TEXT_CONTAINS: "Recalcular" // texto do botão (caso não tenha id fixo)
  };

  // ===== Helpers UI leves (não invasivos) =====
  function findRecalcButton(){
    // tenta por id comum
    let btn = g.document.getElementById("recalc") || g.document.getElementById("btnRecalcular");
    if(btn) return btn;
    // fallback: procura botão com o texto "Recalcular"
    const all = Array.from(document.querySelectorAll("button, [role=button], .btn"));
    return all.find(el => (el.textContent||"").trim().toLowerCase().includes(CFG.BTN_TEXT_CONTAINS.toLowerCase())) || null;
  }

  function ensure1MOptions(){
    const sel = document.getElementById(CFG.SELECT_ID);
    if(!sel) return;
    // substitui 3k/5k/10k por 300k/500k/1M e seta 1M como padrão visual
    sel.innerHTML = `
      <option value="300000">300k</option>
      <option value="500000">500k</option>
      <option value="1000000" selected>1M</option>
    `;
  }

  // overlay simples de progresso (não quebra layout)
  function showProgressOverlay(){
    let el = document.getElementById("pcalc-progress");
    if(!el){
      el = document.createElement("div");
      el.id = "pcalc-progress";
      el.style.cssText = "position:fixed;right:12px;bottom:12px;background:#0b1324;color:#e5e7eb;padding:10px 12px;border-radius:10px;box-shadow:0 4px 24px rgba(0,0,0,.4);font:500 13px/1.3 system-ui,Segoe UI,Roboto,Arial";
      document.body.appendChild(el);
    }
    return el;
  }
  function setOverlayText(txt){
    const el = showProgressOverlay();
    el.textContent = txt;
  }
  function hideOverlay(){
    const el = document.getElementById("pcalc-progress");
    if(el) el.remove();
  }

  // Corrige rótulos “5k” → “1M” quando relevante
  function rewriteLabelsTo1M(){
    try{
      // Cabeçalho "Monte Carlo vs X ... • Y amostras"
      document.querySelectorAll("*").forEach(el=>{
        const t = (el.textContent||"").trim();
        if(/Monte Carlo vs .*oponente/.test(t)){
          el.textContent = t.replace(/\b\d{1,3}\.?\d{0,3}\b(?=\s*amostras)/, "1.000.000");
        }
        if(/^Amostras:\s*/.test(t)){
          el.textContent = "Amostras: 1.000.000";
        }
        if(/\b5k\b/i.test(t)) el.textContent = t.replace(/\b5k\b/ig, "1M");
        if(/\b10k\b/i.test(t)) el.textContent = t.replace(/\b10k\b/ig, "1M");
      });
    }catch(e){}
  }

  // ===== Núcleo — MC pré-flop assíncrono (não trava) =====
  const { makeDeck, evalBest, cardId } = PC;
  const EVAL_ARITY = Number(evalBest.length || 2);
  function evalSafe(hero2, board5){
    return (EVAL_ARITY<=1) ? evalBest(hero2.concat(board5)) : evalBest(hero2, board5);
  }
  function removeCards(deck, cards){
    const dead = new Set(cards.map(cardId));
    return deck.filter(c => !dead.has(cardId(c)));
  }
  function cmpEv(a,b){ return a===b?0:(a>b?1:-1); }

  function mcOnce(hero, opponents){
    // amostra vilões e board; tudo como objetos do core (PCALC.state já guarda assim)
    const deck = makeDeck();
    let pool = removeCards(deck, hero);
    const oppHands = [];
    for(let o=0;o<opponents;o++){
      const i = (Math.random()*pool.length)|0;
      const c1 = pool.splice(i,1)[0];
      const j = (Math.random()*pool.length)|0;
      const c2 = pool.splice(j,1)[0];
      oppHands.push([c1,c2]);
    }
    const board = [];
    for(let k=0;k<5;k++){
      const x = (Math.random()*pool.length)|0;
      board.push(pool.splice(x,1)[0]);
    }
    const he = evalSafe(hero, board);
    let best = he, ties = 0, heroBest = true;
    for(const [v1,v2] of oppHands){
      const ve = evalSafe([v1,v2], board);
      const c = cmpEv(ve,best);
      if(c>0){ best=ve; heroBest=false; ties=0; }
      else if(c===0){ if(heroBest) ties++; }
    }
    if(heroBest) return (ties>0) ? "tie" : "win";
    return "lose";
  }

  async function runPreflop1MAsync({opponents=2, batch=CFG.BATCH, onProgress}={}){
    const sel = (PC.state && PC.state.selected) || [];
    if(sel.length<2){ throw new Error("Selecione 2 cartas antes."); }
    const hero = sel.slice(0,2);
    let win=0,tie=0,lose=0,done=0;
    const total = CFG.TARGET;

    return await new Promise(resolve=>{
      function step(){
        const chunk = Math.min(batch, total - done);
        // loop do chunk
        for(let i=0;i<chunk;i++){
          const r = mcOnce(hero, Math.max(1, Number(PC.state?.opponents||opponents)));
          if(r==="win") win++; else if(r==="tie") tie++; else lose++;
        }
        done += chunk;
        if(onProgress) onProgress({done,total,win,tie,lose});
        if(done < total){
          setTimeout(step, 0);
        } else {
          const tot = win+tie+lose;
          resolve({
            method: "Monte Carlo",
            samples: tot,
            win: win/tot,
            tie: tie/tot,
            lose: lose/tot
          });
        }
      }
      step();
    });
  }

  // Exponha uma API para chamar via console se quiser
  PC.runPreflop1M = function(opts){
    return runPreflop1MAsync({
      opponents: (opts && opts.opponents) || 2,
      batch: (opts && opts.batch) || CFG.BATCH,
      onProgress: (opts && opts.onProgress) || null
    });
  };

  // ===== Integração leve com a sua UI =====
  // 1) Troca o <select> para 1M como opção padrão
  ensure1MOptions();

  // 2) Intercepta clique em "Recalcular" *quando* o select estiver em 1M
  const btn = findRecalcButton();
  if(btn){
    btn.addEventListener("click", function onRecalc(e){
      const sel = document.getElementById(CFG.SELECT_ID);
      const val = sel ? Number(sel.value) : 0;
      // só intercepta se for 1M; caso contrário, deixa seu fluxo original
      if(val === 1_000_000){
        e.preventDefault();
        e.stopPropagation();
        // feedback visual
        setOverlayText("Pré-flop: rodando 1.000.000 (0%)…");
        rewriteLabelsTo1M();

        runPreflop1MAsync({
          opponents: Math.max(1, Number(PC.state?.opponents||2)),
          batch: CFG.BATCH,
          onProgress: ({done,total})=>{
            const pct = Math.min(100, Math.round(done*100/total));
            setOverlayText(`Pré-flop: rodando 1.000.000 (${pct}%)…`);
          }
        }).then(res=>{
          // Mostra resumo no overlay e ajusta rótulos
          setOverlayText(`Monte Carlo • 1.000.000 amostras — Win ${(res.win*100).toFixed(2)}% · Tie ${(res.tie*100).toFixed(2)}% · Lose ${(res.lose*100).toFixed(2)}%`);
          rewriteLabelsTo1M();

          // Opcional: injeta percentuais na UI existente (heurística simples)
          try{
            const winEl = Array.from(document.querySelectorAll("*")).find(n => /^\s*Win:\s*/.test(n.textContent||""));
            const tieEl = Array.from(document.querySelectorAll("*")).find(n => /^\s*Tie:\s*/.test(n.textContent||""));
            const loseEl= Array.from(document.querySelectorAll("*")).find(n => /^\s*Lose:\s*/.test(n.textContent||""));
            if(winEl) winEl.textContent = `Win: ${(res.win*100).toFixed(1)}%`;
            if(tieEl) tieEl.textContent = `Tie: ${(res.tie*100).toFixed(1)}%`;
            if(loseEl)loseEl.textContent= `Lose: ${(res.lose*100).toFixed(1)}%`;
          }catch(_){}

          // some o overlay depois de alguns segundos
          setTimeout(hideOverlay, 4000);
        }).catch(err=>{
          setOverlayText("Falhou o 1M — veja console");
          console.error("[PATCH v7] Erro no 1M:", err);
          setTimeout(hideOverlay, 4000);
        });
      }
    }, true); // capture=true pra pegar antes do handler original
  }

  // 3) Se o usuário mudar o select pra 1M, já ajusta os textos
  const sel = document.getElementById(CFG.SELECT_ID);
  if(sel){
    sel.addEventListener("change", ()=>{
      if(Number(sel.value)===1_000_000) rewriteLabelsTo1M();
    });
  }

  console.log("[PATCH v7] Pré-flop 1M em batches ativo; rótulos ajustados para '1M'. API: PCALC.runPreflop1M({batch})");
})(window);




