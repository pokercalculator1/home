// tts.js — Módulo de Texto-para-Fala (Web Speech) com rótulos curtos
(function(){
  const TTS_STATE = { enabled:true, voice:null, last:'' }; // ativado por padrão

  // remove prefixos comuns e encurta nome
  function shortenName(name){
    if(!name) return '';
    let s = name
      .replace(/Microsoft\s*/gi,'')
      .replace(/Google\s*/gi,'')
      .replace(/Apple\s*/gi,'')
      .replace(/Enhanced\s*/gi,'')
      .replace(/Natural\s*/gi,'')
      .replace(/Desktop\s*/gi,'')
      .replace(/Offline\s*/gi,'')
      .replace(/Voice\s*/gi,'')
      .replace(/Speech\s*/gi,'')
      .replace(/\s{2,}/g,' ')
      .trim();
    if(s.length > 18) s = s.slice(0,18)+'…';
    return s;
  }

  function shortLabel(v){
    const nm = shortenName(v.name||'');
    const lg = (v.lang||'').replace('_','-');
    // exemplo: "pt-BR • Maria"
    let label = `${lg} • ${nm || 'voz'}`;
    if(label.length>22) label = label.slice(0,22)+'…';
    return label;
  }

  function populateVoices(){
    if(!('speechSynthesis' in window)) return;
    const sel = document.getElementById('ttsVoice');
    if(!sel) return;

    const voices = speechSynthesis.getVoices();
    sel.innerHTML = '';

    const pref = v => v.lang?.toLowerCase().startsWith('pt') ? 3
                 : v.lang?.toLowerCase().startsWith('es') ? 2
                 : v.lang?.toLowerCase().startsWith('en') ? 1 : 0;

    voices.sort((a,b)=>pref(b)-pref(a));
    voices.forEach(v=>{
      const opt=document.createElement('option');
      opt.value=v.name;
      opt.textContent= shortLabel(v);
      opt.title = `${v.name} (${v.lang})`; // nome completo no tooltip
      sel.appendChild(opt);
    });

    // escolhe padrão pt-* se houver
    let chosen = voices.find(v=>v.lang?.toLowerCase().startsWith('pt')) || voices[0];
    if(chosen){
      TTS_STATE.voice = chosen;
      const idx=[...sel.options].findIndex(o=>o.value===chosen.name);
      if(idx>=0) sel.selectedIndex=idx;
    }
  }

  function speak(text){
    if(!TTS_STATE.enabled || !('speechSynthesis' in window) || !text) return;
    if(text===TTS_STATE.last) return; // evita repetir a mesma fala
    TTS_STATE.last = text;
    try { speechSynthesis.cancel(); } catch(e){}
    const u = new SpeechSynthesisUtterance(text);
    u.lang  = (TTS_STATE.voice?.lang) || 'pt-BR';
    u.voice = TTS_STATE.voice || null;
    u.rate = 1; u.pitch = 1; u.volume = 1;
    speechSynthesis.speak(u);
  }

  window.TTS = { state:TTS_STATE, populateVoices, speak };
})();
