// pcalc-app.js (robusto contra PCALC atrasado / não carregado)
(function (g) {
  "use strict";

  // =================== CONFIG/UI IDS ===================
  const IDS = {
    hero: "hero",
    board: "board",
    preflopTop: "preflop-top",
    ranking: "ranking",
  };

  // =================== ESTADO INTERNO ==================
  let PC = null; // será preenchido quando window.PCALC existir
  let wired = false;

  // =================== HELPERS RANK/LABEL ==============
  const RANK_CHAR = (r) =>
    r === 14 ? "A" : r === 13 ? "K" : r === 12 ? "Q" : r === 11 ? "J" : r === 10 ? "T" : String(r);
  const RANK_PRINT = RANK_CHAR;

  function normalizePairLabel(c1, c2) {
    const hi = Math.max(c1.r, c2.r),
      lo = Math.min(c1.r, c2.r);
    const suited = c1.s === c2.s;
    if (hi === lo) return `${RANK_PRINT(hi)}${RANK_PRINT(lo)}`;
    return `${RANK_PRINT(hi)}${RANK_PRINT(lo)}${suited ? "s" : "o"}`;
  }

  function normalizeRankOnly(c1, c2) {
    const hi = Math.max(c1.r, c2.r),
      lo = Math.min(c1.r, c2.r);
    return `${RANK_PRINT(hi)}${RANK_PRINT(lo)}`; // sem suited/off e sem ordem
  }

  function parseCard(str) {
    const s = String(str || "").trim();
    if (!s) return null;
    const ch = s[0].toUpperCase();
    const r =
      ch === "A"
        ? 14
        : ch === "K"
        ? 13
        : ch === "Q"
        ? 12
        : ch === "J"
        ? 11
        : ch === "T"
        ? 10
        : parseInt(ch, 10);
    if (!r || r < 2 || r > 14) return null;
    let suit = s[1] ? s[1].toLowerCase() : "x"; // 'x' = naipe neutro
    if (!["s", "h", "d", "c", "x"].includes(suit)) suit = "x";
    return { r, s: suit };
  }

  function parseHand2(s) {
    const str = String(s || "").replace(/\s+/g, "").toUpperCase();
    if (!str) return [];
    const m = str.match(/([2-9TJQKA][SHDCX]?)([2-9TJQKA][SHDCX]?)/i);
    if (!m) return [];
    return [parseCard(m[1]), parseCard(m[2])].filter(Boolean);
  }

  function parseBoard(s) {
    const parts = String(s || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    const out = [];
    for (const p of parts) {
      const c = parseCard(p);
      if (c) out.push(c);
    }
    return out.slice(0, 5);
  }

  // ===== Checagem flush possível no board =====
  function boardSuitCount(board) {
    const cnt = { s: 0, h: 0, d: 0, c: 0 };
    for (const c of board) if (cnt[c.s] !== undefined) cnt[c.s]++;
    return cnt;
  }

  function flushRelevant(board) {
    if (!board || !board.length) return true; // pré-flop: suited importa
    if (board.some((c) => c.s === "x")) return false; // sem naipes no board informado => não diferenciar suited
    const cnt = boardSuitCount(board);
    const maxSuit = Math.max(cnt.s, cnt.h, cnt.d, cnt.c);
    return maxSuit >= 3;
  }

  // ===== Combinações, deck e avaliação =====
  function removeUsedFromDeck(deck, used) {
    const usedKey = new Set(used.map((c) => `${c.r}${c.s}`));
    return deck.filter((c) => !usedKey.has(`${c.r}${c.s}`));
  }

  function allCombos2(cards) {
    const out = [];
    for (let i = 0; i < cards.length; i++) {
      for (let j = i + 1; j < cards.length; j++) {
        out.push([cards[i], cards[j]]);
      }
    }
    return out;
  }

  function keyForGrouping(c1, c2, flushMatters) {
    return flushMatters ? normalizePairLabel(c1, c2) : normalizeRankOnly(c1, c2);
  }

  function dedupByKey(pairs, makeKey) {
    const seen = new Set();
    const kept = [];
    for (const [a, b] of pairs) {
      const k = makeKey(a, b);
      if (!seen.has(k)) {
        seen.add(k);
        kept.push({ key: k, pair: [a, b] });
      }
    }
    return kept;
  }

  // ===== Pré-flop Top list =====
  const TOP_PREFLOP = [
    "AA",
    "KK",
    "QQ",
    "JJ",
    "AKs",
    "TT",
    "AQs",
    "AJs",
    "KQs",
    "AKo",
    "99",
    "ATs",
    "KJs",
    "QJs",
    "KTs",
    "AQo",
    "88",
    "QTs",
    "JTs",
    "A9s",
    "KQo",
    "77",
    "A8s",
    "K9s",
    "T9s",
    "AJo",
    "Q9s",
    "J9s",
    "A7s",
    "KJo",
  ];

  function showPreflopTop(containerId) {
    const el = document.getElementById(containerId || IDS.preflopTop);
    if (!el) return;
    el.innerHTML = "";
    const ul = document.createElement("ul");
    ul.className = "preflop-top";
    TOP_PREFLOP.forEach((h, i) => {
      const li = document.createElement("li");
      li.textContent = `${i + 1}. ${h}`;
      ul.appendChild(li);
    });
    el.appendChild(ul);
  }

  // ===== Ranking relativo ao field =====
  function rankRelativeToField(hero, board) {
    if (!PC) return null;
    const { makeDeck, evalBest, cmpEval } = PC;
    if (!makeDeck || !evalBest || !cmpEval) return null;

    const deck = makeDeck();
    const used = hero.concat(board).filter(Boolean);
    const deckLeft = removeUsedFromDeck(deck, used);

    const flushMatters = board.length === 0 ? true : flushRelevant(board);
    const allPairs = allCombos2(deckLeft);

    const grouped = dedupByKey(allPairs, (a, b) => keyForGrouping(a, b, flushMatters));

    const evals = grouped.map(({ key, pair }) => {
      const ev = evalBest(pair.concat(board));
      return { key, ev, sample: pair };
    });

    evals.sort((x, y) => PC.cmpEval(y.ev, x.ev));

    const heroEv = PC.evalBest(hero.concat(board));
    const heroKey = flushMatters ? normalizePairLabel(hero[0], hero[1]) : normalizeRankOnly(hero[0], hero[1]);

    let better = 0;
    for (const g of evals) {
      const cmp = PC.cmpEval(g.ev, heroEv);
      if (cmp > 0) better++;
      else break;
    }
    const heroPos = better + 1;

    return {
      heroKey,
      heroEval: heroEv,
      groupsSorted: evals,
      heroPosIndex: heroPos,
    };
  }

  function renderRanking(result, containerId) {
    const el = document.getElementById(containerId || IDS.ranking);
    if (!el) return;
    if (!result) {
      el.innerHTML =
        '<em style="opacity:.8">Carregando motor… Assim que o avaliador estiver disponível, o ranking aparece aqui.</em>';
      return;
    }
    const { heroKey, heroPosIndex, groupsSorted } = result;
    const top = groupsSorted.slice(0, 20).map((g, i) => `${i + 1}. ${g.key}`);
    el.innerHTML = `
      <div class="hero-line">Sua mão (equivalência): <b>${heroKey}</b> • Posição: <b>#${heroPosIndex}</b></div>
      <div class="list"><pre>${top.join("\n")}${
      groupsSorted.length > 20 ? `\n… (+${groupsSorted.length - 20} grupos)` : ""
    }</pre></div>
    `;
  }

  // ===== Atualização principal =====
  function updateAll(opts) {
    const {
      heroStr = "",
      boardStr = "",
      preflopTopContainerId = IDS.preflopTop,
      rankingContainerId = IDS.ranking,
    } = opts || {};

    // Sempre mostra Top pré-flop
    showPreflopTop(preflopTopContainerId);

    // Sem mão do herói -> só mantém mensagem
    const hero = parseHand2(heroStr);
    if (hero.length !== 2) {
      const el = document.getElementById(rankingContainerId);
      if (el)
        el.innerHTML = "<em>Informe sua mão para ver o ranking relativo.</em>";
      return null;
    }

    const board = parseBoard(boardStr);

    // Se PCALC ainda não disponível, mostra placeholder
    if (!PC) {
      renderRanking(null, rankingContainerId);
      return null;
    }

    const res = rankRelativeToField(hero, board);
    renderRanking(res, rankingContainerId);
    return res;
  }

  // ===== Auto-wire de inputs e reactive render =====
  function autoWire() {
    if (wired) return;
    wired = true;

    const heroIn = document.getElementById(IDS.hero);
    const boardIn = document.getElementById(IDS.board);

    const rerun = () =>
      updateAll({
        heroStr: heroIn ? heroIn.value : "",
        boardStr: boardIn ? boardIn.value : "",
        preflopTopContainerId: IDS.preflopTop,
        rankingContainerId: IDS.ranking,
      });

    if (heroIn) heroIn.addEventListener("input", rerun);
    if (boardIn) boardIn.addEventListener("input", rerun);

    // Render inicial (mesmo sem PCALC)
    rerun();
  }

  // ===== Espera pelo PCALC sem travar a UI =====
  function waitPCALCAndGo() {
    try {
      if (g && g.PCALC && typeof g.PCALC.makeDeck === "function" && typeof g.PCALC.evalBest === "function") {
        PC = g.PCALC;
        // Depois que PCALC chega, re-renderiza uma vez para preencher o ranking
        const heroIn = document.getElementById(IDS.hero);
        const boardIn = document.getElementById(IDS.board);
        updateAll({
          heroStr: heroIn ? heroIn.value : "",
          boardStr: boardIn ? boardIn.value : "",
        });
        return; // pronto
      }
    } catch (e) {
      // Não quebrar a página
      console.warn("Aguardando PCALC…", e);
    }
    // Tenta de novo em 300ms
    setTimeout(waitPCALCAndGo, 300);
  }

  // ===== Exposição pública (opcional) =====
  g.PCALC_APP = {
    updateAll,
    parseHand2,
    parseBoard,
    flushRelevant,
    rankRelativeToField, // usa PC quando disponível
  };

  // ===== Inicialização segura =====
  function boot() {
    autoWire();       // liga inputs e mostra Top Pré-flop já
    waitPCALCAndGo(); // fica esperando o motor PCALC sem apagar UI
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(window);
