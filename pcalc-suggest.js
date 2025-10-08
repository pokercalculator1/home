// pcalc-suggest.js — Sugestões SEM AÇÃO (alinhadas ao raise.js) + buckets de abertura
// - Pré-flop (você primeiro a agir) e Pós-flop (ninguém apostou)
// - Buckets fixos para abertura pré-flop (sem depender de equity bruta):
//   • 3–4 blinds  → open34 (premium/broadways muito fortes)
//   • 2–3 blinds  → open23 (opens padrão)
//   • 1–2 blinds  → limp/call (mãos jogáveis que preferem pote menor)
// - Faixas por equity (fallback e pós-flop) — AGORA COM ALEATORIEDADE CONTROLADA:
//   <30%   -> PASSE OU DESISTA
//   30–50  -> PRÉ: PASSE OU DESISTA | PÓS: PASSE (só continue vs aposta se houver pot odds)
//   50–70  -> PRÉ: APOSTE 2 OU 3 BLINDS (sorteia 2/3) | PÓS: APOSTE X% DO POTE (X ∈ [50..75], passo 5%)
//   70–80  -> PRÉ: APOSTE 3 OU 4 BLINDS (sorteia 3/4) | PÓS: APOSTE X% DO POTE (X ∈ [75..100], passo 5%)
//   >80%   -> PRÉ: APOSTE 4 OU 5 BLINDS (sorteia 4/5; Efetivo ≤12BB => ALL-IN; Slow Play se toggle ligado)
//             PÓS: ALL-IN / OVERBET (ou Slow Play se toggle ligado)
//
// Observações:
// - Usa “PASSE” no lugar de “check”.
// - “PASSE OU DESISTA” substitui “Desista” para não confundir iniciantes.
// - Pré-flop sem ação: NÃO aplica ajuste multiway (+pp). Pós-flop: aplica +2pp por oponente extra.
// - Equity indefinida -> “Aguardando cartas…”.
// - Integração leve com raise.js: se houve ação pré-flop (modo Raise ligado), a recomendação vem de lá.
// - Aleatoriedade: blinds são escolhidos aleatoriamente dentro da faixa; porcentagens usam passo padrão de 5% (ex.: 50, 55, 60, 65, 70, 75).

