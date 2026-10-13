// ═══════════════════════════════════════════════════════════
// BLOCO CIRÚRGICO — CHECKLIST DE CIRURGIA SEGURA (OMS)
//
// As três fases, a contagem e a conferência de identidade. Saiu do
// `BlocoPage.jsx` sem mudança. As regras estão em `./cirurgia-segura.js`.
// ═══════════════════════════════════════════════════════════

import { useState } from "react";
import { CHECKLIST_OMS, LATERALIDADE } from "./catalogo.js";
import { MOTIVO_MIN, confirmados, conferirRegistro, contagemFecha, contagensQueNaoFecham } from "./cirurgia-segura.js";


/**
 * O modal do checklist de Cirurgia Segura.
 *
 * 🔴 ANTES ELE EXIGIA TODOS OS ITENS MARCADOS (`disabled={!todos}`), e isso
 * parecia rigor. É o contrário: uma equipe com divergência LEGÍTIMA — o
 * antibiótico profilático não foi dado porque o paciente é alérgico, e a
 * anestesia concordou — não conseguia registrar nada. A saída real, no
 * balcão, é marcar a caixinha mentindo. Checklist que empurra para a mentira
 * não mede segurança, mede obediência.
 *
 * Agora: item não confirmado é permitido e CUSTA descrever o que houve. É o
 * que a OMS pede e é o que vale numa análise de causa raiz — "6 de 7, faltou
 * o antibiótico, por alergia, decidido com a anestesia" é informação;
 * "7 de 7" marcado por obrigação não é.
 */
