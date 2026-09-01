// ═══════════════════════════════════════════════════════════
// GLOSAS — A FILA DE TRABALHO DO RECURSO
//
// A tela existe para uma pergunta só: **o que vence primeiro?**
//
// Por isso a fila vem antes dos números, e a ordem é por URGÊNCIA, não por
// data de cadastro nem por valor. Quem some daqui perde o prazo, e prazo
// perdido não volta — não há segunda chance e ninguém é avisado.
//
// ⚠️ SAIU EM ARQUIVO PRÓPRIO. O `FaturamentoSus.jsx` já tem 1.300 linhas;
// enfiar mais uma aba lá dentro repetiria a história do `App.jsx`.
//
// ⚠️ AS REGRAS NÃO MORAM AQUI. Prazo, fila, taxa de recuperação e recusas
// estão em `glosas.js`, testadas por mutação. Aqui só se desenha.
// ═══════════════════════════════════════════════════════════

import { useState, useEffect, useMemo } from "react";
import {
  SITUACOES, filaDeTrabalho, resumoGlosas, porMotivo, recusasDaGlosa,
} from "./glosas.js";
import { carregarGlosas, salvarGlosa } from "./dados.js";
import { reais, centavos } from "./faturamento.js";
import { naoDeuParaLer, avisoDeFalha } from "../util/leitura.js";

// O banco guarda reais (numeric 12,2); `reais()` da casa recebe centavos.
// A conversão fica NUMA função só, na fronteira — e herda de graça a regra
// de que null vira "—" e nunca "R$ 0,00".
const brl = v => reais(centavos(v));

const CORES_PRAZO = {
  vencido:   { cor: "#f43f5e", rotulo: "VENCIDO" },
  sem_prazo: { cor: "#f59e0b", rotulo: "PRAZO NÃO INFORMADO" },
  critico:   { cor: "#fb923c", rotulo: "VENCE JÁ" },
  atencao:   { cor: "#facc15", rotulo: "atenção" },
  ok:        { cor: "#8d99ab", rotulo: "no prazo" },
  encerrada: { cor: "#8d99ab", rotulo: "encerrada" },
};

const cx = {
  card: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 13, padding: "16px 18px" },
  rotulo: { fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--text-muted)" },
  input: { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", color: "var(--text)", fontSize: 14, width: "100%", boxSizing: "border-box", fontFamily: "inherit" },
};

function Selo({ estado }) {
  const c = CORES_PRAZO[estado] || CORES_PRAZO.ok;
  const forte = estado === "vencido" || estado === "sem_prazo" || estado === "critico";
  return (
    <span style={{
      background: forte ? `${c.cor}22` : "transparent", color: c.cor,
      border: `1px solid ${c.cor}${forte ? "88" : "44"}`, borderRadius: 99,
      padding: "2px 9px", fontSize: 10.5, fontWeight: forte ? 800 : 600, whiteSpace: "nowrap",
    }}>{c.rotulo}</span>
  );
}

function Cartao({ label, valor, cor, nota }) {
  return (
    <div style={{ ...cx.card, borderLeft: `4px solid ${cor || "var(--border)"}`, minWidth: 158, flex: 1 }}>
      <div style={cx.rotulo}>{label}</div>
      <div style={{ fontSize: 23, fontWeight: 800, marginTop: 5, color: cor || "var(--text)", fontFamily: "JetBrains Mono, monospace" }}>{valor}</div>
      {nota && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>{nota}</div>}
    </div>
  );
}

const VAZIA = {
  conta_id: "", prontuario: "", competencia: "", valor_glosado: "",
  motivo_codigo: "", motivo: "", recebida_em: "", prazo_recurso_em: "",
  situacao: "recebida", recurso_enviado_em: "", recurso_protocolo: "",
  valor_recuperado: "", encerrada_em: "", observacao: "",
};

