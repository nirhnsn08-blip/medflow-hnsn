// ═══════════════════════════════════════════════════════════
// VALENTRAX MATERNITY CENTER — a casca do módulo
//
// A sub-navegação da visão "command center", no padrão do Faturamento
// (PR #77). Nasceu como esqueleto com painéis "em construção" e foi ganhando
// uma aba por fatia; com o Alojamento conjunto, a jornada fecha — da fila
// obstétrica à alta do binômio — e não há mais placeholder aqui.
//
// A leitura/escrita dos dados (mat_episodios/mat_admissoes) já está liberada
// pelo módulo `paciente` (ver a Fase 0), então quem cuida da gestante alcança
// os dados; este módulo controla a porta da MATERNIDADE no menu.
// ═══════════════════════════════════════════════════════════

import { useState } from "react";
import AdmissaoObstetrica from "./AdmissaoObstetrica.jsx";
import PartogramaView from "./PartogramaView.jsx";
import PartoView from "./PartoView.jsx";
import RecemNascidosView from "./RecemNascidosView.jsx";
import IndicadoresView from "./IndicadoresView.jsx";
import SegurancaMaternaView from "./SegurancaMaternaView.jsx";
import AlojamentoView from "./AlojamentoView.jsx";
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

export default function MaternidadePage({ sb, currentUser, canEdit }) {
  const [abaId, setAbaId] = useState("fila");

  // Paciente escolhida na fila, entregue à aba de destino como `pacienteInicial`.
  // Trocar de aba PELA MÃO (nav) limpa a seleção — só a fila pré-seleciona.
  const [selecao, setSelecao] = useState(null);   // { paciente, tab } | null

  function aoEscolherDaFila(item) {
    const paciente = { prontuario: item.prontuario, iniciais: item.iniciais, nome_completo: null, _fila: item };
    const tab = item.estado === ESTADO.ADMITIDA ? "trabalho" : "admissao";
    setSelecao({ paciente, tab });
    setAbaId(tab);
  }
  // Do painel de segurança para onde os vitais são lançados: o partograma é
  // quem mede de hora em hora. Ver quem precisa e não poder agir seria meia
  // funcionalidade.
  function aoRegistrarVitais(caso) {
    const paciente = { prontuario: caso.prontuario, iniciais: caso.iniciais, nome_completo: caso.nome || null };
    setSelecao({ paciente, tab: "trabalho" });
    setAbaId("trabalho");
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
              </button>
            );
          })}
        </nav>

        {/* Painel — o form rola AQUI (overflow próprio) */}
        <div style={{ flex: 1, minWidth: 0, overflowY: "auto", paddingRight: 6, paddingBottom: 20 }}>
          {/* A fila é o padrão: fecha a cadeia em vez de abrir, para um `abaId`
              desconhecido cair na porta de entrada do módulo, e não em nada. */}
          {abaId === "admissao"
            ? <AdmissaoObstetrica sb={sb} currentUser={currentUser} canEdit={canEdit} pacienteInicial={inicialPara("admissao")} />
            : abaId === "trabalho"
            ? <PartogramaView sb={sb} currentUser={currentUser} canEdit={canEdit} pacienteInicial={inicialPara("trabalho")} />
            : abaId === "partos"
            ? <PartoView sb={sb} currentUser={currentUser} canEdit={canEdit} pacienteInicial={inicialPara("partos")} />
            : abaId === "rn"
            ? <RecemNascidosView sb={sb} currentUser={currentUser} canEdit={canEdit} pacienteInicial={inicialPara("rn")} />
            : abaId === "alojamento"
            ? <AlojamentoView sb={sb} currentUser={currentUser} canEdit={canEdit} pacienteInicial={inicialPara("alojamento")} />
            : abaId === "indicadores"
            ? <IndicadoresView sb={sb} />
            : abaId === "seguranca"
            ? <SegurancaMaternaView sb={sb} onRegistrar={aoRegistrarVitais} />
            : <FilaObstetrica sb={sb} onEscolher={aoEscolherDaFila} />}
        </div>
      </div>
    </div>
  );
}
