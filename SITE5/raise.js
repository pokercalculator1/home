
(function (g) {
  // ========= Config =========
  const DEFAULTS = {
    // Onde montar os controles (coloque o seletor do seu toolbar)
    mountSelector: '#pcalc-toolbar',
    // Onde escrever a sugestão (use o seu elemento atual)
    suggestSelector: '#pcalc-sugestao',

    // Leitores opcionais do seu estado atual (se existir PC ou PCALC)
    readState: () => {
      const PC = g.PC || g.PCALC || {};
      const st = PC.state || {};
      return {
        maoLabel: st.maoLabel || st.mao || '',       // ex: "AKs"
        categoria: st.maoCategoria || 'premium (top 20)',
        stackBB: Number(st.stackBB || st.stack || 100), // stack efetivo em BB
        // Se você já sabe callers via seu fluxo, pode preencher aqui
        callers: Number(st.callers || 0),
      };
    },

    // Callback opcional para sincronizar com sua UI atual
    onUpdateText: null, // (texto, ctx) => {}
  };

  // ========= Estado do módulo =========
  const state = {
    mounted: false,
    elements: {},
    tomeiRaise: false,
    pos: 'IP',          // "IP" (depois do agressor) | "OOP" (antes do agressor)
    raiseBB: null,      // tamanho do raise do vilão em BB
    callers: 0,         // número de callers entre agressor e você
    stackBB: 100,       // stack efetivo em BB (para lógicas de shove)
  };

  // ========= Utils =========
  const $ = (sel, root = document) => root.querySelector(sel);
  const el = (tag, cls) => {
    const x = document.createElement(tag);
    if (cls) x.className = cls;
    return x;
  };
  const roundHalf = (x) => Math.round(x * 2) / 2;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  function ensureCSS() {
    if ($('#raise-css-hook')) return;
    const css = `
    .raise-bar{display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;margin:.5rem 0}
    .raise-btn{border:1px solid #aaa;background:#fff;padding:.45rem .7rem;border-radius:.5rem;cursor:pointer}
    .raise-btn.active{border-color:#222;background:#f3f3f3;box-shadow:inset 0 0 0 2px #222}
    .raise-sep{width:1px;height:26px;background:#ddd;margin:0 .25rem}
    .raise-group{display:flex;gap:.5rem;align-items:center;flex-wrap:wrap}
    .raise-chip{border:1px solid #bbb;border-radius:.5rem;padding:.3rem .55rem;cursor:pointer;background:#fff}
    .raise-chip.active{background:#e9eefc;border-color:#5b76f7}
    .raise-input{display:flex;gap:.35rem;align-items:center;font-size:.92rem}
    .raise-input input{width:80px;padding:.35rem .4rem;border:1px solid #bbb;border-radius:.4rem}
    `;
    const style = el('style');
    style.id = 'raise-css-hook';
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ========= Cálculo da recomendação =========
  function buildSuggestion(ctx) {
    // ctx: { maoLabel, categoria, stackBB, raiseBB, callers, pos, tomeiRaise }
    const maoLabel = ctx.maoLabel || ctx.categoria || '';
    const stackBB = Number(ctx.stackBB || 100);
    const callers = Number(ctx.callers || 0);
    const R = Number(ctx.raiseBB || 0);
    const pos = ctx.pos || 'IP';
    const tomei = !!ctx.tomeiRaise;

    // Tamanhos base
    let threeBetMulti = pos === 'IP' ? 3.0 : 3.8; // 3x IP, ~3.8x OOP
    let squeezeBase = pos === 'IP' ? 4.0 : 4.7;   // IP 4x, OOP ~4.7x
    const squeezePerCaller = 1.0;

    // Ajuste por stack curto: > prioriza all-in / reduz flats
    let shoveHint = null;
    if (stackBB <= 20) {
      shoveHint = 'Stack curto (≤20BB): considere **all-in (jam)** com AA–QQ, AK; evite call.
Se a mão for média (pares médios/baixos, AJs-ATs), prefira **fold** ou 3-bet/fold.';
      // em stack curto a 3-bet pequena não realiza tanto; mantemos os textos mas avisamos do jam
      threeBetMulti = pos === 'IP' ? 2.8 : 3.2;
      squeezeBase   = pos === 'IP' ? 3.5 : 4.2;
    } else if (stackBB <= 35) {
      // zona intermediária: levemente menor
      threeBetMulti = threeBetMulti - 0.2;
      squeezeBase   = squeezeBase - 0.2;
    }

    // Detecta cenário de squeeze se houver callers
    const isSqueeze = tomei && callers > 0;

    // Monta tamanho recomendado se tivermos R
    let sizeText = '';
    if (R > 0) {
      if (isSqueeze) {
        const siz = roundHalf(R * (squeezeBase + callers * squeezePerCaller));
        sizeText = `**Squeeze: ~${siz} BB** (≈ ${squeezeBase}×R ${callers>0?`+ ${callers}×R por caller`:''}).`;
      } else {
        const siz = roundHalf(R * threeBetMulti);
        sizeText = `**3-bet: ~${siz} BB** (≈ ${threeBetMulti.toFixed(1)}× o raise).`;
      }
    } else {
      sizeText = isSqueeze
        ? `**Squeeze: ~${squeezeBase}× o raise + 1×R por caller**.`
        : `**3-bet: ~${threeBetMulti.toFixed(1)}× o raise**.`;
    }

    // Matriz simplificada por categoria (pode ligar na sua classificação)
    // Premium: AA, KK, QQ, AKs, AKo, AQs
    // Fortes:  JJ–TT, AJs, KQs
    // Médias:  99–22, AJo, KQo, ATs–A5s, 98s–76s, QJs/KJs/JTs
    // Fracas:  offsuits médios/baixos etc.
    const cat = (ctx.categoria || '').toLowerCase();
    const premiumLike = /(premium|aa|kk|qq|ak|aqs)/.test(cat) || /(AA|KK|QQ|AKs|AKo|AQs)/i.test(ctx.maoLabel||'');

    let actionText = '';
    if (!tomei) {
      // Modo normal (open)
      actionText = `Sem raise antes.
→ Mão ${maoLabel} — **Abra 2.5–3 BB**.`;
    } else {
      // Tomei raise
      if (isSqueeze) {
        actionText = `Houve raise e ${callers} call${callers>1?'ers':''} antes de você (spot de **squeeze**).
→ ${sizeText}
→ **Valor**: Premium + (JJ/TT, AQs, KQs).
→ **Light**: A5s–A2s, broadways suited.`;
      } else {
        // vs single-raiser
        if (premiumLike) {
          actionText = `Houve raise antes (${pos}).
→ ${sizeText}
→ **Plano**: 3-bet por valor; vs 4-bet continue com AA/KK/QQ/AK.`;
        } else if (/forte|jj|tt|ajs|kqs/i.test(cat + (ctx.maoLabel||''))) {
          actionText = `Houve raise antes (${pos}).
→ ${sizeText}
→ **Plano**: Mix CALL/3-bet (mais 3-bet OOP; mais call IP contra opens tardios).`;
        } else if (/media|99|88|77|66|55|44|33|22|ajo|kqo|ats|a5s|a4s|a3s|a2s|98s|87s|76s|qjs|kjs|jts/i.test(cat + (ctx.maoLabel||''))) {
          actionText = `Houve raise antes (${pos}).
→ **IP**: mais CALL; **OOP**: selecione 3-bet light boas ou **fold**.
${sizeText}`;
        } else {
          actionText = `Houve raise antes (${pos}).
→ Range marginal: **Fold** na maioria dos casos.${R?'' : ' Eventualmente 3-bet light vs steal muito alto.'}`;
        }
      }
    }

    const stackNote = `Stack efetivo: ~${stackBB} BB.`;
    const shoveNote = shoveHint ? `\n${shoveHint}` : '';
    return `${actionText}\n${stackNote}${shoveNote}`;
  }

  // ========= Render / Montagem =========
  function renderControls(cfg) {
    const mount = $(cfg.mountSelector);
    if (!mount) return null;

    const bar = el('div', 'raise-bar');

    // Botão principal
    const btn = el('button', 'raise-btn');
    btn.type = 'button';
    btn.id = 'btn-tomei-raise';
    btn.textContent = '🔥 Tomei Raise';

    // Seletor IP/OOP
    const grpPos = el('div', 'raise-group');
    const chipIP = el('div', 'raise-chip'); chipIP.textContent = 'Depois (IP)';
    const chipOOP = el('div', 'raise-chip'); chipOOP.textContent = 'Antes (OOP)';
    grpPos.appendChild(chipIP);
    grpPos.appendChild(chipOOP);

    // Inputs Raise e Callers
    const inRaise = el('div', 'raise-input');
    inRaise.innerHTML = `Raise (BB): <input id="inp-raise-bb" type="number" step="0.5" min="1" placeholder="ex: 3">`;

    const inCallers = el('div', 'raise-input');
    inCallers.innerHTML = `#Callers: <input id="inp-callers" type="number" step="1" min="0" value="0">`;

    // Input Stack (opcional, ajuda no aviso de jam)
    const inStack = el('div', 'raise-input');
    inStack.innerHTML = `Stack (BB): <input id="inp-stack" type="number" step="1" min="1" placeholder="ex: 100">`;

    // Monta
    bar.appendChild(btn);
    bar.appendChild(grpPos);
    bar.appendChild(el('div','raise-sep'));
    bar.appendChild(inRaise);
    bar.appendChild(inCallers);
    bar.appendChild(inStack);

    mount.appendChild(bar);

    // Estado visual inicial
    btn.classList.toggle('active', state.tomeiRaise);
    chipIP.classList.toggle('active', state.pos === 'IP');
    chipOOP.classList.toggle('active', state.pos === 'OOP');

    // Eventos
    btn.addEventListener('click', () => {
      state.tomeiRaise = !state.tomeiRaise;
      btn.classList.toggle('active', state.tomeiRaise);
      updateSuggestion(cfg);
    });
    chipIP.addEventListener('click', () => {
      state.pos = 'IP';
      chipIP.classList.add('active'); chipOOP.classList.remove('active');
      updateSuggestion(cfg);
    });
    chipOOP.addEventListener('click', () => {
      state.pos = 'OOP';
      chipIP.classList.remove('active'); chipOOP.classList.add('active');
      updateSuggestion(cfg);
    });

    const raiseInput = $('#inp-raise-bb', bar);
    const callersInput = $('#inp-callers', bar);
    const stackInput = $('#inp-stack', bar);

    raiseInput.addEventListener('input', () => {
      const v = parseFloat(raiseInput.value);
      state.raiseBB = Number.isFinite(v) && v > 0 ? v : null;
      updateSuggestion(cfg);
    });
    callersInput.addEventListener('input', () => {
      const v = parseInt(callersInput.value, 10);
      state.callers = Number.isFinite(v) && v >= 0 ? v : 0;
      updateSuggestion(cfg);
    });
    stackInput.addEventListener('input', () => {
      const v = parseInt(stackInput.value, 10);
      state.stackBB = Number.isFinite(v) && v > 0 ? v : state.stackBB;
      updateSuggestion(cfg);
    });

    // Preenche valores se existirem no seu estado
    const st = cfg.readState();
    if (st.stackBB) { state.stackBB = st.stackBB; if(!stackInput.value) stackInput.value = st.stackBB; }
    if (typeof st.callers === 'number') { state.callers = st.callers; callersInput.value = st.callers; }

    return { bar, btn, chipIP, chipOOP, raiseInput, callersInput, stackInput };
  }

  function updateSuggestion(cfg) {
    // Lê seu estado (mão, categoria)
    const st = cfg.readState();
    const ctx = {
      maoLabel: st.maoLabel,
      categoria: st.categoria,
      stackBB: state.stackBB,
      raiseBB: state.raiseBB,
      callers: state.callers,
      pos: state.pos,
      tomeiRaise: state.tomeiRaise,
    };
    const texto = buildSuggestion(ctx);

    // Prioridade 1: callback do app (se você já tem renderer próprio)
    if (typeof cfg.onUpdateText === 'function') {
      cfg.onUpdateText(texto, ctx);
    } else {
      // Prioridade 2: escreve no elemento de sugestão
      const sug = $(cfg.suggestSelector);
      if (sug) sug.innerText = texto;
    }
  }

  // ========= API pública =========
  const API = {
    init(userCfg = {}) {
      if (state.mounted) return;
      ensureCSS();
      const cfg = Object.assign({}, DEFAULTS, userCfg);

      const els = renderControls(cfg);
      if (!els) {
        console.warn('[raise.js] mountSelector não encontrado:', cfg.mountSelector);
        return;
      }
      state.elements = els;
      state.mounted = true;
      updateSuggestion(cfg);

      // Guarda cfg para reuso em setState()
      state._cfg = cfg;
    },

    setState(patch = {}) {
      // Permite atualizar de fora (ex: quando seu engine detectar callers/stack)
      if ('tomeiRaise' in patch) state.tomeiRaise = !!patch.tomeiRaise;
      if ('pos' in patch) state.pos = (patch.pos === 'OOP' ? 'OOP' : 'IP');
      if ('raiseBB' in patch) state.raiseBB = (patch.raiseBB > 0 ? Number(patch.raiseBB) : null);
      if ('callers' in patch) state.callers = clamp(parseInt(patch.callers || 0,10),0,9);
      if ('stackBB' in patch) state.stackBB = clamp(parseInt(patch.stackBB || 100,10),1,1000);

      // Sync visual
      const { btn, chipIP, chipOOP, callersInput } = state.elements || {};
      if (btn) btn.classList.toggle('active', state.tomeiRaise);
      if (chipIP && chipOOP) {
        chipIP.classList.toggle('active', state.pos === 'IP');
        chipOOP.classList.toggle('active', state.pos === 'OOP');
      }
      if (callersInput && Number.isFinite(state.callers)) callersInput.value = state.callers;

      if (state._cfg) updateSuggestion(state._cfg);
    },

    getRecommendation() {
      const cfg = state._cfg || DEFAULTS;
      const st = cfg.readState();
      return buildSuggestion({
        maoLabel: st.maoLabel,
        categoria: st.categoria,
        stackBB: state.stackBB,
        raiseBB: state.raiseBB,
        callers: state.callers,
        pos: state.pos,
        tomeiRaise: state.tomeiRaise,
      });
    }
  };

  g.RAISE = API; // window.RAISE

})(window);
