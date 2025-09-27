// Generated on 2025-09-27T15:25:00.400351 by ChatGPT
/* ============================================================
   INÍCIO DO MÓDULO — pcalc.gtoflop.js
   Faixa GTO-like dedicada ao FLOP (apenas com 3 cartas)
   ============================================================ */
(function (g) {
  const PC = g.PCALC || (g.PCALC = {});

  function ensureGtoLine() {
    const box = document.getElementById("pcalc-sugestao");
    if (!box) return null;
    let line = box.querySelector("#gtoLine");
    if (!line) {
      line = document.createElement("div");
      line.id = "gtoLine";
      line.className = "mut";
      line.style.margin = "6px 0";
      box.prepend(line);
    }
    return line;
  }
  const norm = c => ({ r: c?.r ?? c?.rank, s: c?.s ?? c?.suit });

  function fallbackSuggestFlop(hero, flop) {
    const ev = PC.evalBest?.(hero.concat(flop));
    if (!ev) return { action: "check", why: "sem-eval" };
    if (ev.cat >= PC.CAT.TWO) return { action: "bet33", why: "value_2pair+" };
    const all = hero.concat(flop);
    const cnt = all.reduce((m,c)=>(m[c.s]=(m[c.s]||0)+1,m),{});
    const hasFD = Object.values(cnt).some(v=>v>=4);
    const uniq = a => [...new Set(a)];
    const rs = uniq(all.map(c=>c.r)).sort((a,b)=>a-b);
    const rsA = rs.includes(14) ? uniq(rs.concat([1])).sort((a,b)=>a-b) : rs;
    const hasOESD = arr => { for (let i=0;i<arr.length-3;i++){ const w=arr.slice(i,i+4); if (new Set(w).size===4 && (w[3]-w[0]===3)) return true; } return false; };
    if (hasFD || hasOESD(rs) || hasOESD(rsA)) return { action: "bet33", why: "semi_bluff_draw" };
    return { action: "check", why: "default" };
  }

  async function renderFlopGTO() {
    const line = ensureGtoLine();
    if (!line) return;

    const st = PC.getKnown?.() || { hand:[], board:[] };
    const hand  = (st.hand  || []).map(norm);
    const board = (st.board || []).map(norm);

    // mostrar a faixa SÓ no flop e somente quando as 3 cartas já foram definidas
    if (hand.length < 2 || board.length !== 3) { line.style.display = "none"; return; }
    line.style.display = "";

    const callLike = args => PC.GTO?.suggestFlopLikeGTO?.({ spot: "SRP_BTNvsBB_100bb", ...args });

    try {
      if (callLike) {
        const res = await callLike({ hero: hand, board });
        if (res?.ok) {
          const pct = Math.round((res.freqs?.[res.action] || 0) * 100);
          const bucket  = res.bucketId?.replace?.("__"," · ") || "";
          const feature = res.feature || "";
          line.textContent = `Flop (GTO-like): ${res.action?.toUpperCase?.() || "—"} • ${pct}%  ·  ${bucket}  ·  ${feature}`;
          return;
        } else if (res && res.ok === false) {
          line.textContent = `Flop (GTO pack) indisponível: ${res.reason || "?"} · spot=${res.spot || "?"}`;
          return;
        }
      }
    } catch (e) { /* fallback abaixo */ }

    const flop = board.slice(0,3);
    const fb = fallbackSuggestFlop(hand, flop);
    line.textContent = `Flop (heurístico): ${fb.action.toUpperCase()} · ${fb.why}`;
  }

  function schedule(){ clearTimeout(renderFlopGTO._t); renderFlopGTO._t = setTimeout(renderFlopGTO, 40); }
  document.addEventListener("click", schedule, true);
  document.addEventListener("keyup", schedule, true);
  document.addEventListener("DOMContentLoaded", async () => { try { await g.PCALC?.GTO?.preload?.(); } catch(_) {} schedule(); });

  PC.__GTOFLOP__ = { renderFlopGTO };
})(window);
/* FIM DO MÓDULO — pcalc.gtoflop.js */
