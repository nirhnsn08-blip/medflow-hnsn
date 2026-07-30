// ═══════════════════════════════════════════════════════════
// IMPRESSOS DA RECEPÇÃO — a tela
//
// Só desenho. O conteúdo e as regras estão em `impressos.js` (puro,
// testado): o que conta como identificador, o que nunca pode ir para o
// pulso do paciente e como a falta de identificação é carimbada.
//
// COMO SE IMPRIME AQUI
// `window.print()` nativo, o mesmo padrão dos relatórios do PS, da farmácia
// e do SCIH — sem biblioteca de PDF. Não é economia de dependência: é que
// nenhum dado de paciente sai do navegador para ser renderizado em lugar
// nenhum. O que o hospital escolher como impressora (térmica de etiqueta ou
// laser comum) muda só o `@page`.
//
// A pulseira sai em DUAS VIAS na mesma folha, e cada tira repete o bloco de
// identificação duas vezes. As duas vias porque pulseira rasga na hora de
// fechar; o bloco repetido porque a tira dá a volta no pulso e metade dela
// fica virada para baixo — quem confere não deveria ter que girar o braço
// de um paciente com acesso venoso para ler o nome.
// ═══════════════════════════════════════════════════════════

import { useState } from "react";
import { dadosDaPulseira, dadosDaFicha } from "./impressos.js";

const AREA = "impresso-print";

// Lido daqui, e não recebido por prop, para não abrir mais um ponto de
// alteração no `App.jsx` — que é território compartilhado e já tem 15 mil
// linhas. É a mesma origem que os relatórios do PS e da farmácia usam.
const HOSPITAL_PADRAO = {
  sigla: import.meta.env?.VITE_HOSPITAL_SIGLA || "HNSN",
  nome: import.meta.env?.VITE_HOSPITAL_NOME || "Hospital Nossa Senhora de Navegantes",
};

// A tira: 180mm de comprimento é o que fecha num pulso adulto com folga de
// sobreposição, e cabe na largura útil de um A4 retrato.
const estiloTira = {
  width: "180mm", minHeight: "26mm", border: "1px dashed #94a3b8", borderRadius: 3,
  display: "flex", alignItems: "stretch", background: "#fff", color: "#000",
  marginBottom: "6mm", overflow: "hidden", pageBreakInside: "avoid",
};

const btn = (cor, ativo = true) => ({
  background: ativo ? cor : "var(--surface-2)", color: ativo ? "#000" : "var(--text-muted)",
  border: ativo ? "none" : "1px solid var(--border)", borderRadius: 6, padding: "8px 16px",
  fontWeight: 700, cursor: "pointer", fontSize: 12.5, whiteSpace: "nowrap",
});

/** Metade da tira — o bloco que se lê de qualquer lado do pulso. */
function BlocoPulseira({ d }) {
  return (
    <div style={{ flex: 1, padding: "3mm 4mm", borderRight: "1px dotted #cbd5e1", minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontSize: 6.5, fontWeight: 800, letterSpacing: ".08em", color: "#334155" }}>{d.hospital}</span>
        {d.selo && <span style={{ fontSize: 6.5, fontWeight: 800, color: "#000", border: "1px solid #000", padding: "0 3px" }}>{d.selo}</span>}
      </div>
      <div style={{ fontSize: 11, fontWeight: 800, lineHeight: 1.15, margin: "1mm 0 0", wordBreak: "break-word" }}>
        {d.nome}
      </div>
      {d.nomeRegistro && (
        <div style={{ fontSize: 6.5, color: "#475569", lineHeight: 1.2 }}>registro: {d.nomeRegistro}</div>
      )}
      <div style={{ fontSize: 8, lineHeight: 1.3, marginTop: "1mm", fontFamily: "monospace" }}>
        {d.identificadores.filter(i => i.chave !== "nome").map(i => (
          <span key={i.chave} style={{ marginRight: 8 }}>
            <span style={{ color: "#475569" }}>{i.label}: </span><strong>{i.valor}</strong>
          </span>
        ))}
      </div>
      <div style={{ fontSize: 7, color: "#475569", marginTop: ".5mm" }}>
        {d.contexto.map(c => `${c.label}: ${c.valor}`).join("  ·  ")}
      </div>
    </div>
  );
}

