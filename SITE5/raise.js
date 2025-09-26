// raise.js — módulo "Tomei Raise" (versão limpa, sem template literals)
//
// Define window.RAISE com: init({ mountSelector, suggestSelector, onUpdateText, readState })
// setState({ tomeiRaise, pos, raiseBB, callers, stackBB })
// getRecommendation()
(function (g) {
  // ================== Config ==================
  var DEFAULTS = {
    mountSelector: '#pcalc-toolbar',
    suggestSelector: '#pcalc-sugestao',
    readState: function () {
      var PC = g.PC || g.PCALC || {};
      var st = PC.state || {};
      return {
        maoLabel: st.maoLabel || st.mao || '',
        categoria: st.maoCategoria || 'premium (top 20)',
        stackBB: Number(st.stackBB || st.stack || 100),
        callers: Number(st.callers || 0)
      };
    },
    onUpdateText: null
  };

  // ================== Estado ==================
  var state = {
    mounted: false,
    elements: {},
    tomeiRaise: false,
    pos: 'IP',        // 'IP' ou 'OOP'
    raiseBB: null,    // tamanho do raise do vilão (em BB)
    callers: 0,       // numero de callers entre agressor e você
    stackBB: 100,     // stack efetivo em BB
    _cfg: null
  };

  // ================== Utils ==================
  function $(sel, root){ return (root||document).querySelector(sel); }
  function el(tag, cls){ var x=document.createElement(tag); if(cls) x.className=cls; return x; }
  function roundHalf(x){ return Math.round(x*2)/2; }
  function clamp(x,a,b){ return Math.max(a, Math.min(b, x)); }

  function ensureCSS(){
    if ($('#raise-css-hook')) return;
    var css = ''
      + '.raise-bar{display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;margin:.5rem 0}\n'
      + '.raise-btn{border:1px solid #aaa;background:#fff;padding:.45rem .7rem;border-radius:.5rem;cursor:pointer}\n'
      + '.raise-btn.active{border-color:#222;background:#f3f3f3;box-shadow:inset 0 0 0 2px #222}\n'
      + '.raise-sep{width:1px;height:26px;background:#ddd;margin:0 .25rem}\n'
      + '.raise-group{display:flex;gap:.5rem;align-items:center;flex-wrap:wrap}\n'
      + '.raise-chip{border:1px solid #bbb;border-radius:.5rem;padding:.3rem .55rem;cursor:pointer;background:#fff}\n'
      + '.raise-chip.active{background:#e9eefc;border-color:#5b76f7}\n'
      + '.raise-input{display:flex;gap:.35rem;align-items:center;font-size:.92rem}\n'
      + '.raise-input input{width:80px;padding:.35rem .4rem;border:1px solid #bbb;border-radius:.4rem}\n';
    var style = el('style'); style.id='raise-css-hook';
    style.appendChild(document.createTextNode(css));
    document.head.appendChild(style);
  }

  // ================== Lógica da recomendação ==================
  function buildSuggestion(ctx){
    var maoLabel = ctx.maoLabel || ctx.categoria || '';
    var stackBB  = Number(ctx.stackBB || 100);
    var callers  = Number(ctx.callers || 0);
    var R        = Number(ctx.raiseBB || 0);
    var pos      = ctx.pos || 'IP';
    var tomei    = !!ctx.tomeiRaise;

    // tamanhos base
    var threeBetMulti = (pos === 'IP') ? 3.0 : 3.8;
    var squeezeBase   = (pos === 'IP') ? 4.0 : 4.7;
    var squeezePerCaller = 1.0;

    // ajuste por stack curto
    var shoveHint = null;
    if (stackBB <= 20){
      shoveHint = 'Stack curto (<=20BB): considere all-in (jam) com AA–QQ e AK; evite call.\n'
                + 'Se a mão for média (pares médios/baixos, AJs-ATs), prefira fold ou 3-bet/fold.';
      threeBetMulti = (pos === 'IP') ? 2.8 : 3.2;
      squeezeBase   = (pos === 'IP') ? 3.5 : 4.2;
    } else if (stackBB <= 35){
      threeBetMulti = threeBetMulti - 0.2;
      squeezeBase   = squeezeBase - 0.2;
    }

    var isSqueeze = tomei && callers > 0;

    // Sizing recomendado
    var sizeText = '';
    if (R > 0){
      if (isSqueeze){
        var sizSq = roundHalf(R * (squeezeBase + callers * squeezePerCaller));
        sizeText = '**Squeeze: ~' + sizSq + ' BB** (aprox. ' + squeezeBase + 'x R'
                 + (callers>0 ? ' + ' + callers + 'x R por caller' : '') + ').';
      } else {
        var siz3 = roundHalf(R * threeBetMulti);
        sizeText = '**3-bet: ~' + siz3 + ' BB** (aprox. ' + threeBetMulti.toFixed(1) + 'x o raise).';
      }
    } else {
      sizeText = isSqueeze
        ? '**Squeeze: ~' + squeezeBase + 'x o raise + 1x R por caller**.'
        : '**3-bet: ~' + threeBetMulti.toFixed(1) + 'x o raise**.';
    }

    // heurística simples por categoria
    var cat = String(ctx.categoria || '').toLowerCase();
    var premiumLike = /(premium|aa|kk|qq|ak|aqs)/.test(cat) || /(AA|KK|QQ|AKs|AKo|AQs)/i.test(String(ctx.maoLabel||''));

    var actionText = '';
    if (!tomei){
      actionText = 'Sem raise antes.\n'
                 + '-> Mao ' + maoLabel + ' — Abra 2.5–3 BB.';
    } else {
      if (isSqueeze){
        actionText = 'Houve raise e ' + callers + ' call' + (callers>1?'ers':'') + ' antes de voce (spot de squeeze).\n'
                   + '-> ' + sizeText + '\n'
                   + '-> Valor: Premium + (JJ/TT, AQs, KQs).\n'
                   + '-> Light: A5s–A2s, broadways suited.';
      } else {
        if (premiumLike){
          actionText = 'Houve raise antes (' + pos + ').\n'
                     + '-> ' + sizeText + '\n'
                     + '-> Plano: 3-bet por valor; vs 4-bet continue com AA/KK/QQ/AK.';
        } else if (/forte|jj|tt|ajs|kqs/i.test(cat + String(ctx.maoLabel||''))) {
          actionText = 'Houve raise antes (' + pos + ').\n'
                     + '-> ' + sizeText + '\n'
                     + '-> Plano: Mix CALL/3-bet (mais 3-bet OOP; mais call IP contra opens tardios).';
        } else if (/media|99|88|77|66|55|44|33|22|ajo|kqo|ats|a5s|a4s|a3s|a2s|98s|87s|76s|qjs|kjs|jts/i.test(cat + String(ctx.maoLabel||''))) {
          actionText = 'Houve raise antes (' + pos + ').\n'
                     + '-> IP: mais CALL; OOP: selecione 3-bet light boas ou fold.\n'
                     + sizeText;
        } else {
          actionText = 'Houve raise antes (' + pos + ').\n'
                     + '-> Range marginal: Fold na maioria dos casos.'
                     + (R ? '' : ' Eventualmente 3-bet light vs steal muito alto.');
        }
      }
    }

    var stackNote = 'Stack efetivo: ~' + stackBB + ' BB.';
    var shoveNote = shoveHint ? '\n' + shoveHint : '';
    return actionText + '\n' + stackNote + shoveNote;
  }

  // ================== UI / Montagem ==================
  function renderControls(cfg){
    var mount = $(cfg.mountSelector);
    if (!mount) return null;

    var bar = el('div', 'raise-bar');

    // Botao principal
    var btn = el('button', 'raise-btn');
    btn.type = 'button';
    btn.id   = 'btn-tomei-raise';
    btn.appendChild(document.createTextNode('Tomei Raise'));

    // IP / OOP
    var grpPos = el('div', 'raise-group');
    var chipIP  = el('div', 'raise-chip'); chipIP.appendChild(document.createTextNode('Depois (IP)'));
    var chipOOP = el('div', 'raise-chip'); chipOOP.appendChild(document.createTextNode('Antes (OOP)'));
    grpPos.appendChild(chipIP); grpPos.appendChild(chipOOP);

    // Inputs
    var inRaise = el('div', 'raise-input');
    inRaise.innerHTML = 'Raise (BB): <input id="inp-raise-bb" type="number" step="0.5" min="1" placeholder="ex: 3">';

    var inCallers = el('div', 'raise-input');
    inCallers.innerHTML = '#Callers: <input id="inp-callers" type="number" step="1" min="0" value="0">';

    var inStack = el('div', 'raise-input');
    inStack.innerHTML = 'Stack (BB): <input id="inp-stack" type="number" step="1" min="1" placeholder="ex: 100">';

    // Monta
    bar.appendChild(btn);
    bar.appendChild(grpPos);
    bar.appendChild(el('div', 'raise-sep'));
    bar.appendChild(inRaise);
    bar.appendChild(inCallers);
    bar.appendChild(inStack);
    mount.appendChild(bar);

    // Estado visual inicial
    btn.classList.toggle('active', state.tomeiRaise);
    chipIP.classList.toggle('active', state.pos === 'IP');
    chipOOP.classList.toggle('active', state.pos === 'OOP');

    // Eventos
    btn.addEventListener('click', function(){
      state.tomeiRaise = !state.tomeiRaise;
      btn.classList.toggle('active', state.tomeiRaise);
      updateSuggestion(cfg);
    });
    chipIP.addEventListener('click', function(){
      state.pos = 'IP';
      chipIP.classList.add('active'); chipOOP.classList.remove('active');
      updateSuggestion(cfg);
    });
    chipOOP.addEventListener('click', function(){
      state.pos = 'OOP';
      chipIP.classList.remove('active'); chipOOP.classList.add('active');
      updateSuggestion(cfg);
    });

    var raiseInput   = $('#inp-raise-bb', bar);
    var callersInput = $('#inp-callers', bar);
    var stackInput   = $('#inp-stack', bar);

    if (raiseInput) raiseInput.addEventListener('input', function(){
      var v = parseFloat(raiseInput.value);
      state.raiseBB = (isFinite(v) && v > 0) ? v : null;
      updateSuggestion(cfg);
    });
    if (callersInput) callersInput.addEventListener('input', function(){
      var v = parseInt(callersInput.value, 10);
      state.callers = (isFinite(v) && v >= 0) ? v : 0;
      updateSuggestion(cfg);
    });
    if (stackInput) stackInput.addEventListener('input', function(){
      var v = parseInt(stackInput.value, 10);
      state.stackBB = (isFinite(v) && v > 0) ? v : state.stackBB;
      updateSuggestion(cfg);
    });

    // Prefill inicial a partir do seu app (se houver)
    var st = cfg.readState();
    if (st.stackBB) { state.stackBB = st.stackBB; if (!stackInput.value) stackInput.value = st.stackBB; }
    if (typeof st.callers === 'number') { state.callers = st.callers; callersInput.value = st.callers; }

    return { bar: bar, btn: btn, chipIP: chipIP, chipOOP: chipOOP, raiseInput: raiseInput, callersInput: callersInput, stackInput: stackInput };
  }

  function updateSuggestion(cfg){
    var st = cfg.readState();
    var texto = buildSuggestion({
      maoLabel: st.maoLabel,
      categoria: st.categoria,
      stackBB: state.stackBB,
      raiseBB: state.raiseBB,
      callers: state.callers,
      pos: state.pos,
      tomeiRaise: state.tomeiRaise
    });

    if (typeof cfg.onUpdateText === 'function'){
      cfg.onUpdateText(texto, {});
    } else {
      var out = $(cfg.suggestSelector);
      if (out) out.innerText = texto;
    }
  }

  // ================== API ==================
  var API = {
    init: function(userCfg){
      if (state.mounted) return;
      ensureCSS();
      var cfg = {};
      userCfg = userCfg || {};
      // merge defaults
      var k;
      for (k in DEFAULTS) cfg[k] = DEFAULTS[k];
      for (k in userCfg)   cfg[k] = userCfg[k];

      var els = renderControls(cfg);
      if (!els){
        console.warn('[raise] mountSelector nao encontrado:', cfg.mountSelector);
        return;
      }
      state.elements = els;
      state.mounted  = true;
      state._cfg     = cfg;
      updateSuggestion(cfg);
    },

    setState: function(patch){
      patch = patch || {};
      if ('tomeiRaise' in patch) state.tomeiRaise = !!patch.tomeiRaise;
      if ('pos' in patch)       state.pos = (patch.pos === 'OOP' ? 'OOP' : 'IP');
      if ('raiseBB' in patch)   state.raiseBB = (patch.raiseBB > 0 ? Number(patch.raiseBB) : null);
      if ('callers' in patch)   state.callers = clamp(parseInt(patch.callers || 0, 10), 0, 9);
      if ('stackBB' in patch)   state.stackBB = clamp(parseInt(patch.stackBB || 100, 10), 1, 1000);

      // sync visual
      var els = state.elements || {};
      if (els.btn) els.btn.classList.toggle('active', state.tomeiRaise);
      if (els.chipIP && els.chipOOP){
        els.chipIP.classList.toggle('active', state.pos === 'IP');
        els.chipOOP.classList.toggle('active', state.pos === 'OOP');
      }
      if (els.callersInput && isFinite(state.callers)) els.callersInput.value = state.callers;

      if (state._cfg) updateSuggestion(state._cfg);
    },

    getRecommendation: function(){
      var cfg = state._cfg || DEFAULTS;
      var st  = cfg.readState();
      return buildSuggestion({
        maoLabel: st.maoLabel,
        categoria: st.categoria,
        stackBB: state.stackBB,
        raiseBB: state.raiseBB,
        callers: state.callers,
        pos: state.pos,
        tomeiRaise: state.tomeiRaise
      });
    }
  };

  g.RAISE = API; // exporta

})(window);
