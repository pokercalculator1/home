let players = [];
let board = [];
window.players = players;
window.board = board;

(() => {
  const SUITS = ['s', 'h', 'd', 'c'];
  const RANKS = [2,3,4,5,6,7,8,9,10,11,12,13,14];
  const SUIT_GLYPH = { s:'♠', h:'♥', d:'♦', c:'♣' };
  const SUIT_CLASS = { s:'s', h:'h', d:'d', c:'c' };

  const q = (s, r=document) => r.querySelector(s);
  let currentSlot = null;
  let running = false;

  function fmtRank(r) {
    return r===14?'A':r===13?'K':r===12?'Q':r===11?'J':r===10?'10':String(r);
  }

  function makeDeck() {
    const d=[];
    for (const s of SUITS) for (const r of RANKS) d.push({r,s});
    return d;
  }

  /* ======================================================
     🔹 GERA JOGADORES (Hero + Vilões)
  ====================================================== */
  function genPlayers(){
    const n = parseInt(q('#playerCount').value);
    players.length = 0;
    board.length = 0;

    q('#heroArea').innerHTML = '';
    q('#villainRow1').innerHTML = '';
    q('#villainRow2').innerHTML = '';
    q('#boardRow').innerHTML = '';
    q('#resultArea').innerHTML = '';
    q('#scoreArea').innerHTML = '';

    for(let i=0;i<n;i++){ players.push([null,null]); }

    // Hero
    const heroDiv = document.createElement('div');
    heroDiv.className = 'player-row hero';
    heroDiv.innerHTML = `
      <div class="player-name hero">Hero (Jogador 1)</div>
      <div class="slot" data-player="0" data-slot="0">+</div>
      <div class="slot" data-player="0" data-slot="1">+</div>`;
    q('#heroArea').appendChild(heroDiv);

    // Vilões
    const viloes = players.length - 1;
    if (viloes > 0) {
      const metade = Math.ceil(viloes / 2);
      const row1 = q('#villainRow1');
      const row2 = q('#villainRow2');
      for (let i = 1; i <= viloes; i++) {
        const div = document.createElement('div');
        div.className = 'player-row villain';
        div.innerHTML = `
          <div class="player-name">Vilão ${i}</div>
          <div class="slot" data-player="${i}" data-slot="0">+</div>
          <div class="slot" data-player="${i}" data-slot="1">+</div>`;
        (i <= metade ? row1 : row2).appendChild(div);
      }
    }

    if (n === 2) {
      q('#villainRow1').style.justifyContent = 'center';
      q('#villainRow2').style.display = 'none';
    } else {
      q('#villainRow1').style.display = 'flex';
      q('#villainRow2').style.display = 'flex';
    }

    document.querySelectorAll('.slot').forEach(el=>{
      el.onclick = () => openCardSelector(el);
    });

    renderBoard(); // mostra 5 cartas viradas logo no início
  }

  /* ======================================================
     🂠 MODAL DE CARTAS (com bloqueio de duplicadas)
  ====================================================== */
  function openCardSelector(el){
    currentSlot = el;
    const modal = q('#cardModal');
    const grid = q('#cardGrid');
    grid.innerHTML = '';

    const deck = makeDeck();
    const usadas = new Set();

    // cartas já escolhidas
    players.flat().forEach(c=>{
      if(c) usadas.add(`${c.r}${c.s}`);
    });
    board.forEach(c=>{
      if(c) usadas.add(`${c.r}${c.s}`);
    });

    for(const c of deck){
      const rank = fmtRank(c.r);
      const div = document.createElement('div');
      div.className = `modal-card ${SUIT_CLASS[c.s]}`;
      div.innerHTML = `<div>${rank}</div><div>${SUIT_GLYPH[c.s]}</div>`;
      const id = `${c.r}${c.s}`;
      if(usadas.has(id)){
        div.classList.add('used');
      } else {
        div.onclick = () => { selectCard(c); modal.style.display = 'none'; };
      }
      grid.appendChild(div);
    }

    modal.style.display = 'flex';
    modal.onclick = e => { if(e.target.id === 'cardModal') modal.style.display = 'none'; };
  }

  function selectCard(c){
    if(!currentSlot) return;
    const p = parseInt(currentSlot.dataset.player);
    const s = parseInt(currentSlot.dataset.slot);
    players[p][s] = c;
    currentSlot.classList.add('filled');
    currentSlot.innerHTML = `<div class="${SUIT_CLASS[c.s]}" style="text-align:center">
      <div style="font-weight:700;font-size:18px">${fmtRank(c.r)}</div>
      <div style="font-size:18px">${SUIT_GLYPH[c.s]}</div>
    </div>`;
  }

  /* ======================================================
     🧮 SIMULAÇÃO AUTOMÁTICA
  ====================================================== */
  async function autoSimular(qtd) {
    if (running) return;
    running = true;
    if (window.MultiSim && window.MultiSim.setRounds) window.MultiSim.setRounds(qtd);

    for (let rodada = 1; rodada <= qtd; rodada++) {
      await rodadaCompleta(rodada);
      await delay(1000);
      if (!running) break;
    }
    running = false;
  }

  async function rodadaCompleta(n){
    const deck = makeDeck();

    // remove cartas já escolhidas
    players.flat().forEach(c=>{
      if(!c) return;
      const idx = deck.findIndex(x=>x.r===c.r && x.s===c.s);
      if(idx>=0) deck.splice(idx,1);
    });

    board.length = 0;
    renderBoard();

    // Flop
    await delay(1000);
    for(let i=0;i<3;i++) board.push(deck.splice(Math.floor(Math.random()*deck.length),1)[0]);
    renderBoard();

    // Turn
    await delay(500);
    board.push(deck.splice(Math.floor(Math.random()*deck.length),1)[0]);
    renderBoard();

    // River
    await delay(500);
    board.push(deck.splice(Math.floor(Math.random()*deck.length),1)[0]);
    renderBoard();

    // Envia pro módulo de resultado
    if(window.MultiSim && typeof window.MultiSim.playRound==="function"){
      window.MultiSim.playRound(players, board);
    }
  }

  const delay = (ms)=>new Promise(res=>setTimeout(res,ms));

  /* ======================================================
     🎴 RENDERIZAÇÃO DO BOARD (fixo + viradas individuais)
  ====================================================== */
  function renderBoard(){
    const row = q('#boardRow');

    // cria os 5 slots fixos
    if (row.children.length === 0) {
      for (let i = 0; i < 5; i++) {
        const div = document.createElement('div');
        div.className = 'slot back';
        row.appendChild(div);
      }
    }

    // atualiza apenas as novas cartas
    for (let i = 0; i < 5; i++) {
      const slot = row.children[i];
      const c = board[i];

      if (c && !slot.classList.contains('filled')) {
        slot.className = 'slot filled flip';
        slot.innerHTML = `
          <div class="${SUIT_CLASS[c.s]}" style="text-align:center">
            <div style="font-weight:700;font-size:18px">${fmtRank(c.r)}</div>
            <div style="font-size:18px">${SUIT_GLYPH[c.s]}</div>
          </div>`;
      } else if (!c && !slot.classList.contains('back')) {
        slot.className = 'slot back';
        slot.innerHTML = '';
      }
    }
  }

  /* ======================================================
     🔁 RESET GERAL
  ====================================================== */
  function resetSimulador(){
    running = false;
    board.length = 0;
    players.length = 0;
    q("#heroArea").innerHTML = "";
    q("#villainRow1").innerHTML = "";
    q("#villainRow2").innerHTML = "";
    q("#boardRow").innerHTML = "";
    q("#resultArea").innerHTML = "";
    q("#scoreArea").innerHTML = "";
    if(window.MultiSim && window.MultiSim.resetPlacar)
      window.MultiSim.resetPlacar();
  }

  /* ======================================================
     ⚙️ EVENTOS
  ====================================================== */
  q('#initPlayers').onclick = genPlayers;
  q('#btnAuto').onclick = () => {
    const qtd = parseInt(q('#numRounds').value);
    if (!players.length) { alert("Gere jogadores antes!"); return; }
    if (players.some(p=>!p[0] || !p[1])) { alert("Todos os jogadores precisam ter cartas!"); return; }
    autoSimular(qtd);
  };
  q('#btnReset').onclick = resetSimulador;
})();
