// ═══════════════════════════════════════════════════════════
// CHECAGEM × DISPENSAÇÃO — a tela
//
// A regra mora em ./conciliacao.js (pura e testada). Aqui só entram carga,
// estado e desenho.
//
// ⚠️ ESTA TELA EXIGE O PRONTUÁRIO E O PS. As checagens estão em
// `pep_administracoes` e `ps_administracoes`, que o RLS libera para os
// módulos Paciente 360 e Pronto-Socorro. Sem eles a leitura volta VAZIA — e
// vazia aqui significaria "ninguém administrou nada", que é justamente a
// divergência mais grave. Por isso a tela se recusa a mostrar número a quem
// não tem acesso, em vez de mostrar zero.
// ═══════════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from "react";
import { farmFmtQtd } from "../clinico/alertas.js";
import { loadPsAtendimentos } from "../ps/dados.js";
import { AvisoLeitura, campoTexto } from "../ui/base.jsx";
import { fmtDataBR, horaFmt } from "../util/datas.js";
import { conciliar, PRAZO_SEM_CHECAGEM_H, TIPOS_DIVERGENCIA } from "./conciliacao.js";
import {
  loadAdministracoesDosAtendimentos, loadAdministracoesDosEpisodios, loadEpisodiosAbertos,
  loadFarmMedicamentos, loadFarmSaidasByAtendimentos, loadMovimentosDosEpisodios,
} from "./dados.js";

