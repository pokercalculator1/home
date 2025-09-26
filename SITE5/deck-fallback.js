// deck-fallback.js — monta o grid de cartas e liga nos slots/estado
(function () {
  "use strict";
  // Se já existe um deck renderizado, não faz nada
  const deckMount = document.getElementById("deck");
  if (!deckMount) return;
  if (deckMount.childElementCount > 0) return;

  // ===== helpers =====
  const SUITS = ["s","h","d","c"];
  const RNAME = {14:"A",13:"K",12:"Q",11:"J",10:"T",9:"9",8:"8",7:"7",6:"6",5:"5",4:"4",3:"3",2:"2"};
  const sym = (r)=>RNAME[r]||String(r);
  const toStr = (c)=> sym(c.r) + c.s;
  const fromStr = (txt)=> ({ r: "23456789TJQKA".indexOf(txt[0])>=0
                                 ? ({T:10,J:11,Q:12,K:13,A:14}[txt[0]] || parseInt(txt[0],10))
                                 : parseInt(txt,10),
                              s: txt.slice(-1) });
  const SLOT_ORDER = ["h0","h1","b0","b1","b2","b3","b4"];

  // ===== estilo mínimo (se faltar CSS) =====
  (function injectCSS(){
    if (document.getElementById("deck-fb-css")) return;
    const css = `
    .deckfb-grid{display:grid;grid-template-columns:repeat(13, minmax(32px,1fr));gap:6px}
    .deckfb-card{padding:6px 4px;border-radius:6px;border:1px solid #30363d;background:#161b22;color:#e6edf3;
      text-align:center;font:600 12px system-ui;cursor:pointer;user-select:none}
    .deckfb-card--used{opacity:.35;pointer-events:none}
    .slot{min-width:40px;min-height:24px;display:inline-flex;align-items:center;justify-content:center;
      border:1px dashed #30363d;border-radius:6px;background:#0d1117;color:#e6edf3;font:600 12px system-ui}
    `;
    const st = document.createElement("style");
    st.id = "deck-fb-css";
    st.textContent = css;
    document.head.appendChild(st);
  })();

  // ===== estado local: qual carta está em qual slot =====
  const selected = new Map();   // "As" -> "h0"
  const slotCard = new Map();   // "h0" -> "As"

  // ===== deck completo =====
  const fullDeck = [];
  for (let r=14;r>=2;r--) for (const s of SUITS) fullDeck.push({r,s});

  // ===== DOM: cria grid =====
  const grid = document.createElement("div");
  grid.className = "deckfb-grid";
  deckMount.appendChild(grid);

  // cria botões das cartas
  for (const c of fullDeck) {
    const btn = document.createElement("div");
    btn.className = "deckfb-card";
    btn.dataset.r = String(c.r);
    btn.dataset.s = c.s;
    btn.textContent = toStr(c);
    btn.addEventListener("click", () => onPickCard(btn));
    grid.appendChild(btn);
  }

  // ===== slots util =====
  function nextEmptySlot(){
    for (const id of SLOT_ORDER){
      if (!slotCard.get(id)) return id;
    }
    return null;
  }
  function freeCard(cardStr){
    const slot = selected.get(cardStr);
    if (!slot) return;
    selected.delete(cardStr);
    slotCard.delete(slot);
  }
  function setSlot(slotId, cardStr){
    // Se slot já tinha carta, libera
    const old = slotCard.get(slotId);
    if (old) selected.delete(old);
    slotCard.set(slotId, cardStr);
    selected.set(cardStr, slotId);
  }
  function renderSlots(){
    // escreve o texto nos elementos #h0..#b4
    for (const id of SLOT_ORDER){
      const el = document.getElementById(id);
      if (!el) continue;
      el.textContent = slotCard.get(id) || "";
    }
    // colore cartas usadas
    document.querySelectorAll(".deckfb-card").forEach(btn=>{
      const str = btn.textContent;
      btn.classList.toggle("deckfb-card--used", selected.has(str));
    });
    // sincroniza PCALC.state e dispara
    syncState();
  }

  // ===== sincronia com PCALC.state =====
  function syncState(){
    const PC = window.PCALC || (window.PCALC = {});
    // hero
    const hero = [];
    const h0 = slotCard.get("h0"), h1 = slotCard.get("h1");
    if (h0) hero.push(fromStr(h0));
    if (h1) hero.push(fromStr(h1));
    // board
    const board = [];
    for (const id of ["b0","b1","b2","b3","b4"]){
      const cs = slotCard.get(id);
      if (cs) board.push(fromStr(cs));
    }
    PC.state = Object.assign({}, PC.state, { hero, board });
    (PC.notifyChanged && typeof PC.notifyChanged==="function") && PC.notifyChanged();
  }

  // ===== clique em carta =====
  function onPickCard(btn){
    const str = btn.textContent; // ex: "As"
    // Se já está selecionada, desmarca (remove do slot)
    if (selected.has(str)) {
      const slot = selected.get(str);
      selected.delete(str);
      slotCard.delete(slot);
      renderSlots();
      return;
    }
    // senão, coloca no próximo slot vazio
    const dst = nextEmptySlot();
    if (!dst) return; // todos preenchidos
    setSlot(dst, str);
    renderSlots();
  }

  // ===== botões: sortear e limpar =====
  function randFrom(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
  function remaining() {
    const used = new Set(selected.keys());
    return fullDeck.filter(c => !used.has(toStr(c)));
  }
  function sortearFlop(){
    // mantém a mão se já houver (h0,h1), sorteia b0..b2 do restante
    for (const id of ["b0","b1","b2"]) slotCard.delete(id);
    const rest = remaining();
    // evita sortear cartas repetidas: escolhe 3 distintas
    let picks = [];
    while (picks.length < 3) {
      const c = randFrom(rest);
      const s = toStr(c);
      if (selected.has(s) || picks.includes(s)) continue;
      picks.push(s);
    }
    setSlot("b0", picks[0]); setSlot("b1", picks[1]); setSlot("b2", picks[2]);
    renderSlots();
  }
  function sortearTurn(){
    slotCard.delete("b3");
    const rest = remaining();
    let s;
    do { s = toStr(randFrom(rest)); } while (selected.has(s));
    setSlot("b3", s); renderSlots();
  }
  function sortearRiver(){
    slotCard.delete("b4");
    const rest = remaining();
    let s;
    do { s = toStr(randFrom(rest)); } while (selected.has(s));
    setSlot("b4", s); renderSlots();
  }
  function limparTudo(){
    selected.clear(); slotCard.clear(); renderSlots();
  }

  // ===== liga botões se existirem =====
  const btnFlop  = document.getElementById("btnFlop");
  const btnTurn  = document.getElementById("btnTurn");
  const btnRiver = document.getElementById("btnRiver");
  const btnClear = document.getElementById("btnClear");
  btnFlop  && btnFlop.addEventListener("click", sortearFlop);
  btnTurn  && btnTurn.addEventListener("click", sortearTurn);
  btnRiver && btnRiver.addEventListener("click", sortearRiver);
  btnClear && btnClear.addEventListener("click", limparTudo);

  // Render inicial
  renderSlots();
})();
