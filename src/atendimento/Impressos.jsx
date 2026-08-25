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
import {
  dadosDaPulseira, dadosDaFicha, declaracaoDeComparecimento, comprovanteDeAgendamento,
  documentosDoEpisodio,
} from "./impressos.js";

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
  // O comprovante só existe quando há AGENDAMENTO — é a Agenda que o
  // entrega, logo depois de marcar, com o paciente ainda no balcão. Sem
  // agendamento a aba nem aparece: papel em branco não serve para nada.
  agendamento = null, profissional = null, especialidade = "", tipoAtendimento = "",
  // `null` (padrão) significa "quem imprimiu não consultou o prontuário" —
  // é o caso da recepção, e a ficha diz isso em vez de imprimir negativa.
  alergias = null, responsaveis = [], hospital = HOSPITAL_PADRAO, currentUser, onFechar,
}) {
  // QUAL PAPEL ESTE EPISÓDIO PODE GERAR — a regra mora em `impressos.js`,
  // pura e testada, e não em cada tela que monta este componente. A
  // Recepção só lista episódios em aberto e nunca esbarrou nisso; a
  // pesquisa por histórico mostra episódios de meses atrás, e ali a
  // diferença entre "pode" e "não pode" é uma pulseira com número velho
  // indo para o pulso de alguém hoje.
  const documentos = documentosDoEpisodio(atendimento);
  const podeImprimir = c => documentos.find(d => d.chave === c)?.disponivel;
  const primeiroDisponivel = documentos.find(d => d.disponivel)?.chave || "";
  const [modo, setModo] = useState(agendamento ? "comprovante" : primeiroDisponivel);
  // Quem leva a declaração: o paciente, ou quem o trouxe. São dois papéis
  // diferentes porque são dois empregadores diferentes.
  const [titularDecl, setTitularDecl] = useState("");

  const pulseira = dadosDaPulseira({ paciente, atendimento, hospital });
  const ficha = dadosDaFicha({
    paciente, atendimento, convenio, plano, procedimento,
    catalogos, alergias, responsaveis,
    // O campo antigo do atendimento continua sendo lido durante a transição
    // — prontuário preenchido antes do `pep_alergias` não pode sumir do papel.
    alergiasTextoLegado: atendimento?.alergias || "",
    hospital, usuario: currentUser,
  });

  const acompanhante = (responsaveis || []).find(r => String(r?.nome ?? "").trim() === titularDecl) || null;
  const declaracao = declaracaoDeComparecimento({
    paciente, atendimento, acompanhante, hospital, usuario: currentUser,
  });
  const comprovante = comprovanteDeAgendamento({
    paciente, agendamento, profissional, especialidade, tipoAtendimento,
    hospital, usuario: currentUser,
  });

  // Só o `#impresso-print` fica visível na impressão. `@page` muda com o
  // modo: a ficha é uma folha de papel; a pulseira é uma folha de tiras.
  const printStyles =
    `@media print { body * { visibility: hidden !important; } ` +
    `#${AREA}, #${AREA} * { visibility: visible !important; } ` +
    `#${AREA} { position: fixed; inset: 0; background: #fff !important; color: #000 !important; padding: 0; } ` +
    `@page { size: A4 portrait; margin: ${modo === "pulseira" ? "10mm" : "12mm"}; } }`;

  // O aviso de identificação incompleta vale para a pulseira e para a
  // ficha, que são documentos de identificação. A declaração e o
  // comprovante não identificam ninguém à beira do leito — repetir o alerta
  // neles seria mais um aviso para a recepção aprender a ignorar.
  const aviso = modo === "pulseira" ? pulseira.aviso : modo === "ficha" ? ficha.pulseira.aviso : "";

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1.1rem 1.25rem", marginBottom: 14 }}>
      <style>{printStyles}</style>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <strong style={{ fontSize: 13 }}>Imprimir</strong>
        {/* PULSEIRA, FICHA E DECLARAÇÃO SÓ EXISTEM COM EPISÓDIO. A pulseira
            identifica quem está sendo atendido; a ficha acompanha o
            atendimento; a declaração afirma que a pessoa ESTEVE aqui. Quem
            acabou de marcar consulta não tem nenhuma das três coisas —
            oferecer as abas produziria papel em branco com timbre, que é
            pior que aba faltando. */}
        {atendimento && documentos.map(d => (
          // O indisponível aparece DESLIGADO, com o motivo no title. Botão
          // que some sem explicação vira chamado para a TI; botão que diz
          // por que está desligado ensina a regra a quem está no balcão.
          <button key={d.chave} onClick={() => d.disponivel && setModo(d.chave)}
            disabled={!d.disponivel} title={d.porque || undefined}
            style={{ ...btn("#22d3ee", modo === d.chave),
                     opacity: d.disponivel ? 1 : 0.45,
                     cursor: d.disponivel ? "pointer" : "not-allowed" }}>
            {d.label}
          </button>
        ))}
        {agendamento && (
          <button onClick={() => setModo("comprovante")} style={btn("#22d3ee", modo === "comprovante")}>Comprovante de agendamento</button>
        )}
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

      {/* QUEM LEVA A DECLARAÇÃO. Só aparece quando há acompanhante
          cadastrado — sem ninguém para escolher, um select de uma opção só
          é ruído. O patrão do acompanhante cobra as horas dele, não as do
          paciente: são duas folhas diferentes. */}
      {modo === "declaracao" && (responsaveis || []).some(r => String(r?.nome ?? "").trim()) && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12, fontSize: 12 }}>
          <span style={{ color: "var(--text-muted)" }}>Declaração para:</span>
          <select value={titularDecl} onChange={e => setTitularDecl(e.target.value)}
            style={{ background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6,
                     padding: "6px 9px", color: "var(--text)", fontSize: 12.5 }}>
            <option value="">o próprio paciente</option>
            {(responsaveis || []).filter(r => String(r?.nome ?? "").trim()).map(r => (
              <option key={r.nome} value={r.nome}>{r.nome} (acompanhante)</option>
            ))}
          </select>
        </div>
      )}

      <div id={AREA} style={{ background: "#fff", color: "#000", borderRadius: 8, padding: "6mm",
                              fontFamily: "Inter, sans-serif", border: "1px solid #e5e7eb" }}>
        {modo === "pulseira" && podeImprimir("pulseira") ? (
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
        ) : modo === "declaracao" && podeImprimir("declaracao") ? (
          <Declaracao d={declaracao} />
        ) : modo === "comprovante" && agendamento ? (
          <Comprovante c={comprovante} />
        ) : podeImprimir("ficha") ? (
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
        ) : (
          // Nenhum papel disponível: o episódio cancelado cai aqui. A área
          // diz o que houve em vez de ficar branca — folha em branco com
          // timbre parece defeito.
          <div style={{ fontSize: 11.5, color: "#475569", padding: "6mm 0", textAlign: "center" }}>
            {documentos.find(d => !d.disponivel)?.porque || "Nada a imprimir para este episódio."}
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

/** Cabeçalho comum dos papéis que o paciente leva embora. */
function Timbre({ titulo, hospital }) {
  return (
    <div style={{ textAlign: "center", borderBottom: "2px solid #e5e7eb", paddingBottom: "3mm", marginBottom: "5mm" }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: "#0f172a" }}>{hospital.nome || hospital.sigla}</div>
      <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: ".04em", marginTop: "2mm" }}>{titulo}</div>
    </div>
  );
}

