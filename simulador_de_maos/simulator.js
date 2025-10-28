let players = [];
let board = [];
window.players = players;
window.board = board;

(() => {
  const SUITS = ['s', 'h', 'd', 'c'];
  const RANKS = [2,3,4,5,6,7,8,9,10,11,12,13,14];
  const SUIT_GLYPH = { s:'♠', h:'♥', d:'♦', c:'♣' };
  const SUIT_CLASS = { s:'s', h:'h', d:'♦', c:'c' };
  const q = (s, r=document) => r.querySelector(s);

  let currentSlot = null;
  let running = false;
  const fmtRank = r => r===14?'A':r===13?'K':r===12?'Q':r===11?'J':r===10?'10':String(r);
  const makeDeck = () => { const d=[]; for (const s of SUITS) for (const r of RANKS) d.push({r,s}); return d; };
  const delay = ms => new Promise(r => setTimeout(r, ms));

  // ======== NOVO: controle de vitórias =========
  const winCounts = [];

  // ======== PÓDIO (copiado do turbo.js) =========
  function ensurePodiumStyles() {
    if (q('#podiumModalStyle')) return;
    const css = document.createElement('style');
    css.id = 'podiumModalStyle';
    css.textContent = `
      #podiumModal { position: fixed; inset: 0; display: none; z-index: 99999; }
      #podiumModal .podium-back {
        position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
        background: rgba(0,0,0,0.80); animation: pm-fade .35s ease;
      }
      #podiumModal .podium-content {
        background: #111827; border: 1px solid #334155; border-radius: 14px; width: min(560px, 90vw);
        padding: 18px 22px; box-shadow: 0 0 30px rgba(250,204,21,0.25);
        animation: pm-pop .38s ease;
      }
      #podiumModal h2 { color: #facc15; text-align: center; margin: 0 0 10px; }
      #podiumList { display: flex; flex-direction: column; gap: 8px; margin: 12px 0 16px; }
      .podium-item { display: grid; grid-template-columns: 56px 1fr auto; align-items: center;
        gap: 10px; background: #0f172a; border: 1px solid #334155; border-radius: 10px; padding: 10px 12px;
        opacity: 0; transform: translateY(8px); animation: pm-slide .4s ease forwards;
      }
      .podium-item.first { box-shadow: 0 0 18px rgba(250,204,21,0.20); }
      .podium-rank { font-size: 24px; text-align: center; }
      .podium-name { font-weight: 700; color: #e5e7eb; }
      .podium-score { font-weight: 700; color: #facc15; }
      #closePodium.btn.primary {
        background: #22c55e; color: #000; border: none; padding: 8px 14px;
        border-radius: 8px; font-weight: 700; cursor: pointer; width: 100%;
      }
      @keyframes pm-fade { from{opacity:0} to{opacity:1} }
      @keyframes pm-pop { from{transform:scale(.97); opacity:0} to{transform:scale(1); opacity:1} }
      @keyframes pm-slide { to{opacity:1; transform:translateY(0)} }
    `;
    document.head.appendChild(css);
  }

  function showPodium() {
    ensurePodiumStyles();
    let modal = q('#podiumModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'podiumModal';
      modal.innerHTML = `
        <div class="podium-back">
          <div class="podium-content">
            <h2>🏆 Resultado Parcial</h2>
            <div id="podiumList"></div>
            <button id="closePodium" class="btn primary">Fechar</button>
          </div>
        </div>`;
      document.body.appendChild(modal);
      modal.querySelector('#closePodium').onclick = () => modal.remove();
      modal.addEventListener('click', e => { if (e.target.classList.contains('podium-back')) modal.remove(); });
    }
    modal.style.display = 'block';

    const arr = winCounts.map((v, i) => ({i, v})).sort((a,b) => b.v - a.v);
    const list = modal.querySelector('#podiumList');
    list.innerHTML = arr.map((x, idx) => {
      const rank = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx+1}º`;
      const name = x.i === 0 ? 'Hero' : `Vilão ${x.i}`;
      return `
        <div class="podium-item ${idx===0?'first':''}" style="animation-delay:${idx*0.08}s">
          <div class="podium-rank">${rank}</div>
          <div class="podium-name">${name}</div>
          <div class="podium-score">${x.v} vitória${x.v===1?'':'s'}</div>
        </div>`;
    }).join('');
  }

  // ======== Geração de jogadores =========
  function genPlayers() {
    const n = parseInt(q('#playerCount').value);
    players.length = 0;
    board.length = 0;
    winCounts.length = 0;

    ['#heroArea','#villainRow1','#villainRow2','#boardRow','#resultArea','#scoreArea']
      .forEach(id => q(id)?.replaceChildren());

    players.push([null,null]);
    winCounts.push(0);

    const hero = document.createElement('div');
    hero.className = 'player-row hero';
    hero.innerHTML = `
      <div class="player-name hero">Hero</div>
      <div class="slot" data-player="0" data-slot="0">+</div>
      <div class="slot" data-player="0" data-slot="1">+</div>`;
    q('#heroArea').appendChild(hero);

    const viloes = n - 1;
    if (viloes > 0) {
      const metade = Math.ceil(viloes / 2);
      const row1 = q('#villainRow1');
      const row2 = q('#villainRow2');
      row1.style.display = row2.style.display = 'flex';
      row1.style.flexWrap = row2.style.flexWrap = 'wrap';
      row1.style.justifyContent = row2.style.justifyContent = 'center';
      for (let i = 1; i <= viloes; i++) {
        const div = document.createElement('div');
        div.className = 'player-row villain';
        div.innerHTML = `
          <div class="player-name">Vilão ${i}</div>
          <div class="slot" data-player="${i}" data-slot="0">+</div>
          <div class="slot" data-player="${i}" data-slot="1">+</div>`;
        (i <= metade ? row1 : row2).appendChild(div);
        players.push([null,null]);
        winCounts.push(0);
      }
    }
    document.querySelectorAll('.slot').forEach(el => el.onclick = () => openCardSelector(el));
    renderBoard(true);
  }

  function openCardSelector(el) { /* igual ao seu código original */ }
  function selectCard(c) { /* igual ao seu código original */ }
  function renderBoard(initial = false) { /* igual ao seu código original */ }

  // ======== Simulação Automática ========
  async function autoSimular(qtd) {
    if (running) return;
    running = true;

    for (let i = 1; i <= qtd; i++) {
      await rodadaCompleta(i, qtd);
      await delay(800);
      if (!running) break;
    }
    running = false;
  }

  async function rodadaCompleta(numRodada, total) {
    const deck = makeDeck();
    players.flat().forEach(c => { if (c) { const idx = deck.findIndex(x => x.r===c.r && x.s===c.s); if (idx>=0) deck.splice(idx,1);} });
    board.length = 0; renderBoard();

    // flop, turn, river
    for (const count of [3,1,1]) {
      for (let i=0;i<count;i++) board.push(deck.splice((Math.random()*deck.length)|0,1)[0]);
      renderBoard(); await delay(500);
    }

    await delay(200);
    if (window.MultiSim?.playRound) {
      try {
        const winnerIdx = window.MultiSim.playRound(players, board);
        if (typeof winnerIdx === 'number') {
          winCounts[winnerIdx] = (winCounts[winnerIdx] || 0) + 1;
          showPodium(); // Atualiza pódio a cada showdown
        }
      } catch(e){ console.warn("Erro playRound", e); }
    }
  }

  function resetSimulador() {
    running = false;
    board.length = 0;
    players.length = 0;
    winCounts.length = 0;
    ['#heroArea','#villainRow1','#villainRow2','#boardRow','#resultArea','#scoreArea']
      .forEach(id => q(id)?.replaceChildren());
  }

  // ======== Botões ========
  q('#initPlayers').onclick = genPlayers;
  q('#btnAuto').onclick = () => {
    const qtd = parseInt(q('#numRounds').value)||10;
    if (!players.length) return alert("Gere jogadores antes!");
    if (players.some(p=>!p[0]||!p[1])) return alert("Todos os jogadores precisam ter cartas!");
    autoSimular(qtd);
  };
  q('#btnReset').onclick = resetSimulador;
})();