export function ChecklistOmsModal({ cirurgia, fase, identidade, onClose, onConfirm }) {
  const def = CHECKLIST_OMS[fase];
  const [marcados, setMarcados] = useState(() => def.itens.map(() => false));
  const [divergencia, setDivergencia] = useState("");
  const [contagem, setContagem] = useState({});
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState(null);

  const total = def.itens.length;
  const ok = confirmados(marcados);
  const todos = ok === total;
  const falta = conferirRegistro({ cirurgia, fase, marcados, divergencia, contagem });
  const furos = fase === "sign_out" ? contagensQueNaoFecham(contagem) : [];

  const inp = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6,
                padding: "7px 9px", color: "var(--text)", fontSize: 13, width: 72, textAlign: "center",
                fontFamily: "JetBrains Mono, monospace", boxSizing: "border-box" };
  const setC = (k, v) => setContagem(c => ({ ...c, [k]: v }));

  // Um par de contagem: entrou × saiu. Dois números, não uma caixinha —
  // "a contagem estava correta" marcado por alguém sem identificação tem
  // valor probatório zero, e corpo estranho retido é never event.
  // Função, NÃO componente: definido dentro do render, um componente novo
  // nasce a cada tecla e o React REMONTA o input — o nó some debaixo de
  // quem está digitando (perde foco, e um clique guardado erra o alvo).
  const par = (rotulo, chave, obrigatorio) => {
    const fecha = contagemFecha({ inicial: contagem[chave + "_inicial"], final: contagem[chave + "_final"] });
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
        <span style={{ fontSize: 12.5, color: "var(--text-2)", width: 120 }}>
          {rotulo}{obrigatorio && <span style={{ color: "#f43f5e" }}> *</span>}
        </span>
        <input type="number" min="0" aria-label={rotulo + " — contagem inicial"} placeholder="entrou"
          value={contagem[chave + "_inicial"] ?? ""} onChange={e => setC(chave + "_inicial", e.target.value)} style={inp} />
        <span style={{ color: "var(--text-muted)" }}>→</span>
        <input type="number" min="0" aria-label={rotulo + " — contagem final"} placeholder="saiu"
          value={contagem[chave + "_final"] ?? ""} onChange={e => setC(chave + "_final", e.target.value)} style={inp} />
        {fecha === true && <span style={{ color: "#34d399", fontSize: 12, fontWeight: 700 }}>fecha</span>}
        {fecha === false && <span style={{ color: "#f43f5e", fontSize: 12, fontWeight: 700 }}>NÃO FECHA</span>}
      </div>
    );
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem", width: 600, maxWidth: "94vw", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Cirurgia Segura — <span style={{ color: def.cor }}>{def.label}</span></div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Momento: {def.quando} · Paciente {identidade?.exibir || cirurgia.iniciais} · {cirurgia.procedimento}</div>

        {/* 🔴 A IDENTIDADE, NO ALTO DA TELA QUE MANDA CONFERI-LA.
            O item 1 deste checklist é "Paciente confirmou identidade". O
            cabeçalho mostrava as iniciais digitadas no agendamento, sem
            nunca compará-las com o cadastro — a conferência de identidade
            podia ser marcada contra o rótulo de outra pessoa. Aqui o aviso
            vem ANTES dos itens, com o nome do cadastro, porque depois de
            marcar já não serve. */}
        {identidade?.aviso && (
          <div role={identidade.grave ? "alert" : undefined}
            style={{ fontSize: 12, marginBottom: 8, padding: "8px 11px", borderRadius: 7, lineHeight: 1.5,
                     fontWeight: identidade.grave ? 700 : 500,
                     background: identidade.grave ? "#f43f5e18" : "#fbbf2410",
                     border: `1px solid ${identidade.grave ? "#f43f5e66" : "#fbbf2455"}`,
                     color: identidade.grave ? "#f43f5e" : "#fbbf24" }}>
            {/* A frase de comando é PRÓPRIA DESTE MODAL, e não repete a do
                cartão de propósito: aqui o próximo gesto da pessoa é marcar
                a caixinha da identidade, e é esse gesto que tem de parar.
                "Confirme antes de seguir" no mapa é orientação; aqui é
                instrução sobre o item que está na tela. */}
            <div style={{ marginBottom: 2 }}>
              {identidade.grave
                ? "🔴 NÃO marque o item de identidade antes de resolver isto:"
                : "⚠ A identidade deste paciente NÃO foi conferida com o cadastro:"}
            </div>
            {identidade.aviso}
          </div>
        )}

        {/* O sítio e o lado, ao lado do item que manda conferi-los. O
            checklist pedia para a equipe confirmar um dado que o sistema
            não guardava. */}
        {fase === "sign_in" && (
          <div style={{ fontSize: 12, marginBottom: 8, padding: "7px 10px", borderRadius: 7,
                        background: cirurgia.sitio_cirurgico ? "var(--surface-2)" : "#fbbf2410",
                        border: `1px solid ${cirurgia.sitio_cirurgico ? "var(--border)" : "#fbbf2455"}` }}>
            {cirurgia.sitio_cirurgico
              ? <>Sítio: <strong>{cirurgia.sitio_cirurgico}</strong>{cirurgia.lateralidade ? <> · lado <strong>{LATERALIDADE[cirurgia.lateralidade] || cirurgia.lateralidade}</strong></> : null}</>
              : <span style={{ color: "#fbbf24" }}>Sítio cirúrgico <strong>não registrado</strong> — confirme com a equipe e preencha na cirurgia antes de conferir este item.</span>}
          </div>
        )}

        <div style={{ fontSize: 11.5, color: "var(--text-3)", marginBottom: 14, lineHeight: 1.5 }}>Protocolo de Cirurgia Segura (OMS/Anvisa). Confirme cada item EM VOZ ALTA com a equipe antes de marcar.</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
          {def.itens.map((item, i) => (
            <label key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", background: marcados[i] ? def.cor + "11" : "var(--surface-2)", border: `1px solid ${marcados[i] ? def.cor + "55" : "var(--border)"}`, borderRadius: 8, padding: "9px 12px", cursor: "pointer", fontSize: 13, color: "var(--text-2)", lineHeight: 1.5 }}>
              <input type="checkbox" checked={marcados[i]} onChange={() => setMarcados(m => m.map((v, j) => j === i ? !v : v))} style={{ marginTop: 2, accentColor: def.cor, width: 16, height: 16, flexShrink: 0 }} />
              {item}
            </label>
          ))}
        </div>

        {fase === "sign_out" && (
          <div style={{ marginBottom: 14, padding: "11px 13px", background: "var(--surface-2)", border: "1px solid var(--border-2)", borderRadius: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 9 }}>
              Contagem — entrou → saiu
            </div>
            {par("Compressas", "compressas", true)}
            {par("Instrumentais", "instrumentais")}
            {par("Agulhas", "agulhas")}
          </div>
        )}

        {/* A divergência aparece quando é exigida — pedir sempre faria dela
            mais um campo a ignorar. */}
        {(!todos || furos.length > 0) && (
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#fbbf24", display: "block", marginBottom: 5 }}>
              {furos.length > 0
                ? `A contagem NÃO fecha (${furos.map(f => `${f.nome} ${f.inicial}/${f.final}`).join(", ")}). O que foi feito? *`
                : `Faltou confirmar ${total - ok} de ${total}. O que não foi confirmado, e como a equipe resolveu? *`}
            </label>
            <textarea value={divergencia} onChange={e => { setDivergencia(e.target.value); setErro(null); }} rows={2}
              placeholder="Ex.: antibiótico não administrado — paciente alérgico, conduta definida com a anestesia."
              style={{ background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", color: "var(--text)", fontSize: 13, width: "100%", boxSizing: "border-box", resize: "vertical", fontFamily: "Inter, sans-serif" }} />
            <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 3 }}>
              {divergencia.trim().length}/{MOTIVO_MIN} — isto é o que alguém vai ler numa análise de causa raiz.
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 11.5, color: todos ? def.cor : "#fbbf24", fontWeight: 700 }}>{ok}/{total} itens confirmados</span>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onClose} style={{ background: "var(--surface)", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 16px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Voltar</button>
            <button
              onClick={async () => {
                if (falta) { setErro(falta); return; }
                setBusy(true); setErro(null);
                const r = await onConfirm({ marcados, divergencia, contagem });
                setBusy(false);
                // O modal NÃO fecha sozinho: quem fecha é quem chamou, e só
                // depois de a gravação se confirmar.
                if (r && r.erro) setErro(r.erro);
              }}
              disabled={busy}
              title={falta || undefined}
              style={{ background: falta ? "var(--surface-3)" : def.cor, color: falta ? "var(--text-muted)" : "#fff", border: "none", borderRadius: 6, padding: "9px 20px", fontWeight: 700, cursor: busy ? "default" : "pointer", fontSize: 13 }}>
              {busy ? "…" : `Concluir ${def.label}`}
            </button>
          </div>
        </div>
        {erro && <div role="alert" style={{ marginTop: 10, color: "#fb7185", fontSize: 12.5, lineHeight: 1.45 }}>{erro}</div>}
      </div>
    </div>
  );
}
