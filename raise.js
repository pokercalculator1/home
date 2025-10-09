// raise.js — Pot Odds + Equity Ajustada + chave de decisão com botão "Enviar"
// - Equity "Aguardando cartas…" até ler valor real.
// - 30–50%: pot odds só para decidir PAGAR. <30%: Desista. >=50%: apostar por valor.
// - Slow Play opcional para >80% equity.
// - Botão "Enviar" mostra a ação prevista.
// - Regras por Efetivo (BB): 3 faixas com ações configuráveis.
// - ADICIONADO: Cálculo e exibição da Equity Ajustada (Multiway).
// - ATUALIZADO: Exibição da Equity Ajustada na sugestão principal.

// ===== LÓGICA MULTIWAY (INTEGRADA) =====
(function (g) {
  'use strict';
  const CFG = { ALPHA: 0.08, BETA: 0.5, MULTIWAY_FLOOR: 0.5 };
  const RANK_MAP = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'T':10,'J':11,'Q':12,'K':13,'A':14 };
  function parseCard2(str){ if(!str||str.length<2) return null; const r=str[0].toUpperCase(), s=str[1].toLowerCase(); return {r,rank:RANK_MAP[r],suit:s}; }
  function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
  function boardWetnessScore(flop){
    try{
      if(!Array.isArray(flop)||flop.length<3) return 0;
      const c = flop.map(parseCard2).filter(Boolean); if(c.length<3) return 0;
      const ranks = c.map(x=>x.rank).sort((a,b)=>a-b);
      const suits = c.map(x=>x.suit);
      const distinct = new Set(ranks).size;
      const suitCount = suits.reduce((m,s)=>(m[s]=(m[s]||0)+1,m),{});
      const counts = Object.values(suitCount);
      const mono = counts.includes(3), two = counts.includes(2);
      let score = 0;
      if (mono) score+=35; else if (two) score+=20;
      const g1=ranks[1]-ranks[0], g2=ranks[2]-ranks[1], maxG=Math.max(g1,g2);
      const seq = (g1===1 && g2===1), oneTwo=( [g1,g2].sort().join()==="1,2" );
      if (seq) score+=25; else if (oneTwo) score+=18; else if (maxG>=3) score+=0;
      const need=new Set();
      for(let add=2; add<=14; add++){ const arr=[...ranks,add].sort((a,b)=>a-b); for(let i=0;i<2;i++){ const w=arr.slice(i,i+4); const span=w[3]-w[0]; if(span<=3){ need.add(add); break; } } }
      const n=need.size; if(n>=8) score+=20; else if(n>=5) score+=12; else if(n>=3) score+=6;
      const paired = (distinct<=2); if(paired) score-=10;
      const broad = ranks.filter(r=>r>=10).length; if(broad===3) score+=10;
      const lowConn = (!seq && ranks[2]<=9 && maxG===1); if(lowConn) score+=6;
      return clamp(score,0,100);
    }catch{return 0;}
  }
  function adjustedEquity(eq, opps, wetScore, A=CFG.ALPHA, B=CFG.BETA, FLOOR=CFG.MULTIWAY_FLOOR){
    if (!(eq>=0)) return 0;
    const eqFrac = eq / 100; // Converte % para 0..1
    const multi = Math.max(FLOOR, 1 - A*Math.max(0,(opps||1)-1));
    const wet = 1 - B * Math.max(0, Math.min(1, (wetScore||0)/100));
    const finalFrac = Math.max(0, Math.min(1, eqFrac*multi*wet));
    return finalFrac * 100; // Retorna em %
  }
  g.PCALC = g.PCALC || {}; g.PCALC.Multiway = { config: CFG, boardWetnessScore, adjustedEquity };
})(window);


