// ═══════════════════════════════════════════════════════════
// BLOCO CIRÚRGICO — AGENDAR E CANCELAR
//
// Os dois modais do ciclo do agendamento. Saíram do `BlocoPage.jsx`,
// que tinha 1.472 linhas, SEM UMA LINHA DE MUDANÇA — o que estava aqui
// é o mesmo texto, movido.
//
// ⚠️ `cirurgiasDoDia` e `salas` entram por prop porque a barreira de
// conflito de sala precisa do dia inteiro, não só desta cirurgia.
// ═══════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import { naoDeuParaLer } from "../util/leitura.js";
import { loadCcCirurgias, loadPacientesDoMapa } from "./dados.js";
import { indexarCadastros } from "./identidade-cirurgia.js";
import { fmtDataBR } from "../util/datas.js";
import { conflitosDeSala } from "./agenda.js";
import { CC_MOTIVOS_CANCELAMENTO, LATERALIDADE } from "./catalogo.js";
import { CARATER, procedimentoEscolhido } from "./equipe.js";
import { loadAtendimentosDoPaciente } from "./dados.js";
import { iniciaisDoAgendamento } from "./identidade-cirurgia.js";


// Modal de agendamento (nova cirurgia ou edição) com detecção de conflito de sala
export function AgendarCirurgiaModal({ sb, procedimentos = [], cirurgia, data, salas, cirurgiasDoDia, onClose, onSave }) {
  const [f, setF] = useState({
    data: cirurgia?.data || data, hora_prevista: cirurgia?.hora_prevista?.slice(0, 5) || "",
    duracao_prev_min: cirurgia?.duracao_prev_min || "", sala: cirurgia?.sala || "",
    iniciais: cirurgia?.iniciais || "", prontuario: cirurgia?.prontuario || "",
    procedimento: cirurgia?.procedimento || "", cirurgiao: cirurgia?.cirurgiao || "",
    procedimento_cod: cirurgia?.procedimento_cod || "",
    ps_atendimento_id: cirurgia?.ps_atendimento_id || "",
    carater_cod: cirurgia?.carater_cod || "",
    sitio_cirurgico: cirurgia?.sitio_cirurgico || "", lateralidade: cirurgia?.lateralidade || "",
    opme: cirurgia?.opme || "", observacao: cirurgia?.observacao || "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const inp = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 11px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" };
  const lbl = { fontSize: 11, fontWeight: 700, color: "var(--text-3)", display: "block", marginBottom: 5 };
  // 🔴 A CONFERÊNCIA DE CONFLITO SEGUE O DIA QUE A PESSOA ESCOLHEU.
  //
  // Antes era `f.data === data ? conflitosDeSala(...) : []` — ou seja, só
  // conferia quando a cirurgia era para o dia do mapa aberto. Mas mapa
  // cirúrgico se monta com dias de antecedência: marcar para outro dia é o
  // caso NORMAL, e nele a barreira ficava desligada em silêncio, sem a
  // faixa laranja e sem o aviso. Duas cirurgias às 08:00 na mesma sala de
  // amanhã entravam as duas, caladas — e o cabeçalho de `agenda.js` marca
  // isso como 🔴: "paciente anestesiado esperando sala, ou cirurgia adiada
  // com o paciente já em jejum desde a véspera".
  //
  // A regra pura já existia e já tinha teste. Só não estava sendo chamada.
  const mesmoDia = f.data === data;
  const [doOutroDia, setDoOutroDia] = useState(null);   // null = ainda não li
  useEffect(() => {
    if (mesmoDia || !sb || !f.data) { setDoOutroDia(null); return; }
    let vivo = true;
    setDoOutroDia(null);
    loadCcCirurgias(sb, f.data).then(r => { if (vivo) setDoOutroDia(r); });
    return () => { vivo = false; };
  }, [sb, f.data, mesmoDia]);

  // 🔴 SEM ELO, A CIRURGIA NÃO VIRA CONTA.
  //
  // `cc_cirurgias` era a única tabela clínica sem `ps_atendimento_id`.
  // A migração liga o que não tem dúvida (um único atendimento cobrindo
  // o dia) e deixa o resto em branco de propósito — adivinhar poria o
  // porte cirúrgico na conta do episódio errado. O que sobra se liga
  // AQUI, por quem sabe de qual episódio a cirurgia é.
  //
  // E é indispensável para a cirurgia AGENDADA com antecedência: ela
  // nasce antes de o episódio existir, então o backfill nunca a alcança.
  const [atendimentos, setAtendimentos] = useState([]);
  useEffect(() => {
    let vivo = true;
    const pront = f.prontuario.trim();
    if (!sb || !pront) { setAtendimentos([]); return; }
    loadAtendimentosDoPaciente(sb, pront).then(r => { if (vivo) setAtendimentos(r); });
    return () => { vivo = false; };
  }, [sb, f.prontuario]);

  // 🔴 AS INICIAIS PARAM DE SER DIGITADAS QUANDO O CADASTRO SABE QUEM É.
  //
  // Enquanto o campo aceitava texto livre, cada agendamento era uma chance
  // de inventar um rótulo para um paciente que o sistema já conhece pelo
  // número — e foi assim que o T9060 ("Clara Lima Barbosa") ganhou três
  // cirurgias como T.S.T., A.B.C. e M.O.S.
  //
  // `lido` separa "o cadastro não tem nome" de "ainda não perguntei": na
  // segunda o campo fica livre MAS a nota diz que nada será conferido.
  // Sem essa distinção, a tela em branco passaria por conferida.
  const [cadastro, setCadastro] = useState(null);
  const [cadastroLido, setCadastroLido] = useState(false);
  useEffect(() => {
    let vivo = true;
    const pront = f.prontuario.trim();
    setCadastro(null); setCadastroLido(false);
    if (!sb || !pront) return;
    loadPacientesDoMapa(sb, [pront]).then(r => {
      if (!vivo) return;
      // Leitura falhada NÃO vira "não cadastrado": `indexarCadastros`
      // devolve null, e aí a nota diz que não consegui ler.
      const mapa = indexarCadastros(r);
      setCadastro(mapa ? (mapa.get(pront) || null) : null);
      setCadastroLido(!!mapa);
    });
    return () => { vivo = false; };
  }, [sb, f.prontuario]);

  const doCadastro = iniciaisDoAgendamento(cadastro, { lido: cadastroLido });
  // Quando o cadastro manda, o campo passa a ser espelho dele — inclusive
  // na EDIÇÃO, e é de propósito: abrir e salvar uma cirurgia agendada com
  // iniciais erradas passa a ser o caminho de conserto.
  useEffect(() => {
    if (doCadastro.travado && f.iniciais !== doCadastro.valor) set("iniciais", doCadastro.valor);
  }, [doCadastro.travado, doCadastro.valor, f.iniciais]);

  const base = mesmoDia ? cirurgiasDoDia : doOutroDia;
  // "Ainda não li" e "não deu para ler" são a mesma coisa para quem decide:
  // nos dois casos a conferência NÃO foi feita, e isso tem de ser dito.
  const naoConferi = base == null || naoDeuParaLer(base);
  const conflitos = naoConferi
    ? []
    : conflitosDeSala(base, f.sala, f.hora_prevista, f.duracao_prev_min, cirurgia?.id);

  async function salvar() {
    if (!f.iniciais.trim() || !f.procedimento.trim()) { alert("Informe ao menos as iniciais do paciente e o procedimento."); return; }
    // O rótulo do campo diz `Prontuário *` desde sempre e nada conferia. Um
    // asterisco que mente é pior que a ausência dele, porque a pessoa
    // acredita que o sistema está olhando — e cirurgia sem prontuário não
    // fatura, não entra no prontuário do paciente, e torna indistinguíveis
    // dois pacientes com as mesmas iniciais no mesmo dia (Meta 1 da OMS).
    if (!f.prontuario.trim()) { alert("Informe o prontuário do paciente. Sem ele a cirurgia não identifica quem vai ser operado — e é por ele que o Sign In confere a identidade."); return; }
    if (naoConferi && !confirm(`NÃO consegui conferir se a sala ${f.sala || "escolhida"} já tem cirurgia em ${f.data} nesse horário.\n\nAgendar sem essa conferência?`)) return;
    if (conflitos.length && !confirm(`Atenção: a sala ${f.sala} já tem ${conflitos.length} cirurgia(s) nesse horário (${conflitos.map(c => c.iniciais).join(", ")}). Agendar mesmo assim?`)) return;
    setBusy(true);
    await onSave({
      data: f.data, hora_prevista: f.hora_prevista || null, duracao_prev_min: f.duracao_prev_min ? Number(f.duracao_prev_min) : null,
      sala: f.sala || null, iniciais: f.iniciais.trim(), prontuario: f.prontuario.trim() || null,
      procedimento: f.procedimento.trim(), cirurgiao: f.cirurgiao.trim() || null,
      procedimento_cod: f.procedimento_cod || null,
      ps_atendimento_id: f.ps_atendimento_id ? Number(f.ps_atendimento_id) : null,
      carater_cod: f.carater_cod || null,
      sitio_cirurgico: f.sitio_cirurgico.trim() || null,
      lateralidade: f.lateralidade || null,
      opme: f.opme.trim() || null, observacao: f.observacao.trim() || null,
    }, cirurgia?.id);
    setBusy(false);
  }
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", width: 540, maxWidth: "94vw", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>{cirurgia ? "Editar cirurgia" : "Agendar cirurgia"}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div><label style={lbl}>Data</label><input type="date" value={f.data} onChange={e => set("data", e.target.value)} style={inp} /></div>
          <div><label style={lbl}>Hora prevista</label><input type="time" value={f.hora_prevista} onChange={e => set("hora_prevista", e.target.value)} style={inp} /></div>
          <div><label style={lbl}>Duração (min)</label><input type="number" min="10" step="10" value={f.duracao_prev_min} onChange={e => set("duracao_prev_min", e.target.value)} placeholder="90" style={inp} /></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div><label style={lbl}>Sala</label>
            <select value={f.sala} onChange={e => set("sala", e.target.value)} style={inp}>
              <option value="">— definir depois —</option>
              {salas.map(s => <option key={s.nome} value={s.nome}>{s.nome}</option>)}
            </select></div>
          <div><label style={lbl}>Iniciais do paciente *</label>
            <input value={f.iniciais} onChange={e => set("iniciais", e.target.value)}
              readOnly={doCadastro.travado} aria-readonly={doCadastro.travado || undefined}
              title={doCadastro.travado ? "Vem do cadastro do prontuário — corrija no cadastro do paciente, não aqui." : undefined}
              placeholder="J.S.M."
              style={{ ...inp, ...(doCadastro.travado ? { background: "var(--surface-3)", color: "var(--text-2)", cursor: "not-allowed" } : {}) }} /></div>
          <div><label style={lbl}>Prontuário *</label><input value={f.prontuario} onChange={e => set("prontuario", e.target.value)} placeholder="48213" style={inp} /></div>
        </div>
        {/* A nota explica POR QUE o campo está travado — ou avisa que o que
            for digitado não será conferido. Campo travado sem explicação
            vira chamado de suporte; campo livre sem aviso vira T.S.T. */}
        {f.prontuario.trim() && (
          <div style={{ fontSize: 10.5, marginTop: -4, marginBottom: 10,
                        color: doCadastro.travado ? "var(--text-muted)" : "#fbbf24" }}>
            {doCadastro.travado ? "🔒 " : "⚠ "}{doCadastro.nota}
          </div>
        )}
        {/* A ausência de faixa laranja sempre significou "conferi e não há
            conflito". Quando a conferência NÃO foi feita, a tela tem de
            dizer isso — senão o silêncio continua passando por aprovação. */}
        {naoConferi && <div style={{ background: "#3a2d06", border: "1px solid #fbbf2466", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#fbbf24", fontWeight: 600, marginBottom: 10 }}>Ainda NÃO conferi se a sala já está ocupada em {f.data}. A ausência de aviso aqui não quer dizer que está livre.</div>}
        {conflitos.length > 0 && <div style={{ background: "#3d2206", border: "1px solid #f9731666", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#f97316", fontWeight: 600, marginBottom: 10 }}>Conflito de sala: já há {conflitos.length} cirurgia(s) na {f.sala} nesse intervalo.</div>}
        {/* O EPISÓDIO a que esta cirurgia pertence. */}
        <div style={{ marginBottom: 10 }}>
          <label style={lbl}>Atendimento (episódio)</label>
          <select value={f.ps_atendimento_id} onChange={e => set("ps_atendimento_id", e.target.value)} style={inp}
            aria-label="Atendimento a que esta cirurgia pertence">
            <option value="">— ainda não ligada</option>
            {atendimentos.map(a => (
              <option key={a.id} value={a.id}>
                #{a.id} · {fmtDataBR(a.chegada_em)} · {a.tipo_atendimento || "emergência"}
                {a.desfecho_em ? "" : " · EM ABERTO"}
              </option>
            ))}
          </select>
          {!f.ps_atendimento_id && (
            <div style={{ fontSize: 10.5, color: "#fbbf24", marginTop: 3 }}>
              {f.prontuario.trim() && atendimentos.length === 0
                ? "Este paciente não tem atendimento aberto. A cirurgia fica sem episódio até ele chegar — ligue depois, pela edição."
                : "Sem episódio, a cirurgia não entra na conta de ninguém."}
            </div>
          )}
        </div>

        {/* 🔴 O CÓDIGO, não só o nome. Cirurgia é o procedimento de maior
            valor da tabela: sem SIGTAP não há AIH, sem TUSS não há guia
            TISS. Antes era um input livre, e o faturista redigitava tudo
            do papel — onde nasce o código trocado. O nome continua
            editável porque o catálogo nem sempre tem o termo que a sala
            usa, e porque cirurgia fora do catálogo ainda precisa entrar. */}
        <div style={{ marginBottom: 10 }}>
          <label style={lbl}>Procedimento do catálogo</label>
          <select value={f.procedimento_cod} style={inp}
            onChange={e => {
              const esc = procedimentoEscolhido(procedimentos, e.target.value);
              setF(prev => ({ ...prev, procedimento_cod: e.target.value,
                              procedimento: esc ? esc.nome : prev.procedimento }));
            }}>
            <option value="">— sem código (não fatura)</option>
            {procedimentos.map(o => <option key={o.codigo} value={o.codigo}>{o.codigo} — {o.nome}</option>)}
          </select>
          {!f.procedimento_cod && (
            <div style={{ fontSize: 10.5, color: "#fbbf24", marginTop: 3 }}>
              Sem código a cirurgia não vira conta: nem AIH, nem guia TISS.
            </div>
          )}
        </div>
        <div style={{ marginBottom: 10 }}><label style={lbl}>Procedimento *</label><input value={f.procedimento} onChange={e => set("procedimento", e.target.value)} placeholder="Ex.: Colecistectomia videolaparoscópica" style={inp} /></div>

        {/* 🔴 SÍTIO E LADO. O Sign In manda a equipe confirmar o sítio
            cirúrgico — e até aqui não havia onde guardá-lo: numa
            artroplastia, "joelho D" ou "joelho E" só existia se alguém
            escrevesse na observação. Cirurgia em lado errado é o evento
            que a Meta 4 da OMS existe para impedir. */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 160px", gap: 10, marginBottom: 10 }}>
          <div><label style={lbl}>Sítio cirúrgico</label>
            <input value={f.sitio_cirurgico} onChange={e => set("sitio_cirurgico", e.target.value)} placeholder="Ex.: joelho, vesícula, hérnia inguinal" style={inp} /></div>
          <div><label style={lbl}>Lado</label>
            <select value={f.lateralidade} onChange={e => set("lateralidade", e.target.value)} style={inp}>
              <option value="">—</option>
              {Object.entries(LATERALIDADE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></div>
        </div>

        <div style={{ marginBottom: 10 }}>
          <label style={lbl}>Caráter</label>
          <select value={f.carater_cod} onChange={e => set("carater_cod", e.target.value)} style={inp}>
            <option value="">—</option>
            {CARATER.map(c => <option key={c.chave} value={c.chave}>{c.label}</option>)}
          </select>
          <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 3 }}>
            Exigido na AIH. Separa os indicadores: cancelamento de eletiva é cobrança de gestão; de urgência, não é comparável.
          </div>
        </div>
        <div style={{ marginBottom: 10 }}><label style={lbl}>Cirurgião</label><input value={f.cirurgiao} onChange={e => set("cirurgiao", e.target.value)} placeholder="Sobrenome do cirurgião" style={inp} /></div>
        <div style={{ marginBottom: 10 }}><label style={lbl}>Materiais e OPME necessários</label><textarea value={f.opme} onChange={e => set("opme", e.target.value)} rows={2} placeholder="Ex.: kit vídeo, clipes de titânio; OPME: prótese X (fornecedor Y)" style={{ ...inp, resize: "vertical", lineHeight: 1.5 }} /></div>
        <div style={{ marginBottom: 16 }}><label style={lbl}>Observação</label><input value={f.observacao} onChange={e => set("observacao", e.target.value)} placeholder="Opcional" style={inp} /></div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ background: "var(--surface)", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 16px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Cancelar</button>
          <button onClick={salvar} disabled={busy} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "9px 20px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>{busy ? "…" : cirurgia ? "Salvar alterações" : "Agendar"}</button>
        </div>
      </div>
    </div>
  );
}

// Modal de cancelamento com motivo padronizado (alimenta o indicador da Fase C)
export function CancelarCirurgiaModal({ cirurgia, onClose, onConfirm }) {
  const [motivo, setMotivo] = useState("");
  const [outro, setOutro] = useState("");
  const inp = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 11px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" };
  function confirmar() {
    const m = motivo === "Outro" ? (outro.trim() ? `Outro: ${outro.trim()}` : "") : motivo;
    if (!m) { alert("Escolha o motivo do cancelamento."); return; }
    onConfirm(cirurgia, m);
  }
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", width: 420, maxWidth: "94vw" }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Cancelar cirurgia — {cirurgia.iniciais}</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>{cirurgia.procedimento}</div>
        <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", display: "block", marginBottom: 5 }}>Motivo do cancelamento *</label>
        <select value={motivo} onChange={e => setMotivo(e.target.value)} style={{ ...inp, marginBottom: 10 }}>
          <option value="">Escolha…</option>
          {CC_MOTIVOS_CANCELAMENTO.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        {motivo === "Outro" && <input value={outro} onChange={e => setOutro(e.target.value)} placeholder="Descreva o motivo" style={{ ...inp, marginBottom: 10 }} />}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
          <button onClick={onClose} style={{ background: "var(--surface)", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 16px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Voltar</button>
          <button onClick={confirmar} style={{ background: "#f43f5e", color: "#fff", border: "none", borderRadius: 6, padding: "9px 20px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>Confirmar cancelamento</button>
        </div>
      </div>
    </div>
  );
}
