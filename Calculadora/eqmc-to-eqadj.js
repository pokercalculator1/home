// ===== eq-adjust-mc.v2.js =====
// Nova lógica: recalcula "Equity (MC)" JÁ AJUSTADA, publica window.PC_EQ.raw/adj,
// atualiza BE e recomendações com base na equity ajustada.

(function (g) {
  // ================== CONFIG ==================
  const CFG = {
    // Peso do tie na equity bruta (win + tie * TIE_WEIGHT)
    TIE_WEIGHT: 0.5,

    // Penalização por vilão (multiplicativa, suave e contínua):
    // eq_adj = eq_raw * (1 - VILLAIN_BETA)^(villains - 1)
    // (ex.: 6% por vilão extra; ajuste se quiser mais/menos conservador)
    VILLAIN_BETA: 0.06,

    // Penalização por textura do board (opcional).
    // multiplicador final = mult_viloes * mult_textura
    ENABLE_TEXTURE: true,

    // Pesos da textura (0 = neutro; 1 = penaliza forte)
    // o script tenta inferir textura via cartas do board se existirem na UI
    // ou via atributos globais (g.PCALC.state.boardCards = ['As','Kd','Qd'] etc.)
    TEXTURE: {
      // % de penalização por flush draw presente
      FLUSH_DRAW: 0.06,
      // % por straight draw aberto (abcd_5 ou a_2345)
      OPEN_END: 0.05,
      // % por straight draw gutshot
      GUTSHOT: 0.03,
      // % extra por board “muito conectado” (ex.: T-9-8 / 9-8-7)
      HIGH_CONNECT: 0.04,
      // % por pares/dobrados no board (muita realização contra trincas frágeis em multiway)
      PAIRED: 0.02
    },

    // Seletores da UI (ajuste se necessário)
    SEL: {
      // Onde a equity (MC) aparece/precisa aparecer
      DEST_EQ: ['#eqMC', '#equityMC', '#equity-mc', '.eq-mc', '#po-eq', '.po-eq-value'],
      // Onde o BE aparece
      DEST_BE: ['#po-be', '.po-be-value'],
      // Inputs de pot/call
      POT: '#inp-pot',
      CALL: '#inp-call',
      // Nº de vilões
      VIL: ['#inp-viloes', '#numVilao', '#vilaoCount', '#callers', '[data-callers]'],
      // Fonte textual (fallback) para equity bruta caso não haja win/tie globais
      RAW_TEXT: ['#eqMC', '#equityMC', '#equity-mc', '.eq-mc']
    },

    // Intervalo de varredura (ms) caso seu MC não dispare eventos
    TICK_MS: 400
  };

  // ================ HELPERS ===================
  function clamp01(x){ return x < 0 ? 0 : x > 1 ? 1 : x; }
  function pct(x){ return (x * 100).toFixed(1) + '%'; }
  function setText(el, txt){ if (el && el.textContent !== txt) el.textContent = txt; }
  function qs(sel){ return document.querySelector(sel); }
  function qsa(sel){ return Array.from(document.querySelectorAll(sel)); }

  function parsePercent(text) {
    if (!text) return null;
    const m = (text.match(/(-?\d+(?:[.,]\d+)?)\s*%/) || [])[1];
    if (!m) return null;
    return Number(String(m).replace(',', '.')) / 100;
  }

  function readNumberFromCandidates(cands, fallback=1) {
    for (const sel of cands) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const v = el.getAttribute?.('data-callers') ?? el.value ?? el.textContent;
      const n = Number(String(v ?? '').trim());
      if (Number.isFinite(n) && n > 0) return n;
    }
    return fallback;
  }

  // -------- Board parsing (opcional) --------
  const RANKS = '23456789TJQKA'.split('');
  const SUITS = ['s','h','d','c'];

  function parseCard(str){
    // aceita 'As', 'Kd', 'Qh', 'Tc' etc.
    if(!str || typeof str !== 'string') return null;
    const s = str.trim().toLowerCase();
    const r = s[0].toUpperCase();
    const u = s[s.length-1];
    if (!RANKS.includes(r)) return null;
    const suit = ({s:'s',h:'h',d:'d',c:'c'})[u];
    if (!suit) return null;
    return r + suit;
  }

  function boardFromUIorState(){
    // tente obter via seu estado global
    try{
      const st = (g.PCALC && g.PCALC.state) || g.PC?.state || {};
      if (Array.isArray(st.boardCards)) {
        const arr = st.boardCards.map(parseCard).filter(Boolean);
        if (arr.length) return arr;
      }
    }catch{}

    // tente heurísticas simples na UI (ex.: .board .card[data-card="As"], etc.)
    const cards = [];
    qsa('.board [data-card], .pcalc-board [data-card], .board .card')
      .forEach(el=>{
        const v = el.getAttribute('data-card') || el.textContent || '';
        const c = parseCard(v);
        if (c) cards.push(c);
      });
    return cards.slice(0,5); // flop/turn/river
  }

  function textureMultiplier(board){
    if (!CFG.ENABLE_TEXTURE || !board || !board.length) return 1;

    // Suitedness
    const suitsCount = {s:0,h:0,d:0,c:0};
    board.forEach(c => suitsCount[c[1]]++);
    const maxSuit = Math.max(suitsCount.s, suitsCount.h, suitsCount.d, suitsCount.c);
    const hasFlushDraw = (maxSuit >= 2) && (board.length >= 3); // flop 2+ mesmo naum garante FD, mas é um proxy leve

    // Conectividade (mapa para índices)
    const idx = RANKS.reduce((m, r, i)=> (m[r]=i, m), {});
    const ranks = board.map(c => idx[c[0]]).sort((a,b)=>a-b);
    let openEnd = false, gutshot = false, highConnect = false;

    // checa sequências simples no flop/turn/river (heurística leve)
    // janelas de tamanho 3 e 4
    const arr = ranks;
    for (let w of [3,4]){
      for (let i=0;i+ w-1< arr.length;i++){
        const slice = arr.slice(i, i+w);
        const span = slice[slice.length-1] - slice[0];
        if (w === 4) {
          if (span === 3) openEnd = true; // ex.: 9,10,J,Q
          else if (span === 4) gutshot = true; // ex.: 9,10,Q,K (um furo)
        }
        if (w === 3 && span <= 2) highConnect = true; // muito conectado (T-9-8, 9-8-7 etc.)
      }
    }

    // Board pareado
    const rankCount = {};
    board.forEach(c => rankCount[c[0]] = (rankCount[c[0]]||0)+1);
    const paired = Object.values(rankCount).some(v => v >= 2);

    let pen = 0;
    if (hasFlushDraw) pen += CFG.TEXTURE.FLUSH_DRAW;
    if (openEnd)     pen += CFG.TEXTURE.OPEN_END;
    if (gutshot)     pen += CFG.TEXTURE.GUTSHOT;
    if (highConnect) pen += CFG.TEXTURE.HIGH_CONNECT;
    if (paired)      pen += CFG.TEXTURE.PAIRED;

    return clamp01(1 - pen);
  }

  // -------- Monte Carlo readers --------
  function readMcFromState(){
    try{
      const st = (g.PCALC && g.PCALC.state) || g.PC?.state || {};
      // aceitamos várias convenções: st.win, st.tie (decimais 0–1) ou st.eqMC pronta
      if (typeof st.eqMC === 'number') return { rawEq: clamp01(st.eqMC) };
      if (typeof st.win === 'number') {
        const win = clamp01(st.win);
        const tie = clamp01(st.tie ?? 0);
        const rawEq = clamp01(win + tie * CFG.TIE_WEIGHT);
        return { rawEq, win, tie };
      }
    }catch{}
    return null;
  }

  function readMcFromText(){
    // tenta ler % já renderizado em algum lugar (ex.: “Equity (MC) 44.8%”)
    for (const sel of CFG.SEL.RAW_TEXT) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const v = parsePercent(el.textContent);
      if (v != null) return { rawEq: clamp01(v) };
    }
    return null;
  }

  // -------- Núcleo do ajuste --------
  function adjustEquity(rawEq, villains, board){
    const multVillains = Math.pow(1 - CFG.VILLAIN_BETA, Math.max(0, (villains||1) - 1));
    const multTexture  = textureMultiplier(board);
    const adj = clamp01(rawEq * multVillains * multTexture);
    return { adj, multVillains, multTexture };
  }

  // -------- BE e decisão --------
  function computeBE(){
    const potEl  = qs(CFG.SEL.POT);
    const callEl = qs(CFG.SEL.CALL);
    const pot  = Number(potEl?.value || 0);
    const call = Number(callEl?.value || 0);
    if (!(pot > 0 && call > 0)) return null;
    return call / (pot + call); // decimal
  }

  function renderBE(be){
    if (be == null) return;
    for (const sel of CFG.SEL.DEST_BE) {
      qsa(sel).forEach(el => setText(el, pct(be)));
    }
  }

  function renderEq(dec){
    for (const sel of CFG.SEL.DEST_EQ) {
      qsa(sel).forEach(el => setText(el, pct(dec)));
    }
  }

  function publish(rawEq, adjEq){
    g.PC_EQ = g.PC_EQ || {};
    g.PC_EQ.raw = rawEq; // decimal
    g.PC_EQ.adj = adjEq; // decimal
    try {
      if (g.PCALC && g.PCALC.state) {
        g.PCALC.state.eqMC_raw = rawEq;
        g.PCALC.state.eqMC_adj = adjEq;
      }
    } catch {}
    g.dispatchEvent?.(new CustomEvent('pc_equity_change', { detail: { raw: rawEq, adj: adjEq } }));
  }

  // Se você quiser “Recomendação” baseada em EqAdj vs BE, opcional:
  function maybeRenderRecommendation(be, eqAdj){
    // procure um container padrão se existir
    const slot = document.querySelector('.po-rec-value #po-rec, #po-rec');
    if (!slot || be == null) return;
    const rec = eqAdj >= be ? 'Pague a aposta' : 'Desista / Check';
    // estilização mínima (deixa seu CSS cuidar do resto)
    setText(slot, rec);
  }

  // ================== LOOP ==================
  let lastSig = '';
  function tick(){
    // 1) Monte Carlo
    const mc = readMcFromState() || readMcFromText();
    if (!mc || typeof mc.rawEq !== 'number') return; // nada pra fazer
    const raw = mc.rawEq;

    // 2) Contexto (vilões + board)
    const villains = readNumberFromCandidates(CFG.SEL.VIL, 1);
    const board = boardFromUIorState();

    // 3) Ajuste
    const { adj } = adjustEquity(raw, villains, board);

    // 4) Render / Publish
    publish(raw, adj);
    renderEq(adj);

    const be = computeBE();
    renderBE(be);
    maybeRenderRecommendation(be, adj);

    // 5) Evita retrabalho em excesso
    const sig = [raw.toFixed(4), adj.toFixed(4), villains, be?.toFixed?.(4) ?? ''].join('|');
    if (sig !== lastSig) {
      lastSig = sig;
      // console.debug('[eq-adjust-mc.v2] raw:', raw, 'adj:', adj, 'vill:', villains, 'BE:', be);
    }
  }

  setInterval(tick, CFG.TICK_MS);
  // primeira rodada
  tick();
})(window);
