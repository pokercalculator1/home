// pcalc-tts.js
(function(g){
  if(g.TTS) return; // se já existir, respeita
  const TTS = {
    state: { enabled: false, voice: null },
    populateVoices(){
      const sel = document.getElementById('ttsVoice');
      if(!sel) return;
      const voices = (g.speechSynthesis && g.speechSynthesis.getVoices && g.speechSynthesis.getVoices()) || [];
      sel.innerHTML = voices.map(v=>`<option value="${v.name}">${v.name}</option>`).join('') || '<option>(sem vozes)</option>';
      const pt = voices.find(v=>/pt-BR|Português/i.test(v.lang||v.name));
      TTS.state.voice = pt || voices[0] || null;
      if(TTS.state.voice) sel.value = TTS.state.voice.name;
    },
    speak(text){
      if(!TTS.state.enabled) return;
      if(!('speechSynthesis' in g)) return;
      const u = new SpeechSynthesisUtterance(text);
      if(TTS.state.voice) u.voice = TTS.state.voice;
      g.speechSynthesis.cancel();
      g.speechSynthesis.speak(u);
    }
  };
  g.TTS = TTS;
})(window);
