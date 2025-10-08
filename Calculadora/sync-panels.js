// eqadj-badge.js — overlay seguro: mostra EqAdj, BE, wet, opps. Toggle: F9
(function (g) {
  'use strict';
  const PC = g.PCALC = g.PCALC || {};
  const MW = PC.Multiway || {};

  let visible = true;

  // cria overlay
  const box = document.createElement('div');
  box.style.cssText = `
    position:fixed; right:12px; bottom:12px; z-index:99999;
    background:#0f172a; color:#e5e7eb; border:1px solid rgba(255,255,255,.12);
    border-radius:10px; padding:10px 12px; font:12px/1.35 system-ui;
    box-shadow:0 6px 20px rgba(0,0,0,.25)
  `;
  box.innerHTML = `
    <div style="opacity:.8;margin-bottom:6px">EQAJ Debug</div>
    <div id="eq-main">EqAdj —</div>
    <div id="eq-more" style="opacity:.85;margin-top:4px"></div>
    <div style="opacity:.6;margin-top:6px">F9 para ocultar</div>
  `;
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(box));

  const pct = x => (100*(+x||0)).toFixed(1)+'%';
  const clamp01 = x => Math.max(0, Math.min(1, +x||0));

  function getKnown() {
    try { return PC.getKnown ? PC.getKnown() : { hand:[], board:[] }; }
    catch { return { hand:[], board:[] }; }
  }

  function readEqMC01(){
    const st = PC.state || {};
    let eq = st.eqMC ?? st.equityMC ?? st.eqPct ?? 0;
    eq = +eq;
    if (eq > 1) eq = eq/100;
    if (eq > 0) return clamp01(eq);

    // fallback: tenta ler "Win: X%  Tie: Y%" em qualquer lugar
    const n = Array.from(document.querySelectorAll('*')).find(el =>
      /Win:\s*\d+(\.\d+)?%\s*Tie:\s*\d+(\.\d+)?%/i.test((el.textContent||''))
    );
    if (!n) return 0;
    const t = (n.textContent||'').replace(/\s+/g, ' ');
    const mW = t.match(/Win:\s*([\d.]+)%/i);
    const mT = t.match(/Tie:\s*([\d.]+)%/i);
    if (!mW || !mT) return 0;
    const win = parseFloat(mW[1])/100;
    const tie = parseFloat(mT[1])/100;
    return clamp01(win + 0.5*tie);
  }

  function tick(){
    const st = PC.state = PC.state || {};
    const kn = getKnown();
    const flop = (kn.board || []).slice(0,3);
    const opps = +((st.eqOpp ?? st.opponents ?? 2)) || 2;
    const pot = +((st.pot ?? 0)) || 0;
    const toCall = +((st.toCall ?? 0)) || 0;

    const eqMC = readEqMC01(); // 0..1
    const wet = MW.boardWetnessScore ? MW.boardWetnessScore(flop) : 0;

    // EqAdj (com fallback se não houver multiway.js)
    let eqAdj = eqMC;
    if (MW.adjustedEquity){
      eqAdj = MW.adjustedEquity(eqMC, opps, wet);
    } else {
      const multi = Math.max(0.5, 1 - 0.08*Math.max(0,opps-1));
      const wetF  = 1 - 0.5*Math.max(0, Math.min(1, wet/100));
      eqAdj = clamp01(eqMC * multi * wetF);
    }

    const be = MW.potOdds ? MW.potOdds(pot, toCall)
                          : (toCall>0 ? clamp01(toCall/(pot+toCall)) : 0);

    // grava no estado (útil para outros scripts)
    st.eqAdj = eqAdj;
    st.potOdds = be;
    st.wetScore = wet;

    // render
    const m = box.querySelector('#eq-main');
    const more = box.querySelector('#eq-more');
    m.textContent = `EqAdj ${pct(eqAdj)}  |  BE ${pct(be)}`;
    more.textContent = `EqMC ${pct(eqMC)} • wet ${wet} • opps ${opps} • pot ${pot} • call ${toCall}`;
  }

  setInterval(tick, 350);
  window.addEventListener('keydown', e => {
    if (e.key === 'F9'){
      visible = !visible;
      box.style.display = visible ? 'block' : 'none';
    }
  });
})(window);
