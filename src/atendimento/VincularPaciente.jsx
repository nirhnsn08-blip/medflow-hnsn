// ═══════════════════════════════════════════════════════════
// "QUEM VEIO?" — ligar a pessoa do balcão à vaga da regulação
//
// 🔴 O QUE ISTO SUBSTITUI: um `prompt("Número do prontuário de quem veio:")`
// que gravava o número digitado sem mostrar de quem ele era. Um dígito
// trocado ligava a vaga — e depois a presença, o atendimento e a produção —
// a OUTRA pessoa real, e nada na tela denunciava. É o que a Meta 1 de
// segurança do paciente existe para impedir: identificar por dois dados que
// a pessoa confirma, não por um número que alguém digitou.
//
// Agora: procura pelo que a pessoa diz (nome, nascimento, CPF, Cartão SUS),
// abre a ficha COMPLETA, mostra nome, nascimento e mãe, e só liga depois do
// "é esta pessoa". Ficha unificada vai para a que vale; óbito recusa.
// ═══════════════════════════════════════════════════════════

import { useState } from "react";
import { buscarPacientes, carregarPaciente } from "./dados.js";
import { motivoSemBusca } from "./recepcao.js";
import { comoExibir, idadeDetalhada, avisoDeObito } from "../pacientes/identidade.js";
import { foiUnificado, prontuarioVigente } from "../pacientes/unificacao.js";
import { fmtDataBR } from "../util/datas.js";

const caixa = { marginTop: 8, padding: "10px 12px", borderRadius: 8, border: "1px solid #6366f155",
                background: "#6366f10d", fontSize: 12.5 };
const inp = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "7px 10px",
              color: "var(--text)", fontSize: 13, outline: "none", flex: 1, minWidth: 220 };
const btn = (cor, ativo = true) => ({
  background: ativo ? cor : "var(--surface-2)", color: ativo ? "#fff" : "var(--text-muted)",
  border: ativo ? "none" : "1px solid var(--border)", borderRadius: 6, padding: "6px 12px",
  fontWeight: 700, cursor: ativo ? "pointer" : "not-allowed", fontSize: 12, whiteSpace: "nowrap",
});
const neutro = { ...btn("var(--surface-2)", false), color: "var(--text)", cursor: "pointer" };

/**
 * Abre o cadastro que VALE para esta pessoa.
 *
 * A busca devolve só os campos da lista; óbito e unificação moram no
 * cadastro inteiro. E "não consegui abrir" não vira "pode ligar": sem a
 * ficha completa não há como saber se o número foi aposentado.
 */
export async function fichaQueVale(sb, prontuario) {
  const ficha = await carregarPaciente(sb, prontuario);
  if (!ficha) return { ok: false, motivo: "Não consegui abrir a ficha completa deste paciente. Tente de novo — sem ela não dá para conferir quem é." };
  if (!foiUnificado(ficha)) return { ok: true, paciente: ficha, nota: null };
  const para = prontuarioVigente(ficha);
  const vigente = await carregarPaciente(sb, para);
  if (!vigente) return { ok: false, motivo: `O prontuário ${ficha.prontuario} foi unificado em ${para}, e não consegui abrir o ${para}. Tente de novo.` };
  return { ok: true, paciente: vigente,
    nota: `O prontuário ${ficha.prontuario} foi unificado em ${para} — é a mesma pessoa, e a vaga vai para o ${para}.` };
}

