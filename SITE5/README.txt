Como usar (sem mudar layout/cores/posições):
1) No seu HTML original, mantenha TUDO igual. Apenas substitua o <script> inline por:
   <script src="login-guard.js"></script>
   <script src="pcalc-core.js"></script>
   <script src="pcalc-chen.js"></script>
   <script src="pcalc-outs.js"></script>
   <script src="pcalc-suggest.js"></script>
   <script src="pcalc-tts.js"></script>
   <script src="pcalc-app.js"></script>
   (nessa ordem)
2) Não é preciso 'type="module"'. Tudo usa a namespace global PCALC, preservando o comportamento.
3) Nenhuma mudança em IDs/classes ou estrutura do HTML/CSS é necessária.
