// ============ FUNÇÃO decide MODIFICADA ============
    function decide(eSmart, be) {
      if (!isFinite(eSmart) || !isFinite(be)) {
        return { label: 'Sem dados suficientes', level: 'neutral' };
      }

      // --- SUA NOVA REGRA ---
      // 1. Sempre desistir se a Smart Equity for < 30%
      if (eSmart < 30) {
        return { label: 'Passe ou Desista (Eq < 30%)', level: 'fold' };
      }

      // --- LÓGICA ORIGINAL ---
      // 2. Se for >= 30%, avalia contra o BE (Break-Even)
      if (eSmart >= be * 1.20) {
        return { label: 'Aposte por valor ( 50 a 75% do pote )', level: 'strong' };
      }
      if (eSmart >= be * 1.05) {
        return { label: 'Pague ou Aposte Baixo ( 33 a 50% do pote )', level: 'good' };
      }
      if (eSmart >= be * 0.95) {
        return { label: 'Pague ou Desista', level: 'thin' };
      }
      
      // 3. Se for >= 30%, mas não bate o BE (não é "bom"), desiste.
      return { label: 'Passe ou Desista', level: 'fold' };
    }