/**
 * A declaração de comparecimento.
 *
 * A linha que separa declaração de atestado vem ANTES do corpo, em caixa,
 * porque é o que o RH procura primeiro. Sem ela a folha volta ao hospital
 * ("está sem CID") ou é usada como afastamento — e nos dois casos quem
 * gasta o dia resolvendo é o paciente.
 */
function Declaracao({ d }) {
  const dele = d.titular.tipo === "acompanhante";
  return (
    <div style={{ fontSize: 11.5, lineHeight: 1.7 }}>
      <Timbre titulo="DECLARAÇÃO DE COMPARECIMENTO" hospital={d.hospital} />

      <div style={{ border: "1px solid #94a3b8", padding: "2mm 3mm", marginBottom: "5mm", fontSize: 9.5, color: "#334155" }}>
        Este documento declara <strong>presença</strong> nesta unidade e nada mais. Não é atestado médico:
        não afirma incapacidade, não concede afastamento e <strong>não informa diagnóstico</strong> — o sigilo
        sobre o motivo do atendimento é do paciente.
      </div>

      <p style={{ margin: "0 0 4mm" }}>
        Declaramos, para os devidos fins, que <strong>{d.titular.nome || "—"}</strong>
        {d.titular.documento ? <> (CPF {d.titular.documento})</> : null}
        {dele ? <> esteve nesta unidade <strong>acompanhando</strong> {d.paciente.nome}</> : <> esteve nesta unidade para atendimento de saúde</>}
        {d.periodo.data ? <> no dia <strong>{d.periodo.data}</strong></> : null}
        {d.periodo.entrada ? <>, das <strong>{d.periodo.entrada}</strong> às <strong>{d.periodo.saida}</strong></> : null}.
      </p>

      {d.periodo.saidaEstimada && (
        <p style={{ margin: "0 0 4mm", fontSize: 9.5, color: "#334155" }}>
          O horário final é o da <strong>emissão desta declaração</strong> — o atendimento ainda estava em
          curso quando ela foi impressa.
        </p>
      )}

      <div style={{ fontSize: 9.5, color: "#475569", marginBottom: "8mm" }}>
        Paciente: {d.paciente.nome}
        {d.paciente.nascimento ? ` · nascido(a) em ${d.paciente.nascimento}` : ""}
        {d.paciente.prontuario ? ` · prontuário ${d.paciente.prontuario}` : ""}
        {d.atendimento ? ` · atendimento ${d.atendimento}` : ""}
      </div>

      <div style={{ marginTop: "14mm", width: "70mm", borderTop: "1px solid #94a3b8", paddingTop: 3,
                    fontSize: 8.5, color: "#475569", marginLeft: "auto", marginRight: "auto", textAlign: "center" }}>
        {d.hospital.sigla || d.hospital.nome} — Recepção
      </div>

      <div style={{ fontSize: 8, color: "#64748b", marginTop: "8mm", borderTop: "1px solid #e5e7eb", paddingTop: "2mm" }}>
        Emitida por {d.rodape.impressoPor} em {d.rodape.impressoEm}.
        {d.atendimento ? ` Confira a autenticidade citando o atendimento ${d.atendimento}.` : ""}
      </div>
    </div>
  );
}

