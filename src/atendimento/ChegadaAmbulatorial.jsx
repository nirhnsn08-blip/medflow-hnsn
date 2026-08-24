// ═══════════════════════════════════════════════════════════
// CHEGADA AMBULATORIAL — a etapa entre o agendamento e o atendimento
//
// POR QUE ISTO É UM COMPONENTE, E NÃO CÓDIGO DENTRO DA AGENDA
// Nasceu na Agenda (PR #111, fechado no #113). Agora a Recepção precisa da
// MESMA etapa: o paciente com hora marcada se apresenta no balcão, não na
// tela de quem publica grade. Copiar seria a terceira cópia divergente do
// mesmo formulário neste módulo — e a primeira já custou caro.
//
// O QUE ELE GARANTE, E QUE UM BOTÃO "PRESENÇA" SOLTO NÃO GARANTIA
//   • convênio, plano, carteira e senha — sem isso a consulta chega ao
//     faturamento sem quem paga, e o erro só aparece na competência;
//   • a classificação (tipo de atendimento, caráter, tipo de paciente) —
//     é o `tipo_atendimento_cod` que separa 1ª consulta de retorno na
//     pactuação;
//   • o MÉDICO com o CBO congelado — sem CBO a produção SUS não é glosada,
//     é REJEITADA no processamento, e some inteira;
//   • o cadastro real do paciente, não um `{ prontuario, iniciais: "?" }`.
//
// Quem confirma decide o desfecho: o componente avisa por `onConfirmado` e
// não desenha responsável nem impressos — as duas telas já têm essa etapa,
// e centralizá-la aqui obrigaria as duas a abrir mão da que já têm.
// ═══════════════════════════════════════════════════════════

import { useState } from "react";
import { comoExibir } from "../pacientes/identidade.js";
import { conferirFicha, DOMINIOS } from "./ficha.js";
import FontePagadora, { CampoCatalogo } from "./FontePagadora.jsx";
import { confirmarPresenca } from "./dados.js";

const cartao = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1.1rem 1.25rem", marginBottom: 14 };
const rotulo = { fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 };
const btn = (cor, ativo = true) => ({
  background: ativo ? cor : "var(--surface-2)", color: ativo ? "#000" : "var(--text-muted)",
  border: ativo ? "none" : "1px solid var(--border)", borderRadius: 6, padding: "9px 18px",
  fontWeight: 700, cursor: ativo ? "pointer" : "not-allowed", fontSize: 13, whiteSpace: "nowrap",
});

/**
 * A ficha inicial da chegada.
 *
 * O que a marcação já sabe vem preenchido; o que só se descobre com a pessoa
 * na frente (a carteirinha na mão) fica para a recepcionista.
 *
 * `unidade_origem_cod` NÃO é chute: `confirmarPresenca` grava exatamente
 * este valor. Sem ele aqui, a conferência cobrava "Origem do atendimento não
 * informado" — um aviso falso, para um campo que o painel nem desenha.
 */
export function fichaDaChegada(agendamento) {
  return {
    convenio_id: "", plano_id: "", carteira: "", carteira_validade: "",
    guia_numero: "", autorizacao_senha: "",
    tipo_atendimento_cod: agendamento?.tipo_atendimento_cod || "",
    especialidade_cod: agendamento?.especialidade_cod || "",
    unidade_origem_cod: "ambulatorio",
    tipo_paciente_cod: "", carater_cod: "",
    local_procedencia_cod: "", destino_cod: "",
  };
}