(function (g) {
  // ===== DEFAULTS
  var DEFAULTS = {
    mountSelector: '#pcalc-toolbar',
    suggestSelector: '#pcalc-sugestao',
    potOddsCompact: true,
    potKey: 'potAtual', toCallKey: 'toCall', equityKey: 'equityPct',
    winKey: 'win', tieKey: 'tie',
    effStackKey: 'effStack', heroStackKey: 'heroStack', villainStackKey: 'villainStack',

    readState: function () {
      var PC = g.PC || g.PCALC || {};
      var st = PC.state || {};
      var ek='equityPct', pk='potAtual', tk='toCall', wk='win', tk2='tie';

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
      var winS = parseFlex(st[wk]); if (isFinite(winS) && winS > 1) winS /= 100;
      var tieS = parseFlex(st[tk2]); if (isFinite(tieS) && tieS > 1) tieS /= 100;
      var eqFromWT = (isFinite(winS) ? winS : NaN) + (isFinite(tieS) ? tieS/2 : 0);
      if (isFinite(eqFromWT)) eqFromWT *= 100; else eqFromWT = NaN;

      var eqFromDOM = (typeof extractEquityFromDOM === 'function') ? extractEquityFromDOM() : NaN;
      var eqFromState = Number(st[ek]); if (!isFinite(eqFromState)) eqFromState = NaN;

      var eqPct = NaN;
      if (isFinite(eqFromDOM)) eqPct = eqFromDOM;
      else if (isFinite(eqFromWT)) eqPct = eqFromWT;
      else if (isFinite(eqFromState)) eqPct = eqFromState;

      function num(x){ var n=Number(x); return isFinite(n)?n:NaN; }
      var potAtual = num(st[pk])||0;
      var toCall = num(st[tk])||0;
      var effStack = num(st[DEFAULTS.effStackKey]);
      if (!isFinite(effStack)) {
        var hs = num(st[DEFAULTS.heroStackKey]), vs = num(st[DEFAULTS.villainStackKey]);
        if (isFinite(hs) && isFinite(vs)) effStack = Math.min(hs, vs);
      }

      return {
        potAtual: potAtual, toCall: toCall,
        equityPct: isFinite(eqPct) ? +eqPct.toFixed(1) : NaN,
        rakePct: num(st.rakePct) || 0, rakeCap: (st.rakeCap != null ? Number(st.rakeCap) : Infinity),
        effStack: isFinite(effStack) ? effStack : NaN
      };
    },
    onUpdateText: null
  };

  // ===== STATE
  var state = {
    mounted: false, elements: {}, injectDecision: false, slowPlay: false,
    lastPotOdds: null, _cfg: null,
    overrides: { potAtual: undefined, toCall: undefined, equityPct: undefined, rakePct: undefined, rakeCap: undefined, effStack: undefined, bb: undefined, opps: 1 },
    observers: [], lastSuggestSnapshot: null,
    rangePolicy: {
      enabled: true, bb: NaN, tLow: 20, tHigh: 60,
      buckets: {
        low:  { enabled: true,  action: 'Aposte 80 á 100% (shove ok)' },
        mid:  { enabled: true,  action: 'Aposte 50 á 75%' },
        high: { enabled: true,  action: 'Aposte 40 á 60% (ou Slow Play)' }
      }
    },
    domNodes: { eqBreakEl: null, eqBarEl: null, suggestOutEl: null },
    domObs:   { eqBreak: null, eqBar: null, suggestOut: null, body: null },
    pollTimer: null, lastSelSignature: null
  };

  // ===== Utils
  function $(sel, root){ return (root||document).querySelector(sel); }
  function $$(sel, root){ return Array.from((root||document).querySelectorAll(sel)); }
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
    var m = (text||'').match(re); if (!m) return NaN;
    return parseFlexibleNumber(m[1]);
  }
  function extractEquityFromDOM(){
    var br = $('#eqBreak');
    if (br) {
      var win = matchPct(br.textContent, /Win:\s*([\d.,]+)%/i);
      var tie = matchPct(br.textContent, /Tie:\s*([\d.,]+)%/i);
      if (isFinite(win)) return clamp01pct(win + (isFinite(tie)? tie/2 : 0));
    }
    var bar = $('#eqBarWin');
    if (bar && bar.style.width) return clamp01pct(parseFlexibleNumber(bar.style.width));
    var node = $$('div,span,small,p,li,td,th').find(n => /Win:\s*[\d.,]+%/i.test(n.textContent||''));
    if (node){
      var w2 = matchPct(node.textContent, /Win:\s*([\d.,]+)%/i);
      var t2 = matchPct(node.textContent, /Tie:\s*([\d.,]+)%/i);
      if (isFinite(w2)) return clamp01pct(w2 + (isFinite(t2)? t2/2 : 0));
    }
    return NaN;
  }
  
  function readWetness(){
    try {
      if (!g.PCALC || !g.PCALC.Multiway || typeof g.PCALC.Multiway.boardWetnessScore !== 'function') return 0;
      const PC = g.PC || {};
      const S = PC.state || {};
      if (Array.isArray(S.flop) && S.flop.length >= 3) return g.PCALC.Multiway.boardWetnessScore(S.flop);
      
      const cards = $$('[data-street="flop"] [data-card]').concat($$('[data-card].flop'));
      if (cards.length >= 3) {
        const txt = cards.slice(0, 3).map(el => (el.getAttribute('data-code') || el.textContent || '').trim()).filter(Boolean);
        if (txt.length >= 3) return g.PCALC.Multiway.boardWetnessScore(txt);
      }
      return 0;
    } catch (_) { return 0; }
  }

  function potOddsBE(potAtual, toCall, rakePct, rakeCap){
    var potFinal = (potAtual||0) + (toCall||0);
    var rake = Math.min(potFinal * (rakePct||0), rakeCap==null?Infinity:rakeCap);
    var potFinalEfetivo = Math.max(0, potFinal - rake);
    var be = (toCall||0) / (potFinalEfetivo || 1);
    return { be: be, bePct: +(be*100).toFixed(1) };
  }

  function decideByRanges(eqPct, bePct, slowPlay){
    if (!isFinite(eqPct)) return { rec:'Aguardando', detail:'Aguardando cartas…', tag:'wait' };
    var hasPotOdds = eqPct >= bePct;
    if (eqPct < 30) return { rec:'Desista', detail:'Equity < 30%', tag:'fold' };
    if (eqPct < 50) return hasPotOdds ? { rec:'Pague a aposta', detail:'30–49% de equity com pot odds', tag:'call' } : { rec:'Desista', detail:'30–50% de equity sem pot odds', tag:'fold' };
    if (eqPct < 70) return { rec:'Aposte 50 á 75% do pote', detail:'50–69% de equity. Aposte por valor.', tag:'value_bet_medium' };
    if (eqPct <= 80) return { rec:'Aposte 75 á 100% do pote', detail:'70–80% de equity. Maximize o valor.', tag:'value_bet_strong' };
    if (slowPlay) return { rec:'Slow Play: Aposte 33% do Pote ou Passe', detail:'>80% de equity. Induza blefes.', tag:'slow_play' };
    return { rec:'Aposte Pote ou All-in', detail:'>80% de equity. Extraia valor máximo.', tag:'nuts_value' };
  }
  
    function computeEffBB(effStack, bb){ if (!isFinite(effStack) || effStack<=0 || !isFinite(bb) || bb<=0) return NaN; return +(effStack / bb).toFixed(1); }
    function optionsHTML(selected){ return ['Aposte 40–60%','Aposte 50–75%','Aposte 75–100%','Aposte 80–100% (shove ok)','Aposte grande / All-in','Slow Play: passe / 33%','Pague a aposta','Desista'].map(o => `<option ${o===selected?'selected':''}>${o}</option>`).join(''); }
    function mapActionStringToRec(str){
        const map = { 'Aposte 40–60%':{rec:'Aposte 40–60% do pote',tag:'value_bet_light'},'Aposte 50–75%':{rec:'Aposte 50–75% do pote',tag:'value_bet_medium'},'Aposte 75–100%':{rec:'Aposte 75–100% do pote',tag:'value_bet_strong'},'Aposte 80–100% (shove ok)':{rec:'Aposte 80–100% (shove ok)',tag:'value_bet_push'},'Aposte grande / All-in':{rec:'Aposte grande / All-in',tag:'nuts_value'},'Slow Play: passe / 33%':{rec:'Slow Play: passe / 33% do pote',tag:'slow_play'},'Pague a aposta':{rec:'Pague a aposta',tag:'call'},'Desista':{rec:'Desista',tag:'fold'} };
        return map[str] || null;
    }
    function applyRangePolicy(result, ctx, policy){
        var out = Object.assign({}, result); var bb = Number(policy && policy.bb || ctx.bb || NaN); var effBB = computeEffBB(ctx.effStack, bb); if (isFinite(effBB)) out.effBB = effBB; if (!policy || !policy.enabled || !isFinite(out.equityPct) || out.equityPct < 50 || !isFinite(effBB)) return out;
        var low = Number(policy.tLow||NaN), high = Number(policy.tHigh||NaN); var bucket = null; if (isFinite(low) && effBB < low) bucket = 'low'; else if (isFinite(low) && isFinite(high) && effBB >= low && effBB <= high) bucket = 'mid'; else if (isFinite(high) && effBB > high) bucket = 'high'; if (!bucket) return out;
        var b = policy.buckets[bucket] || {}; if (!b.enabled) { out.bbBucket = bucket; return out; }
        var mapped = mapActionStringToRec(b.action); out.bbBucket = bucket; if (!mapped) return out;
        out.rec = mapped.rec; out.recTag = mapped.tag; var detailBase = out.recDetail || ''; var bucketPt = bucket==='low'?'baixo':(bucket==='mid'?'médio':'alto'); out.recDetail = (detailBase? detailBase+' · ':'') + `Regra BB: ${bucketPt} (${effBB} BB)`; return out;
    }
    function ttsSayNow(text){ try{ if(g.TTS && g.TTS.state.enabled){ g.speechSynthesis.cancel(); g.TTS.speak(text); } }catch(_){} }
    function inputsReady(ctx){ var p=Number(ctx.potAtual||0),c=Number(ctx.toCall||0); return p>0&&c>0; }
    function ttsRaise(result){ if (result.recTag !== 'wait') ttsSayNow('Sugestão: ' + result.rec + '.'); }

  function ensureCSS(){ /* ... CSS original ... */ }
  function buildPotInputs(initialPot, initialCall, initialEff, initialBB, initialOpps){
    function createField(label, id, placeholder, value){
        var wrap = el('div','field');
        var lbl  = el('span','fld-label'); lbl.textContent = label;
        var inpW = el('div','input-modern'); inpW.innerHTML=`<input id="${id}" type="number" step="1" min="0" placeholder="${placeholder}">`;
        var inp = inpW.querySelector('input');
        if (isFinite(value) && value >= 0) inp.value = String(value);
        wrap.appendChild(lbl); wrap.appendChild(inpW);
        return { wrap, input: inp };
    }
    var pot  = createField('Pot (fichas):', 'inp-pot',  'ex: 1200', initialPot);
    var call = createField('A pagar (fichas):', 'inp-call', 'ex: 400',  initialCall);
    var eff  = createField('Efetivo:', 'inp-eff',  'ex: 5000', initialEff);
    var bb   = createField('BB:', 'inp-bb',   'ex: 100',  initialBB);
    var opps = createField('Oponentes:', 'inp-opps', 'ex: 2', initialOpps);
    
    return { 
        potWrap: pot.wrap, callWrap: call.wrap, effWrap: eff.wrap, bbWrap: bb.wrap, oppsWrap: opps.wrap,
        potInput: pot.input, callInput: call.input, effInput: eff.input, bbInput: bb.input, oppsInput: opps.input
    };
  }
  
    function buildRangePolicyControls(){ var box=el('div','range-box'); box.innerHTML=`<div style="font-weight:700;margin-bottom:4px">Regras por Efetivo (BB)</div><div class="range-row"><label><input id="rp-en" type="checkbox" ${state.rangePolicy.enabled?'checked':''}> Ativar</label><span class="fld-label">Limite baixo (BB):</span><input id="rp-low" type="number" step="1" min="1" value="${state.rangePolicy.tLow}"><span class="fld-label">Limite alto (BB):</span><input id="rp-high" type="number" step="1" min="2" value="${state.rangePolicy.tHigh}"></div><div class="range-row"><label><input id="rp-low-en" type="checkbox" ${state.rangePolicy.buckets.low.enabled?'checked':''}> Baixo (&lt; low)</label><select id="rp-low-act" class="sel">${optionsHTML(state.rangePolicy.buckets.low.action)}</select></div><div class="range-row"><label><input id="rp-mid-en" type="checkbox" ${state.rangePolicy.buckets.mid.enabled?'checked':''}> Médio (low–high)</label><select id="rp-mid-act" class="sel">${optionsHTML(state.rangePolicy.buckets.mid.action)}</select></div><div class="range-row"><label><input id="rp-high-en" type="checkbox" ${state.rangePolicy.buckets.high.enabled?'checked':''}> Alto (&gt; high)</label><select id="rp-high-act" class="sel">${optionsHTML(state.rangePolicy.buckets.high.action)}</select></div>`; var en=box.querySelector('#rp-en'),lowI=box.querySelector('#rp-low'),highI=box.querySelector('#rp-high'),lowEn=box.querySelector('#rp-low-en'),midEn=box.querySelector('#rp-mid-en'),highEn=box.querySelector('#rp-high-en'),lowAc=box.querySelector('#rp-low-act'),midAc=box.querySelector('#rp-mid-act'),highAc=box.querySelector('#rp-high-act'); function rerender(){if(state._cfg){renderPotOddsUI(buildCtxFromCurrent(state._cfg),state._cfg);updateSendBtnLabel();}} en.addEventListener('change',function(){state.rangePolicy.enabled=!!en.checked;rerender();}); lowI.addEventListener('input',function(){var v=Number(lowI.value||0);if(isFinite(v)&&v>0)state.rangePolicy.tLow=v|0;rerender();}); highI.addEventListener('input',function(){var v=Number(highI.value||0);if(isFinite(v)&&v>0)state.rangePolicy.tHigh=v|0;rerender();}); lowEn.addEventListener('change',function(){state.rangePolicy.buckets.low.enabled=!!lowEn.checked;rerender();}); midEn.addEventListener('change',function(){state.rangePolicy.buckets.mid.enabled=!!midEn.checked;rerender();}); highEn.addEventListener('change',function(){state.rangePolicy.buckets.high.enabled=!!highEn.checked;rerender();}); lowAc.addEventListener('change',function(){state.rangePolicy.buckets.low.action=lowAc.value;rerender();}); midAc.addEventListener('change',function(){state.rangePolicy.buckets.mid.action=midAc.value;rerender();}); highAc.addEventListener('change',function(){state.rangePolicy.buckets.high.action=highAc.value;rerender();}); return box; }

  function renderControls(cfg){
    var mount = $(cfg.mountSelector); if (!mount) return null;
    var bar = el('div', 'raise-bar');

    var injWrap = el('div','field'); injWrap.innerHTML = '<span class="fld-label">Houve Ação ?</span><label class="rsw"><input type="checkbox" id="rsw-inject"><span class="slider"></span></label>';
    
    var st0 = cfg.readState();
    var pots = buildPotInputs(st0.potAtual, st0.toCall, st0.effStack, state.rangePolicy.bb, state.overrides.opps);

    var sendBtn = el('button','raise-send-btn'); sendBtn.id='btn-raise-send'; sendBtn.textContent='Enviar';
    
    var spWrap = el('div','field'); spWrap.innerHTML = '<span class="fld-label">Slow Play</span><label class="rsw"><input type="checkbox" id="rsw-slow"><span class="slider"></span></label>';
    
    var infoTxt = el('div'); infoTxt.id = 'eqStatus'; infoTxt.className = 'mut'; infoTxt.textContent = 'Ative se houver Apostas ou Aumento, para Calcular Pot Odds e Tomar a Melhor Decisão!';

    bar.appendChild(injWrap);
    bar.appendChild(pots.potWrap);
    bar.appendChild(pots.callWrap);
    bar.appendChild(pots.effWrap);
    bar.appendChild(pots.bbWrap);
    bar.appendChild(pots.oppsWrap);
    bar.appendChild(sendBtn);
    bar.appendChild(spWrap);
    bar.appendChild(infoTxt);
    mount.appendChild(bar);

    var policyBox = buildRangePolicyControls(); mount.appendChild(policyBox);

    var injCb = $('#rsw-inject'), spCb = $('#rsw-slow');
    injCb.checked = !!state.injectDecision; spCb.checked = !!state.slowPlay;

    function rerender(){ if (state._cfg) { renderPotOddsUI(buildCtxFromCurrent(state._cfg), state._cfg); updateSendBtnLabel(); } }
    injCb.addEventListener('change', function(){ setInjectDecision(!!injCb.checked, { source:'user', restore:true }); updateSendBtnLabel(); });
    spCb.addEventListener('change', function(){ state.slowPlay = !!spCb.checked; rerender(); });
    
    pots.potInput.addEventListener('input', function(){ state.overrides.potAtual = Number(this.value||0); rerender(); });
    pots.callInput.addEventListener('input', function(){ state.overrides.toCall = Number(this.value||0); rerender(); });
    pots.effInput.addEventListener('input', function(){ state.overrides.effStack = Number(this.value||0)||undefined; rerender(); });
    pots.bbInput.addEventListener('input', function(){ state.overrides.bb = Number(this.value||0)||undefined; state.rangePolicy.bb = state.overrides.bb; rerender(); });
    pots.oppsInput.addEventListener('input', function(){ state.overrides.opps = Number(this.value||0)||1; rerender(); });
    sendBtn.addEventListener('click', onEnviar);

    return { injCb, slowCb, potInput: pots.potInput, callInput: pots.callInput, effInput: pots.effInput, bbInput: pots.bbInput, oppsInput: pots.oppsInput, sendBtn };
  }
  
  function setInjectDecision(flag, opts){ state.injectDecision=!!flag; if(state.elements.injCb)state.elements.injCb.checked=state.injectDecision; if(!state.injectDecision && opts && opts.source==='user' && opts.restore) restoreDefaultSuggestion(); else if(state.injectDecision && state._cfg) renderPotOddsUI(buildCtxFromCurrent(state._cfg),state._cfg); }
  function updateSendBtnLabel(){ var btn = state.elements && state.elements.sendBtn; if (!btn || !state._cfg) return; var ctx = buildCtxFromCurrent(state._cfg); if (!state.injectDecision || !inputsReady(ctx)) { btn.textContent = 'Enviar'; return; } var res = computeDecision(ctx); btn.textContent = res && res.rec ? 'Enviar — ' + res.rec : 'Enviar'; }
    
  // ===== ATUALIZADO: Injeção no bloco principal com Equity Ajustada =====
  function injectDecisionIntoMain(result, ctx){
    var host=$('#suggestOut'); if(!host)return;
    if(state.lastSuggestSnapshot==null)state.lastSuggestSnapshot=host.innerHTML;
    
    var cls=result.recTag==='wait'?'warn':result.recTag==='fold'?'bad':'good';
    var glow=(result.recTag!=='wait'&&result.recTag!=='fold');
    var eqLabel=isFinite(result.equityPct)?(result.equityPct.toFixed(1)+'%'):'Aguardando…';

    // NOVO: Cria a string da Equity Ajustada com a comparação
    let eqAdjHtml = '';
    if (isFinite(result.eqAdj)) {
        const comparison = result.eqAdj < 30 ? `&lt; 30%` : ''; // &lt; é o código para o sinal de <
        eqAdjHtml = `<br>Equity Ajustada = ${result.eqAdj.toFixed(1)}% ${comparison}`;
    }

    host.innerHTML=`
      <div class="decision ${glow?'glow':''}">
        <div class="decision-title ${cls}">${result.rec}</div>
        <div class="decision-detail">
          BE ${result.bePct}% | EQ ${eqLabel}
          ${eqAdjHtml}
        </div>
        <div class="decision-detail" style="margin-top: 5px;">
           Pot ${Number(ctx.potAtual||0).toFixed(0)} | A pagar ${Number(ctx.toCall||0).toFixed(0)}
          ${result.effBB?` · Efetivo ${result.effBB} BB`:''}
          ${result.bbBucket?` · Faixa ${result.bbBucket}`:''}
          ${result.recDetail?' · '+result.recDetail:''}
        </div>
      </div>`;
  }

    function restoreDefaultSuggestion(){ var host=$('#suggestOut'); if(host&&state.lastSuggestSnapshot!=null) host.innerHTML=state.lastSuggestSnapshot; state.lastSuggestSnapshot=null; }
    function onEnviar(){ if(!state.injectDecision||!state._cfg)return; var ctx=buildCtxFromCurrent(state._cfg); if(!inputsReady(ctx))return; var res=computeDecision(ctx); injectDecisionIntoMain(res,ctx); ttsRaise(res); setInjectDecision(false,{source:'auto',restore:false}); try{ if(state.elements.potInput)state.elements.potInput.value=''; if(state.elements.callInput)state.elements.callInput.value=''; state.overrides.potAtual=0; state.overrides.toCall=0; if(state._cfg)renderPotOddsUI(buildCtxFromCurrent(state._cfg),state._cfg); updateSendBtnLabel(); }catch(_){} }

  function renderPotOddsUI(ctx, cfg){
    var out = $(cfg.suggestSelector); if(!out) return;

    var result = computeDecision(ctx);
    state.lastPotOdds = result;

    var eqLabel = isFinite(result.equityPct) ? (result.equityPct.toFixed(1) + '%') : 'Aguardando…';
    var recLabel = result.rec || 'Aguardando';
    var pillColor = result.recTag==='wait'?'#f59e0b':result.recTag==='fold'?'#ef4444':'#10b981';
    
    var eqAdjLabel = '—';
    if (isFinite(result.eqAdj)) {
        eqAdjLabel = result.eqAdj.toFixed(1) + '%';
    }

    out.innerHTML = `
      <div class="raise-potodds card">
        <div style="font-weight:700;margin-bottom:6px">Informações do Pot Odd</div>
        <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px">
          <div>Pot (fichas)</div><div><b>${ctx.potAtual ? ctx.potAtual.toFixed(0) : '—'}</b></div>
          <div>A pagar (fichas)</div><div><b>${ctx.toCall ? ctx.toCall.toFixed(0) : '—'}</b></div>
          <div>Oponentes</div><div><b>${ctx.opps || '—'}</b></div>
          <div>BE (pot odds)</div><div><b>${result.bePct}%</b></div>
          <div>Equity (MC)</div><div><b>${eqLabel}</b></div>
          <div>Equity Ajustada</div><div><b>${eqAdjLabel}</b></div>
          ${isFinite(result.effBB) ? `<div>Efetivo (BB)</div><div><b>${result.effBB}</b></div>` : ''}
          ${result.bbBucket ? `<div>Faixa (BB)</div><div><b>${result.bbBucket}</b></div>` : ''}
          <div>Recomendação</div>
          <div><span id="po-rec" style="padding:2px 8px;border-radius:999px;border:1px solid #22304a">${recLabel}</span></div>
        </div>
      </div>`;
    var pill = out.querySelector('#po-rec');
    if (pill){ pill.style.background=pillColor+'22'; pill.style.borderColor=pillColor+'66'; pill.style.color='#e5e7eb'; }

    updateSendBtnLabel();
  }

  function decideVsRaise(potAtual, toCall, equityPct, rakePct, rakeCap){
    var r = potOddsBE(potAtual, toCall, rakePct, rakeCap);
    var choice = decideByRanges(equityPct, r.bePct, !!state.slowPlay);
    return Object.assign({ bePct: r.bePct, equityPct: isFinite(equityPct)?+equityPct.toFixed(1):NaN }, choice);
  }

  // ===== ATUALIZADO: Função de decisão agora calcula e retorna a Equity Ajustada =====
  function computeDecision(ctx){
    // Decisão base com a equity normal (MC)
    var base = decideVsRaise(ctx.potAtual, ctx.toCall, ctx.equityPct, ctx.rakePct, ctx.rakeCap);

    // Aplica regras de range por BB
    var res = applyRangePolicy(base, ctx, state.rangePolicy);

    // Calcula e anexa a equity ajustada ao resultado final
    if (isFinite(ctx.equityPct)) {
        const wetness = readWetness();
        res.eqAdj = g.PCALC.Multiway.adjustedEquity(ctx.equityPct, ctx.opps, wetness);
    } else {
        res.eqAdj = NaN;
    }
    
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
      bb:       (state.overrides.bb != null ? state.overrides.bb : state.rangePolicy.bb),
      opps:     (state.overrides.opps != null ? state.overrides.opps : 1)
    };
  }
  
    function updateSuggestion(cfg){ renderPotOddsUI(buildCtxFromCurrent(cfg), cfg); }
    function attachDOMObservers(){ /* ... */ }
    function detachDOMObservers(){ /* ... */ }
    var API = {
        init: function(userCfg){ if(state.mounted)return; ensureCSS(); var cfg=Object.assign({},DEFAULTS,userCfg); var els=renderControls(cfg); if(!els)return; state.elements=els; state.mounted=true; state._cfg=cfg; attachDOMObservers(); updateSuggestion(cfg); },
        setState: function(patch){ patch=patch||{}; if('useDecisionInjection' in patch) setInjectDecision(!!patch.useDecisionInjection,{source:'code',restore:false}); if('slowPlay' in patch){state.slowPlay=!!patch.slowPlay; if(state.elements.slowCb)state.elements.slowCb.checked=state.slowPlay;} if('potAtual' in patch)state.overrides.potAtual=(patch.potAtual==null?undefined:Number(patch.potAtual)); if('toCall' in patch)state.overrides.toCall=(patch.toCall==null?undefined:Number(patch.toCall)); if('equityPct' in patch)state.overrides.equityPct=(patch.equityPct==null?undefined:Number(patch.equityPct)); if('rakePct' in patch)state.overrides.rakePct=(patch.rakePct==null?undefined:Number(patch.rakePct)); if('rakeCap' in patch)state.overrides.rakeCap=(patch.rakeCap==null?undefined:Number(patch.rakeCap)); if('effStack' in patch)state.overrides.effStack=(patch.effStack==null?undefined:Number(patch.effStack)); if('bb' in patch){state.overrides.bb=(patch.bb==null?undefined:Number(patch.bb));state.rangePolicy.bb=state.overrides.bb;} if('opps' in patch)state.overrides.opps=(patch.opps==null?undefined:Number(patch.opps)); if(state._cfg)renderPotOddsUI(buildCtxFromCurrent(state._cfg),state._cfg); updateSendBtnLabel(); },
        getRecommendation: function(){ return state.lastPotOdds || null; }
    };
    g.RAISE = API;

})(window);