/**
 * O comprovante de agendamento.
 *
 * O telefone do cadastro é impresso EM DESTAQUE e com o pedido de correção
 * — é para ele que a confirmação da véspera vai ligar, e este é o único
 * momento em que corrigir custa dez segundos em vez de um telefonema
 * perdido. Sem telefone, a folha diz que não tem.
 */
function Comprovante({ c }) {
  const semTelefone = !c.contato.telefone;
  return (
    <div style={{ fontSize: 11.5 }}>
      <Timbre titulo="COMPROVANTE DE AGENDAMENTO" hospital={c.hospital} />

      <div style={{ fontSize: 10.5, color: "#475569", marginBottom: "4mm" }}>
        <strong style={{ fontSize: 12, color: "#0f172a" }}>{c.paciente.nome}</strong>
        {c.paciente.prontuario ? ` · prontuário ${c.paciente.prontuario}` : ""}
        {c.paciente.nascimento ? ` · ${c.paciente.nascimento}` : ""}
      </div>

      <div style={{ border: "1.5px solid #0f172a", padding: "3mm 4mm", marginBottom: "5mm" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "2mm 6mm" }}>
          {c.consulta.map(l => (
            <div key={l.label} style={{ fontSize: 11.5, display: "flex", gap: 5 }}>
              <span style={{ color: "#64748b", whiteSpace: "nowrap" }}>{l.label}:</span>
              <strong style={{ minWidth: 0, wordBreak: "break-word" }}>{l.valor}</strong>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 10, marginTop: "3mm", borderTop: "1px dotted #cbd5e1", paddingTop: "2mm" }}>
          Chegue com <strong>{c.antecedenciaMinutos} minutos de antecedência</strong>.
        </div>
      </div>

      <div style={{ display: "flex", gap: "6mm", marginBottom: "5mm" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: ".06em", color: "#334155", marginBottom: 2 }}>
            O QUE TRAZER
          </div>
          <ul style={{ margin: 0, paddingLeft: "5mm", fontSize: 10.5, lineHeight: 1.6 }}>
            {c.trazer.map(t => <li key={t}>{t}</li>)}
          </ul>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: ".06em", color: "#334155", marginBottom: 2 }}>
            SE NÃO PUDER VIR
          </div>
          <div style={{ fontSize: 10.5, lineHeight: 1.6 }}>
            Avise a recepção com antecedência. A vaga é reaproveitada para outra pessoa que está
            esperando — desmarcar ajuda quem vem depois de você.
          </div>
        </div>
      </div>

      <div style={{ border: `1.5px solid ${semTelefone ? "#000" : "#cbd5e1"}`, padding: "2mm 3mm", marginBottom: "4mm" }}>
        <span style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: ".06em", color: "#334155" }}>TELEFONE NO CADASTRO </span>
        {c.contato.telefone && <strong style={{ fontSize: 12 }}>{c.contato.telefone}</strong>}
        <div style={{ fontSize: 10, fontWeight: semTelefone ? 800 : 400, marginTop: 1 }}>{c.contato.aviso}</div>
      </div>

      <div style={{ fontSize: 8, color: "#64748b", marginTop: "6mm", borderTop: "1px solid #e5e7eb", paddingTop: "2mm" }}>
        {c.protocolo ? `Agendamento ${c.protocolo}. ` : ""}
        Emitido por {c.rodape.impressoPor} em {c.rodape.impressoEm}.
      </div>
    </div>
  );
}