export default function FarmConciliacaoView({ sb, leProntuario, lePs }) {
  const [dados, setDados] = useState(null);
  const [meds, setMeds] = useState([]);
  const [busca, setBusca] = useState("");
  const [fonte, setFonte] = useState("");   // "" | internacao | ps

  const recarregar = useCallback(async () => {
    if (!sb) return;
    const [episodios, atendimentos] = await Promise.all([
      leProntuario ? loadEpisodiosAbertos(sb) : Promise.resolve([]),
      lePs ? loadPsAtendimentos(sb) : Promise.resolve([]),
    ]);
    const epIds = episodios.map(e => e.id);
    const atIds = atendimentos.map(a => a.id);
    const [admInt, movInt, admPs, movPs] = await Promise.all([
      loadAdministracoesDosEpisodios(sb, epIds),
      loadMovimentosDosEpisodios(sb, epIds),
      loadAdministracoesDosAtendimentos(sb, atIds),
      loadFarmSaidasByAtendimentos(sb, atIds),
    ]);
    setDados({ episodios, atendimentos, admInt, movInt, admPs, movPs });
  }, [sb, leProntuario, lePs]);

  useEffect(() => {
    recarregar();
    loadFarmMedicamentos(sb).then(setMeds);
    const onF = () => recarregar();
    window.addEventListener("focus", onF);
    return () => window.removeEventListener("focus", onF);
  }, [recarregar, sb]);

  if (!leProntuario && !lePs) {
    return (
      <div style={{ fontSize: 13, color: "#d97706", background: "#d9770610", border: "1px solid #d9770644", borderRadius: 10, padding: "14px 16px", lineHeight: 1.55 }}>
        Esta conferência cruza a <strong>checagem da enfermagem</strong> com a <strong>saída do estoque</strong>, e seu perfil não abre o prontuário nem o pronto-socorro.
        Sem essas duas leituras a tela mostraria "nenhuma dose administrada" para todo mundo — que é a própria divergência que ela procura. Peça o módulo Paciente 360 (leitura) para usá-la.
      </div>
    );
  }

  const medById = Object.fromEntries(meds.map(m => [m.id, m]));
  const nomeDe = id => medById[id]?.nome || `medicamento ${id}`;
  const d = dados || { episodios: [], atendimentos: [], admInt: [], movInt: [], admPs: [], movPs: [] };

  const epPorId = Object.fromEntries(d.episodios.map(e => [e.id, e]));
  const atPorId = Object.fromEntries(d.atendimentos.map(a => [a.id, a]));

  const divInternacao = conciliar({
    administracoes: d.admInt.map(a => ({ ...a, chave: a.episodio_id })),
    movimentos: d.movInt.map(m => ({ ...m, chave: m.episodio_id })),
  }).map(x => ({ ...x, fonte: "internacao", quem: epPorId[x.chave] }));

  const divPs = conciliar({
    administracoes: d.admPs.map(a => ({ ...a, chave: a.atendimento_id })),
    movimentos: d.movPs.map(m => ({ ...m, chave: m.atendimento_id })),
  }).map(x => ({ ...x, fonte: "ps", quem: atPorId[x.chave] }));

  const q = busca.trim().toLowerCase();
  const linhas = [...divInternacao, ...divPs].filter(x => {
    if (fonte && x.fonte !== fonte) return false;
    if (!q) return true;
    const quem = x.quem || {};
    return `${quem.iniciais || ""} ${quem.prontuario || ""} ${quem.leito || ""} ${nomeDe(x.medicamento_id)}`.toLowerCase().includes(q);
  });

  const conta = t => linhas.filter(x => x.tipo === t).length;

  return (
    <div>
      <AvisoLeitura oQue="as checagens e as saídas de estoque" listas={[d.admInt, d.movInt, d.admPs, d.movPs]} />
      {(!leProntuario || !lePs) && (
        <div style={{ fontSize: 11.5, color: "#d97706", marginBottom: 10 }}>
          Conferindo só {leProntuario ? "a internação" : "o pronto-socorro"}: seu perfil não lê {leProntuario ? "o pronto-socorro" : "o prontuário"}.
        </div>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        {Object.entries(TIPOS_DIVERGENCIA).map(([k, v]) => (
          <div key={k} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `4px solid ${v.cor}`, borderRadius: 10, padding: "12px 16px", minWidth: 230, flex: "1 1 230px" }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em" }}>{v.label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: conta(k) ? v.cor : "var(--text)", fontFamily: "JetBrains Mono, monospace" }}>{dados ? conta(k) : "—"}</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.45, marginTop: 2 }}>{v.explica}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar paciente, leito ou medicamento…" style={{ ...campoTexto, maxWidth: 320, flex: "1 1 220px" }} />
        <select value={fonte} onChange={e => setFonte(e.target.value)} style={{ ...campoTexto, maxWidth: 190 }}>
          <option value="">Origem: todas</option>
          <option value="internacao">Internação</option>
          <option value="ps">Pronto-socorro</option>
        </select>
        <span style={{ fontSize: 11.5, color: "var(--text-muted)", marginLeft: "auto" }}>{dados ? `${linhas.length} divergência(s)` : "carregando…"}</span>
      </div>

      {!dados ? null : linhas.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "2rem", border: "1px dashed var(--border)", borderRadius: 10 }}>
          Nenhuma divergência entre o que a enfermagem checou e o que saiu da farmácia.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {linhas.map((x, i) => {
            const t = TIPOS_DIVERGENCIA[x.tipo];
            const quem = x.quem || {};
            return (
              <div key={i} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `4px solid ${t.cor}`, borderRadius: 10, padding: "11px 14px" }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 9.5, fontWeight: 800, color: t.cor, border: `1px solid ${t.cor}66`, borderRadius: 99, padding: "1px 8px", textTransform: "uppercase" }}>{t.label}</span>
                  <strong style={{ fontSize: 13 }}>{nomeDe(x.medicamento_id)}</strong>
                  <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                    {x.fonte === "internacao" ? `leito ${quem.leito || "?"} · ` : "PS · "}{quem.iniciais || quem.prontuario || "paciente"}{quem.prontuario ? ` · reg. ${quem.prontuario}` : ""}
                  </span>
                  <span style={{ fontSize: 11.5, color: "var(--text-2)", marginLeft: "auto" }}>
                    {x.doses} dose(s) checada(s) · {farmFmtQtd(x.dispensado)} dispensado
                  </span>
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                  {x.primeiraDose ? `1ª checagem ${fmtDataBR(x.primeiraDose)} ${horaFmt(x.primeiraDose)}` : ""}
                  {x.primeiraDose && x.primeiraSaida ? " · " : ""}
                  {x.primeiraSaida ? `1ª saída ${fmtDataBR(x.primeiraSaida)} ${horaFmt(x.primeiraSaida)}` : ""}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 14, lineHeight: 1.5 }}>
        A conferência compara <strong>presença</strong>, não quantidade: a dose checada é "500 mg" e a saída é "2 comprimidos", e converter uma na outra sem a apresentação estruturada seria inventar número.
        "Dispensado e não checado" só aparece depois de {PRAZO_SEM_CHECAGEM_H} h.
      </div>
    </div>
  );
}
