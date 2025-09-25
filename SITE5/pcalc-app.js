// pcalc-app.js
(function (g) {
  "use strict";

  // Espera por g.PCALC (seu motor/evaluator já existente)
  const PC = g.PCALC || {};
  const {
    RANKS = [2,3,4,5,6,7,8,9,10,11,12,13,14],
    SUITS = ["s", "h", "d", "c"],
    fmtRank = (r)=>r,          // fallback
    cardId = (r,s)=>({r,s}),   // fallback
    makeDeck = ()=>[],         // fallback
    evalBest = ()=>({cat:0, ranks:[], kicker:[]}), // fallback
    cmpEval = (a,b)=>0,        // fallback
    CAT = {}, CAT_NAME = {}
  } = PC;

  // ===== Helpers de ranks/labels =====
  const RANK_CHAR  = r => r===14?'A':r===13?'K':r===12?'Q':r===11?'J':r===10?'T':String(r);
  const RANK_PRINT = RANK_CHAR;

  function normalizePairLabel(c1, c2){
    // Ordem-insensível; retorna "AKs", "AKo" ou "AA" etc.
    const hi = Math.max(c1.r, c2.r), lo = Math.min(c1.r, c2.r);
    const suited = (c1.s === c2.s);
    if (hi === lo) return `${RANK_PRINT(hi)}${RANK_PRINT(lo)}`;
    return `${RANK_PRINT(hi)}${RANK_PRINT(lo)}${suited ? "s" : "o"}`;
  }

  function normalizeRankOnly(c1, c2){
    // Ordem-insensível e DESPREZA naipe (usado quando flush é impossível)
    const hi = Math.max(c1.r, c2.r), lo = Math.min(c1.r, c2.r);
    return `${RANK_PRINT(hi)}${RANK_PRINT(lo)}`; // sem 's'/'o'
  }

  function parseCard(str){
    // Aceita "As", "Td", "9h" etc. ou apenas rank "A","T","9" (assume naipe 'x' neutro)
    const s = String(str).trim();
    if (!s) return null;
    const ch = s[0].toUpperCase();
    const r = ch==='A'?14:ch==='K'?13:ch==='Q'?12:ch==='J'?11:ch==='T'?10:parseInt(ch,10);
    if (!r || r<2 || r>14) return null;
    let suit = s[1] ? s[1].toLowerCase() : 'x'; // 'x' = naipe neutro (desconhecido)
    if (!['s','h','d','c','x'].includes(suit)) suit='x';
    return { r, s: suit };
  }

  function parseHand2(s) {
    // Ex.: "8s6h" -> [{8,s},{6,h}] ; "86" -> [{8,x},{6,x}]
    const str = String(s||"").replace(/\s+/g,'').toUpperCase();
    if (!str) return [];
    const m = str.match(/([2-9TJQKA][SHDCX]?)([2-9TJQKA][SHDCX]?)/i);
    if (!m) return [];
    return [ parseCard(m[1]), parseCard(m[2]) ].filter(Boolean);
  }

  function parseBoard(s){
    // Aceita 0..5 cartas. Ex.: "7d 9c Tc 2h As"
    const parts = String(s||"").trim().split(/\s+/).filter(Boolean);
    const out = [];
    for (const p of parts) {
      const c = parseCard(p);
      if (c) out.push(c);
    }
    return out.slice(0,5);
  }

  // ===== Checagens de possibilidade de flush =====
  function boardSuitCount(board){
    const cnt = { s:0,h:0,d:0,c:0 };
    for (const c of board) if (cnt[c.s] !== undefined) cnt[c.s]++;
    return cnt;
  }

  function flushRelevant(board){
    // Flush só é possível se houver ao menos 3 cartas do mesmo naipe na mesa
    // (para vilão ter chance com 2 do mesmo naipe) ou 4 na mesa (para qualquer naipe do vilão ajudar)
    // Se o board foi fornecido SEM naipes (suit 'x'), assumimos "não relevante".
    if (!board || !board.length) return true; // pré-flop: suited importa
    if (board.some(c => c.s === 'x')) return false;
    const cnt = boardSuitCount(board);
    const maxSuit = Math.max(cnt.s, cnt.h, cnt.d, cnt.c);
    return maxSuit >= 3;
  }

  // ===== Geração de combinações de vilão e agrupamento =====
  function removeUsedFromDeck(deck, used){
    const usedKey = new Set(used.map(c=>`${c.r}${c.s}`));
    return deck.filter(c => !usedKey.has(`${c.r}${c.s}`));
  }

  function allCombos2(cards){
    const out = [];
    for (let i=0;i<cards.length;i++){
      for (let j=i+1;j<cards.length;j++){
        out.push([cards[i], cards[j]]);
      }
    }
    return out;
  }

  function bestEvalFor(hand2, board, evalBestFn){
    return evalBestFn(hand2.concat(board));
  }

  function keyForGrouping(c1, c2, flushMatters){
    return flushMatters ? normalizePairLabel(c1,c2) : normalizeRankOnly(c1,c2);
  }

  function dedupByKey(pairs, makeKey){
    const seen = new Set();
    const kept = [];
    for (const [a,b] of pairs){
      const k = makeKey(a,b);
      if (!seen.has(k)){
        seen.add(k);
        kept.push({ key:k, pair:[a,b] });
      }
    }
    return kept;
  }

  // ===== Pré-flop Top list =====
  // Lista padrão (sem polêmica): 30 melhores mãos iniciais.
  const TOP_PREFLOP = [
    "AA","KK","QQ","JJ","AKs","TT","AQs","AJs","KQs","AKo",
    "99","ATs","KJs","QJs","KTs","AQo","88","QTs","JTs","A9s",
    "KQo","77","A8s","K9s","T9s","AJo","Q9s","J9s","A7s","KJo"
  ];

  function showPreflopTop(containerId){
    const el = document.getElementById(containerId || "preflop-top");
    if (!el) return;
    el.innerHTML = "";
    const ul = document.createElement("ul");
    ul.className = "preflop-top";
    TOP_PREFLOP.forEach((h,i)=>{
      const li = document.createElement("li");
      li.textContent = `${i+1}. ${h}`;
      ul.appendChild(li);
    });
    el.appendChild(ul);
  }

  // ===== Cálculo principal de ranking relativo =====
  function rankRelativeToField(hero, board){
    // Retorna { heroKey, heroEval, groupsSorted:[{key, eval}], heroPosIndex }
    // Onde heroPosIndex é base-1 (1 = melhor)
    const deck = makeDeck();
    const used = hero.concat(board).filter(Boolean);
    const deckLeft = removeUsedFromDeck(deck, used);

    const flushMatters = board.length === 0 ? true : flushRelevant(board);

    const allPairs = allCombos2(deckLeft);

    // Agrupar por equivalência:
    const grouped = dedupByKey(allPairs, (a,b)=>keyForGrouping(a,b, flushMatters));

    // Avaliar 1 representante por grupo:
    const evals = grouped.map(({key, pair})=>{
      const ev = bestEvalFor(pair, board, evalBest);
      return { key, ev, sample: pair };
    });

    // Ordenar por força (melhor primeiro)
    evals.sort((x,y)=>cmpEval(y.ev, x.ev));

    // Avaliar herói
    const heroEv = bestEvalFor(hero, board, evalBest);
    const heroKey = (flushMatters
      ? normalizePairLabel(hero[0], hero[1])
      : normalizeRankOnly(hero[0], hero[1])
    );

    // Posição do herói entre os grupos (sem duplicates por suited/order)
    let better = 0;
    for (const g of evals){
      const cmp = cmpEval(g.ev, heroEv);
      if (cmp > 0) better++;
      else break; // como está ordenado desc, podemos parar quando empata ou é pior
    }
    const heroPos = better + 1;

    return {
      heroKey, heroEval: heroEv,
      groupsSorted: evals,
      heroPosIndex: heroPos
    };
  }

  // ===== UI de exemplo (opcional) =====
  function renderRanking(result, containerId){
    const el = document.getElementById(containerId || "ranking");
    if (!el || !result) return;
    const { heroKey, heroPosIndex, groupsSorted } = result;

    const top = groupsSorted.slice(0, 20).map((g,i)=>`${i+1}. ${g.key}`);
    el.innerHTML = `
      <div class="hero-line">Sua mão (equivalência): <b>${heroKey}</b> • Posição: <b>#${heroPosIndex}</b></div>
      <div class="list"><pre>${top.join("\n")}${groupsSorted.length>20?`\n… (+${groupsSorted.length-20} grupos)`:''}</pre></div>
    `;
  }

  // ===== API pública deste arquivo =====
  // updateAll: chama exibição de pré-flop top + ranking relativo se hero/board dados
  function updateAll(opts){
    const {
      heroStr = "",  // "8s6h" etc.
      boardStr = "", // "7d 9c Tc 2h As" etc.
      preflopTopContainerId = "preflop-top",
      rankingContainerId = "ranking"
    } = opts || {};

    // Sempre mostra Top pré-flop
    showPreflopTop(preflopTopContainerId);

    // Se não houver mão do herói, não calcula ranking
    const hero = parseHand2(heroStr);
    if (hero.length !== 2) {
      const el = document.getElementById(rankingContainerId);
      if (el) el.innerHTML = "<em>Informe sua mão para ver o ranking relativo.</em>";
      return null;
    }

    const board = parseBoard(boardStr);
    const res = rankRelativeToField(hero, board);
    renderRanking(res, rankingContainerId);
    return res;
  }

  // Exemplo de integração automática (se existirem inputs com estes ids)
  function autoWire(){
    const heroIn  = document.getElementById("hero");
    const boardIn = document.getElementById("board");
    const rerun = ()=>{
      updateAll({
        heroStr  : heroIn  ? heroIn.value  : "",
        boardStr : boardIn ? boardIn.value : "",
        preflopTopContainerId: "preflop-top",
        rankingContainerId: "ranking"
      });
    };
    if (heroIn)  heroIn.addEventListener("input", rerun);
    if (boardIn) boardIn.addEventListener("input", rerun);
    // primeiro render
    rerun();
  }

  // Exporta funções úteis
  g.PCALC_APP = {
    updateAll,
    parseHand2,
    parseBoard,
    flushRelevant,
    rankRelativeToField
  };

  // Autowire se a página tiver os campos
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", autoWire);
  } else {
    autoWire();
  }

})(window);