export default function VincularPaciente({ sb, agendamento, onLigar, onCancelar }) {
  const [termo, setTermo] = useState("");
  const [achados, setAchados] = useState([]);
  const [procurou, setProcurou] = useState(false);
  const [escolhido, setEscolhido] = useState(null);
  const [nota, setNota] = useState(null);
  const [erro, setErro] = useState(null);
  const [busy, setBusy] = useState(false);

  async function procurar() {
    const sem = motivoSemBusca(termo);
    if (sem) { setErro(sem); setAchados([]); setProcurou(false); return; }
    setBusy(true); setErro(null); setEscolhido(null); setNota(null);
    const r = await buscarPacientes(sb, termo);
    setBusy(false);
    // Falha de consulta NÃO é "não cadastrado": aqui isso faria ligar a
    // vaga a outra pessoa da lista, ou desistir de quem está no balcão.
    if (!r.ok) { setAchados([]); setProcurou(false); setErro(`${r.motivo} Tente de novo — não é que o paciente não exista.`); return; }
    setAchados(r.lista); setProcurou(true);
  }

  async function escolher(p) {
    setBusy(true); setErro(null); setNota(null);
    const r = await fichaQueVale(sb, p.prontuario);
    setBusy(false);
    if (!r.ok) { setErro(r.motivo); return; }
    const obito = avisoDeObito(r.paciente);
    if (obito) { setErro(obito.agenda); return; }
    setEscolhido(r.paciente); setNota(r.nota);
  }

  async function ligar() {
    if (!escolhido || busy) return;
    setBusy(true);
    const r = await onLigar(escolhido);
    setBusy(false);
    if (r && !r.ok) setErro(r.motivo);
  }

  const idade = escolhido ? idadeDetalhada(escolhido.data_nascimento)?.rotulo : null;

  return (
    <div style={caixa} role="group" aria-label="Quem veio para esta vaga">
      <div style={{ fontWeight: 700, marginBottom: 6 }}>
        Quem veio para a vaga das {agendamento?.hora ? String(agendamento.hora).slice(0, 5) : "—"}?
        <span style={{ fontWeight: 400, color: "var(--text-muted)" }}> Procure pelo que a pessoa disser e confira antes de ligar.</span>
      </div>

      {!escolhido && (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input autoFocus value={termo} onChange={e => setTermo(e.target.value)}
              onKeyDown={e => e.key === "Enter" && procurar()}
              placeholder="Nome, data de nascimento, CPF, Cartão SUS ou prontuário" style={inp} />
            <button onClick={procurar} disabled={busy} style={btn("#6366f1", !busy)}>{busy ? "Procurando…" : "Procurar"}</button>
            <button onClick={onCancelar} style={neutro}>Fechar</button>
          </div>
          {procurou && achados.length === 0 && (
            <div style={{ marginTop: 8, color: "var(--text-muted)" }}>
              Nenhum paciente encontrado. Se for a primeira vez dele aqui, cadastre pela <strong>Recepção</strong> e volte para ligar a vaga.
            </div>
          )}
          {achados.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 8 }}>
              {achados.map(p => (
                <button key={p.prontuario} onClick={() => escolher(p)} disabled={busy}
                  style={{ ...neutro, textAlign: "left", fontWeight: 400 }}>
                  <strong>{comoExibir(p, { completo: true }) || p.iniciais}</strong>
                  {" · nasc. "}{p.data_nascimento ? fmtDataBR(p.data_nascimento) : (p.ano_nascimento || "—")}
                  {p.nome_mae ? ` · mãe ${p.nome_mae}` : ""}
                  {" · reg. "}{p.prontuario}
                  {p.obito ? <span style={{ color: "#fb7185" }}> · óbito registrado</span> : ""}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {escolhido && (
        <div>
          {nota && <div style={{ color: "#a5b4fc", marginBottom: 6 }}>{nota}</div>}
          <div style={{ lineHeight: 1.6 }}>
            Confirme com a pessoa no balcão:{" "}
            <strong>{comoExibir(escolhido, { completo: true }) || escolhido.iniciais}</strong>
            {escolhido.nome_social && escolhido.nome_completo ? <span style={{ color: "var(--text-muted)" }}> (registro: {escolhido.nome_completo})</span> : ""}
            {" · nascida(o) em "}<strong>{escolhido.data_nascimento ? fmtDataBR(escolhido.data_nascimento) : "data não cadastrada"}</strong>
            {idade ? ` (${idade})` : ""}
            {escolhido.nome_mae ? <> · mãe <strong>{escolhido.nome_mae}</strong></> : ""}
            {" · reg. "}{escolhido.prontuario}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            <button onClick={ligar} disabled={busy} style={btn("#6366f1", !busy)}>
              {busy ? "Ligando…" : "É esta pessoa — ligar à vaga"}
            </button>
            <button onClick={() => { setEscolhido(null); setNota(null); }} style={neutro}>Não é — procurar de novo</button>
          </div>
        </div>
      )}

      {erro && <div role="alert" style={{ marginTop: 8, color: "#fb7185" }}>{erro}</div>}
    </div>
  );
}
