// app.js — escolha manual de cartas + equity dinâmica + clique garantido nos slots

let players = [];
let board = []; // [0..4]
const usedCards = new Set();

const ranks = "23456789TJQKA";
const suits = ["s","h","d","c"];

let currentPick = null; // { type: 'player'|'board', playerIndex?, cardIndex?, boardIndex? }

document.addEventListener("DOMContentLoaded", () => {
  const playerCountSel = document.getElementById("numPlayers");
  const btnGenerate     = document.getElementById("generate");
  const btnFlop         = document.getElementById("flop");
  const btnTurn         = document.getElementById("turn");
  const btnRiver        = document.getElementById("river");
  const btnReset        = document.getElementById("reset");

  const cardModal = document.getElementById("cardModal");
  const cardGrid  = document.getElementById("cardGrid");

  if (!cardModal || !cardGrid) {
    console.error("❌ Modal não encontrado no HTML. Adicione <div id=\"cardModal\"><div id=\"cardGrid\"></div></div> antes do </body>.");
  }

  function all52() {
    const list = [];
    for (const r of ranks) for (const s of suits) list.push(r + s);
    return list;
  }
  function codeToPretty(code) {
    const r = code[0];
    const s = code[1];
    const sym = s === "s" ? "♠" : s === "h" ? "♥" : s === "d" ? "♦" : "♣";
    return `<span class="${s}">${r}${sym}</span>`;
  }

  function openModal(pick) {
    currentPick = pick;
    buildCardGrid();
    cardModal.style.display = "flex";
  }
  function closeModal() {
    cardModal.style.display = "none";
    currentPick = null;
  }
  function buildCardGrid() {
    cardGrid.innerHTML = "";
    const deckAll = all52();
    deckAll.forEach(code => {
      const cell = document.createElement("div");
      cell.className = "modal-card";
      cell.innerHTML = codeToPretty(code);
      if (usedCards.has(code)) cell.classList.add("used");
      cell.addEventListener("click", () => {
        if (cell.classList.contains("used")) return;
        applyPick(code);
        closeModal();
      });
      cardGrid.appendChild(cell);
    });
  }

  function applyPick(code) {
    if (!currentPick) return;

    if (currentPick.type === "player") {
      const p = players[currentPick.playerIndex];
      const idx = currentPick.cardIndex;
      const prev = p.hand[idx];
      if (prev) usedCards.delete(prev);
      p.hand[idx] = code;
      usedCards.add(code);
      renderPlayers();
      updateEquityUI();
    } else if (currentPick.type === "board") {
      const bi = currentPick.boardIndex;
      const prev = board[bi];
      if (prev) usedCards.delete(prev);
      board[bi] = code;
      usedCards.add(code);
      renderBoard();
      updateEquityUI();
    }
  }

  function generatePlayers() {
    const heroArea    = document.getElementById("heroArea");
    const villainArea = document.getElementById("villainArea");
    const boardRow    = document.getElementById("boardRow");
    if (!heroArea || !villainArea || !boardRow) {
      console.error("❌ Áreas não encontradas (#heroArea, #villainArea, #boardRow). Verifique o HTML.");
      return;
    }

    players = [];
    board = [];
    usedCards.clear();
    heroArea.innerHTML = "";
    villainArea.innerHTML = "";
    boardRow.innerHTML = "";
    const score = document.getElementById("scoreArea");
    if (score) score.innerHTML = "";

    const n = Math.max(2, Math.min(9, parseInt(playerCountSel.value) || 2));
    for (let i = 0; i < n; i++) {
      players.push({ name: i === 0 ? "Hero" : `Vilão ${i}`, hand: [null, null], equity: "0.0" });
    }
    renderPlayers();
    renderBoard();
    updateEquityUI();
  }

  function renderPlayers() {
    const heroArea    = document.getElementById("heroArea");
    const villainArea = document.getElementById("villainArea");
    heroArea.innerHTML = "";
    villainArea.innerHTML = "";

    players.forEach((p, i) => {
      const row = document.createElement("div");
      row.className = "player-row" + (i === 0 ? " hero" : " villain");

      const name = document.createElement("div");
      name.className = "player-name" + (i === 0 ? " hero" : "");
      name.textContent = p.name;

      const cardsDiv = document.createElement("div");
      cardsDiv.className = "cardsline";

      p.hand.forEach((card, cardIdx) => {
        const slot = document.createElement("div");
        slot.className = "slot " + (card ? "filled" : "back");
        slot.dataset.player = String(i);
        slot.dataset.cardindex = String(cardIdx);
        slot.dataset.type = "player";
        if (card) slot.innerHTML = codeToPretty(card);
        cardsDiv.appendChild(slot);
      });

      const eqDiv = document.createElement("div");
      eqDiv.className = "equity-value";
      eqDiv.textContent = p.equity ? `${p.equity}%` : "";

      row.appendChild(name);
      row.appendChild(cardsDiv);
      row.appendChild(eqDiv);

      if (i === 0) heroArea.appendChild(row);
      else villainArea.appendChild(row);
    });

    // diagnóstico
    const totalSlots = document.querySelectorAll('.slot[data-type="player"]').length;
    console.log(`✅ Slots de player renderizados: ${totalSlots}`);
  }

  function renderBoard() {
    const boardRow = document.getElementById("boardRow");
    boardRow.innerHTML = "";
    for (let i = 0; i < 5; i++) {
      const code = board[i] || null;
      const slot = document.createElement("div");
      slot.className = "slot " + (code ? "filled" : "back");
      slot.dataset.type = "board";
      slot.dataset.boardindex = String(i);
      if (code) slot.innerHTML = codeToPretty(code);
      boardRow.appendChild(slot);
    }
  }

  function availableDeck() {
    const all = all52();
    return all.filter(c => !usedCards.has(c));
  }
  function drawRandomAvailable() {
    const avail = availableDeck();
    if (avail.length === 0) return null;
    return avail[Math.floor(Math.random() * avail.length)];
  }

  function dealFlop() {
    for (let i = 0; i < 3; i++) {
      if (!board[i]) {
        const c = drawRandomAvailable();
        if (!c) break;
        board[i] = c; usedCards.add(c);
      }
    }
    renderBoard();
    updateEquityUI();
  }
  function dealTurn() {
    if (!board[0] || !board[1] || !board[2]) return;
    if (!board[3]) {
      const c = drawRandomAvailable();
      if (c) { board[3] = c; usedCards.add(c); }
    }
    renderBoard();
    updateEquityUI();
  }
  function dealRiver() {
    if (!board[0] || !board[1] || !board[2] || !board[3]) return;
    if (!board[4]) {
      const c = drawRandomAvailable();
      if (c) { board[4] = c; usedCards.add(c); }
    }
    renderBoard();
    updateEquityUI();
  }

  function resetAll() {
    players = [];
    board = [];
    usedCards.clear();
    const heroArea    = document.getElementById("heroArea");
    const villainArea = document.getElementById("villainArea");
    const boardRow    = document.getElementById("boardRow");
    if (heroArea) heroArea.innerHTML = "";
    if (villainArea) villainArea.innerHTML = "";
    if (boardRow) boardRow.innerHTML = "";
    const score = document.getElementById("scoreArea");
    if (score) score.innerHTML = "";
  }

  // ======= Equity =======
  function evaluateHand(cards) {
    const ranksOrder = "23456789TJQKA";
    const sArr = cards.map(c => c[1]);
    const rArr = cards.map(c => c[0]);

    const counts = rArr.reduce((acc, r) => (acc[r] = (acc[r] || 0) + 1, acc), {});
    const isFlush = sArr.length >= 5 && sArr.some(s => sArr.filter(x => x === s).length >= 5);

    const nums = rArr.map(r => ranksOrder.indexOf(r)).sort((a,b)=>a-b);
    const uniq = [...new Set(nums)];
    let isStraight = false;
    if (uniq.length >= 5) {
      for (let i = 0; i <= uniq.length - 5; i++) {
        if (uniq[i+4] - uniq[i] === 4) { isStraight = true; break; }
      }
      if (!isStraight && uniq.includes(12)) {
        const wheel = [0,1,2,3,12];
        if (wheel.every(v => uniq.includes(v))) isStraight = true;
      }
    }

    const vals = Object.values(counts);
    const pairs  = vals.filter(v => v === 2).length;
    const threes = vals.filter(v => v === 3).length;
    const fours  = vals.filter(v => v === 4).length;

    let strength = 0;
    if (isFlush && isStraight) strength = 900;
    else if (fours)            strength = 800;
    else if (threes && pairs)  strength = 700;
    else if (isFlush)          strength = 600;
    else if (isStraight)       strength = 500;
    else if (threes)           strength = 400;
    else if (pairs >= 2)       strength = 300;
    else if (pairs === 1)      strength = 200;
    else                       strength = 100;

    const high = Math.max(...nums, 0);
    return strength + high;
  }

  function updateEquityUI() {
    const readyPlayers = players.filter(p => p.hand[0] && p.hand[1]).length;
    const rows = document.querySelectorAll(".player-row");

    if (readyPlayers < 2) {
      rows.forEach(el => {
        const eq = el.querySelector(".equity-value");
        if (eq) eq.textContent = "";
        el.classList.remove("winner-glow");
      });
      return;
    }

    const strengths = players.map(p => {
      if (!p.hand[0] || !p.hand[1]) return 0;
      const cards = [...p.hand, ...board.filter(Boolean)];
      if (cards.length < 5) {
        const base = evaluateHand(cards);
        return base + Math.random()*5;
      }
      return evaluateHand(cards);
    });

    const maxStrength = Math.max(...strengths);
    const riverDone = board.filter(Boolean).length === 5;

    if (riverDone) {
      const winnersIdx = strengths.reduce((acc, v, i) => v === maxStrength ? (acc.push(i), acc) : acc, []);
      players.forEach((p,i) => p.equity = winnersIdx.includes(i) ? (100 / winnersIdx.length).toFixed(1) : "0.0");
    } else {
      const sum = strengths.reduce((a,b)=>a+b,0) || 1;
      players.forEach((p,i) => p.equity = ((strengths[i] / sum) * 100).toFixed(1));
    }

    const maxEq = Math.max(...players.map(p => parseFloat(p.equity)));
    players.forEach((p,i) => {
      const row = rows[i];
      const eqDiv = row.querySelector(".equity-value");
      if (eqDiv) eqDiv.textContent = `${p.equity}%`;
      if (parseFloat(p.equity) === maxEq && parseFloat(p.equity) > 0) {
        row.classList.add("winner-glow");
      } else {
        row.classList.remove("winner-glow");
      }
    });
  }

  // ======= Delegação global de clique (garantia) =======
  document.addEventListener("click", (e) => {
    const slot = e.target.closest(".slot");
    if (!slot) return;

    // Se for slot de player
    if (slot.dataset.type === "player") {
      const pi = parseInt(slot.dataset.player, 10);
      const ci = parseInt(slot.dataset.cardindex, 10);
      if (Number.isInteger(pi) && Number.isInteger(ci)) {
        openModal({ type: "player", playerIndex: pi, cardIndex: ci });
      }
      return;
    }

    // Se for slot do board
    if (slot.dataset.type === "board") {
      const bi = parseInt(slot.dataset.boardindex, 10);
      if (Number.isInteger(bi)) {
        openModal({ type: "board", boardIndex: bi });
      }
      return;
    }
  });

  // limpar carta com botão direito
  document.addEventListener("contextmenu", (e) => {
    const slot = e.target.closest(".slot");
    if (!slot) return;
    e.preventDefault();

    if (slot.dataset.type === "player") {
      const pi = parseInt(slot.dataset.player, 10);
      const ci = parseInt(slot.dataset.cardindex, 10);
      const prev = players[pi]?.hand?.[ci] || null;
      if (prev) {
        usedCards.delete(prev);
        players[pi].hand[ci] = null;
        renderPlayers();
        updateEquityUI();
      }
    } else if (slot.dataset.type === "board") {
      const bi = parseInt(slot.dataset.boardindex, 10);
      const prev = board[bi] || null;
      if (prev) {
        usedCards.delete(prev);
        board[bi] = null;
        renderBoard();
        updateEquityUI();
      }
    }
  });

  // Fechar modal ao clicar fora
  cardModal?.addEventListener("click", (e) => {
    if (e.target === cardModal) closeModal();
  });

  // Botões
  btnGenerate?.addEventListener("click", generatePlayers);
  btnFlop?.addEventListener("click", dealFlop);
  btnTurn?.addEventListener("click", dealTurn);
  btnRiver?.addEventListener("click", dealRiver);
  btnReset?.addEventListener("click", resetAll);

  console.log("✅ App iniciado. Clique em 'Gerar' para criar os slots e depois clique nos slots para abrir o baralho.");
});