export default function Impressos({
  paciente, atendimento, catalogos = {}, convenio, plano, procedimento,
  // `null` (padrão) significa "quem imprimiu não consultou o prontuário" —
  // é o caso da recepção, e a ficha diz isso em vez de imprimir negativa.
  alergias = null, responsaveis = [], hospital = HOSPITAL_PADRAO, currentUser, onFechar,
}) {
  const [modo, setModo] = useState("pulseira");

  const pulseira = dadosDaPulseira({ paciente, atendimento, hospital });
  const ficha = dadosDaFicha({
    paciente, atendimento, convenio, plano, procedimento,
    catalogos, alergias, responsaveis,
    // O campo antigo do atendimento continua sendo lido durante a transição
    // — prontuário preenchido antes do `pep_alergias` não pode sumir do papel.
    alergiasTextoLegado: atendimento?.alergias || "",
    hospital, usuario: currentUser,
  });

  // Só o `#impresso-print` fica visível na impressão. `@page` muda com o
  // modo: a ficha é uma folha de papel; a pulseira é uma folha de tiras.
  const printStyles =
    `@media print { body * { visibility: hidden !important; } ` +
    `#${AREA}, #${AREA} * { visibility: visible !important; } ` +
    `#${AREA} { position: fixed; inset: 0; background: #fff !important; color: #000 !important; padding: 0; } ` +
    `@page { size: A4 portrait; margin: ${modo === "pulseira" ? "10mm" : "12mm"}; } }`;

  const aviso = modo === "pulseira" ? pulseira.aviso : ficha.pulseira.aviso;

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1.1rem 1.25rem", marginBottom: 14 }}>
      <style>{printStyles}</style>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <strong style={{ fontSize: 13 }}>Imprimir</strong>
        <button onClick={() => setModo("pulseira")} style={btn("#22d3ee", modo === "pulseira")}>Pulseira</button>
        <button onClick={() => setModo("ficha")} style={btn("#22d3ee", modo === "ficha")}>Ficha do atendimento</button>
        <button onClick={() => window.print()} style={{ ...btn("#34d399"), marginLeft: "auto" }}>Imprimir / PDF</button>
        {onFechar && (
          <button onClick={onFechar} style={{ ...btn("var(--surface-2)", false), color: "var(--text)" }}>Fechar</button>
        )}
      </div>

      {aviso && (
        <div style={{ padding: "9px 12px", borderRadius: 8, fontSize: 12, marginBottom: 12,
                      background: "#d9770610", border: "1px solid #d9770655" }}>
          <strong style={{ color: "#d97706" }}>{pulseira.selo || ficha.pulseira.selo}</strong> — {aviso}
        </div>
      )}

      <div id={AREA} style={{ background: "#fff", color: "#000", borderRadius: 8, padding: "6mm",
                              fontFamily: "Inter, sans-serif", border: "1px solid #e5e7eb" }}>
        {modo === "pulseira" ? (
          <>
            {[0, 1].map(via => (
              <div key={via} style={estiloTira}>
                <BlocoPulseira d={pulseira} />
                <BlocoPulseira d={pulseira} />
              </div>
            ))}
            <div style={{ fontSize: 8, color: "#64748b" }}>
              Duas vias — recorte na linha tracejada. Confira os identificadores COM O PACIENTE antes de
              fechar a pulseira: pergunte o nome e a data de nascimento em vez de ler para ele confirmar.
              Emitida em {pulseira.emitidoEm}.
            </div>
          </>
        ) : (
          <div style={{ fontSize: 11 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start",
                          borderBottom: "2px solid #e5e7eb", paddingBottom: "3mm", marginBottom: "4mm" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>FICHA DE ATENDIMENTO — {ficha.hospital.sigla}</div>
                <div style={{ fontSize: 9.5, color: "#64748b", marginTop: 2 }}>{ficha.hospital.nome}</div>
              </div>
              {ficha.pulseira.selo && (
                <div style={{ fontSize: 9, fontWeight: 800, border: "1.5px solid #000", padding: "2px 6px" }}>
                  {ficha.pulseira.selo}
                </div>
              )}
            </div>

            <Secao titulo="Identificação do paciente" linhas={ficha.identificacao} colunas={2} />
            {ficha.episodio.length > 0 && <Secao titulo="Episódio" linhas={ficha.episodio} colunas={2} />}
            {ficha.pagadora.length > 0 && <Secao titulo="Fonte pagadora" linhas={ficha.pagadora} colunas={2} />}
            {ficha.classificacao.length > 0 && <Secao titulo="Classificação" linhas={ficha.classificacao} colunas={2} />}

            {/* A alergia é a única informação clínica desta folha, e está
                aqui porque é o que alguém precisa ver antes de administrar
                qualquer coisa. O estado "sem registro" fica em destaque de
                propósito — em branco, seria lido como "não tem". */}
            <div style={{ border: `1.5px solid ${ficha.alergias.estado === "com_alergia" ? "#000" : "#cbd5e1"}`,
                          padding: "2mm 3mm", marginBottom: "4mm" }}>
              <span style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: ".06em", color: "#334155" }}>ALERGIAS </span>
              <span style={{ fontSize: 11, fontWeight: ficha.alergias.estado === "com_alergia" ? 800 : 600 }}>
                {ficha.alergias.texto}
              </span>
            </div>

            {ficha.responsaveis.length > 0 && (
              <div style={{ marginBottom: "4mm" }}>
                <div style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: ".06em", color: "#334155",
                              borderBottom: "1px solid #e5e7eb", paddingBottom: 2, marginBottom: 3 }}>
                  RESPONSÁVEL PELO EPISÓDIO
                </div>
                {ficha.responsaveis.map((r, i) => (
                  <div key={i} style={{ fontSize: 10.5, marginBottom: 1 }}>
                    <strong>{r.nome}</strong>
                    <span style={{ color: "#64748b" }}>
                      {r.vinculo ? ` · ${r.vinculo}` : ""} · {r.papel}
                      {r.cpf ? ` · CPF ${r.cpf}` : ""}{r.telefone ? ` · ${r.telefone}` : ""}
                    </span>
                    {r.recebeAlta && <strong style={{ marginLeft: 5 }}>— RECEBE A ALTA</strong>}
                  </div>
                ))}
              </div>
            )}

            {ficha.queixa && (
              <div style={{ marginBottom: "4mm" }}>
                <div style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: ".06em", color: "#334155", marginBottom: 2 }}>
                  QUEIXA RELATADA NA CHEGADA
                </div>
                <div style={{ fontSize: 11 }}>{ficha.queixa}</div>
                <div style={{ fontSize: 8, color: "#64748b" }}>
                  Relato do paciente. Não é classificação de risco nem diagnóstico.
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: "10mm", marginTop: "12mm" }}>
              {["Assinatura do paciente ou responsável", "Recepção"].map(t => (
                <div key={t} style={{ flex: 1, borderTop: "1px solid #94a3b8", paddingTop: 3, fontSize: 8.5, color: "#475569" }}>{t}</div>
              ))}
            </div>

            <div style={{ fontSize: 8, color: "#64748b", marginTop: "6mm", borderTop: "1px solid #e5e7eb", paddingTop: "2mm" }}>
              Documento de uso interno com dado pessoal de paciente — não descartar em lixo comum (LGPD art. 46).
              Impresso por {ficha.rodape.impressoPor} em {ficha.rodape.impressoEm}.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Secao({ titulo, linhas, colunas = 2 }) {
  return (
    <div style={{ marginBottom: "4mm" }}>
      <div style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: ".06em", color: "#334155",
                    borderBottom: "1px solid #e5e7eb", paddingBottom: 2, marginBottom: 2 }}>
        {titulo.toUpperCase()}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${colunas}, 1fr)`, gap: "1mm 6mm" }}>
        {linhas.map(l => (
          <div key={l.label} style={{ fontSize: 10.5, display: "flex", gap: 5 }}>
            <span style={{ color: "#64748b", whiteSpace: "nowrap" }}>{l.label}:</span>
            <strong style={{ minWidth: 0, wordBreak: "break-word" }}>{l.valor}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}
