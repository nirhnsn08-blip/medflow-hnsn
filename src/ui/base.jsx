// ═══════════════════════════════════════════════════════════
// A BASE VISUAL — cor, identidade do hospital, meses e ícone
//
// 🔴 POR QUE ISTO SAIU DO App.jsx
// Estas peças são as MAIS compartilhadas do sistema: `VX` é usado por 37
// declarações, `Icon` por 21, `MONTHS_FULL` por 12, `HOSPITAL_NOME` por 13.
// Enquanto viviam dentro do monólito, nenhum módulo podia sair sem levá-las
// junto — e levá-las junto quebraria todos os outros.
//
// Foi exatamente o que a medição mostrou ao planejar a extração do módulo
// de Segurança do Paciente: das 84 linhas que ele "compartilha", metade era
// isto. Tirar a base primeiro é o que torna cada extração seguinte barata.
//
// ⚠️ NADA AQUI TEM REGRA DE NEGÓCIO. São constantes de apresentação e um
// componente de ícone. Se algo com decisão clínica ou de acesso for parar
// aqui, está no lugar errado.
// ═══════════════════════════════════════════════════════════

import { fmt } from "../util/formato.js";

// A paleta da marca. Usada por quase toda tela do sistema.
export const VX = { turquesa: "#2dd4bf", azul: "#38bdf8", royal: "#1d4ed8", prata: "#8d99ab", marinho: "#101c30", marinho2: "#14233a", borda: "#23395a" };

// Identidade do hospital — vem do ambiente para o mesmo código servir a
// mais de uma casa, e cai no HNSN quando não há variável definida.
export const HOSPITAL_NOME  = import.meta.env?.VITE_HOSPITAL_NOME  || "Hospital Nossa Senhora de Navegantes";
export const HOSPITAL_SIGLA = import.meta.env?.VITE_HOSPITAL_SIGLA || "HNSN";

export const MONTHS_FULL = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
export const MONTHS      = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