export default function ChegadaAmbulatorial({
  sb, currentUser, canEdit, agendamento, paciente,
  catalogos = {}, profissionais = [], espec = c => c,
  onConfirmado, onCancelar,
}) {
  const [ficha, setFicha] = useState(() => fichaDaChegada(agendamento));
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState(null);

  if (!agendamento || !paciente) return null;

  // Quem vai atender, congelado com o CBO no momento da abertura. A agenda
  // SABE quem é — e mesmo assim a presença abria o episódio sem médico.
  const medico = profissionais.find(p => p.username === agendamento.profissional_username) || null;

  const convenio = (catalogos.convenios || []).find(c => String(c.id) === String(ficha.convenio_id)) || null;
  const plano = (catalogos.planos || []).find(p => String(p.id) === String(ficha.plano_id)) || null;

  // `hoje` é a data do AGENDAMENTO, não a de agora: a carteirinha tem que
  // valer no dia do atendimento. Conferir contra hoje reprovaria carteira
  // que estava válida e foi renovada depois — o defeito que o #107
  // consertou no fechamento da conta.
  const conf = conferirFicha({
    paciente, convenio, plano, ficha, catalogos, medico,
    procedimento: (catalogos.procedimentos || []).find(p => p.codigo === ficha.procedimento_cod) || null,
    hoje: agendamento?.data ? new Date(`${String(agendamento.data).slice(0, 10)}T12:00:00`) : new Date(),
  });

  async function confirmar() {
    if (!canEdit || busy) return;
    setBusy(true); setErro(null);
    const r = await confirmarPresenca(sb, agendamento, { paciente, ficha, medico }, currentUser);
    setBusy(false);
    if (!r.ok) { setErro(r.motivo); return; }
    onConfirmado?.({ atendimento: r.atendimento, paciente, aviso: r.aviso || null });
  }

  return (
    <div style={{ ...cartao, borderLeft: "4px solid #0d9488" }}>
      <div style={rotulo}>Chegada — confirmar presença</div>
      <div style={{ fontSize: 13.5, fontWeight: 700 }}>
        {comoExibir(paciente, { completo: true }) || paciente.iniciais}
        <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>
          {" · reg. "}{paciente.prontuario}
          {agendamento.hora ? ` · ${String(agendamento.hora).slice(0, 5)}` : ""}
          {" · "}{espec(agendamento.especialidade_cod)}
        </span>
      </div>

      <FontePagadora catalogos={catalogos} ficha={ficha} onChange={setFicha} />

      {/* A classificação que o painel COBRA precisa ter onde ser respondida.
          Origem e especialidade ficam de fora porque já são conhecidas: uma
          vem cravada na gravação, a outra vem do agendamento. */}
      <div style={{ ...rotulo, marginTop: 16, marginBottom: 8 }}>Classificação do atendimento</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
        {DOMINIOS.filter(d => !["unidade_origem", "especialidade"].includes(d.chave)).map(d => (
          <CampoCatalogo key={d.chave} label={d.label} dica={d.dica}
            lista={catalogos[d.chave]} valor={ficha[`${d.chave}_cod`]}
            onChange={v => setFicha(f => ({ ...f, [`${d.chave}_cod`]: v }))} />
        ))}
      </div>

      <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 10 }}>
        {medico
          ? <>Atende: <strong>{medico.nome || medico.username}</strong>
              {medico.cbo
                ? <> · CBO {medico.cbo}</>
                : <span style={{ color: "#d97706" }}> · sem CBO no cadastro — a produção SUS não é processada sem ele</span>}
            </>
          : <span style={{ color: "#d97706" }}>Esta grade não tem profissional definido — o atendimento nasce sem médico e sem CBO.</span>}
      </div>

      {/* Pendência ao lado do botão, SEM modal — o padrão da casa desde o
          #114. Modal que dispara sempre ensina a fechar aviso sem ler. */}
      {conf.avisos.length > 0 && (
        <div style={{ marginTop: 14, padding: "10px 12px", borderRadius: 8, fontSize: 12,
                      background: conf.pendenciasGraves ? "#d9770610" : "var(--surface-2)",
                      border: `1px solid ${conf.pendenciasGraves ? "#d9770655" : "var(--border)"}` }}>
          <strong style={{ color: conf.pendenciasGraves ? "#d97706" : "var(--text-muted)" }}>
            {conf.pendenciasGraves
              ? `${conf.pendenciasGraves} pendência(s) que impedem o faturamento`
              : "Pendências menores"}
          </strong>
          <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
            {conf.avisos.map(a => (
              <div key={a.chave} style={{ color: a.gravidade === "alta" ? "var(--text)" : "var(--text-muted)" }}>
                • {a.texto}
              </div>
            ))}
          </div>
          <div style={{ color: "var(--text-muted)", marginTop: 7 }}>
            Nada disso impede a consulta. O que não fecha é a conta — e depois que o paciente for embora, isto vira telefonema.
          </div>
        </div>
      )}

      {erro && <div style={{ marginTop: 12, fontSize: 12.5, color: "#fb7185" }}>{erro}</div>}

      <div style={{ display: "flex", gap: 8, marginTop: 14, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={confirmar} disabled={busy || !canEdit} style={{ ...btn("#0d9488", !busy && canEdit), color: "#fff" }}>
          {busy ? "Confirmando…"
            : conf.pendenciasGraves
              ? `Confirmar com ${conf.pendenciasGraves} pendência(s)`
              : "Confirmar presença"}
        </button>
        <button onClick={onCancelar} style={{ ...btn("var(--surface-2)", false), color: "var(--text)" }}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
