// raise.js — Pot Odds + chave de decisão com botão "Enviar" (Slow Play, Botão dinâmico e Regras por Efetivo em BB)
// - Equity "Aguardando cartas…" até ler valor real (nunca usa 50% padrão).
// - 30–50%: pot odds só para decidir PAGAR. <30%: Desista. >=50%: apostar por valor (sem depender de pot odds).
// - Slow Play opcional para >80% equity.
// - Botão "Enviar" mostra a ação prevista.
// - Regras por Efetivo (BB): 3 faixas (baixo/médio/alto) com ações configuráveis (checáveis) e limites custom (low/high BB).
(function (g) {
  // ===== DEFAULTS
  var DEFAULTS = {
    mountSelector: '#pcalc-toolbar',
    suggestSelector: '#pcalc-sugestao',
    potOddsCompact: true,

    // chaves usuais no PC.state
    potKey: 'potAtual',
    toCallKey: 'toCall',
    equityKey: 'equityPct', // % pronta (fallback)
    winKey: 'win',          // 0..1 ou 0..100
    tieKey: 'tie',

    // stacks (opcionais no PC.state)
    effStackKey: 'effStack',
    heroStackKey: 'heroStack',
    villainStackKey: 'villainStack',

    // ======= readState com prioridade: DOM Win/Tie > state Win/Tie > equityPct =======
    readState: function () {
      var PC = g.PC || g.PCALC || {};
      var st = PC.state || {};

      var ek  = DEFAULTS.equityKey || 'equityPct';
      var pk  = DEFAULTS.potKey     || 'potAtual';
      var tk  = DEFAULTS.toCallKey  || 'toCall';
      var wk  = DEFAULTS.winKey     || 'win';
      var tk2 = DEFAULTS.tieKey     || 'tie';

      function parseFlex(x){
        if(x==null) return NaN;
        var s = String(x).trim().replace('%','');
        var hasDot = s.includes('.'), hasComma = s.includes(',');
        if (hasDot && hasComma){
          if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g,'').replace(',', '.');
          else s = s.replace(/,/g,'');
        } else if (hasComma){ s = s.replace(',', '.'); }
        var n = parseFloat(s);
        return isFinite(n) ? n : NaN;
      }
      // 1) tenta Win/Tie do state
      var winS = parseFlex(st[wk]);
      var tieS = parseFlex(st[tk2]);
      if (isFinite(winS) && winS > 1) winS /= 100;
      if (isFinite(tieS) && tieS > 1) tieS /= 100;
      var eqFromWT = (isFinite(winS) ? winS : NaN) + (isFinite(tieS) ? tieS/2 : 0);
      if (isFinite(eqFromWT)) eqFromWT = Math.max(0, Math.min(1, eqFromWT)) * 100; else eqFromWT = NaN;

      // 2) tenta Win/Tie do DOM
      var eqFromDOM = (function(){
        if (typeof extractEquityFromDOM === 'function') {
          var v = extractEquityFromDOM(); // 0..100
          if (isFinite(v)) return v;
        }
        return NaN;
      })();

      // 3) equityPct do state (fallback)
      var eqFromState = Number(st[ek]); if (!isFinite(eqFromState)) eqFromState = NaN;

      // 4) prioridade — se nada for válido, deixamos NaN para "Aguardando cartas..."
      var eqPct = NaN;
      if (isFinite(eqFromDOM))        eqPct = eqFromDOM;
      else if (isFinite(eqFromWT))    eqPct = eqFromWT;
      else if (isFinite(eqFromState)) eqPct = eqFromState;

      // pot/toCall (fichas)
      function num(x){ var n=Number(x); return isFinite(n)?n:NaN; }
      var potAtual = num(st[pk]); if(!isFinite(potAtual)) potAtual=0;
      var toCall   = num(st[tk]); if(!isFinite(toCall))   toCall=0;

      // efetivo (stack efetivo em fichas)
      var effStack = NaN;
      if (st[DEFAULTS.effStackKey] != null) effStack = num(st[DEFAULTS.effStackKey]);
      if (!isFinite(effStack)) {
        var hs = num(st[DEFAULTS.heroStackKey]);
        var vs = num(st[DEFAULTS.villainStackKey]);
        if (isFinite(hs) && isFinite(vs)) effStack = Math.min(hs, vs);
      }

      return {
        potAtual: potAtual,
        toCall: toCall,
        equityPct: isFinite(eqPct) ? +eqPct.toFixed(1) : NaN,
        rakePct: num(st.rakePct) || 0,
        rakeCap: (st.rakeCap != null ? Number(st.rakeCap) : Infinity),
        effStack: isFinite(effStack) ? effStack : NaN
      };
    },
    onUpdateText: null
  };

  // ===== STATE
  var state = {
    mounted: false,
    elements: {},
    injectDecision: false,     // switch ON/OFF
    slowPlay: false,           // toggle slow play para >80%
    lastPotOdds: null,
    _cfg: null,
    overrides: { potAtual: undefined, toCall: undefined, equityPct: undefined, rakePct: undefined, rakeCap: undefined, effStack: undefined, bb: undefined },
    observers: [],
    lastSuggestSnapshot: null,

    // Regras por Efetivo (BB)
    rangePolicy: {
      enabled: true,
      bb: NaN,           // BB corrente (se NaN, usa overrides.bb)
      tLow: 20,          // limite baixo (BB)
      tHigh: 60,         // limite alto (BB)
      buckets: {
        low:  { enabled: true,  action: 'Aposte 80–100% (shove ok)' },
        mid:  { enabled: true,  action: 'Aposte 50–75%' },
        high: { enabled: true,  action: 'Aposte 40–60% (ou Slow Play)' }
      }
    },

    // reattach dinâmico + controle de nós atuais
    domNodes: { eqBreakEl: null, eqBarEl: null, suggestOutEl: null },
    domObs:   { eqBreak: null, eqBar: null, suggestOut: null, body: null },

    // heartbeat
    pollTimer: null,
    lastSelSignature: null
  };

  // ===== Utils
  function $(sel, root){ return (root||document).querySelector(sel); }
  function el(tag, cls){ var x=document.createElement(tag); if(cls) x.className=cls; return x; }
  function clamp01pct(p){ return Math.max(0, Math.min(100, +Number(p).toFixed(1))); }
  function parseFlexibleNumber(raw){
    if(raw==null) return NaN;
    var s = String(raw).trim(); if(!s) return NaN;
    var hasDot = s.includes('.'), hasComma = s.includes(',');
    if (hasDot && hasComma){
      if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g,'').replace(',', '.');
      else s = s.replace(/,/g,'');
    } else if (hasComma){ s = s.replace(',', '.'); }
    var n = parseFloat(s); return isFinite(n)? n : NaN;
  }
  function matchPct(text, re){
    var m = (text||'').match(re);
    if (!m) return NaN;
    return parseFlexibleNumber(m[1]);
  }
  function extractEquityFromDOM(){
    var br = document.getElementById('eqBreak');
    if (br) {
      var txt = br.textContent || '';
      var win = matchPct(txt, /Win:\s*([\d.,]+)%/i);
      var tie = matchPct(txt, /Tie:\s*([\d.,]+)%/i);
      if (isFinite(win)) {
        var eq = win + (isFinite(tie)? tie/2 : 0);
        return clamp01pct(eq);
      }
    }
    var bar = document.getElementById('eqBarWin');
    if (bar && bar.style && bar.style.width){
      var w = parseFlexibleNumber((bar.style.width||'').replace('%',''));
      if (isFinite(w)) return clamp01pct(w);
    }
    var nodes = Array.from(document.querySelectorAll('div,span,small,p,li,td,th'));
    var node = nodes.find(n => /Win:\s*[\d.,]+%/i.test(n.textContent||''));
    if (node){
      var t = node.textContent || '';
      var w2 = matchPct(t, /Win:\s*([\d.,]+)%/i);
      var t2 = matchPct(t, /Tie:\s*([\d.,]+)%/i);
      if (isFinite(w2)) return clamp01pct(w2 + (isFinite(t2)? t2/2 : 0));
    }
    return NaN;
  }

  // ===== Pot Odds/Decisão base
  function potOddsBE(potAtual, toCall, rakePct, rakeCap){
    potAtual = Number(potAtual||0);
    toCall   = Number(toCall||0);
    rakePct  = Number(rakePct||0);
    rakeCap  = (rakeCap==null)?Infinity:Number(rakeCap);
    var potFinal = potAtual + toCall;
    var rake = Math.min(potFinal * rakePct, rakeCap);
    var potFinalEfetivo = Math.max(0, potFinal - rake);
    var be = toCall / (potFinalEfetivo || 1); // 0..1
    return { be: be, bePct: +(be*100).toFixed(1), potFinal: potFinal, potFinalEfetivo: potFinalEfetivo, rake: rake };
  }

  // ===== Heurística principal por faixas (slow play opcional)
  function decideByRanges(eqPct, bePct, slowPlay){
    if (!isFinite(eqPct)) {
      return { rec:'Aguardando', detail:'Aguardando cartas…', tag:'wait' };
    }
    var hasPotOdds = eqPct >= bePct;

    if (eqPct < 30) {
      return { rec:'Desista', detail:'Equity < 30%', tag:'fold' };
    }
    if (eqPct < 50) {
      return hasPotOdds
        ? { rec:'Pague a aposta', detail:'30–50% de equity com pot odds', tag:'call' }
        : { rec:'Desista',        detail:'30–50% de equity sem pot odds', tag:'fold' };
    }
    if (eqPct < 70) {
      return { rec:'Aposte 50–75% do pote', detail:'50–70% de equity. Aposte por valor.', tag:'value_bet_medium' };
    }
    if (eqPct <= 80) {
      return { rec:'Aposte 75–100% do pote', detail:'70–80% de equity. Maximize o valor.', tag:'value_bet_strong' };
    }
    // >80%
    if (slowPlay) {
      return { rec:'Slow Play: passe / 33% do pote', detail:'>80% de equity. Induza blefes em board seco ou vs vilão agressivo.', tag:'slow_play' };
    }
    return { rec:'Aposte grande / All-in', detail:'>80% de equity. Extraia valor máximo.', tag:'nuts_value' };
  }

  // ===== Regras por Efetivo (BB)
  function computeEffBB(effStack, bb){
    effStack = Number(effStack||NaN);
    bb = Number(bb||NaN);
    if (!isFinite(effStack) || effStack<=0 || !isFinite(bb) || bb<=0) return NaN;
    return +(effStack / bb).toFixed(1);
  }

  function optionsHTML(selected){
    var opts = [
      'Aposte 40–60%',
      'Aposte 50–75%',
      'Aposte 75–100%',
      'Aposte 80–100% (shove ok)',
      'Aposte grande / All-in',
      'Slow Play: passe / 33%',
      'Pague a aposta',
      'Desista'
    ];
    return opts.map(o => `<option ${o===selected?'selected':''}>${o}</option>`).join('');
  }

  function mapActionStringToRec(str){
    switch (str){
      case 'Aposte 40–60%':               return { rec:'Aposte 40–60% do pote', tag:'value_bet_light' };
      case 'Aposte 50–75%':               return { rec:'Aposte 50–75% do pote', tag:'value_bet_medium' };
      case 'Aposte 75–100%':              return { rec:'Aposte 75–100% do pote', tag:'value_bet_strong' };
      case 'Aposte 80–100% (shove ok)':   return { rec:'Aposte 80–100% (shove ok)', tag:'value_bet_push' };
      case 'Aposte grande / All-in':      return { rec:'Aposte grande / All-in', tag:'nuts_value' };
      case 'Slow Play: passe / 33%':      return { rec:'Slow Play: passe / 33% do pote', tag:'slow_play' };
      case 'Pague a aposta':              return { rec:'Pague a aposta', tag:'call' };
      case 'Desista':                     return { rec:'Desista', tag:'fold' };
      default:                            return null;
    }
  }

  // aplica política por efetivo apenas para equity >=50%
  function applyRangePolicy(result, ctx, policy){
    var out = Object.assign({}, result);
    var bb = Number(policy && policy.bb || ctx.bb || NaN);
    var effBB = computeEffBB(ctx.effStack, bb);
    if (isFinite(effBB)) out.effBB = effBB;

    if (!policy || !policy.enabled) return out;
    if (!isFinite(out.equityPct) || out.equityPct < 50) return out;
    if (!isFinite(effBB)) return out;

    var low = Number(policy.tLow||NaN), high = Number(policy.tHigh||NaN);
    var bucket = null;
    if (isFinite(low) && effBB < low) bucket = 'low';
    else if (isFinite(low) && isFinite(high) && effBB >= low && effBB <= high) bucket = 'mid';
    else if (isFinite(high) && effBB > high) bucket = 'high';

    if (!bucket) return out;
    var b = policy.buckets[bucket] || {};
    if (!b.enabled) { out.bbBucket = bucket; return out; }

    var mapped = mapActionStringToRec(b.action);
    out.bbBucket = bucket;
    if (!mapped) return out;

    // Só sobrescreve a recomendação textual; mantém BE/Equity/potes
    out.rec = mapped.rec;
    out.recTag = mapped.tag;
    var detailBase = out.recDetail || '';
    var bucketPt = bucket==='low'?'baixo':(bucket==='mid'?'médio':'alto');
    out.recDetail = (detailBase? detailBase+' · ':'') + `Regra BB: ${bucketPt} (${effBB} BB)`;
    return out;
  }

  // ===== TTS helpers — fala apenas quando houver decisão (não no "Aguardando")
  function ttsEnabled(){
    return !!(g.TTS && g.TTS.state && g.TTS.state.enabled && 'speechSynthesis' in g);
  }
  function ttsSayNow(text){
    if(!ttsEnabled()) return;
    try{ speechSynthesis.cancel(); }catch(_){}
    try{ g.TTS.speak(text); }catch(_){}
  }
  function inputsReady(ctx){
    var p = Number(ctx.potAtual||0), c = Number(ctx.toCall||0);
    return isFinite(p) && p > 0 && isFinite(c) && c > 0;
  }
  function ttsRaise(result){
    if (result.recTag === 'wait') return; // não falar aguardando
    var phrase = 'Sugestão: ' + result.rec + '.';
    ttsSayNow(phrase);
  }

  // ===== Estilos (switch + botão Enviar + slow play + policy)
  function ensureCSS(){
    if ($('#raise-css-hook')) return;
    var css = ''
      + '#pcalc-toolbar{border:1px dashed #334155;border-radius:5px;padding:8px}\n'
      + '.raise-bar{display:flex;gap:.9rem;align-items:center;flex-wrap:wrap;margin:.5rem 0}\n'
      + '.field{display:flex;align-items:center;gap:.6rem}\n'
      + '.fld-label{color:#93c5fd;font-weight:600;white-space:nowrap}\n'
      + '.input-modern input{width:60px;padding:.48rem .6rem;border:1px solid #334155;'
        + 'background:#0f172a;color:#e5e7eb;border-radius:.6rem;outline:0}\n'
      + '.raise-potodds.card{background:#0b1324;border:1px solid #22304a;border-radius:10px;padding:10px;line-height:1.2}\n'
      + '.rsw{position:relative;display:inline-block;width:48px;height:26px}\n'
      + '.rsw input{opacity:0;width:0;height:0}\n'
      + '.slider{position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:#475569;border-radius:26px;transition:.25s}\n'
      + '.slider:before{position:absolute;content:"";height:20px;width:20px;left:3px;top:3px;background:#0b1324;border-radius:50%;transition:.25s}\n'
      + '.rsw input:checked + .slider{background:#22c55e}\n'
      + '.rsw input:checked + .slider:before{transform:translateX(22px)}\n'
      + '.raise-send-btn{padding:.48rem .7rem;border:1px solid #334155;background:#0f172a;color:#e5e7eb;'
        + 'border-radius:.6rem;cursor:pointer;user-select:none}\n'
      + '.raise-send-btn:hover{border-color:#60a5fa}\n'
      + '#eqStatus{margin-top:8px;color:#9ca3af}\n'
      + '.range-box{border:1px solid #22304a;border-radius:10px;padding:8px;margin-top:8px;background:#0b1324}\n'
      + '.range-row{display:flex;gap:.6rem;align-items:center;flex-wrap:wrap;margin-top:6px}\n'
      + '.range-row .sel{background:#0f172a;border:1px solid #334155;border-radius:.6rem;color:#e5e7eb;padding:.35rem .5rem}\n'
      + '.range-row input[type=number]{width:70px;padding:.35rem .5rem;border:1px solid #334155;background:#0f172a;color:#e5e7eb;border-radius:.6rem}\n';
    var style = el('style'); style.id='raise-css-hook';
    style.appendChild(document.createTextNode(css));
    document.head.appendChild(style);
  }

  // ===== UI - inputs básicos
  function buildPotInputs(initialPot, initialCall, initialEff, initialBB){
    var potWrap = el('div','field');
    var potLbl  = el('span','fld-label'); potLbl.textContent='Pot (fichas):';
    var potInpW = el('div','input-modern'); potInpW.innerHTML='<input id="inp-pot" type="number" step="1" min="0" placeholder="ex: 1200">';
    potWrap.appendChild(potLbl); potWrap.appendChild(potInpW);

    var callWrap = el('div','field');
    var callLbl  = el('span','fld-label'); callLbl.textContent='A pagar (fichas):';
    var callInpW = el('div','input-modern'); callInpW.innerHTML='<input id="inp-call" type="number" step="1" min="0" placeholder="ex: 400">';
    callWrap.appendChild(callLbl); callWrap.appendChild(callInpW);

    var effWrap = el('div','field');
    var effLbl  = el('span','fld-label'); effLbl.textContent='Efetivo:';
    var effInpW = el('div','input-modern'); effInpW.innerHTML='<input id="inp-eff" type="number" step="1" min="0" placeholder="ex: 5000">';
    effWrap.appendChild(effLbl); effWrap.appendChild(effInpW);

    var bbWrap = el('div','field');
    var bbLbl  = el('span','fld-label'); bbLbl.textContent='BB:';
    var bbInpW = el('div','input-modern'); bbInpW.innerHTML='<input id="inp-bb" type="number" step="1" min="1" placeholder="ex: 100">';
    bbWrap.appendChild(bbLbl); bbWrap.appendChild(bbInpW);

    var potInp  = potInpW.querySelector('input');
    var callInp = callInpW.querySelector('input');
    var effInp  = effInpW.querySelector('input');
    var bbInp   = bbInpW.querySelector('input');

    if (isFinite(initialPot) && initialPot>0) potInp.value = String(initialPot);
    if (isFinite(initialCall) && initialCall>0) callInp.value = String(initialCall);
    if (isFinite(initialEff) && initialEff>0)  effInp.value  = String(initialEff);
    if (isFinite(initialBB)  && initialBB>0)   bbInp.value   = String(initialBB);

    return { potWrap, callWrap, effWrap, bbWrap, potInput: potInp, callInput: callInp, effInput: effInp, bbInput: bbInp };
  }

  // ===== UI - bloco de política por efetivo (BB)
  function buildRangePolicyControls(){
    var box = el('div','range-box');
    box.innerHTML = `
      <div style="font-weight:700;margin-bottom:4px">Regras por Efetivo (BB)</div>
      <div class="range-row">
        <label><input id="rp-en" type="checkbox" ${state.rangePolicy.enabled?'checked':''}> Ativar</label>
        <span class="fld-label">Limite baixo (BB):</span>
        <input id="rp-low" type="number" step="1" min="1" value="${state.rangePolicy.tLow}">
        <span class="fld-label">Limite alto (BB):</span>
        <input id="rp-high" type="number" step="1" min="2" value="${state.rangePolicy.tHigh}">
      </div>
      <div class="range-row">
        <label><input id="rp-low-en" type="checkbox" ${state.rangePolicy.buckets.low.enabled?'checked':''}> Baixo (&lt; low)</label>
        <select id="rp-low-act" class="sel">
          ${optionsHTML(state.rangePolicy.buckets.low.action)}
        </select>
      </div>
      <div class="range-row">
        <label><input id="rp-mid-en" type="checkbox" ${state.rangePolicy.buckets.mid.enabled?'checked':''}> Médio (low–high)</label>
        <select id="rp-mid-act" class="sel">
          ${optionsHTML(state.rangePolicy.buckets.mid.action)}
        </select>
      </div>
      <div class="range-row">
        <label><input id="rp-high-en" type="checkbox" ${state.rangePolicy.buckets.high.enabled?'checked':''}> Alto (&gt; high)</label>
        <select id="rp-high-act" class="sel">
          ${optionsHTML(state.rangePolicy.buckets.high.action)}
        </select>
      </div>
    `;

    var en    = box.querySelector('#rp-en');
    var lowI  = box.querySelector('#rp-low');
    var highI = box.querySelector('#rp-high');
    var lowEn = box.querySelector('#rp-low-en');
    var midEn = box.querySelector('#rp-mid-en');
    var highEn= box.querySelector('#rp-high-en');
    var lowAc = box.querySelector('#rp-low-act');
    var midAc = box.querySelector('#rp-mid-act');
    var highAc= box.querySelector('#rp-high-act');

    function rerender(){
      if (state._cfg){
        renderPotOddsUI(buildCtxFromCurrent(state._cfg), state._cfg);
        updateSendBtnLabel();
      }
    }

    en.addEventListener('change', function(){ state.rangePolicy.enabled = !!en.checked; rerender(); });
    lowI.addEventListener('input', function(){
      var v = Number(lowI.value||0);
      if (isFinite(v) && v>0) state.rangePolicy.tLow = v|0;
      rerender();
    });
    highI.addEventListener('input', function(){
      var v = Number(highI.value||0);
      if (isFinite(v) && v>0) state.rangePolicy.tHigh = v|0;
      rerender();
    });

    lowEn.addEventListener('change', function(){ state.rangePolicy.buckets.low.enabled = !!lowEn.checked; rerender(); });
    midEn.addEventListener('change', function(){ state.rangePolicy.buckets.mid.enabled = !!midEn.checked; rerender(); });
    highEn.addEventListener('change',function(){ state.rangePolicy.buckets.high.enabled= !!highEn.checked; rerender(); });

    lowAc.addEventListener('change', function(){ state.rangePolicy.buckets.low.action  = lowAc.value;  rerender(); });
    midAc.addEventListener('change', function(){ state.rangePolicy.buckets.mid.action  = midAc.value;  rerender(); });
    highAc.addEventListener('change',function(){ state.rangePolicy.buckets.high.action = highAc.value; rerender(); });

    return box;
  }

  // ===== RENDER DOS CONTROLES
  function renderControls(cfg){
    var mount = $(cfg.mountSelector);
    if (!mount) return null;

    var bar = el('div', 'raise-bar');

    // (1) Switch: Houve Ação ?
    var injWrap = el('div','field');
    var injLbl  = el('span','fld-label'); 
    injLbl.textContent = 'Houve Ação ?';
    var injRsw  = el('label','rsw');
    var injCb   = document.createElement('input'); injCb.type='checkbox'; injCb.id='rsw-inject';
    var injSl   = el('span','slider');
    injRsw.appendChild(injCb); injRsw.appendChild(injSl);
    injWrap.appendChild(injLbl); injWrap.appendChild(injRsw);

    // (2) Pot/A pagar/Efetivo/BB
    var st0 = cfg.readState();
    var pots= buildPotInputs(st0.potAtual, st0.toCall, st0.effStack, state.rangePolicy.bb);

    // (3) Botão Enviar
    var sendBtn = el('button','raise-send-btn'); sendBtn.id='btn-raise-send'; sendBtn.type='button'; sendBtn.textContent='Enviar';

    // (4) Toggle Slow Play
    var spWrap = el('div','field');
    var spLbl  = el('span','fld-label'); spLbl.textContent = 'Slow Play';
    var spRsw  = el('label','rsw');
    var spCb   = document.createElement('input'); spCb.type='checkbox'; spCb.id='rsw-slow';
    var spSl   = el('span','slider');
    spRsw.appendChild(spCb); spRsw.appendChild(spSl);
    spWrap.appendChild(spLbl); spWrap.appendChild(spRsw);

    // (5) Texto informativo solicitado (logo após o botão)
    var infoTxt = el('div'); 
    infoTxt.id = 'eqStatus';
    infoTxt.className = 'mut';
    infoTxt.textContent = 'Ative se houver Apostas ou Aumento, para Calcular Pot Odds e Tomar a Melhor Decisão!';

    // Montagem
    bar.appendChild(injWrap);
    bar.appendChild(pots.potWrap);
    bar.appendChild(pots.callWrap);
    bar.appendChild(pots.effWrap);
    bar.appendChild(pots.bbWrap);
    bar.appendChild(sendBtn);
    bar.appendChild(spWrap);
    bar.appendChild(infoTxt);
    mount.appendChild(bar);

    // (6) Bloco: Regras por Efetivo (BB)
    var policyBox = buildRangePolicyControls();
    mount.appendChild(policyBox);

    // Estado inicial dos switches
    injCb.checked = !!state.injectDecision;
    spCb.checked  = !!state.slowPlay;

    // Eventos
    injCb.addEventListener('change', function(){
      setInjectDecision(!!injCb.checked, { source:'user', restore:true });
      updateSendBtnLabel();
    });
    spCb.addEventListener('change', function(){
      state.slowPlay = !!spCb.checked;
      if (state._cfg) {
        renderPotOddsUI(buildCtxFromCurrent(state._cfg), state._cfg);
        updateSendBtnLabel();
      }
    });
    if (pots.potInput) pots.potInput.addEventListener('input', function(){
      var v = Number(pots.potInput.value||0);
      state.overrides.potAtual = isFinite(v)?v:0;
      if (state._cfg) { renderPotOddsUI(buildCtxFromCurrent(state._cfg), state._cfg); updateSendBtnLabel(); }
    });
    if (pots.callInput) pots.callInput.addEventListener('input', function(){
      var v = Number(pots.callInput.value||0);
      state.overrides.toCall = isFinite(v)?v:0;
      if (state._cfg) { renderPotOddsUI(buildCtxFromCurrent(state._cfg), state._cfg); updateSendBtnLabel(); }
    });
    if (pots.effInput) pots.effInput.addEventListener('input', function(){
      var v = Number(pots.effInput.value||0);
      state.overrides.effStack = isFinite(v)?v:undefined;
      if (state._cfg) { renderPotOddsUI(buildCtxFromCurrent(state._cfg), state._cfg); updateSendBtnLabel(); }
    });
    if (pots.bbInput) pots.bbInput.addEventListener('input', function(){
      var v = Number(pots.bbInput.value||0);
      state.overrides.bb = isFinite(v)?v:undefined;
      state.rangePolicy.bb = state.overrides.bb;
      if (state._cfg) { renderPotOddsUI(buildCtxFromCurrent(state._cfg), state._cfg); updateSendBtnLabel(); }
    });
    sendBtn.addEventListener('click', onEnviar);

    return { injCb: injCb, slowCb: spCb, potInput: pots.potInput, callInput: pots.callInput, effInput: pots.effInput, bbInput: pots.bbInput, sendBtn: sendBtn };
  }

  function setInjectDecision(flag, opts){
    opts = opts || {};
    state.injectDecision = !!flag;
    if (state.elements.injCb) state.elements.injCb.checked = state.injectDecision;

    if (!state.injectDecision){
      if (opts.source === 'user' && opts.restore){
        restoreDefaultSuggestion();
      }
    } else {
      if (state._cfg) renderPotOddsUI(buildCtxFromCurrent(state._cfg), state._cfg);
    }
  }

  // ===== Label dinâmico do botão "Enviar"
  function updateSendBtnLabel(){
    var btn = state.elements && state.elements.sendBtn;
    if (!btn || !state._cfg) return;
    var ctx = buildCtxFromCurrent(state._cfg);
    if (!state.injectDecision || !inputsReady(ctx)) {
      btn.textContent = 'Enviar';
      return;
    }
    var res = computeDecision(ctx);
    if (res && res.rec) btn.textContent = 'Enviar — ' + res.rec;
    else btn.textContent = 'Enviar';
  }

  // ===== Injeção no bloco principal
  function injectDecisionIntoMain(result, ctx){
    var host = document.getElementById('suggestOut');
    if (!host) return;

    if (state.lastSuggestSnapshot == null) {
      state.lastSuggestSnapshot = host.innerHTML;
    }

    var cls =
      result.recTag === 'wait' ? 'warn' :
      result.recTag === 'fold' ? 'bad'  : 'good';
    var glow = (result.recTag !== 'wait' && result.recTag !== 'fold');

    var eqLabel = isFinite(result.equityPct) ? (result.equityPct + '%') : 'Aguardando cartas…';

    host.innerHTML = `
      <div class="decision ${glow ? 'glow' : ''}">
        <div class="decision-title ${cls}">${result.rec}</div>
        <div class="decision-detail">
          BE ${result.bePct}% | EQ ${eqLabel} &nbsp;•&nbsp;
          Pot ${Number(ctx.potAtual||0).toFixed(0)} | A pagar ${Number(ctx.toCall||0).toFixed(0)}
          ${result.effBB ? ` · Efetivo ${result.effBB} BB` : ''}
          ${result.bbBucket ? ` · Faixa ${result.bbBucket}` : ''}
          ${result.recDetail ? ' · ' + result.recDetail : ''}
        </div>
      </div>
    `;
  }
  function restoreDefaultSuggestion(){
    var host = document.getElementById('suggestOut');
    if (host && state.lastSuggestSnapshot != null){
      host.innerHTML = state.lastSuggestSnapshot;
    }
    state.lastSuggestSnapshot = null;
  }

  // ===== Botão Enviar
  function onEnviar(){
    if (!state.injectDecision || !state._cfg) return;
    var ctx = buildCtxFromCurrent(state._cfg);
    if (!inputsReady(ctx)) return;

    var res = computeDecision(ctx);
    injectDecisionIntoMain(res, ctx);
    ttsRaise(res);

    setInjectDecision(false, { source:'auto', restore:false });

    // limpar campos e overrides + label
    try {
      if (state.elements.potInput)  state.elements.potInput.value  = '';
      if (state.elements.callInput) state.elements.callInput.value = '';
      // não limpamos efetivo/BB por serem "constantes" da mesa
      state.overrides.potAtual = 0;
      state.overrides.toCall   = 0;
      if (state._cfg) renderPotOddsUI(buildCtxFromCurrent(state._cfg), state._cfg);
      updateSendBtnLabel();
    } catch(_) {}
  }

  // ===== Render do card compacto
  function renderPotOddsUI(ctx, cfg){
    var out = $(cfg.suggestSelector);
    if(!out) return;

    var result = computeDecision(ctx);
    state.lastPotOdds = result;

    var eqLabel = isFinite(result.equityPct) ? (result.equityPct + '%') : 'Aguardando cartas…';
    var recLabel = result.rec || 'Aguardando';
    var pillColor =
      result.recTag === 'wait' ? '#f59e0b' :
      result.recTag === 'fold' ? '#ef4444' : '#10b981';

    out.innerHTML = `
      <div class="raise-potodds card">
        <div style="font-weight:700;margin-bottom:6px">Pot Odds (vs Raise) — Compacto</div>
        <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px">
          <div>Pot (fichas)</div><div><b>${ctx.potAtual ? ctx.potAtual.toFixed(0) : '—'}</b></div>
          <div>A pagar (fichas)</div><div><b>${ctx.toCall ? ctx.toCall.toFixed(0) : '—'}</b></div>
          <div>BE (pot odds)</div><div><b>${result.bePct}%</b></div>
          <div>Equity (MC)</div><div><b>${eqLabel}</b></div>
          ${isFinite(result.effBB) ? `<div>Efetivo (BB)</div><div><b>${result.effBB}</b></div>` : ''}
          ${result.bbBucket ? `<div>Faixa (BB)</div><div><b>${result.bbBucket}</b></div>` : ''}
          <div>Recomendação</div>
          <div><span id="po-rec" style="padding:2px 8px;border-radius:999px;border:1px solid #22304a">${recLabel}</span></div>
        </div>
      </div>`;
    var pill = out.querySelector('#po-rec');
    if (pill){
      pill.style.background = pillColor + '22';
      pill.style.borderColor = pillColor + '66';
      pill.style.color = '#e5e7eb';
    }

    // Atualiza label do botão junto com o card
    updateSendBtnLabel();
  }

  // ===== Decide + aplica política por efetivo
  function decideVsRaise(potAtual, toCall, equityPct, rakePct, rakeCap){
    var r = potOddsBE(potAtual, toCall, rakePct, rakeCap);
    var bePct = r.bePct;
    var eq    = equityPct; // pode ser NaN
    var choice = decideByRanges(eq, bePct, !!state.slowPlay);

    return {
      bePct: bePct,
      equityPct: isFinite(eq)? +eq.toFixed(1) : NaN,
      rec: choice.rec,
      recDetail: choice.detail,
      recTag: choice.tag,
      potFinal: r.potFinal,
      potFinalEfetivo: r.potFinalEfetivo,
      rake: r.rake
    };
  }

  function computeDecision(ctx){
    var potAtual = Number(ctx.potAtual || 0);
    var toCall   = Number(ctx.toCall   || 0);
    var equity   = (ctx.equityPct!= null ? Number(ctx.equityPct) : NaN);
    var rakePct  = Number(ctx.rakePct  || 0);
    var rakeCap  = (ctx.rakeCap===Infinity || ctx.rakeCap==null) ? Infinity : Number(ctx.rakeCap);

    var base = decideVsRaise(potAtual, toCall, equity, rakePct, rakeCap);

    // aplica regra por Efetivo (BB)
    var res = applyRangePolicy(base, ctx, state.rangePolicy);
    return res;
  }

  function buildCtxFromCurrent(cfg){
    var st = cfg.readState();
    return {
      potAtual: (state.overrides.potAtual != null ? state.overrides.potAtual : st.potAtual),
      toCall:   (state.overrides.toCall   != null ? state.overrides.toCall   : st.toCall),
      equityPct:(state.overrides.equityPct!= null ? state.overrides.equityPct: st.equityPct),
      rakePct:  (state.overrides.rakePct  != null ? state.overrides.rakePct  : st.rakePct),
      rakeCap:  (state.overrides.rakeCap  != null ? state.overrides.rakeCap  : st.rakeCap),
      effStack: (state.overrides.effStack != null ? state.overrides.effStack : st.effStack),
      bb:       (state.overrides.bb != null ? state.overrides.bb : state.rangePolicy.bb)
    };
  }

  function updateSuggestion(cfg){
    var ctx = buildCtxFromCurrent(cfg);
    renderPotOddsUI(ctx, cfg);
  }

  // ===== Reattach dinâmico + Heartbeat =====
  function attachObserverTo(targetEl, kind){
    if (!g.MutationObserver || !targetEl) return;
    if (kind==='eqBreak' && state.domNodes.eqBreakEl !== targetEl && state.domObs.eqBreak){
      try{ state.domObs.eqBreak.disconnect(); }catch(_){}
      state.domObs.eqBreak = null;
    }
    if (kind==='eqBar' && state.domNodes.eqBarEl !== targetEl && state.domObs.eqBar){
      try{ state.domObs.eqBar.disconnect(); }catch(_){}
      state.domObs.eqBar = null;
    }
    if (kind==='eqBreak' && !state.domObs.eqBreak){
      var mo1 = new MutationObserver(function(){
        if (state._cfg) renderPotOddsUI(buildCtxFromCurrent(state._cfg), state._cfg);
      });
      mo1.observe(targetEl, { childList:true, subtree:true, characterData:true });
      state.domObs.eqBreak = mo1;
      state.domNodes.eqBreakEl = targetEl;
    }
    if (kind==='eqBar' && !state.domObs.eqBar){
      var mo2 = new MutationObserver(function(muts){
        if (muts.some(m => m.attributeName === 'style') && state._cfg)
          renderPotOddsUI(buildCtxFromCurrent(state._cfg), state._cfg);
      });
      mo2.observe(targetEl, { attributes:true, attributeFilter:['style'] });
      state.domObs.eqBar = mo2;
      state.domNodes.eqBarEl = targetEl;
    }
  }

  function ensureDomObserversAttached(){
    attachObserverTo(document.getElementById('eqBreak'), 'eqBreak');
    attachObserverTo(document.getElementById('eqBarWin'), 'eqBar');

    var so = document.getElementById('suggestOut');
    if (so && !state.domObs.suggestOut && g.MutationObserver){
      var mo3 = new MutationObserver(function(){
        if (state._cfg) renderPotOddsUI(buildCtxFromCurrent(state._cfg), state._cfg);
      });
      mo3.observe(so, { childList:true, subtree:true, characterData:true });
      state.domObs.suggestOut = mo3;
      state.domNodes.suggestOutEl = so;
    }
  }

  function startHeartbeat(){
    stopHeartbeat();
    state.pollTimer = setInterval(function(){
      if (!state._cfg) return;
      var eq = extractEquityFromDOM();
      var eqKey = isFinite(eq)? eq.toFixed(2) : 'NA';
      var PC = g.PC || g.PCALC || {};
      var sel = (PC.state && Array.isArray(PC.state.selected)) ? PC.state.selected.join(',') : '';
      var sig = eqKey + '|' + sel;

      if (sig !== state.lastSelSignature){
        state.lastSelSignature = sig;
        renderPotOddsUI(buildCtxFromCurrent(state._cfg), state._cfg);
      }
    }, 300);
  }
  function stopHeartbeat(){
    if (state.pollTimer){ clearInterval(state.pollTimer); state.pollTimer = null; }
  }

  function attachDOMObservers(){
    detachDOMObservers();
    ensureDomObserversAttached();
    if (g.MutationObserver && document.body) {
      var moBody = new MutationObserver(function(){
        ensureDomObserversAttached();
      });
      moBody.observe(document.body, { childList:true, subtree:true });
      state.observers.push(moBody);
      state.domObs.body = moBody;
    }
    startHeartbeat();
    [80, 300, 1200].forEach(function(ms){
      setTimeout(function(){
        ensureDomObserversAttached();
        if (state._cfg) renderPotOddsUI(buildCtxFromCurrent(state._cfg), state._cfg);
      }, ms);
    });
  }

  function detachDOMObservers(){
    (state.observers||[]).forEach(function(mo){ try{ mo.disconnect(); }catch(_){ } });
    state.observers = [];
    ['eqBreak','eqBar','suggestOut','body'].forEach(function(k){
      if (state.domObs[k]) { try{ state.domObs[k].disconnect(); }catch(_){} state.domObs[k]=null; }
    });
    state.domNodes = { eqBreakEl: null, eqBarEl: null, suggestOutEl: null };
    stopHeartbeat();
  }

  // ===== API
  var API = {
    init: function(userCfg){
      if (state.mounted) return;
      ensureCSS();
      var cfg = {};
      userCfg = userCfg || {};
      for (var k in DEFAULTS) cfg[k] = DEFAULTS[k];
      for (var k2 in userCfg)   cfg[k2] = userCfg[k2];

      var els = renderControls(cfg);
      if (!els){
        console.warn('[raise] mountSelector nao encontrado:', cfg.mountSelector);
        return;
      }
      state.elements = els;
      state.mounted  = true;
      state._cfg     = cfg;

      attachDOMObservers();
      updateSuggestion(cfg);
    },

    setState: function(patch){
      patch = patch || {};
      if ('useDecisionInjection' in patch) {
        setInjectDecision(!!patch.useDecisionInjection, { source:'code', restore:false });
      }
      if ('slowPlay' in patch) {
        state.slowPlay = !!patch.slowPlay;
        if (state.elements.slowCb) state.elements.slowCb.checked = state.slowPlay;
      }
      if ('potAtual'  in patch) state.overrides.potAtual  = (patch.potAtual==null?undefined:Number(patch.potAtual));
      if ('toCall'    in patch) state.overrides.toCall    = (patch.toCall==null?undefined:Number(patch.toCall));
      if ('equityPct' in patch) state.overrides.equityPct = (patch.equityPct==null?undefined:Number(patch.equityPct));
      if ('rakePct'   in patch) state.overrides.rakePct   = (patch.rakePct==null?undefined:Number(patch.rakePct));
      if ('rakeCap'   in patch) state.overrides.rakeCap   = (patch.rakeCap==null?undefined:Number(patch.rakeCap));
      if ('effStack'  in patch) state.overrides.effStack  = (patch.effStack==null?undefined:Number(patch.effStack));
      if ('bb'        in patch) { state.overrides.bb = (patch.bb==null?undefined:Number(patch.bb)); state.rangePolicy.bb = state.overrides.bb; }

      if (state._cfg) renderPotOddsUI(buildCtxFromCurrent(state._cfg), state._cfg);
      updateSendBtnLabel();
    },

    getRecommendation: function(){
      return state.lastPotOdds || null;
    }
  };

  g.RAISE = API;

})(window);
