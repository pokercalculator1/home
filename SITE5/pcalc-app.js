// pcalc-app.js
// App principal: integra UI + sugestão GTO-like no FLOP (somente com 3 cartas),
// fallback para o motor atual, e modal Top5 em hover.

(function (g) {
  "use strict";

  const PC = g.PCALC || (g.PCALC = {});
  const { makeDeck, evalBest, cmpEval, CAT_NAME } = PC;

  // ========================== CONFIG / SELECTORS ==========================
  const SEL = {
    suggest:   "#pcalc-sugestao",
    toolbar:   "#pcalc-toolbar",
    nutsModal: "#pcalc-nuts-modal",
  };

  // cria #pcalc-sugestao se não existir
  function ensureSuggestNode() {
    let el = document.querySelector(SEL.suggest);
    if (!el) {
      const tb = document.querySelector(SEL.toolbar) || document.body;
      el = document.createElement("div");
      el.id = SEL.suggest.slice(1);
      el.className = "pcalc-sugestao";
      el.style.cssText = "margin:6px 0;padding:8px 10px;border-radius:8px;background:#111;color:#fff;font:500 14px/1.4 system-ui,Segoe UI,Roboto,Arial;display:inline-block;cursor:help;white-space:pre-line";
      tb.appendChild(el);
    }
    return el;
  }

  // injeta estilo do modal se ainda não houver
  function ensureModalCss() {
    if (document.getElementById("pcalc-nuts-css")) return;
    const css = `
    .pcalc-nuts-modal{
      position:fixed; z-index:999999; min-width:260px; max-width:360px;
      background:#0d1117; color:#e6edf3; border:1px solid #30363d; border-radius:12px;
      box-shadow:0 10px 30px rgba(0,0,0,.35); padding:10px 12px; font: 13px/1.4 system-ui,Segoe UI,Roboto,Arial;
    }
    .pcalc-nuts-modal h4{margin:0 0 8px 0; font-size:13px; font-weight:700}
    .pcalc-nuts-list{margin:0; padding:0; list-style:none}
    .pcalc-nuts-list li{display:flex; align-items:center; gap:8px; padding:4px 0; border-top:1px dashed #30363d}
    .pcalc-nuts-list li:first-child{border-top:none}
    .pcalc-tag{font-size:11px; background:#1f6feb; color:#fff; padding:2px 6px; border-radius:999px}
    .pcalc-chip{font:600 12px/1 system-ui; padding:3px 7px; border-radius:6px; background:#161b22; border:1px solid #30363d}
    .pcalc-chip--me{background:#102a43; border-color:#0b84ff; color:#8bc0ff}
    `;
    const style = document.createElement("style");
    style.id = "pcalc-nuts-css";
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ========================== HELPERS DE CARTAS ==========================
  const SUIT_ORDER = { s: 0, h: 1, d: 2, c: 3 };
  const RANK_CHAR = r => r === 14 ? "A" : r === 13 ? "K" : r === 12 ? "Q" : r === 11 ? "J" : r === 10 ? "T" : String(r);
  const printCard = c => `${RANK_CHAR(c.r || c.rank)}${(c.s || c.suit)}`;
  const sortCardsDesc = arr => [...arr].sort((a, b) => {
    const ra = a.r || a.rank, rb = b.r || b.rank;
    if (ra !== rb) return rb - ra;
    const sa = a.s || a.suit, sb = b.s || b.suit;
    return SUIT_ORDER[sa] - SUIT_ORDER[sb];
  });

  function getState() {
    const st = PC.state || {};
    const hero = st.hero || st.hole || st.mao || st.hand || [];
    const board = st.board || st.mesa || [];
    return { hero, board, pos: st.pos, stackBB: st.stackBB, callers: st.callers, raiseBB: st.raiseBB };
  }

  // ========================== NUTS / TOP5 MODAL ==========================
  async function computeTop5(board3) {
    const deck = makeDeck ? makeDeck() : null;
    if (!deck || !evalBest || !cmpEval) return { top: [] };

    // remove cartas do board do deck
    const seen = new Set(board3.map(printCard));
    const rest = deck.filter(c => !seen.has(printCard(c)));

    const hands = [];
    for (let i = 0; i < rest.length; i++) {
      for (let j = i + 1; j < rest.length; j++) {
        const h = [rest[i], rest[j]];
        const ev = evalBest(h, board3);
        hands.push({ h, ev });
      }
    }
    hands.sort((a, b) => cmpEval(b.ev, a.ev));

    const top = hands.slice(0, 5).map(x => ({
      hand: x.h.map(printCard),
      cat: (typeof x.ev.cat === "number" && CAT_NAME) ? (CAT_NAME[x.ev.cat] || String(x.ev.cat)) : "—",
      info: x.ev
    }));

    return { top };
  }

  function showNutsModal(anchorEl, payload, hero) {
    ensureModalCss();
    hideNutsModal();

    const modal = document.createElement("div");
    modal.id = SEL.nutsModal.slice(1);
    modal.className = "pcalc-nuts-modal";

    const myKey = hero ? sortCardsDesc(hero).map(printCard).join(" ") : "";

    let html = `<h4>Top 5 mãos possíveis (neste flop)</h4><ul class="pcalc-nuts-list">`;
    for (const item of payload.top) {
      const combo = item.hand.join(" ");
      const isMe = (combo === myKey);
      html += `<li><span class="pcalc-tag">${item.cat}</span><span class="pcalc-chip ${isMe ? "pcalc-chip--me" : ""}">${combo}</span></li>`;
    }
    html += `</ul>`;

    modal.innerHTML = html;
    document.body.appendChild(modal);

    const r = anchorEl.getBoundingClientRect();
    const x = Math.min(r.left, window.innerWidth - 380);
    const y = r.bottom + 6;
    modal.style.left = `${x}px`;
    modal.style.top = `${y}px`;
  }
  function hideNutsModal() {
    const old = document.querySelector(SEL.nutsModal);
    if (old) old.remove();
  }
  function rankFromStr(ch) {
    if (ch === "A") return 14;
    if (ch === "K") return 13;
    if (ch === "Q") return 12;
    if (ch === "J") return 11;
    if (ch === "T") return 10;
    return parseInt(ch, 10);
  }

  // ========================== SUGESTÃO (FLOP) ==========================
  async function buildFlopSuggestionText() {
    const { hero, board } = getState();
    const flop = (board || []).slice(0, 3);

    if (!hero || hero.length < 2) return "";
    if (flop.length < 3) return "";

    // Usa Auto se existir; se não, embrulha LikeGTO no spot padrão
    if (PC.GTO && (PC.GTO.suggestFlopAuto || PC.GTO.suggestFlopLikeGTO)) {
      try {
        const callAuto = PC.GTO.suggestFlopAuto
          || (args => PC.GTO.suggestFlopLikeGTO({ spot: "SRP_BTNvsBB_100bb", ...args }));
        const res = await callAuto({ hero, board });
        if (res && res.ok) {
          const pct = Math.round((res.freqs[res.action] || 0) * 100);
          return `Flop: ${res.action.toUpperCase()} • ${pct}%  ·  Bucket: ${res.bucketId.replace("__", " · ")}  ·  Perfil: ${res.feature}`;
        }
      } catch (e) { /* segue fallback */ }
    }

    if (PC.fallbackSuggestFlop) {
      const f = PC.fallbackSuggestFlop({ hero, board });
      return `Flop: ${String(f.action || "check").toUpperCase()} (fallback)`;
    }
    return "Flop: CHECK (sem pack nem fallback)";
  }

  async function updateSuggestionUI() {
    const el = ensureSuggestNode();
    const txt = await buildFlopSuggestionText();
    el.textContent = txt || "";
  }

  // Atualiza os painéis “Sua Mão” e “A Melhor Mão”
  function updateHandAndNutsUI() {
    const { hero, board } = getState();
    const flop = (board || []).slice(0, 3);

    const handCatEl = document.getElementById("handCat");
    if (handCatEl) {
      if (hero.length < 2) {
        handCatEl.textContent = "Selecione Sua Mão";
      } else if (flop.length < 3) {
        handCatEl.textContent = "Aguardando Flop…";
      } else {
        const ev = evalBest ? evalBest(hero, flop) : null;
        const name = ev && CAT_NAME ? (CAT_NAME[ev.cat] || String(ev.cat)) : "—";
        handCatEl.textContent = `Melhor mão: ${name}`;
      }
    }

    const nutsCatEl = document.getElementById("nutsCat");
    const n0 = document.getElementById("n0");
    const n1 = document.getElementById("n1");
    if (flop.length >= 3 && n0 && n1 && nutsCatEl) {
      computeTop5(flop).then(payload => {
        const first = (payload.top && payload.top[0]) || null;
        if (!first) {
          n0.textContent = ""; n1.textContent = ""; nutsCatEl.textContent = "";
          return;
        }
        const [c1, c2] = first.hand;
        n0.textContent = c1;
        n1.textContent = c2;
        nutsCatEl.textContent = first.cat || "";
      }).catch(()=>{});
    } else {
      if (n0) n0.textContent = "";
      if (n1) n1.textContent = "";
      if (nutsCatEl) nutsCatEl.textContent = "";
    }
  }

  // ========================== WIRING / DISPARO AUTOMÁTICO ==========================
  PC.notifyChanged = function notifyChanged() {
    updateSuggestionUI();
    updateHandAndNutsUI();
  };

  ["click", "keyup"].forEach(evt => {
    document.addEventListener(evt, () => {
      clearTimeout(updateSuggestionUI._t);
      updateSuggestionUI._t = setTimeout(() => {
        PC.notifyChanged && PC.notifyChanged();
      }, 50);
    }, true);
  });

  document.addEventListener("DOMContentLoaded", async () => {
    ensureSuggestNode();
    await updateSuggestionUI();
    updateHandAndNutsUI();
    wireHoverModal();
  });

  // ========================== HOVER MODAL (TOP 5) ==========================
  function wireHoverModal() {
    const el = ensureSuggestNode();
    if (el._wired) return;
    el._wired = true;

    let over = false;

    el.addEventListener("mouseenter", async () => {
      over = true;
      const { board, hero } = getState();
      const flop = (board || []).slice(0, 3);
      if (flop.length < 3) return;

      el.style.cursor = "wait";
      try {
        const payload = await computeTop5(flop);
        if (!over) return;
        el.style.cursor = "help";
        showNutsModal(el, payload, hero);
      } catch {
        el.style.cursor = "help";
      }
    });

    el.addEventListener("mouseleave", () => {
      over = false;
      hideNutsModal();
    });
  }

})(window);