// Ícones de linha (profissionais, sem emoji) — traço 1.8, herdam a cor do texto
const ICON_PATHS = {
  dashboard: <><rect x="3" y="3" width="7.5" height="9.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="5.5" rx="1.5"/><rect x="13.5" y="11.5" width="7.5" height="9.5" rx="1.5"/><rect x="3" y="15.5" width="7.5" height="5.5" rx="1.5"/></>,
  clinic:    <><path d="M4 21 V6 a2 2 0 0 1 2-2 h12 a2 2 0 0 1 2 2 v15"/><path d="M2 21 h20"/><path d="M12 7 v6 M9 10 h6"/><path d="M9.5 21 v-4 h5 v4"/></>,
  bed:       <><path d="M3 6 v12"/><path d="M3 15 h18 v3"/><path d="M3 11 h18 v4"/><circle cx="7" cy="8.5" r="1.6"/><path d="M11 11 V9 a1.5 1.5 0 0 1 1.5-1.5 H19 a2 2 0 0 1 2 2 V11"/></>,
  shield:    <><path d="M12 3 l7 3 v5.5 c0 4.2-2.9 7.4-7 9.5 -4.1-2.1-7-5.3-7-9.5 V6 z"/><path d="M9.2 12 l2 2 3.6-4"/></>,
  printer:   <><path d="M7 8 V4 h10 v4"/><rect x="4" y="8" width="16" height="8" rx="1.5"/><path d="M7 13 h10 v7 H7 z"/></>,
  clipboard: <><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5 V3 h6 v1.5"/><path d="M8.5 9.5 h7 M8.5 13 h7 M8.5 16.5 h4.5"/></>,
  upload:    <><path d="M4 17 v3 h16 v-3"/><path d="M12 15 V4"/><path d="M7.5 8.5 L12 4 l4.5 4.5"/></>,
  cloud:     <><path d="M7 18 a4.5 4.5 0 0 1 -.6-8.96 6 6 0 0 1 11.7 1.2 A4 4 0 0 1 17.5 18 z"/></>,
  users:     <><circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19.5 c0-3 2.5-5 5.5-5 s5.5 2 5.5 5"/><circle cx="16.8" cy="9.5" r="2.5"/><path d="M16.5 14.6 c2.4.3 4 2 4 4.4"/></>,
  activity:  <path d="M3 12 h4 l2.5-6.5 5 13 2.5-6.5 H21"/>,
  record:    <><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 13 h2 l1-2.5 2 5 1-2.5 H16"/><path d="M9 7 h6"/></>,
  scissors:  <><circle cx="6" cy="6" r="2.6"/><circle cx="6" cy="18" r="2.6"/><path d="M8.2 7.6 L20 18 M8.2 16.4 L20 6 M13.2 12 l1.6 1.4"/></>,
  pill:      <><rect x="3" y="8" width="18" height="8" rx="4" transform="rotate(-45 12 12)"/><path d="M8.5 8.5 l7 7"/></>,
  list:      <><path d="M8 6h12M8 12h12M8 18h10"/><path d="M4 6h.01M4 12h.01M4 18h.01"/></>,
  box:       <><path d="M12 3 l8 4.5 v9 L12 21 l-8-4.5 v-9 z"/><path d="M4 7.5 l8 4.5 8-4.5"/><path d="M12 12 v9"/></>,
  flask:     <><path d="M9 3h6"/><path d="M10 3v6l-4.5 8.5A1.6 1.6 0 0 0 7 20h10a1.6 1.6 0 0 0 1.5-2.5L14 9V3"/><path d="M7.5 14h9"/></>,
  lock:      <><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></>,
  chart:     <><path d="M4 4v16h16"/><rect x="7.5" y="12" width="2.6" height="5"/><rect x="12" y="8" width="2.6" height="9"/><rect x="16.5" y="5" width="2.6" height="12"/></>,
  chat:      <><path d="M4 5h16v11H9l-4 4v-4H4z"/><path d="M8 9h8M8 12.5h5"/></>,
  cart:      <><circle cx="9" cy="20" r="1.6"/><circle cx="17" cy="20" r="1.6"/><path d="M3 4h2.5l2.2 11.5h10.6L21 8H6.6"/></>,
  briefcase: <><rect x="3" y="7.5" width="18" height="12.5" rx="2"/><path d="M9 7.5V5.5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="M3 13h18"/></>,
  clock:     <><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/></>,
  checks:    <><path d="M4 12.5l3.5 3.5L14 9"/><path d="M11 15l1.6 1.6L20 9"/></>,
  truck:     <><rect x="2" y="6" width="12" height="10" rx="1.5"/><path d="M14 9.5h4l3 3.5v3h-7"/><circle cx="6.5" cy="18.5" r="1.8"/><circle cx="17.5" cy="18.5" r="1.8"/></>,
  // Porta de entrada — a Recepção. Ícone próprio para não dividir o
  // `record` com o Paciente 360: são módulos diferentes e o menu precisa
  // deixar isso óbvio.
  door:      <><path d="M4 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17"/><path d="M2.5 21h19"/><circle cx="13" cy="12.5" r="1"/></>,
};
export function Icon({ name, size = 15 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      {ICON_PATHS[name] || null}
    </svg>
  );
}

// ── O botão de contorno da casa ──
// ⚠️ CHAMAVA-SE `btnLeito`, e não é do Giro de Leitos: das 25 declarações
// que o usam, o Bloco Cirúrgico sozinho usa 14, e ainda aparece no
// Pronto-Socorro, no Paciente 360 e na visão geral. Nome errado em peça
// compartilhada custa caro — quem precisa de um botão de contorno fora de
// Leitos não reconhece este, e escreve o dele.
export function btnContorno(cor) {
  return { background: "transparent", border: `1px solid ${cor}55`, color: cor, borderRadius: 5, padding: "4px 10px", cursor: "pointer", fontSize: 12, fontWeight: 600 };
}

// A marca escrita, com o X em degradê. Usada no topo, no login e nos
// impressos.
export function VxWordmark({ size = 14, color = "inherit", spacing = ".1em" }) {
  return (
    <span style={{ fontWeight: 800, fontSize: size, letterSpacing: spacing, color }}>
      VALENTRA<span style={{ background: `linear-gradient(135deg, ${VX.azul}, ${VX.royal})`, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>X</span>
    </span>
  );
}

// O balão dos gráficos (recharts). Recebe o formato da casa em vez do
// padrão da biblioteca, para número grande não aparecer sem separador.
export const customTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "var(--surface-3)", border: "1px solid var(--border-2)", borderRadius: 6, padding: "8px 12px", fontSize: 12 }}>
      <div style={{ color: "var(--text-3)", marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || "var(--text)", display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ width: 8, height: 8, background: p.color, borderRadius: 2, display: "inline-block" }} />
          {p.name}: <strong>{fmt(p.value)}</strong>
        </div>
      ))}
    </div>
  );
};
