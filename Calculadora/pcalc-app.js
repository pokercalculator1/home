// pcalc-app.js — painel de análise com lista de TODOS os grupos (inline à direita, abaixo do H2), scroll fino #222, 1 combo/grupo
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
  function all169Tags(){
    const order = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'];
    const tags = [];
    for(let i=0;i<order.length;i++){
      for(let j=0;j<=i;j++){
        const hi = order[i], lo = order[j];
        if(hi === lo){ tags.push(hi+lo); }
        else{ tags.push(hi+lo+'s'); tags.push(hi+lo+'o'); }
      }
    }
    return tags;
  }
  function rankAllPF(){
    if(!hasPF()) return null;
    const rows = [];
    for(const t of all169Tags()){
      try{
        const info = g.PF.describe(t);
        if(info && typeof info.rank === 'number'){
          rows.push({ label: info.hand, rank: info.rank, tier: info.tier || '' });
        }
      }catch(e){}
    }
    if(!rows.length) return null;
    rows.sort((a,b)=>a.rank - b.rank);
    return rows;
  }
  function top5FromAllPF(all){
    return all.slice(0,5).map(it=>({ label: it.label, right: `Rank ${it.rank}` }));
  }

  // ========== Linha do Rank PF ==========
  function renderPreflopRankLineInto(box){
    if(!box) return;
    const { hand, board } = PC.getKnown();
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
  function stopPFWatchdog(){ if(pfWatchdogTimer){ clearInterval(pfWatchdogTimer); pfWatchdogTimer = null; } }
  window.addEventListener('PF:ready', ()=>{
    try{
      const box = document.getElementById('equityBox');
      if(box) renderPreflopRankLineInto(box);
      stopPFWatchdog();
    }catch(e){}
  });

  // ======================================
  // AGRUPAMENTO POR “GRUPOS LÓGICOS”
  // ======================================
  function r2cSafe(r){ if(r==null) return ''; return (r===14?'A':r===13?'K':r===12?'Q':r===11?'J':r===10?'T':String(r)); }
  function listClean(arr){ return (arr||[]).map(r2cSafe).filter(Boolean); }

  function describeEval(ev){
    const name = CAT_NAME[ev.cat] || '—';
    const k = ev.kick || [];
    let detail = '';
    switch(ev.cat){
      case CAT.ROYAL: detail='Royal Flush'; break;
      case CAT.STRAIGHT_FLUSH: {
        const hi=r2cSafe(k[0]); const suit = ev.s ? ` (${ev.s})` : '';
        detail = hi?`Straight Flush (alto ${hi})${suit}`:`Straight Flush${suit}`; break;
      }
      case CAT.QUADS: {
        const quad=r2cSafe(k[0]), kick=r2cSafe(k[1]);
        detail = quad?`Quadra de ${quad}`:'Quadra';
        if(kick) detail+=` (kicker ${kick})`;
        break;
      }
      case CAT.FULL: {
        const t=r2cSafe(k[0]), p=r2cSafe(k[1]);
        detail = (t&&p)?`Full House (${t} cheio de ${p})`:'Full House'; break;
      }
      case CAT.FLUSH: {
        const hi=r2cSafe(k[0]); detail = hi?`Flush (alto ${hi})`:'Flush'; break;
      }
      case CAT.STRAIGHT: {
        const hi=r2cSafe(k[0]); detail = hi?`Sequência (alto ${hi})`:'Sequência'; break;
      }
      case CAT.TRIPS: {
        const t=r2cSafe(k[0]); const ks=listClean([k[1],k[2]]);
        detail = t?`Trinca de ${t}`:'Trinca';
        if(ks.length) detail+=` (kickers ${ks.join(', ')})`; break;
      }
      case CAT.TWO: {
        const a=r2cSafe(k[0]), b=r2cSafe(k[1]), kick=r2cSafe(k[2]);
        detail = (a&&b)?`Dois Pares (${a} & ${b})`:'Dois Pares';
        if(kick) detail+=`, kicker ${kick}`; break;
      }
      case CAT.PAIR: {
        const p=r2cSafe(k[0]); const ks=listClean([k[1],k[2],k[3]]);
        detail = p?`Par de ${p}`:'Par';
        if(ks.length) detail+=` (kickers ${ks.join(', ')})`; break;
      }
      case CAT.HIGH: {
        const hi=r2cSafe(k[0]); detail = hi?`Carta Alta ${hi}`:'Carta Alta'; break;
      }
      default: detail=name||'—';
    }
    return { name, detail };
  }

  function flushRanksBySuit(all7, suit){
    return all7.filter(c=>c.s===suit).map(c=>c.r).sort((a,b)=>b-a);
  }
  function inferFlushSuit(all7, ev){
    if(ev.cat !== CAT.FLUSH) return null;
    const target = (ev.kick||[]).slice(0,5).join(',');
    for(const s of SUITS){
      const top5 = flushRanksBySuit(all7, s).slice(0,5).join(',');
      if(top5 && top5 === target) return s;
    }
    return null;
  }
  function highCardTop2(all7){
    const uniq = Array.from(new Set(all7.map(c=>c.r))).sort((a,b)=>b-a);
    return { hi: uniq[0]||null, k2: uniq[1]||null };
  }

  function groupKey(ev, all7, board){
    switch(ev.cat){
      case CAT.HIGH: { const {hi:H,k2}=highCardTop2(all7); return `HIGH:${H||0}-${k2||0}`; }
      case CAT.PAIR: { const p = ev.kick?.[0]||0; return `PAIR:${p}`; }
      case CAT.TWO:  { const a=ev.kick?.[0]||0, b=ev.kick?.[1]||0; const hi2=Math.max(a,b), lo2=Math.min(a,b); return `TWO:${hi2}-${lo2}`; }
      case CAT.TRIPS:{ const t=ev.kick?.[0]||0; return `TRIPS:${t}`; }
      case CAT.STRAIGHT: { const top=ev.kick?.[0]||0; return `STRAIGHT:${top}`; }
      case CAT.FLUSH:{
        const suit = inferFlushSuit(all7, ev) || 'x';
        const boardSuitCount = board.filter(c=>c.s===suit).length;
        const ranks = flushRanksBySuit(all7, suit);
        const top=ranks[0]||0, second=ranks[1]||0;
        if(boardSuitCount>=4) return `FLUSH:${suit}:${top}`;
        return `FLUSH:${suit}:${top}-${second}`;
      }
      case CAT.FULL: { const t=ev.kick?.[0]||0, p=ev.kick?.[1]||0; return `FULL:${t}-${p}`; }
      case CAT.QUADS:{ const q=ev.kick?.[0]||0; return `QUADS:${q}`; }
      case CAT.STRAIGHT_FLUSH:{ const top=ev.kick?.[0]||0; const s=ev.s||inferFlushSuit(all7,ev)||'x'; return `SFLUSH:${s}:${top}`; }
      case CAT.ROYAL: { const s=ev.s||inferFlushSuit(all7,ev)||'x'; return `ROYAL:${s}`; }
      default: return `UNK`;
    }
  }
  function groupLabel(key){
    const [cat, rest] = key.split(':', 2);
    const toC = r2cSafe;
    switch(cat){
      case 'HIGH': { const [a,b]=(rest||'0-0').split('-').map(x=>+x); return `Carta Alta ${toC(a)} (kicker ${toC(b)})`; }
      case 'PAIR': return `Par de ${toC(+rest)}`;
      case 'TWO':  { const [a,b]=(rest||'0-0').split('-').map(x=>+x); return `Dois Pares (${toC(a)} & ${toC(b)})`; }
      case 'TRIPS': return `Trinca de ${toC(+rest)}`;
      case 'STRAIGHT': return `Sequência (alto ${toC(+rest)})`;
      case 'FLUSH': {
        const [s, ranks] = (rest||'x:0').split(':');
        const [top,second] = (ranks||'0').split('-').map(x=>+x);
        return (second!=null && !isNaN(second))
          ? `Flush ${s} (alto ${toC(top)} / ${toC(second)})`
          : `Flush ${s} (alto ${toC(top)})`;
      }
      case 'FULL': { const [t,p]=(rest||'0-0').split('-').map(x=>+x); return `Full House (${toC(t)} cheio de ${toC(p)})`; }
      case 'QUADS': return `Quadra de ${toC(+rest)}`;
      case 'SFLUSH': { const [s,top]=(rest||'x:0').split(':'); return `Straight Flush ${s} (alto ${toC(+top)})`; }
      case 'ROYAL': return `Royal Flush ${rest||''}`;
      default: return '—';
    }
  }
  function representativeExample(ev){
    const toC = r => r===14?'A':r===13?'K':r===12?'Q':r===11?'J':r===10?'T':String(r||'');
    const k = ev.kick || [];
    switch(ev.cat){
      case CAT.HIGH: { const a=toC(k[0]), b=toC(k[1]); return [`${a} ${b}`.trim()]; }
      case CAT.PAIR:   return [`${toC(k[0])}${toC(k[0])}`];
      case CAT.TWO:    return [`${toC(Math.max(k[0]||0,k[1]||0))} ${toC(Math.min(k[0]||0,k[1]||0))}`];
      case CAT.TRIPS:  return [`${toC(k[0])}${toC(k[0])}`];
      case CAT.STRAIGHT: { const top=toC(k[0]); return [`Sequência alta ${top}`]; }
      case CAT.FLUSH: { const top=toC(k[0]), sec=toC(k[1]); return [sec?`Flush alto ${top}/${sec}`:`Flush alto ${top}`]; }
      case CAT.FULL:  { const t=toC(k[0]), p=toC(k[1]); return [`${t}${t}${t}+${p}${p}`]; }
      case CAT.QUADS: return [`${toC(k[0])}${toC(k[0])}${toC(k[0])}${toC(k[0])}`];
      case CAT.STRAIGHT_FLUSH: { const top=toC(k[0]); return [`Straight Flush alto ${top}`]; }
      case CAT.ROYAL: return [`Royal Flush`];
      default: return ['—'];
    }
  }
  function displayCountForGroup(){ return 1; }

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
      const oppAll7 = [a,b].concat(board);
      const ev = evalBest(oppAll7);
      const key = groupKey(ev, oppAll7, board);
      let g = groups.get(key);
      if(!g){
        g = { key, ev, rawCount:0, examplesCanon: representativeExample(ev) };
        groups.set(key, g);
      }
      g.rawCount++;

      const cmp = cmpEval(ev, heroEv);
      if(cmp>0) betterCombos++;
      else if(cmp<0) worseCombos++;
      else tieCombos++;
    }

    const arr = [...groups.values()].sort((x,y)=> -cmpEval(x.ev, y.ev));

    const heroAll7 = hand.concat(board);
    const heroKey  = groupKey(evalBest(heroAll7), heroAll7, board);
    let heroClassPos = 1;
    for(const g of arr){ if(cmpEval(g.ev, heroEv) > 0) heroClassPos++; else break; }
    const heroClassesTotal = arr.length;

    const top5 = arr.slice(0,5).map(g=>{
      return {
        name: CAT_NAME[g.ev.cat] || '—',
        detail: groupLabel(g.key),
        count: displayCountForGroup(g.ev),
        examples: g.examplesCanon
      };
    });

    return {
      top5,
      hero: {
        eval: heroEv,
        desc: describeEval(heroEv),
        classPosition: heroClassPos,
        classTotal: heroClassesTotal,
        betterCombos, tieCombos, worseCombos,
        heroKey
      },
      _allGroups: arr
    };
  }

  function computeAllPostflopLeaderboard(){
    const base = computePostflopLeaderboard();
    if(!base) return null;
    const arr = base._allGroups || [];
    const rows = arr.map((g, idx)=>({
      key: g.key,
      left: `${idx+1}) ${groupLabel(g.key)}`,
      right: `(${displayCountForGroup(g.ev)} combo)`,
      examples: g.examplesCanon
    }));
    return { rows, hero: base.hero, heroKey: base.hero.heroKey };
  }

  // ========== UI base ==========
  let wiredNuts=false;
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
    PC.computeAndRenderOuts?.();
    renderEquityPanel();

    // desativa overlay antigo (não usamos mais)
    wiredNuts=true;
    // atualiza painel inline
    if (typeof renderHandsPanel === 'function') renderHandsPanel();

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
        else if(cmp===0){ winners.push(`opp${k}`); }
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
              <select id="eq
