let players = [];
let board = [];
window.players = players;
window.board = board;

(() => {
  const SUITS = ['s','h','d','c'];
  const RANKS = [2,3,4,5,6,7,8,9,10,11,12,13,14];
  const SUIT_GLYPH = {s:'♠',h:'♥',d:'♦',c:'♣'};
  const SUIT_CLASS = {s:'s',h:'h',d:'d',c:'c'};

  const q = (s,r=document)=>r.querySelector(s);
  let currentSlot=null, running=false;

  function fmtRank(r){ return r===14?'A':r===13?'K':r===12?'Q':r===11?'J':r===10?'10':String(r); }
  function makeDeck(){const d=[];for(const s of SUITS)for(const r of RANKS)d.push({r,s});return d;}

  function genPlayers(){
    const n=parseInt(q('#playerCount').value);
    players.length=0; board.length=0;
    ['#heroArea','#villainRow1','#villainRow2','#boardRow','#resultArea','#scoreArea']
      .forEach(id=>q(id)?.replaceChildren());
    for(let i=0;i<n;i++)players.push([null,null]);

    const hero=document.createElement('div');
    hero.className='player-row hero';
    hero.innerHTML=`<div class="player-name hero">Hero</div>
    <div class="slot" data-player="0" data-slot="0">+</div>
    <div class="slot" data-player="0" data-slot="1">+</div>`;
    q('#heroArea').appendChild(hero);

    const viloes=players.length-1;
    if(viloes>0){
      const metade=Math.ceil(viloes/2);
      const row1=q('#villainRow1'), row2=q('#villainRow2');
      for(let i=1;i<=viloes;i++){
        const div=document.createElement('div');
        div.className='player-row villain';
        div.innerHTML=`<div class="player-name">Vilão ${i}</div>
        <div class="slot" data-player="${i}" data-slot="0">+</div>
        <div class="slot" data-player="${i}" data-slot="1">+</div>`;
        (i<=metade?row1:row2).appendChild(div);
      }
    }
    document.querySelectorAll('.slot').forEach(el=>el.onclick=()=>openCardSelector(el));
    renderBoard();
  }

  function openCardSelector(el){
    currentSlot=el;
    const modal=q('#cardModal'), grid=q('#cardGrid');
    grid.innerHTML='';
    const deck=makeDeck(), usadas=new Set();
    players.flat().concat(board).forEach(c=>{if(c)usadas.add(`${c.r}${c.s}`);});
    for(const c of deck){
      const div=document.createElement('div');
      div.className=`modal-card ${SUIT_CLASS[c.s]}`;
      div.innerHTML=`<div>${fmtRank(c.r)}</div><div>${SUIT_GLYPH[c.s]}</div>`;
      const id=`${c.r}${c.s}`;
      if(usadas.has(id))div.classList.add('used');
      else div.onclick=()=>{selectCard(c);modal.style.display='none';};
      grid.appendChild(div);
    }
    modal.style.display='flex';
    modal.onclick=e=>{if(e.target.id==='cardModal')modal.style.display='none';};
  }

  function selectCard(c){
    if(!currentSlot)return;
    const p=parseInt(currentSlot.dataset.player);
    const s=parseInt(currentSlot.dataset.slot);
    players[p][s]=c;
    currentSlot.classList.add('filled');
    currentSlot.innerHTML=`<div class="${SUIT_CLASS[c.s]}" style="text-align:center">
      <div style="font-weight:700;font-size:18px">${fmtRank(c.r)}</div>
      <div style="font-size:18px">${SUIT_GLYPH[c.s]}</div>
    </div>`;
  }

  const delay=ms=>new Promise(r=>setTimeout(r,ms));

  async function autoSimular(qtd){
    if(running)return; 
    running=true;
    if(window.MultiSim?.setRounds) window.MultiSim.setRounds(qtd);

    for(let i=1;i<=qtd;i++){
      await rodadaCompleta(i, qtd);
      await delay(1000);
      if(!running)break;
    }

    running=false;
  }

  async function rodadaCompleta(numRodada,total){
    const deck=makeDeck();
    players.flat().forEach(c=>{
      if(!c)return;
      const idx=deck.findIndex(x=>x.r===c.r&&x.s===c.s);
      if(idx>=0)deck.splice(idx,1);
    });

    board.length=0;
    renderBoard();
    await delay(500);

    // Flop
    for(let i=0;i<3;i++)
      board.push(deck.splice((Math.random()*deck.length)|0,1)[0]);
    renderBoard();
    await delay(1000);

    // Turn
    board.push(deck.splice((Math.random()*deck.length)|0,1)[0]);
    renderBoard();
    await delay(1000);

    // River
    board.push(deck.splice((Math.random()*deck.length)|0,1)[0]);
    renderBoard();
    await delay(1000);

    if(window.MultiSim?.playRound)
      window.MultiSim.playRound(players, board);
  }

  function renderBoard(){
    const row=q('#boardRow');

    if(row.children.length===0)
      for(let i=0;i<5;i++){
        const d=document.createElement('div');
        d.className='slot back';
        row.appendChild(d);
      }

    for(let i=0;i<5;i++){
      const slot=row.children[i];
      const c=board[i];

      if(c){
        if(slot.dataset.shown!=='1'){
          slot.className='slot';
          slot.innerHTML=`
            <div class="card-inner">
              <div class="card-back"></div>
              <div class="card-front ${SUIT_CLASS[c.s]}">
                <div style="text-align:center">
                  <div style="font-weight:700;font-size:18px">${fmtRank(c.r)}</div>
                  <div style="font-size:18px">${SUIT_GLYPH[c.s]}</div>
                </div>
              </div>
            </div>`;
          slot.dataset.shown='1';
          requestAnimationFrame(()=>{requestAnimationFrame(()=>{slot.classList.add('faceup');});});
        }
      } else {
        slot.classList.remove('faceup');
        slot.className='slot back';
        slot.innerHTML='';
        delete slot.dataset.shown;
      }
    }
  }

  function resetSimulador(){
    running=false;
    board.length=0;
    players.length=0;
    ['#heroArea','#villainRow1','#villainRow2','#boardRow','#resultArea','#scoreArea']
      .forEach(id=>q(id)?.replaceChildren());
    if(window.MultiSim?.resetPlacar) window.MultiSim.resetPlacar();
  }

  q('#initPlayers').onclick=genPlayers;
  q('#btnAuto').onclick=()=>{
    const qtd=parseInt(q('#numRounds').value)||10;
    if(!players.length) return alert("Gere jogadores antes!");
    if(players.some(p=>!p[0]||!p[1])) return alert("Todos os jogadores precisam ter cartas!");
    autoSimular(qtd);
  };
  q('#btnReset').onclick=resetSimulador;
})();
