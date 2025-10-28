(() => {
  const q = (s, r = document) => r.querySelector(s);
  const qq = (s, r = document) => Array.from(r.querySelectorAll(s));

  const playerCountSelect = q('#playerCount');
  const numRoundsInput = q('#numRounds');
  const btnSimulate = q('#btnSimulate');
  const btnReset = q('#btnReset');
  const heroArea = q('#heroArea');
  const villainArea = q('#villainArea');
  const boardRow = q('#boardRow');
  const scoreArea = q('#scoreArea');
  const modal = q('#cardModal');
  const grid = q('#cardGrid');

  let selectedCard = null;
  let players = [];
  let board = [];

  // ===============================
  // Inicialização principal
  // ===============================
  function init() {
    renderCardGrid();
    renderPlayers(parseInt(playerCountSelect.value, 10));
  }

  // ===============================
  // Gera o grid de cartas do modal
  // ===============================
  function renderCardGrid() {
    grid.innerHTML = '';
    const ranks = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
    const suits = ['s','h','d','c'];
    for (const r of ranks) {
      for (const s of suits) {
        const card = document.createElement('div');
        card.className = `modal-card ${s}`;
        card.textContent = r + getSuitSymbol(s);
        card.dataset.card = r + s;
        card.addEventListener('click', () => selectCard(r, s));
        grid.appendChild(card);
      }
    }
  }

  function getSuitSymbol(s) {
    return { s: '♠', h: '♥', d: '♦', c: '♣' }[s];
  }

  // ===============================
  // Renderização de jogadores
  // ===============================
  function renderPlayers(count) {
    heroArea.innerHTML = '';
    villainArea.innerHTML = '';
    players = [];

    // Estilo automático para múltiplos vilões
    villainArea.style.display = 'flex';
    villainArea.style.flexWrap = 'wrap';
    villainArea.style.justifyContent = 'center';
    villainArea.style.gap = '12px';

    // Hero
    const hero = createPlayer('Hero', true);
    heroArea.appendChild(hero.elem);
    players.push(hero);

    // Vilões
    for (let i = 2; i <= count; i++) {
      const v = createPlayer(`Vilão ${i - 1}`, false);
      villainArea.appendChild(v.elem);
      players.push(v);
    }

    renderBoard();
  }

  function createPlayer(name, isHero = false) {
    const playerElem = document.createElement('div');
    playerElem.className = `player-row ${isHero ? 'hero' : 'villain'}`;

    const nameElem = document.createElement('div');
    nameElem.className = 'player-name' + (isHero ? ' hero' : '');
    nameElem.textContent = name;
    playerElem.appendChild(nameElem);

    const cardsWrap = document.createElement('div');
    cardsWrap.className = isHero ? 'hero-cards' : 'villain-cards';
    playerElem.appendChild(cardsWrap);

    const cards = [];
    for (let i = 0; i < 2; i++) {
      const slot = document.createElement('div');
      slot.className = 'slot';
      slot.dataset.owner = name;
      slot.addEventListener('click', () => openModal(slot));
      cardsWrap.appendChild(slot);
      cards.push(slot);
    }

    return { name, elem: playerElem, cards };
  }

  // ===============================
  // Renderiza o board (mesa)
  // ===============================
  function renderBoard() {
    boardRow.innerHTML = '';
    board = [];
    for (let i = 0; i < 5; i++) {
      const slot = document.createElement('div');
      slot.className = 'slot back';
      slot.addEventListener('click', () => openModal(slot));
      boardRow.appendChild(slot);
      board.push(slot);
    }
  }

  // ===============================
  // Modal de seleção de cartas
  // ===============================
  function openModal(slot) {
    selectedCard = slot;
    modal.style.display = 'flex';
  }

  function selectCard(r, s) {
    if (!selectedCard) return;
    const txt = `${r}${getSuitSymbol(s)}`;
    selectedCard.innerHTML = txt;
    selectedCard.classList.add('filled', s);
    modal.style.display = 'none';
    selectedCard = null;
  }

  // ===============================
  // Reset geral
  // ===============================
  function resetAll() {
    heroArea.innerHTML = '';
    villainArea.innerHTML = '';
    boardRow.innerHTML = '';
    scoreArea.innerHTML = '';
    init();
  }

  // ===============================
  // Eventos dos botões
  // ===============================
  btnReset.addEventListener('click', resetAll);

  playerCountSelect.addEventListener('change', () => {
    renderPlayers(parseInt(playerCountSelect.value, 10));
  });

  // Simulação placeholder (visual apenas)
  btnSimulate.addEventListener('click', () => {
    scoreArea.innerHTML = '';
    const item = document.createElement('div');
    item.textContent = `Simulando ${numRoundsInput.value} rodadas...`;
    item.style.color = '#22c55e';
    item.style.textAlign = 'center';
    item.style.marginTop = '8px';
    scoreArea.appendChild(item);
  });

  // ===============================
  // Inicialização inicial
  // ===============================
  init();
})();