function FormGlosa({ inicial, onSalvar, onCancelar, salvando }) {
  const [g, setG] = useState({ ...VAZIA, ...(inicial || {}) });
  const campo = (k, v) => setG(x => ({ ...x, [k]: v }));

  // A validação da tela é a MESMA do banco — não uma cópia parecida.
  const recusas = recusasDaGlosa({
    ...g,
    conta_id: g.conta_id === "" ? null : Number(g.conta_id),
    valor_glosado: g.valor_glosado === "" ? null : Number(String(g.valor_glosado).replace(",", ".")),
    valor_recuperado: g.valor_recuperado === "" ? null : Number(String(g.valor_recuperado).replace(",", ".")),
  });

  const L = ({ children }) => <div style={{ ...cx.rotulo, marginBottom: 4 }}>{children}</div>;

  return (
    <div style={{ ...cx.card, marginBottom: 18 }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>
        {g.id ? `Glosa #${g.id}` : "Registrar glosa recebida"}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        <div><L>Conta *</L><input style={cx.input} value={g.conta_id} onChange={e => campo("conta_id", e.target.value)} placeholder="id da conta" /></div>
        <div><L>Prontuário</L><input style={cx.input} value={g.prontuario} onChange={e => campo("prontuario", e.target.value)} /></div>
        <div><L>Competência</L><input style={cx.input} value={g.competencia} onChange={e => campo("competencia", e.target.value)} placeholder="2026-08" /></div>
        <div><L>Valor glosado (R$) *</L><input style={cx.input} value={g.valor_glosado} onChange={e => campo("valor_glosado", e.target.value)} placeholder="850,00" /></div>

        <div><L>Recebida em *</L><input type="date" style={cx.input} value={g.recebida_em} onChange={e => campo("recebida_em", e.target.value)} /></div>
        <div>
          <L>Prazo do recurso</L>
          <input type="date" style={cx.input} value={g.prazo_recurso_em} onChange={e => campo("prazo_recurso_em", e.target.value)} />
          {/* 🔴 O sistema NÃO calcula esta data. O prazo muda por operadora,
              contrato e portaria; uma data inventada com cara de oficial
              esconderia glosa perdida ou daria alarme falso em glosa boa. */}
          <div style={{ fontSize: 10.5, color: "#f59e0b", marginTop: 4, lineHeight: 1.35 }}>
            {g.prazo_recurso_em ? " " : "Em branco a glosa entra no topo da fila como PRAZO NÃO INFORMADO — o sistema não inventa esta data."}
          </div>
        </div>

        <div><L>Código do motivo</L><input style={cx.input} value={g.motivo_codigo} onChange={e => campo("motivo_codigo", e.target.value)} placeholder="como veio da operadora" /></div>
        <div style={{ gridColumn: "span 2" }}><L>Motivo</L><input style={cx.input} value={g.motivo} onChange={e => campo("motivo", e.target.value)} /></div>

        <div>
          <L>Situação</L>
          <select style={cx.input} value={g.situacao} onChange={e => campo("situacao", e.target.value)}>
            {Object.entries(SITUACOES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <div><L>Recurso enviado em</L><input type="date" style={cx.input} value={g.recurso_enviado_em} onChange={e => campo("recurso_enviado_em", e.target.value)} /></div>
        <div><L>Protocolo do recurso</L><input style={cx.input} value={g.recurso_protocolo} onChange={e => campo("recurso_protocolo", e.target.value)} /></div>
        <div>
          <L>Valor recuperado (R$)</L>
          <input style={cx.input} value={g.valor_recuperado} onChange={e => campo("valor_recuperado", e.target.value)} placeholder="em branco = recurso não acabou" />
          {/* Branco ≠ zero, e a diferença decide a taxa de recuperação. */}
          <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 4, lineHeight: 1.35 }}>
            Em branco = recurso em andamento. Zero = recorreu e não voltou nada.
          </div>
        </div>
      </div>

      {recusas.length > 0 && (
        <ul style={{ margin: "14px 0 0", paddingLeft: 18, color: "#f43f5e", fontSize: 12.5, lineHeight: 1.6 }}>
          {recusas.map((r, i) => <li key={i}>{r}</li>)}
        </ul>
      )}

      <div style={{ display: "flex", gap: 9, marginTop: 16 }}>
        <button
          disabled={recusas.length > 0 || salvando}
          onClick={() => onSalvar(g)}
          style={{
            background: recusas.length ? "var(--surface-3)" : "#2dd4bf", color: recusas.length ? "var(--text-muted)" : "#062a26",
            border: "none", borderRadius: 8, padding: "9px 20px", fontWeight: 700,
            cursor: recusas.length || salvando ? "not-allowed" : "pointer", fontSize: 13,
          }}>{salvando ? "Gravando…" : "Gravar"}</button>
        <button onClick={onCancelar} style={{ background: "transparent", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 18px", cursor: "pointer", fontSize: 13 }}>Cancelar</button>
      </div>
    </div>
  );
}

export default function GlosasView({ sb, currentUser, canEdit }) {
  const [glosas, setGlosas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [form, setForm] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const hoje = new Date();

  async function recarregar() {
    if (!sb) { setGlosas([]); setCarregando(false); return; }
    setCarregando(true);
    setGlosas(await carregarGlosas(sb));
    setCarregando(false);
  }
  // Recarrega quando a conexão muda. `recarregar` fecha sobre `sb` e nada mais.
  useEffect(() => { recarregar(); }, [sb]);

  const fila = useMemo(() => filaDeTrabalho(glosas, hoje), [glosas]);
  const r = useMemo(() => resumoGlosas(glosas, hoje), [glosas]);
  const motivos = useMemo(() => porMotivo(glosas), [glosas]);
  const encerradas = useMemo(() => glosas.filter(g => !SITUACOES[g?.situacao]?.aberta), [glosas]);

  async function gravar(g) {
    setSalvando(true); setErro("");
    const res = await salvarGlosa(sb, {
      ...g,
      conta_id: Number(g.conta_id),
      valor_glosado: Number(String(g.valor_glosado).replace(",", ".")),
      valor_recuperado: g.valor_recuperado === "" ? null : Number(String(g.valor_recuperado).replace(",", ".")),
    }, currentUser);
    setSalvando(false);
    if (!res.ok) { setErro(res.motivo); return; }
    setForm(null);
    recarregar();
  }

  return (
    <div>
      <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 700 }}>Glosas</h2>
      <p style={{ margin: "0 0 6px", color: "var(--text-muted)", fontSize: 13 }}>
        Glosa recebida → recurso no prazo → recuperação. A fila abaixo está em ordem de urgência,
        não de cadastro.
      </p>
      <p style={{ margin: "0 0 18px", color: "var(--text-muted)", fontSize: 12 }}>
        A conferência que evita a glosa <em>antes</em> de enviar está na aba <strong>Tabela SIGTAP</strong>.
      </p>

      {/* 🔴 Lista que não deu para ler parece "nenhuma glosa" — e nenhuma
          glosa é a melhor notícia possível nesta tela. */}
      {naoDeuParaLer(glosas) && (
        <div role="alert" style={{ display: "flex", gap: 8, background: "#7f1d1d22", border: "1px solid #ef444455", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 12.5, color: "#fca5a5" }}>
          {avisoDeFalha("as glosas")}
        </div>
      )}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <Cartao label="Em aberto" valor={brl(r.valorEmAberto)} nota={`${r.abertas} glosa(s)`} />
        <Cartao label="Vencidas" valor={r.vencidas} cor={r.vencidas ? "#f43f5e" : undefined} nota="prazo passou" />
        <Cartao label="Vence já" valor={r.criticas} cor={r.criticas ? "#fb923c" : undefined} nota="7 dias ou menos" />
        <Cartao label="Sem prazo" valor={r.semPrazo} cor={r.semPrazo ? "#f59e0b" : undefined} nota="ninguém informou" />
        <Cartao
          label="Recuperação"
          /* null ≠ 0%: "nenhum recurso terminou" não é "não recuperamos nada". */
          valor={r.taxaRecuperacao == null ? "—" : `${r.taxaRecuperacao.toFixed(0)}%`}
          cor={r.taxaRecuperacao == null ? undefined : r.taxaRecuperacao >= 50 ? "#22c55e" : "#f59e0b"}
          nota={r.taxaRecuperacao == null ? "nenhum recurso encerrado ainda" : `${brl(r.valorRecuperado)} de ${brl(r.glosadoEncerrado)}`}
        />
      </div>

      {canEdit && !form && (
        <button onClick={() => setForm({})} style={{ background: "#2dd4bf", color: "#062a26", border: "none", borderRadius: 8, padding: "9px 20px", fontWeight: 700, cursor: "pointer", fontSize: 13, marginBottom: 18 }}>
          + Registrar glosa recebida
        </button>
      )}
      {form && <FormGlosa inicial={form} salvando={salvando} onSalvar={gravar} onCancelar={() => { setForm(null); setErro(""); }} />}
      {erro && <div style={{ background: "#7f1d1d22", border: "1px solid #ef444455", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 12.5, color: "#fca5a5" }}>{erro}</div>}

      <section style={{ ...cx.card, marginBottom: 18 }}>
        <div style={{ ...cx.rotulo, marginBottom: 10 }}>Fila de trabalho ({fila.length})</div>
        {carregando ? <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>Carregando…</p>
         : fila.length === 0 ? (
          <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>
            {naoDeuParaLer(glosas) ? "Não foi possível ler." : "Nenhuma glosa em aberto."}
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--text-muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em" }}>
                  <th style={{ padding: "6px 8px" }}>Prazo</th>
                  <th style={{ padding: "6px 8px" }}>Dias</th>
                  <th style={{ padding: "6px 8px" }}>Conta</th>
                  <th style={{ padding: "6px 8px" }}>Motivo</th>
                  <th style={{ padding: "6px 8px", textAlign: "right" }}>Glosado</th>
                  <th style={{ padding: "6px 8px" }}>Situação</th>
                  {canEdit && <th style={{ padding: "6px 8px" }}></th>}
                </tr>
              </thead>
              <tbody>
                {fila.map(g => (
                  <tr key={g.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "8px" }}><Selo estado={g.prazoEstado} /></td>
                    <td style={{ padding: "8px", fontFamily: "JetBrains Mono, monospace", color: "var(--text-3)" }}>
                      {g.diasRestantes == null ? "—" : g.diasRestantes < 0 ? `${-g.diasRestantes}d atrás` : `${g.diasRestantes}d`}
                    </td>
                    <td style={{ padding: "8px" }}>#{g.conta_id}{g.prontuario ? ` · ${g.prontuario}` : ""}</td>
                    <td style={{ padding: "8px", color: "var(--text-3)", maxWidth: 260 }}>{g.motivo_codigo || ""} {g.motivo || <span style={{ color: "var(--text-muted)" }}>—</span>}</td>
                    <td style={{ padding: "8px", textAlign: "right", fontFamily: "JetBrains Mono, monospace" }}>{brl(g.valor_glosado)}</td>
                    <td style={{ padding: "8px", color: SITUACOES[g.situacao]?.cor }}>{SITUACOES[g.situacao]?.label}</td>
                    {canEdit && (
                      <td style={{ padding: "8px" }}>
                        <button onClick={() => setForm({ ...g, valor_recuperado: g.valor_recuperado ?? "" })} style={{ background: "transparent", border: "1px solid var(--border)", color: "var(--text-3)", borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontSize: 11.5 }}>abrir</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {motivos.length > 0 && (
        <section style={{ ...cx.card, marginBottom: 18 }}>
          <div style={{ ...cx.rotulo, marginBottom: 4 }}>Por que glosaram</div>
          {/* Dez glosas do mesmo motivo é processo quebrado, não azar — por
              isso a ordem é pelo que mais CUSTA, não pelo que mais aparece. */}
          <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 10 }}>Do que mais custa para o que menos. Motivo repetido é processo, não azar.</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <tbody>
              {motivos.map(m => (
                <tr key={m.motivo} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "7px 8px", fontWeight: 600 }}>{m.motivo}</td>
                  <td style={{ padding: "7px 8px", color: "var(--text-3)" }}>{m.descricao !== m.motivo ? m.descricao : ""}</td>
                  <td style={{ padding: "7px 8px", textAlign: "right", color: "var(--text-muted)" }}>{m.quantidade}×</td>
                  <td style={{ padding: "7px 8px", textAlign: "right", fontFamily: "JetBrains Mono, monospace" }}>{brl(m.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {encerradas.length > 0 && (
        <section style={cx.card}>
          <div style={{ ...cx.rotulo, marginBottom: 10 }}>Encerradas ({encerradas.length})</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <tbody>
              {encerradas.map(g => (
                <tr key={g.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "7px 8px", color: SITUACOES[g.situacao]?.cor }}>{SITUACOES[g.situacao]?.label}</td>
                  <td style={{ padding: "7px 8px" }}>#{g.conta_id}</td>
                  <td style={{ padding: "7px 8px", color: "var(--text-3)" }}>{g.motivo_codigo || g.motivo || "—"}</td>
                  <td style={{ padding: "7px 8px", textAlign: "right", fontFamily: "JetBrains Mono, monospace" }}>{brl(g.valor_glosado)}</td>
                  <td style={{ padding: "7px 8px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", color: "#22c55e" }}>
                    {g.valor_recuperado == null ? "—" : brl(g.valor_recuperado)}
                  </td>
                  {canEdit && <td style={{ padding: "7px 8px" }}><button onClick={() => setForm({ ...g, valor_recuperado: g.valor_recuperado ?? "" })} style={{ background: "transparent", border: "1px solid var(--border)", color: "var(--text-3)", borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontSize: 11.5 }}>abrir</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
