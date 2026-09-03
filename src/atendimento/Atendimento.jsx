// ═══════════════════════════════════════════════════════════
// MÓDULO ATENDIMENTO — a casca com as duas frentes
//
// Recepção e Tabelas são trabalhos de pessoas diferentes, no mesmo módulo:
// a recepcionista abre atendimento o dia inteiro; o analista comercial
// mexe no catálogo de vez em quando, quando um convênio é negociado.
//
// Ficam juntos porque a segunda existe para a primeira funcionar — é a
// mesma organização do MV, onde Tabelas é submenu de Atendimento. Separar
// em dois módulos de menu esconderia essa dependência: quem visse a
// recepção com campos vazios não teria pista de onde resolver.
// ═══════════════════════════════════════════════════════════

import { useState } from "react";
import Recepcao from "./Recepcao.jsx";
import Agenda from "./Agenda.jsx";
import Consultas from "./Consultas.jsx";
import Faturamento from "./Faturamento.jsx";
import Tabelas from "./Tabelas.jsx";

const ABAS = [
  { chave: "recepcao", label: "Recepção", dica: "Identifica o paciente e abre o atendimento." },
  { chave: "agenda",   label: "Agenda",   dica: "Grade do ambulatório, marcação e o painel do dia." },
  { chave: "consultas", label: "Consultas", dica: "Pesquisa: histórico do paciente, período e número do atendimento." },
  { chave: "faturamento", label: "Faturamento", dica: "A conta do episódio: procedimento, material e medicamento, com a via." },
  { chave: "tabelas",  label: "Tabelas",  dica: "Convênios, planos, procedimentos e as listas da ficha." },
];

export default function Atendimento({ sb, currentUser, canEdit, abaInicial }) {
  // ⚠️ Só o valor INICIAL. Depois de montada, quem manda na aba é quem está
  // olhando a tela — não o clique que trouxe ela para cá.
  const [aba, setAba] = useState(abaInicial || "recepcao");

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div style={{ display: "flex", gap: 6, padding: "10px 1.5rem 0", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        {ABAS.map(a => (
          <button key={a.chave} onClick={() => setAba(a.chave)} title={a.dica}
            style={{
              background: "none", border: "none", cursor: "pointer", fontSize: 13,
              fontWeight: aba === a.chave ? 700 : 500,
              color: aba === a.chave ? "var(--text)" : "var(--text-muted)",
              padding: "8px 14px", borderBottom: `2px solid ${aba === a.chave ? "#22d3ee" : "transparent"}`,
            }}>
            {a.label}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, overflow: "hidden" }}>
        {aba === "recepcao" && <Recepcao sb={sb} currentUser={currentUser} canEdit={canEdit} />}
        {aba === "agenda"   && <Agenda   sb={sb} currentUser={currentUser} canEdit={canEdit} />}
        {/* `currentUser` entra para o rodapé dos impressos: papel com dado
            de paciente sem autor é o vazamento que ninguém investiga porque
            ninguém sabe que aconteceu. Não vem `canEdit`: esta aba é de
            leitura, e imprimir não altera nada. */}
        {aba === "consultas" && <Consultas sb={sb} currentUser={currentUser} />}
        {aba === "faturamento" && <Faturamento sb={sb} currentUser={currentUser} canEdit={canEdit} />}
        {aba === "tabelas"  && <Tabelas  sb={sb} currentUser={currentUser} canEdit={canEdit} />}
      </div>
    </div>
  );
}
