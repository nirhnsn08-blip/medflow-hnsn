// ═══════════════════════════════════════════════════════════
// CADASTRO DE RECÉM-NASCIDO — a tela
//
// Só desenho. As regras estão em `recem-nascido.js` (puras, testadas): o
// nome provisório, o que é obrigatório, o prazo do registro civil e a que
// separa gêmeos de duplicata.
//
// POR QUE ESTE FORMULÁRIO É CURTO
// O cadastro comum tem trinta campos e pede nome, CPF e CNS. O bebê não tem
// nenhum dos três no dia em que nasce, e quem está no balcão tem minutos —
// o parto acabou de acontecer. Aqui se pede o que só existe agora: a DNV, a
// hora, o sexo e a ordem no parto. Endereço e telefone vêm da mãe, porque
// moram no mesmo lugar; o resto se completa depois, pelo cadastro normal.
//
// ⚠️ A MÃE NÃO É UM CAMPO — é o ponto de partida. Esta tela só abre a
// partir do cadastro dela, e é dela que sai o nome provisório, o vínculo do
// parto e o identificador que a pulseira do berçário exige.
// ═══════════════════════════════════════════════════════════

import { useState, useEffect } from "react";
import { comoExibir } from "./identidade.js";
import { nomeProvisorioDoRN, validarRecemNascido } from "./recem-nascido.js";
import { cadastrarRecemNascido, irmaosDoMesmoParto } from "../atendimento/dados.js";

const cartao = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1.1rem 1.25rem", marginBottom: 14 };
const rotulo = { fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 12 };
const inp = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" };
const lbl = { fontSize: 10.5, color: "var(--text-muted)", display: "block", marginBottom: 3 };
const btn = (cor, ativo = true) => ({
  background: ativo ? cor : "var(--surface-2)", color: ativo ? "#000" : "var(--text-muted)",
  border: ativo ? "none" : "1px solid var(--border)", borderRadius: 6, padding: "8px 16px",
  fontWeight: 700, cursor: ativo ? "pointer" : "not-allowed", fontSize: 12.5,
});

const hojeISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const agoraHHMM = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export default function RecemNascido({ sb, mae, currentUser, onCadastrado, onCancelar }) {
  // Data e hora vêm preenchidas com AGORA: o parto acabou de acontecer, e
  // obrigar a digitar o que o relógio já sabe é como se digita errado.
  const [f, setF] = useState({
    data_nascimento: hojeISO(), hora_nascimento: agoraHHMM(),
    sexo: "", dnv: "", ordem_nascimento: "",
  });
  const [irmaos, setIrmaos] = useState([]);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState("");
  const set = (k, v) => { setF(p => ({ ...p, [k]: v })); setMsg(""); };

  // 🔴 ESTA MÃE JÁ TEM OUTRO BEBÊ HOJE?
  //
  // É assim que se descobre que o parto foi múltiplo ANTES de criar o
  // segundo cadastro. Sem a pergunta, a recepção cria dois "RN de Maria"
  // idênticos — e a enfermagem do berçário fica com dois bebês e um nome.
  useEffect(() => {
    let vivo = true;
    if (!mae?.prontuario || !f.data_nascimento) { setIrmaos([]); return; }
    irmaosDoMesmoParto(sb, mae.prontuario, f.data_nascimento)
      .then(r => { if (vivo) setIrmaos(r); })
      .catch(() => { if (vivo) setIrmaos([]); });
    return () => { vivo = false; };
  }, [sb, mae?.prontuario, f.data_nascimento]);

  const ordem = f.ordem_nascimento || (irmaos.length ? String(irmaos.length + 1) : "");
  const nomeProvisorio = nomeProvisorioDoRN(mae?.nome_completo, { ordem });
  const v = validarRecemNascido({ mae, dnv: f.dnv, data_nascimento: f.data_nascimento, ordem: f.ordem_nascimento });

  async function salvar() {
    if (salvando) return;
    if (!v.ok) { setMsg("⚠️ " + v.erros.join(" ")); return; }
    setSalvando(true);
    const r = await cadastrarRecemNascido(sb, {
      mae,
      dados: {
        nome_completo: nomeProvisorio,
        data_nascimento: f.data_nascimento || null,
        hora_nascimento: f.hora_nascimento || null,
        dnv: f.dnv,
        ordem_nascimento: ordem ? Number(ordem) : null,
        sexo: f.sexo || null,
      },
    }, currentUser);
    setSalvando(false);
    if (!r.ok) { setMsg("⚠️ " + r.motivo); return; }
    onCadastrado?.(r.paciente);
  }

  return (
    <div style={cartao}>
      <div style={rotulo}>Cadastrar recém-nascido</div>

      <div style={{ fontSize: 12.5, marginBottom: 12 }}>
        Mãe: <strong>{comoExibir(mae, { completo: true }) || mae?.iniciais}</strong>
        <span style={{ color: "var(--text-muted)" }}> · prontuário {mae?.prontuario}</span>
      </div>

      {/* O nome que vai sair na pulseira, mostrado ANTES de gravar. É o
          único jeito de a recepção perceber que ficou igual ao do irmão. */}
      <div style={{ padding: "9px 12px", borderRadius: 8, marginBottom: 12,
                    background: "var(--surface-2)", border: "1px solid var(--border)" }}>
        <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>NOME PROVISÓRIO </span>
        <strong style={{ fontSize: 14, fontFamily: "JetBrains Mono, monospace" }}>
          {nomeProvisorio || "— escolha a mãe —"}
        </strong>
        <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 3 }}>
          Convenção nacional, e é o que vai na pulseira. Troque pelo nome da certidão quando ela sair.
        </div>
      </div>

      {irmaos.length > 0 && (
        // 🔴 PARTO MÚLTIPLO. Não é aviso de erro: é a informação que evita o
        // erro. Dois bebês da mesma mãe no mesmo dia precisam de nomes
        // diferentes, e a ordem já vem sugerida.
        <div style={{ padding: "9px 12px", borderRadius: 8, marginBottom: 12, fontSize: 12,
                      background: "#6366f110", border: "1px solid #6366f155" }}>
          <strong style={{ color: "#6366f1" }}>
            Esta mãe já tem {irmaos.length} bebê(s) cadastrado(s) nesta data — o parto foi múltiplo.
          </strong>
          <div style={{ marginTop: 4, color: "var(--text-muted)" }}>
            {irmaos.map(i => `${i.nome_completo}${i.hora_nascimento ? ` (${String(i.hora_nascimento).slice(0, 5)})` : ""}`).join(" · ")}
          </div>
          <div style={{ marginTop: 4, color: "var(--text-muted)" }}>
            Este é o <strong>{ordem || "?"}º</strong> do parto. Nome igual entre irmãos é o que faz a
            enfermagem trocar um pelo outro no berçário.
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "150px 110px 130px", gap: 10 }}>
        <div>
          <label style={lbl}>Data do nascimento</label>
          <input type="date" value={f.data_nascimento} onChange={e => set("data_nascimento", e.target.value)} style={inp} />
        </div>
        <div>
          <label style={lbl}>Hora</label>
          <input type="time" value={f.hora_nascimento} onChange={e => set("hora_nascimento", e.target.value)} style={inp} />
          <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 3 }}>
            Na primeira semana a idade se conta em horas.
          </div>
        </div>
        <div>
          <label style={lbl}>Sexo</label>
          <select value={f.sexo} onChange={e => set("sexo", e.target.value)} style={inp}>
            <option value="">—</option>
            <option value="M">Masculino</option>
            <option value="F">Feminino</option>
          </select>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 130px", gap: 10, marginTop: 10 }}>
        <div>
          <label style={lbl}>DNV — Declaração de Nascido Vivo</label>
          <input value={f.dnv} onChange={e => set("dnv", e.target.value)}
            placeholder="número da DNV" style={inp} />
          <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 3 }}>
            É o documento do bebê até a certidão sair — e é o que separa um gêmeo do outro.
          </div>
        </div>
        <div>
          <label style={lbl}>Ordem no parto</label>
          <input type="number" min="1" value={f.ordem_nascimento}
            onChange={e => set("ordem_nascimento", e.target.value)}
            placeholder={ordem || "1"} style={inp} />
        </div>
      </div>

      {v.pendencias.length > 0 && (
        <div style={{ marginTop: 12, padding: "9px 12px", borderRadius: 8, fontSize: 12,
                      background: "#d9770610", border: "1px solid #d9770655" }}>
          <strong style={{ color: "#d97706" }}>{v.pendencias.length} pendência(s)</strong>
          <div style={{ marginTop: 5, display: "flex", flexDirection: "column", gap: 3 }}>
            {v.pendencias.map(p => <div key={p.campo} style={{ color: "var(--text-muted)" }}>• {p.texto}</div>)}
          </div>
          <div style={{ color: "var(--text-muted)", marginTop: 6 }}>
            {/* A mesma regra do resto do módulo: não bloqueia. Bebê em parada
                respiratória precisa de prontuário AGORA. */}
            Pode cadastrar assim mesmo — o bebê precisa de prontuário agora. O que não pode é a pendência sumir.
          </div>
        </div>
      )}

      {msg && (
        <div style={{ marginTop: 12, padding: "9px 12px", borderRadius: 8, fontSize: 12.5,
                      background: "#f43f5e10", border: "1px solid #f43f5e55" }}>{msg}</div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button onClick={salvar} disabled={salvando || !v.ok} style={btn("#22d3ee", !salvando && v.ok)}>
          {salvando ? "Cadastrando…"
            : v.pendencias.length ? `Cadastrar com ${v.pendencias.length} pendência(s)` : "Cadastrar recém-nascido"}
        </button>
        <button onClick={onCancelar} style={{ ...btn("var(--surface-2)", false), color: "var(--text)" }}>Cancelar</button>
      </div>
    </div>
  );
}
