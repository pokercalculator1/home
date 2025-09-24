// pcalc-tts.js
export const TTS = {
  state: { enabled: false, voice: null },
  populateVoices(){
    const sel = document.getElementById('ttsVoice');
    if(!sel) return;
    const voices = speechSynthesis.getVoices();
    sel.innerHTML = voices.map(v=>`<option value="${v.name}">${v.name}</option>`).join('') || '<option>(sem vozes)</option>';
    const pt = voices.find(v=>/pt-BR|Português/i.test(v.lang||v.name));
    TTS.state.voice = pt || voices[0] || null;
    if(TTS.state.voice) sel.value = TTS.state.voice.name;
  },
  speak(text){
    if(!TTS.state.enabled) return;
    if(!('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    if(TTS.state.voice) u.voice = TTS.state.voice;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }
};
window.TTS = TTS;
