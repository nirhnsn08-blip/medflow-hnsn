// ═══════════════════════════════════════════════════════════
// PRIMEIRO USO — a faixa
//
// Fica no TOPO do painel, acima dos números, porque é ela que diz como ler
// os números. Embaixo deles seria lida depois — ou não seria lida.
//
// ⚠️ NÃO É ERRO, e não pode ter cara de erro. Hospital novo com cadastro
// vazio está exatamente onde deveria estar no primeiro dia; a faixa é uma
// instrução, não uma reclamação. Vermelho aqui assustaria quem acabou de
// comprar o sistema.
//
// As regras estão em `primeiro-uso.js`, testadas por mutação.
// ═══════════════════════════════════════════════════════════

import { textoDoPrimeiroUso } from "./primeiro-uso.js";

const TOM = {
  // Falta cadastro: é instrução. Âmbar, não vermelho.
  cadastro: { borda: "#f59e0b66", fundo: "#78350f22", cor: "#fcd34d" },
  // Não deu para ler: aí sim é falha, e usa a cor de falha da casa.
  duvida:   { borda: "#ef444455", fundo: "#7f1d1d22", cor: "#fca5a5" },
};

export default function PrimeiroUso({ checagens }) {
  const t = textoDoPrimeiroUso(checagens);
  if (!t) return null;
  const c = TOM[t.tom] || TOM.cadastro;

  return (
    <div role="status" style={{
      background: c.fundo, border: `1px solid ${c.borda}`, borderRadius: 10,
      padding: "12px 16px", marginBottom: 16, color: c.cor, fontSize: 12.5, lineHeight: 1.55,
    }}>
      <div style={{ fontWeight: 700, marginBottom: 3 }}>{t.titulo}</div>
      <div>{t.corpo}</div>
      {t.onde.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 9, alignItems: "center" }}>
          {t.onde.map(x => x.ir ? (
            // Quando a tela sabe navegar, vira botão. Ver o atalho do
            // cadastro de convênios: instrução escrita faz a pessoa achar o
            // menu sozinha, no primeiro minuto de uso.
            <button key={x.o} onClick={x.ir} style={{
              background: "transparent", color: c.cor, border: `1px solid ${c.borda}`,
              borderRadius: 6, padding: "3px 11px", cursor: "pointer", fontSize: 11.5, fontWeight: 700,
            }}>Cadastrar {x.o}</button>
          ) : (
            <span key={x.o} style={{ opacity: .9 }}>
              <strong>{x.o}:</strong> {x.onde}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