(function (g) {
  const PCALC = g.PCALC || (g.PCALC = {});
  const CAT = (PCALC && PCALC.CAT) ? PCALC.CAT : {};

  // =========================================================
  // Aleatoriedade controlada (helpers)
  // =========================================================
  function rndInt(min, max) { // inclusive
    min = Math.ceil(min); max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  function rndFrom(arr) {
    return arr[rndInt(0, arr.length - 1)];
  }
  // porcentagem inteira aleatória dentro de [min..max], com passo (default 5%)
  function rndPct(min, max, step = 5) {
    const vals = [];
    for (let v = Math.max(0, Math.ceil(min)); v <= Math.min(100, Math.floor(max)); v += step) {
      vals.push(v);
    }
    if (vals.length === 0) return Math.max(0, Math.min(100, Math.round((min + max) / 2)));
    return rndFrom(vals);
  }
  function makeBlindTitle(minB, maxB) {
    const b = (minB === maxB) ? minB : rndInt(minB, maxB);
    return `APOSTE ${b} BLIND${b === 1 ? '' : 'S'}`;
  }
  function makePotTitle(minPct, maxPct, step = 5) {
    const p = (minPct === maxPct) ? minPct : rndPct(minPct, maxPct, step);
    return `APOSTE ${p}% DO POTE`;
  }

  // =========================================================
  // Classes de decisão (cores/estilos na UI)
  // =========================================================
  PCALC.decisionClass = function (title) {
    const t = (title || '').toUpperCase();
    if (t.includes('APOSTE') || t.includes('AUMENTE') || t.includes('3-BET') || t.includes('SQUEEZE'))
      return 'ok';
    if (t.includes('SEMI-BLEFE'))
      return 'warn';
    if (t.includes('PASSE OU DESISTA') || t.includes('DESISTA') || t.includes('FOLD'))
      return 'danger';
    if (t.includes('CONTROLE') || t.includes('PASSE') || t.includes('POT CONTROL') || t.includes('PAGUE') || t.includes('CALL'))
      return 'info';
    return 'info';
  };

  // animação de “glow” quando muda o tipo de decisão
  let _lastDecisionClass = null;
  PCALC.shouldGlow = function (cls) {
    const glow = (_lastDecisionClass && _lastDecisionClass !== cls);
    _lastDecisionClass = cls;
    return glow;
  };

  // =========================================================
  // Utils
  // =========================================================
  function normalizeHand(hand) {
    if (!hand || hand.length < 2) return "";
    const ranks = hand.map(c => c.r).sort((a, b) => b - a);
    const suited = (hand[0].s === hand[1].s);
    const map = { 14: "A", 13: "K", 12: "Q", 11: "J", 10: "T", 9: "9", 8: "8", 7: "7", 6: "6", 5: "5", 4: "4", 3: "3", 2: "2" };
    const toStr = r => map[r] || r;
    const a = toStr(ranks[0]), b = toStr(ranks[1]);
    if (a === b) return a + a; // pares
    return a + b + (suited ? "s" : "o");
  }

  function q(sel){ return document.querySelector(sel); }
  function effBB(){
    const eff = Number((q('#inp-eff')||{}).value || NaN);
    const bb  = Number((q('#inp-bb') ||{}).value || NaN);
    if (!isFinite(eff) || !isFinite(bb) || bb <= 0) return NaN;
    return +(eff / bb).toFixed(1);
  }
  function slowPlayOn(){
    const el = document.getElementById('rsw-slow');
    return !!(el && el.checked);
  }
  function isRaiseModeOn(){
    try{
      if (!g.RAISE || typeof g.RAISE.getRecommendation !== 'function') return false;
      const rec = g.RAISE.getRecommendation();
      return /Houve Ação/i.test(String(rec||'')) || /Houve raise/i.test(String(rec||''));
    }catch(_){ return false; }
  }

  // =========================================================
  // Buckets pré-flop (você primeiro a agir, SEM ação antes)
  // =========================================================

  // Top 20 mãos iniciais — tratadas como premium para open-raise (3–4 blinds)
  const top20 = new Set([
    "AA","KK","QQ","JJ","TT","99","88","77",
    "AKs","AQs","AJs","ATs","KQs",
    "AKo","AQo","KJs","QJs","JTs","KTs","QTs"
  ]);

  // 3–4 blinds: mantém top20 (premium/broadways muito fortes)
  const open34 = new Set([...top20]);

  // 2–3 blinds: opens padrão
  const open23 = new Set([
    // pares médios/baixos
    "66","55","44","33","22",
    // Axs fortes & wheel bons
    "A9s","A8s","A7s","A6s","A5s",
    // broadways adicionais
    "AJo","KQo","ATo",
    // suited connectors fortes
    "T9s","98s"
  ]);

  // 1–2 blinds (call/limp): jogáveis, preferem pot menor
  const limp12 = new Set([
    // suited connectors / gappers jogáveis
    "87s","76s","65s","54s","J9s","T8s","97s","86s","75s","64s","53s",
    // Axs marginais
    "A4s","A3s","A2s",
    // suited figuras mais fracas
    "Q9s","J8s"
  ]);

  // =========================================================
  // SUGESTÃO por Equidade — SEM AÇÃO (você primeiro a agir / ninguém apostou)
  // =========================================================
  PCALC.suggestAction = function (eqPct, hand, board, opp) {
    // Equity indisponível → aguardar
    if (!isFinite(eqPct)) {
      return { title: 'Aguardando cartas…', detail: 'Calculando equity/outs' };
    }

    const isPre = (board && board.length < 3);
    const isFlop = (board && board.length === 3);
    const isTurn = (board && board.length === 4);
    // Pós-flop aplica ajuste leve multiway (+2pp por oponente extra)
    const oppN = Math.max(1, Number(opp || 1));
    const adjPost = Math.max(0, (oppN - 1) * 2);
    const gePre  = (x) => eqPct >= x;
    const gePost = (x) => eqPct >= (x + adjPost);

    // Integração com raise.js: se houve ação pré-flop, o Raise domina
    if (isPre && isRaiseModeOn()){
      return { title: 'Houve Ação', detail: 'Use a recomendação do módulo Raise (Pot Odds / decisão)' };
    }

    // -------------------- PRÉ-FLOP — você é o primeiro a agir --------------------
    if (isPre) {
      const norm = normalizeHand(hand);

      // Buckets fixos primeiro (independem de equity bruta) — agora com sorteio
      if (open34.has(norm)) {
        return { title: makeBlindTitle(3, 4), detail: 'Open padrão (mão forte)' };
      }
      if (open23.has(norm)) {
        return { title: makeBlindTitle(2, 3), detail: 'Open padrão' };
      }
      if (limp12.has(norm)) {
        const b = rndInt(1, 2);
        return { title: `PAGUE ${b} BLIND${b===1?'':'S'}`, detail: 'Mão jogável; mantenha o pote menor' };
      }

      // Fallback por equity (para mãos fora das listas) — com sorteio
      if (eqPct < 30)  return { title: 'PASSE OU DESISTA', detail: 'Equity < 30%' };
      if (eqPct < 50)  return { title: 'PASSE OU DESISTA', detail: '30–50%: evite abrir; só continue vs aposta se houver pot odds' };
      if (eqPct < 70)  return { title: makeBlindTitle(2, 3), detail: '50–70% de equity' };
      if (eqPct <= 80) return { title: makeBlindTitle(3, 4), detail: '70–80% de equity' };

      // >80%
      if (slowPlayOn()) {
        // pode variar o tamanho do "induzir" entre 25–40% para dar variação leve
        const p = rndPct(25, 40, 5);
        return { title: 'SLOW PLAY', detail: `Passe/limp ou ${p}% para induzir` };
      }
      const ebb = effBB();
      if (isFinite(ebb) && ebb <= 12) {
        return { title: 'ALL-IN', detail: '>80% equity e efetivo curto (≤12 BB)' };
      }
      return { title: makeBlindTitle(4, 5), detail: 'Mão muito forte' };
    }

    // -------------------- PÓS-FLOP — ninguém apostou ainda --------------------
    // (Opcional) leitura de draws para descrição
    const outsRes      = (PCALC.computeOuts && PCALC.computeOuts()) || null;
    const outsStraight = outsRes?.outsExact?.[CAT.STRAIGHT]?.size || 0;
    const outsFlush    = outsRes?.outsExact?.[CAT.FLUSH]?.size    || 0;
    const strongDraw   = (outsFlush >= 9) || (outsStraight >= 8);
    const weakDraw     = (!strongDraw && outsStraight >= 4);

    if (!gePost(30))
      return { title: 'PASSE OU DESISTA', detail: '<30%: blefe só com MUITA fold equity' };

    if (!gePost(50)) {
      if (strongDraw) {
        const p = rndPct(33, 50, 1); // permitir 33, 34, 35… até 50
        return { title: 'SEMI-BLEFE', detail: `${p}% do pote (draw forte)` };
      }
      if (weakDraw && oppN === 1 && gePost(32)) {
        const p = rndPct(30, 40, 5); // 30/35/40
        return { title: 'SEMI-BLEFE (HU)', detail: `${p}% do pote` };
      }
      return { title: 'PASSE', detail: '30–50%: se houver aposta, continue só com pot odds' };
    }

    if (!gePost(70)) {
      // 50–70% → 50..75%
      const t = makePotTitle(50, 75, 5); // 50/55/60/65/70/75
      return { title: t, detail: 'Faixa de valor (50–70%)' };
    }

    if (!gePost(80)) {
      // 70–80% → 75..100%
      const t = makePotTitle(75, 100, 5); // 75/80/85/90/95/100
      return { title: t, detail: 'Valor forte (70–80%)' };
    }

    // >80%
    if (slowPlayOn()) {
      // manter 33% fixo é ok, mas pode variar 25–40% se quiser:
      const p = rndPct(25, 40, 5);
      return { title: `SLOW PLAY: APOSTE ${p}% DO POTE`, detail: 'Passe / size pequeno para induzir' };
    }

    const ebb2 = effBB();
    if (isFinite(ebb2) && ebb2 <= 12)
      return { title: 'APOSTE 100% DO POTE OU ALL IN', detail: 'Efetivo curto (≤12 BB)' };

    // overbet/pot — manter estável (suficientemente imprevisível por contexto)
    return { title: 'APOSTE 100% DO POTE OU MAIS', detail: 'Pot / overbet' };
  };

})(window);


/* ============================================================================================
   BEGIN — PATCH: Guardas Contextuais (equity + contexto) aplicadas à sugestão SEM AÇÃO
   - Multiway: exige mais equity pós-flop
   - Board perigoso: altas (A/K/Q), conectividade e flush-draw
   - Par Baixo vs Board Alto: evita “pagar por inércia” com SDV fraco
   - River multiway bet/raise à frente: anti–hero call fraco
   Integração: faz um wrap em PCALC.suggestAction mantendo a assinatura (eqPct, hand, board, opp)
   ============================================================================================ */
(function(g){
  const PC = g.PCALC || (g.PCALC = {});
  PC.state = PC.state || {};

  // ================= Config TUNÁVEL =================
  const CFG = {
    baseFoldEqPct: 40,   // exigência mínima de equity (pós-flop) antes de ajustar por contexto
    multiwayBonus: 10,   // +10pp de equity requerida quando 3+ players
    boardDangerBonus: 10,// +10pp em board perigoso
    weakPairFoldPct: 55, // se “par baixo vs board alto” e equity < 55% → FOLD/CHECK-FOLD
    riverHeroCallMin: 60 // river multiway com bet/raise à frente precisa ≥60% para continuar
  };

  // ----------------- Helpers de cartas -----------------
  function rankFromCard(c){
    // Aceita formatos {r,s} (numérico) ou "As"
    if(!c) return null;
    if(typeof c === 'string'){
      const r = c[0].toUpperCase();
      return ({A:14,K:13,Q:12,J:11,T:10,'9':9,'8':8,'7':7,'6':6,'5':5,'4':4,'3':3,'2':2})[r]||null;
    }
    if(typeof c === 'object' && c.r) return c.r|0;
    return null;
  }
  function suitFromCard(c){
    if(!c) return null;
    if(typeof c === 'string') return c[1]||null;
    if(typeof c === 'object' && c.s) return c.s||null;
    return null;
  }
  function onlyRanks(cards){
    return (cards||[]).map(rankFromCard).filter(x=>x!=null).sort((a,b)=>a-b);
  }
  function uniq(arr){ return Array.from(new Set(arr)); }

  function hasHighCard(board){
    const ranks = onlyRanks(board);
    return ranks.some(r => r>=12); // Q(12)+
  }
  function isConnected(board){
    const rs = uniq(onlyRanks(board)); if(rs.length<3) return false;
    rs.sort((a,b)=>a-b);
    let longest=1, cur=1;
    for(let i=1;i<rs.length;i++){
      if(rs[i]===rs[i-1]+1){ cur++; longest=Math.max(longest,cur); }
      else if(rs[i]!==rs[i-1]){ cur=1; }
    }
    return longest>=3; // conectividade relevante
  }
  function hasFlushDraw(board){
    // flush draw forte quando já há 4+ do mesmo naipe (turn/river) ou 3 no flop
    const counts = {};
    (board||[]).forEach(c=>{
      const s = suitFromCard(c);
      if(!s) return; counts[s]=(counts[s]||0)+1;
    });
    const n = (board||[]).length;
    const need = (n===3 ? 3 : 4);
    return Object.values(counts).some(v=>v>=need);
  }
  function boardDanger(board){
    return hasHighCard(board) || isConnected(board) || hasFlushDraw(board);
  }

  // “Par baixo vs board alto” (ex.: ter 5x em Q,7,A turn/river — sem dois pares/set)
  function isWeakPairLowVsHighBoard(hand, board){
    if(!hand || hand.length<2) return false;
    const hr = onlyRanks(hand).sort((a,b)=>b-a); // ex. K5 → [13,5]
    if(hr.length<2) return false;
    const pairInHand = (hr[0]===hr[1]); // pocket pair
    if(pairInHand) return false;        // não tratamos pocket pair aqui
    const low = hr[1];                   // “baixo” (como 5 do K5)
    const br = onlyRanks(board);
    const boardHigh = br.some(r=>r>=12); // Q/A/K presentes?
    if(!boardHigh) return false;

    // Checar se já virou dois pares/set
    const countLowOnBoard = br.filter(r=>r===low).length;
    if(countLowOnBoard>=2) return false; // set de low
    const hasOneLow = countLowOnBoard===1;
    const hasTopPairWithHigh = br.includes(hr[0]); // fez par com a alta? (ex. caiu K e você tem K5)
    if(hasTopPairWithHigh) return false; // não é “par baixo”, já é top pair

    // Caso típico: você só tem UM par do low (com a carta da mão), board contém Q/K/A
    // e não fez dois pares/set
    return !pairInHand && boardHigh && !hasTopPairWithHigh && !hasOneLow; // só par de mão, SDV fraco
  }

  function streetFrom(board){
    const n = (board||[]).length;
    if(n<3) return 'preflop';
    if(n===3) return 'flop';
    if(n===4) return 'turn';
    return 'river';
  }

  function requiredEqPctBase(opp){
    // base pós-flop (40%) + multa multiway (10pp para 3+)
    const players = Math.max(1, Number(opp||1));
    let req = CFG.baseFoldEqPct;
    if(players>=3) req += CFG.multiwayBonus;
    return Math.min(80, req);
  }

  function applyGuards(eqPct, hand, board, opp, rec){
    try{
      const street = streetFrom(board||[]);
      // 1) Par baixo vs board alto
      if(street!=='preflop' && isWeakPairLowVsHighBoard(hand, board)){
        if(eqPct < CFG.weakPairFoldPct){
          const t = (street==='flop'||street==='turn') ? 'PASSE' : 'PASSE OU DESISTA';
          return {
            title: t,
            detail: (rec?.detail? rec.detail+' · ' : '') + 'Par baixo em board alto: baixo showdown value.'
          };
        }
      }
      // 2) Board perigoso exige mais equity
      let req = requiredEqPctBase(opp);
      if(boardDanger(board)) req += CFG.boardDangerBonus;
      req = Math.min(80, req);

      if(eqPct < req){
        // converte sugestões marginais em controle/retirada
        const t = (street==='flop'||street==='turn') ? 'PASSE' : 'PASSE OU DESISTA';
        return {
          title: t,
          detail: (rec?.detail? rec.detail+' · ' : '') + `Equity ${eqPct.toFixed(1)}% < requisito de contexto ${req.toFixed(1)}%.`
        };
      }

      // 3) River multiway com força à frente (bet/raise) — precisamos do “contexto de aumento”.
      // Como suggestAction não recebe flags de ação, inferimos o cenário duro: multiway no river.
      if(street==='river' && Number(opp||1)>=3){
        if(eqPct < CFG.riverHeroCallMin){
          return {
            title: 'PASSE OU DESISTA',
            detail: (rec?.detail? rec.detail+' · ' : '') + 'River multiway — evite hero call com SDV fraco.'
          };
        }
      }

      // 4) Caso passe nas guardas, mantém a recomendação e anexa nota
      if(rec && typeof rec==='object'){
        return Object.assign({}, rec, {
          detail: (rec.detail? rec.detail+' · ' : '') + 'Guardas OK (contexto favorável).'
        });
      }
      return rec || { title: 'PASSE', detail: 'Guardas: fallback.' };
    }catch(e){
      return rec || { title: 'PASSE', detail: 'Guardas: fallback (erro não crítico).' };
    }
  }

  // --------------- Wrap da função original ----------------
  if(typeof PC.suggestAction === 'function'){
    const _orig = PC.suggestAction;
    PC.suggestAction = function(eqPct, hand, board, opp){
      const base = _orig.call(this, eqPct, hand, board, opp);
      // Só aplicamos guardas pós-flop (street >= flop). Pré-flop mantemos seu modelo.
      const street = streetFrom(board||[]);
      if(street==='preflop') return base;
      return applyGuards(Number(eqPct||0), hand, board, opp, base);
    };
  }

})(window);
/* ================================== END PATCH ================================== */
