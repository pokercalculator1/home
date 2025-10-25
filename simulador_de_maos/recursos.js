(() => {
  const q = (s, r=document) => r.querySelector(s);
  const PC = window.PCALC;
  if (!PC) { console.error("pcalc-core.js não carregado."); return; }

  let placar = {};
  let totalRounds = 0;
  let currentRound = 0;

  // === Renderiza o placar + contador ===
  function renderPlacar(players) {
    const s = q("#scoreArea");
    if (!s) return;
    let html = "";
    players.forEach((_, i) => {
      const nome = i === 0 ? "Hero" : `Vilão ${i}`;
      const classe = i === 0 ? "score-item hero" : "score-item";
      html += `
        <div class="${classe}">
          <div class="score-name">${nome}</div>
          <div class="score-points">${placar[i] || 0}</div>
        </div>`;
    });
    const restantes = Math.max(totalRounds - currentRound, 0);
    html += `
      <div class="score-item counter">
        <div class="score-name">Rodadas restantes</div>
        <div class="score-points">${restantes > 0 ? restantes : "🏁"}</div>
      </div>`;
    s.innerHTML = html;
  }

  // === Resultado e placar ===
  function showResult(text) {
    const r = q("#resultArea");
    if (r) {
      r.innerHTML = `
        <div style="text-align:center;margin-top:10px;">
          <div style="font-size:16px;font-weight:bold;color:#22c55e;">${text}</div>
        </div>`;
    }
  }

  function playRound(players, board) {
    if (!players?.length || board.length !== 5) return;
    currentRound++;

    const results = [];
    players.forEach((hand, i) => {
      if (!hand[0] || !hand[1]) return;
      const cards = [...hand, ...board];
      const evalRes = PC.evalBest(cards);
      results.push({ i, evalRes });
    });
    if (results.length === 0) return;

    results.sort((a,b)=>PC.cmpEval(b.evalRes,a.evalRes));
    const best = results[0].evalRes;
    const winners = results.filter(r=>PC.cmpEval(r.evalRes,best)===0).map(r=>r.i);
    winners.forEach(w=>(placar[w]=(placar[w]||0)+1));

    const catName = PC.CAT_NAME[best.cat] || "Desconhecida";
    const msg = winners.length>1
      ? `Empate (${catName})`
      : `${winners[0]===0?"Hero":("Vilão "+winners[0])} venceu com ${catName}!`;

    showResult(msg);
    renderPlacar(players);

    if (currentRound === totalRounds) {
      setTimeout(() => showPodium(players), 800);
    }
  }

  function resetPlacar() {
    placar = {}; totalRounds = 0; currentRound = 0;
    q("#scoreArea")?.replaceChildren();
    q("#resultArea")?.replaceChildren();
    q("#podiumModal")?.remove();
  }

  window.MultiSim = { playRound, resetPlacar, setRounds:n=>totalRounds=n };

  // === Pódio Final Corrigido ===
  function showPodium(players) {
    const modal = document.createElement("div");
    modal.id = "podiumModal";
    Object.assign(modal.style,{
      position:"fixed",inset:"0",zIndex:"99999",
      display:"flex",alignItems:"center",justifyContent:"center",
      background:"rgba(0,0,0,0.8)",animation:"fadeIn .3s ease"
    });

    const box = document.createElement("div");
    Object.assign(box.style,{
      background:"#111827",border:"1px solid #334155",borderRadius:"14px",
      width:"min(560px,90vw)",padding:"20px 26px",textAlign:"center",
      boxShadow:"0 0 30px rgba(250,204,21,0.25)",
      transform:"scale(0.9)",opacity:"0",transition:"all .4s ease"
    });
    box.innerHTML = `
      <h2 style="color:#facc15;margin-bottom:14px;">🏆 Resultado Final</h2>
      <div id="podiumList"></div>
      <button id="closePodium" style="
        background:#22c55e;color:#000;border:none;
        padding:8px 14px;border-radius:8px;font-weight:bold;cursor:pointer;">
        Fechar
      </button>
    `;
    modal.appendChild(box);
    document.body.appendChild(modal);

    const arr = Object.entries(placar).map(([i,p])=>({i:+i,p}));
    arr.sort((a,b)=>b.p-a.p);
    const list = box.querySelector("#podiumList");
    arr.forEach((x,idx)=>{
      const rank = idx===0?"🥇":idx===1?"🥈":idx===2?"🥉":`${idx+1}º`;
      const nome = x.i===0?"Hero":`Vilão ${x.i}`;
      const item = document.createElement("div");
      Object.assign(item.style,{
        display:"grid",gridTemplateColumns:"56px 1fr auto",alignItems:"center",
        background:"#0f172a",border:"1px solid #334155",borderRadius:"10px",
        padding:"10px 12px",margin:"6px 0",opacity:"0",transform:"translateY(10px)",
        transition:"all .4s ease"
      });
      if(idx===0)item.style.boxShadow="0 0 20px rgba(250,204,21,0.5)";
      item.innerHTML = `
        <div style="font-size:24px;">${rank}</div>
        <div style="color:#e5e7eb;font-weight:bold;text-align:left;">${nome}</div>
        <div style="color:#facc15;font-weight:bold;text-align:right;">${x.p} vitória${x.p===1?'':'s'}</div>
      `;
      list.appendChild(item);
    });

    requestAnimationFrame(()=>{
      box.style.transform="scale(1)";
      box.style.opacity="1";
      list.querySelectorAll("div").forEach((el,i)=>{
        setTimeout(()=>{
          el.style.opacity="1";
          el.style.transform="translateY(0)";
        },i*120);
      });
    });

    box.querySelector("#closePodium").onclick=()=>modal.remove();
    modal.onclick=e=>{if(e.target===modal)modal.remove();};
  }
})();
