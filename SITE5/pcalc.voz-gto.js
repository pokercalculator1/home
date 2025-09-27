// Generated on 2025-09-27T15:25:00.400351 by ChatGPT
/* ============================================================
   INÍCIO DO MÓDULO — pcalc.voz-gto.js
   Voz: prioriza leitura da linha .hero-gto-line; fallback
   ============================================================ */
(function (g) {
  const PC = g.PCALC || (g.PCALC = {});
  const S = {}; let lastSpoken = '';

  function pctToWords(p){ if(!p) return ''; const n = Number(String(p).replace('%',''))||0; return n ? `${n} por cento` : ''; }
  function normalizeAction(a){
    a = String(a||'').toUpperCase();
    if(/CHECK/.test(a)) return 'check';
    if(/CALL/.test(a))  return 'call';
    if(/FOLD/.test(a))  return 'fold';
    if(/OVERBET/.test(a)) return 'overbet';
    if(/SHOVE|ALL[- ]?IN/.test(a)) return 'all-in';
    if(/BET/.test(a))   return 'bet';
    return a.toLowerCase();
  }
  function buildSpeechFromDom(){
    const host = document.querySelector('#pcalc-sugestao') || document.querySelector('[data-sugestao]');
    if(!host) return '';
    const hero = host.querySelector('.hero-gto-line');
    if(hero && hero.textContent.trim()){
      const t = hero.textContent;
      const m = t.match(/Sugerido \(por mão\):\s*([A-Z\- ]+)\s*(\d+%)?/i);
      const cat = (t.match(/Reconhecido:\s*([^\·]+)/i)||[])[1]?.trim() || '';
      if(m){
        const action = normalizeAction(m[1]||'');
        const size   = pctToWords(m[2]||'');
        const sizePart = size ? ` ${size}` : '';
        const catPart  = cat ? ` (${cat})` : '';
        return `Sugestão por mão${catPart}: ${action}${sizePart}.`;
      }
    }
    const box = host.querySelector('.card, .suggestion, .gto, [data-gto]') || host;
    const txt = (box.textContent || '').trim();
    const m2 = txt.match(/\b(BET|CHECK|CALL|FOLD|OVERBET|SHOVE|ALL[- ]?IN)\s*([0-9]{2,3})?%?/i);
    if(m2){
      const action = normalizeAction(m2[1]);
      const sizeNum = m2[2] ? `${m2[2]}%` : '';
      const sizePart = sizeNum ? ` ${pctToWords(sizeNum)}` : '';
      return `Sugestão: ${action}${sizePart}.`;
    }
    return '';
  }
  function speak(text){
    if(!text || text===lastSpoken) return; lastSpoken = text;
    if(g.PCVOICE && typeof g.PCVOICE.speak === 'function'){ try { g.PCVOICE.speak(text); return; } catch(e){} }
    try{
      const u = new SpeechSynthesisUtterance(text);
      const sel = document.querySelector('[data-voz], [name="voz"], #ttsVoice');
      if(sel && sel.value){
        const want = String(sel.value).toLowerCase();
        const v = speechSynthesis.getVoices().find(v=> (v.name||'').toLowerCase().includes(want) || (v.lang||'').toLowerCase().includes(want));
        if(v) u.voice = v;
      }
      speechSynthesis.cancel(); speechSynthesis.speak(u);
    }catch(e){ console.warn('[VOZ-GTO] Fallback de voz falhou:', e); }
  }
  function attachObserver(){
    const host = document.querySelector('#pcalc-sugestao') || document.querySelector('[data-sugestao]');
    if(!host) return;
    const mo = new MutationObserver(()=>{
      const text = buildSpeechFromDom();
      const on = document.querySelector('[data-voz-toggle], #voz, [name="voz-enabled"], #ttsEnable');
      const enabled = on ? !!(on.checked || /ativo|on|true/i.test(on.value||'')) : true;
      if(enabled) speak(text);
    });
    mo.observe(host, { childList:true, subtree:true, characterData:true });
  }
  setTimeout(attachObserver, 600);
  console.info('[VOZ-GTO] ativo.');
})(window);
/* FIM DO MÓDULO — pcalc.voz-gto.js */
