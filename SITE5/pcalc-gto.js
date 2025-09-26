// Acrescente no pcalc-gto.js
(function(g){
  const PC = g.PCALC || (g.PCALC = {});
  const GTO = PC.GTO = PC.GTO || {};

  function inferSpot(st){
    const pos = (st && st.pos) || "";
    const callers = Number((st && st.callers) || 0);
    const raiseBB = Number((st && st.raiseBB) || 0);

    const headsUpFlop = callers === 1;        // SRP heads-up
    const heroIsBB = pos === "BB";
    const isSRP = raiseBB > 0;                // houve open preflop

    if (isSRP && headsUpFlop && !heroIsBB) return "SRP_IP_vs_BB_100bb"; // herói IP vs BB
    if (isSRP && headsUpFlop && heroIsBB)  return "SRP_OOP_vs_IP_100bb"; // herói BB vs IP
    return "UNIVERSAL_SAFE";
  }

  // Wrapper que decide o spot automaticamente
  GTO.suggestFlopAuto = async function ({hero, board}){
    const st = PC.state || {};
    const spot = inferSpot(st);

    if (spot === "SRP_IP_vs_BB_100bb") {
      // reaproveita seu pack atual BTN vs BB
      return GTO.suggestFlopLikeGTO({ spot: "SRP_BTNvsBB_100bb", hero, board });
    }

    // quando você tiver o pack OOP, troque aqui:
    // if (spot === "SRP_OOP_vs_IP_100bb") {
    //   return GTO.suggestFlopLikeGTO({ spot: "SRP_OOPvsIP_100bb", hero, board });
    // }

    // Caso contrário, deixa o app cair no fallback seguro
    return { ok:false, reason:`spot-not-supported:${spot}`, spot };
  };
})(window);
