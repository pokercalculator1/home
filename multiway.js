/* multiway.js — board wetness + penalização multiway (drop-in)
   Coloque no index e pronto. Tenta auto-integrar; se não achar, expõe utilitários em PCALC.Multiway.
*/
(function (g) {
  'use strict';

  // ================== Config ==================
  const CFG = {
    // Penalização por vilão extra (além do primeiro). 0.08 = 8% por vilão.
    ALPHA: 0.08,
    // Peso da molhabilidade do board. 0.5 = até -50% de equity no pior caso (score 100).
    BETA: 0.50,
    // Limite inferior para o fator multiway (evita "zerar" demais)
    MULTIWAY_FLOOR: 0.50,
    // Nomes comuns de funções de decisão a serem "embrulhadas" (auto-hook)
    WRAP_TARGETS: [
      'PCALC.recommendAction',
      'PCALC.suggestAction',
      'RAISE.recommend',
      'window.recommendAction'
    ]
  };

  // ================== Helpers ==================
  const RANK_MAP = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'T':10,'J':11,'Q':12,'K':13,'A':14 };
  function parseCard(card) { // "Qs", "Td", "Ah"
    if (!card || typeof card !== 'string' || card.length < 2) return null;
    const r = card[0].toUpperCase();
    const s = card[1].toLowerCase();
    if (!RANK_MAP[r]) return null;
    return { rChar: r, rank: RANK_MAP[r], suit: s };
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // ================== Wetness do FLOP (0..100) ==================
  function boardWetnessScore(flop3 /* array tipo ["Qs","Jh","9d"] */) {
    try {
      if (!Array.isArray(flop3) || flop3.length < 3) return 0;
      const c = flop3.map(parseCard).filter(Boolean);
      if (c.length < 3) return 0;

      const ranks = c.map(x => x.rank).sort((a,b)=>a-b);
      const suits = c.map(x => x.suit);
      const distinctRanks = new Set(ranks).size;

      // (1) Flush potential
      const suitCount = suits.reduce((m,s)=> (m[s]=(m[s]||0)+1, m), {});
      const counts = Object.values(suitCount);
      const isMonotone = counts.includes(3);
      const isTwoTone  = counts.includes(2);
      let score = 0;
      if (isMonotone) score += 35;
      else if (isTwoTone) score += 20;

      // (2) Conectividade simples
      const gap1 = ranks[1] - ranks[0];
      const gap2 = ranks[2] - ranks[1];
      const maxGap = Math.max(gap1, gap2);
      const connectedSeq = (gap1===1 && gap2===1);             // 7-8-9
      const oneAndTwo = ([gap1,gap2].sort().join() === '1,2'); // 9-T-Q
      if (connectedSeq) score += 25;
      else if (oneAndTwo) score += 18;
      else if (maxGap >= 3) score += 0;

      // (3) Quantas ranks fazem 4-to-straight com 1 carta
      const needed = new Set();
      for (let add = 2; add <= 14; add++) {
        const arr = [...ranks, add].sort((a,b)=>a-b);
        for (let i=0;i<2;i++){
          const w = arr.slice(i, i+4);
          const span = w[3] - w[0];
          if (span <= 3) { needed.add(add); break; }
        }
      }
      const needN = needed.size;
      if (needN >= 8) score += 20;
      else if (needN >= 5) score += 12;
      else if (needN >= 3) score += 6;

      // (4) Ajustes
      const isPaired = (distinctRanks <= 2);
      if (isPaired) score -= 10;

      const broadways = ranks.filter(r => r >= 10).length;
      if (broadways === 3) score += 10;

      const lowConnected = (!connectedSeq && ranks[2] <= 9 && maxGap === 1);
      if (lowConnected) score += 6;

      return clamp(score, 0, 100);
    } catch {
      return 0;
    }
  }

  // ================== Penalizações e equity ajustada ==================
  function adjustedEquity(equityBruta /*0..1*/, nViloes, wetScore,
                          ALPHA=CFG.ALPHA, BETA=CFG.BETA, FLOOR=CFG.MULTIWAY_FLOOR) {
    if (!(equityBruta >= 0)) return 0;
    const multiway = Math.max(FLOOR, 1 - ALPHA * Math.max(0, (nViloes||1) - 1));
    const wet = 1 - BETA * clamp((wetScore||0)/100, 0, 1);
    return clamp(equityBruta * multiway * wet, 0, 1);
  }

  // ================== Pot odds ==================
  function potOdds(pot, toCall) {
    pot = Number(pot||0); toCall = Number(toCall||0);
    if (pot < 0) pot = 0; if (toCall <= 0) return 0;
    return clamp(toCall / (pot + toCall), 0, 1);
  }

  // ================== State readers (tolerantes) ==================
  function readState() {
    const PC = g.PCALC || g.PC || {};
    const st = PC.state || {};
    // tentativa de ler flop em diferentes formatos
    const flop =
      st.flop || st.boardFlop || st.board || st.flopCards ||
      (Array.isArray(st.boardAll) ? st.boardAll.slice(0,3) : null) ||
      null;

    return {
      equity: Number(st.eqMC || st.equityMC || st.equity || 0), // 0..1 esperado
      pot: Number(st.pot || 0),
      toCall: Number(st.toCall || st.call || 0),
      opponents: Number(st.oponentes || st.opponents || st.viloes || st.nViloes || 1),
      flop
    };
  }

  // ================== Auto-hook (embrulha funções de decisão comuns) ==================
  function getByPath(path) {
    const parts = path.split('.');
    let cur = (parts[0] === 'window') ? g : g;
    for (const p of parts) {
      if (p === 'window') continue;
      if (!cur) return { parent:null, key:null, val:undefined };
      if (!(p in cur)) return { parent:cur, key:p, val:undefined };
      cur = cur[p];
    }
    const key = parts.pop();
    return { parent:null, key, val:cur };
  }
  function setByPath(path, fn) {
    const parts = path.split('.');
    let cur = (parts[0] === 'window') ? g : g;
    for (let i=0;i<parts.length-1;i++){
      const p = parts[i];
      if (p === 'window') continue;
      cur[p] = cur[p] || {};
      cur = cur[p];
    }
    cur[parts[parts.length-1]] = fn;
  }

  function wrapDecision(targetPath) {
    const { val } = getByPath(targetPath);
    if (typeof val !== 'function') return false;

    const wrapped = function (...args) {
      try {
        // Tenta detectar assinatura comum: (equity, pot, toCall, opponents, flopArray)
        // Se não houver, tenta ler do estado global PCALC.state
        let equity = null, potV = null, toCallV = null, opps = null, flopArr = null;

        // Heurística de parsing dos args
        for (const a of args) {
          if (typeof a === 'number') {
            if (equity === null && a >= 0 && a <= 1) { equity = a; continue; }
            if (potV === null && a >= 0) { potV = a; continue; }
            if (toCallV === null && a >= 0) { toCallV = a; continue; }
            if (opps === null && a >= 1 && a <= 9) { opps = a; continue; }
          } else if (Array.isArray(a) && a.length <= 5) {
            flopArr = a;
          }
        }

        if (equity == null || potV == null || toCallV == null) {
          const st = readState();
          equity = (equity==null)? st.equity : equity;
          potV = (potV==null)? st.pot : potV;
          toCallV = (toCallV==null)? st.toCall : toCallV;
          opps = (opps==null)? st.opponents : opps;
          flopArr = flopArr || st.flop || [];
        }

        const wet = boardWetnessScore(flopArr || []);
        const eqAdj = adjustedEquity(equity, opps||1, wet);

        // Substitui equity pelo eqAdj na chamada original
        const newArgs = args.map(x => x);
        const idxEq = newArgs.findIndex(x => typeof x === 'number' && x >= 0 && x <= 1);
        if (idxEq >= 0) newArgs[idxEq] = eqAdj;

        // Também injeta info em PCALC.state se existir:
        const PC = g.PCALC || g.PC || {};
        if (PC.state) {
          PC.state.wetScore = wet;
          PC.state.eqAdj = eqAdj;
          PC.state.potOdds = potOdds(potV, toCallV);
        }

        const out = val.apply(this, newArgs);
        return out;
      } catch (e) {
        console.warn('[multiway.js] falha no wrapper:', e);
        return val.apply(this, args);
      }
    };

    setByPath(targetPath, wrapped);
    console.info('[multiway.js] auto-hook aplicado em:', targetPath);
    return true;
  }

  function autoIntegrate() {
    let hooked = false;
    for (const p of CFG.WRAP_TARGETS) {
      try { hooked = wrapDecision(p) || hooked; } catch {}
    }
    if (!hooked) {
      console.info('[multiway.js] nenhum alvo de decisão encontrado — funcionando como biblioteca (PCALC.Multiway.*).');
    }
    return hooked;
  }

  // ================== Exposição pública ==================
  const API = {
    version: '1.0.0',
    config: CFG,
    boardWetnessScore,
    adjustedEquity,
    potOdds,
    readState,
    autoIntegrate
  };

  g.PCALC = g.PCALC || {};
  g.PCALC.Multiway = API;

  // ================== Boot ==================
  // tenta integrar imediatamente; se ainda não carregou o app, tenta de novo depois
  const didHook = autoIntegrate();
  if (!didHook) {
    // tenta novamente quando a página "assentar"
    setTimeout(autoIntegrate, 1000);
    // e mais uma vez depois (caso os módulos carreguem tardiamente)
    setTimeout(autoIntegrate, 3000);
  }

})(window);
