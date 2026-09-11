// ═══════════════════════════════════════════════════════════
// VALENTRAX MATERNITY CENTER — a casca do módulo
//
// Primeira aparição na barra. Aqui é só o ESQUELETO: a sub-navegação da
// visão "command center" e os painéis marcados "em construção". Cada aba
// ganha conteúdo real nas fatias seguintes (a Admissão é a próxima). O padrão
// é o mesmo do Faturamento (PR #77): registrar o módulo e provar o
// encanamento — menu, permissão, render — antes de encher a tela.
//
// A leitura/escrita dos dados (mat_episodios/mat_admissoes) já está liberada
// pelo módulo `paciente` (ver a Fase 0), então quem cuida da gestante alcança
// os dados; este módulo controla a porta da MATERNIDADE no menu.
// ═══════════════════════════════════════════════════════════

import { useState } from "react";
import AdmissaoObstetrica from "./AdmissaoObstetrica.jsx";
import PartogramaView from "./PartogramaView.jsx";
import PartoView from "./PartoView.jsx";
import FilaObstetrica from "./FilaObstetrica.jsx";
import { ESTADO } from "./fila.js";

const ABAS = [
  { id: "fila",        label: "Fila obstétrica" },
  { id: "admissao",    label: "Admissão obstétrica" },
  { id: "trabalho",    label: "Trabalho de parto" },
  { id: "partos",      label: "Partos & cesáreas" },
  { id: "rn",          label: "Recém-nascidos" },
  { id: "alojamento",  label: "Alojamento conjunto" },
  { id: "seguranca",   label: "Segurança materna (MEOWS)" },
  { id: "indicadores", label: "Indicadores" },
];

const TURQ = "#2dd4bf";

const cx = {
  card: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 13, padding: "18px 20px" },
  rotulo: { fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--text-muted)" },
};

function Placeholder({ aba }) {
  return (
    <section style={{ ...cx.card, minHeight: 280, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center", gap: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: ".14em", textTransform: "uppercase", color: aba.proxima ? TURQ : "var(--text-muted)" }}>
        {aba.proxima ? "Próxima entrega" : "Em construção"}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700 }}>{aba.label}</div>
      <p style={{ margin: 0, maxWidth: 460, color: "var(--text-muted)", fontSize: 13.5, lineHeight: 1.6 }}>
        {aba.proxima
          ? "O formulário de admissão obstétrica (padrão FEBRASGO / Ministério da Saúde) já está desenhado e validado, com o motor de cálculo (IG, DPP, IMC, Bishop) e o MEOWS prontos. É a próxima fatia a entrar aqui."
          : "Esta frente entra em uma fatia futura do módulo, construída em cima da mesma fundação de dados."}
      </p>
    </section>
  );
}

export default function MaternidadePage({ sb, currentUser, canEdit }) {
  const [abaId, setAbaId] = useState("fila");
  const aba = ABAS.find(a => a.id === abaId) || ABAS[0];

  // Paciente escolhida na fila, entregue à aba de destino como `pacienteInicial`.
  // Trocar de aba PELA MÃO (nav) limpa a seleção — só a fila pré-seleciona.
  const [selecao, setSelecao] = useState(null);   // { paciente, tab } | null

  function aoEscolherDaFila(item) {
    const paciente = { prontuario: item.prontuario, iniciais: item.iniciais, nome_completo: null, _fila: item };
    const tab = item.estado === ESTADO.ADMITIDA ? "trabalho" : "admissao";
    setSelecao({ paciente, tab });
    setAbaId(tab);
  }
  function irParaAba(id) { setSelecao(null); setAbaId(id); }
  const inicialPara = tab => (selecao?.tab === tab ? selecao.paciente : undefined);

  return (
    // Altura cheia + scroll no painel: o app dá aos módulos uma coluna de
    // altura fixa com overflow:hidden (App.jsx), então cada módulo rola por
    // dentro — mesmo desenho do Faturamento. Sem isto, um form alto é cortado.
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* Cabeçalho do módulo — a identidade do Maternity Center */}
      <div style={{ flexShrink: 0, marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".16em", textTransform: "uppercase", color: TURQ }}>
          Valentrax Maternity Center
        </div>
        <h2 style={{ margin: "6px 0 2px", fontSize: 22, fontWeight: 800, letterSpacing: "-.01em" }}>Maternidade</h2>
        <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 13 }}>
          Uma jornada. Duas vidas. Um comando — mãe e recém-nascido, da admissão à alta.
        </p>
      </div>

      <div style={{ display: "flex", flex: 1, minHeight: 0, gap: 18 }}>
        {/* Sub-navegação lateral (padrão NSP/Faturamento) — scroll próprio */}
        <nav style={{ ...cx.card, padding: 8, width: 250, flexShrink: 0, alignSelf: "flex-start", maxHeight: "100%", overflowY: "auto" }}>
          {ABAS.map(a => {
            const on = a.id === abaId;
            return (
              <button key={a.id} onClick={() => irParaAba(a.id)} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                width: "100%", textAlign: "left", border: "none", borderRadius: 9, cursor: "pointer",
                padding: "9px 12px", marginBottom: 2, fontSize: 13, fontFamily: "inherit",
                background: on ? "color-mix(in srgb, #2dd4bf 16%, transparent)" : "transparent",
                color: on ? TURQ : "var(--text-2)", fontWeight: on ? 700 : 500,
              }}>
                {a.label}
                {a.proxima && <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".05em", color: on ? TURQ : "var(--text-muted)", border: `1px solid ${on ? TURQ : "var(--border-2)"}`, borderRadius: 99, padding: "1px 6px" }}>PRÓXIMA</span>}
              </button>
            );
          })}
        </nav>

        {/* Painel — o form rola AQUI (overflow próprio) */}
        <div style={{ flex: 1, minWidth: 0, overflowY: "auto", paddingRight: 6, paddingBottom: 20 }}>
          {abaId === "fila"
            ? <FilaObstetrica sb={sb} onEscolher={aoEscolherDaFila} />
            : abaId === "admissao"
            ? <AdmissaoObstetrica sb={sb} currentUser={currentUser} canEdit={canEdit} pacienteInicial={inicialPara("admissao")} />
            : abaId === "trabalho"
            ? <PartogramaView sb={sb} currentUser={currentUser} canEdit={canEdit} pacienteInicial={inicialPara("trabalho")} />
            : abaId === "partos"
            ? <PartoView sb={sb} currentUser={currentUser} canEdit={canEdit} pacienteInicial={inicialPara("partos")} />
            : <Placeholder aba={aba} />}
        </div>
      </div>
    </div>
  );
}
