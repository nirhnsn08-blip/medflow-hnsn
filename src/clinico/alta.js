// ═══════════════════════════════════════════════════════════
// SUMÁRIO DE ALTA
//
// É o documento que fecha a internação e o único que o paciente leva
// consigo. Quem vai atendê-lo depois — o posto de saúde, o cardiologista,
// o pronto-socorro daqui a três semanas — vai ler ISTO, e nada mais do
// prontuário. Sumário incompleto não é falha de papelada: é o próximo
// profissional decidindo sem saber o que aconteceu aqui.
//
// POR QUE ESTRUTURADO, E NÃO UM TEXTO LIVRE
// As Portarias GM/MS 8.025 e 8.026/2025 instituíram o modelo de Sumário de
// Alta da RNDS. A integração não é para agora (ver docs/REQUISITOS-PEP.md,
// seção 3 — a obrigatoriedade para hospital de pequeno porte não está
// confirmada), mas o erro caro não é adiar a integração: é guardar o
// desfecho como um parágrafo só, e ter de reescrever tudo quando ela
// chegar. Campo separado hoje custa nada; extrair diagnóstico de texto
// corrido depois custa uma migração de dado clínico.
//
// O QUE ESTE MÓDULO FAZ
// Monta o RASCUNHO a partir do que já está no prontuário e confere o que
// falta. Não assina, não decide e não preenche conteúdo clínico: o resumo
// da internação e as orientações são escritos por quem dá a alta.
//
// Funções puras — sem React, sem rede, sem relógio próprio.
// ═══════════════════════════════════════════════════════════

import { diasInternacao, prescricaoVigente, itensAtivos, serieSinaisVitais } from "./prontuario.js";

/**
 * Desfechos possíveis da internação.
 *
 * `exigeReceita` separa o que é alta do que não é: em óbito e evasão não
 * há medicação para casa nem orientação de retorno, e cobrar esses campos
 * transformaria o registro de um óbito num formulário absurdo.
 */
export const DESFECHOS = {
  alta_melhorado:  { label: "Alta por melhora",        exigeReceita: true,  cor: "#34d399" },
  alta_inalterado: { label: "Alta sem melhora",        exigeReceita: true,  cor: "#d97706" },
  alta_pedido:     { label: "Alta a pedido",           exigeReceita: true,  cor: "#d97706" },
  transferencia:   { label: "Transferência externa",   exigeReceita: false, cor: "#38bdf8" },
  evasao:          { label: "Evasão",                  exigeReceita: false, cor: "#f43f5e" },
  obito:           { label: "Óbito",                   exigeReceita: false, cor: "#f43f5e" },
};

/** Quem some do hospital sem alta formal — o registro é outro. */
export const SEM_ALTA_FORMAL = ["evasao", "obito"];

// ── RASCUNHO ────────────────────────────────────────────────

/**
 * Pré-preenche o sumário com o que o prontuário já sabe.
 *
 * Tudo o que sai daqui é RASCUNHO e vem marcado como tal na tela. Um
 * sumário que se preenche sozinho e é assinado sem leitura seria pior que
 * um formulário em branco: daria aparência de conferido ao que ninguém
 * conferiu.
 */
export function montarRascunhoAlta({
  episodio, anamneses = [], evolucoes = [], prescricoes = [], itens = [],
  eventos = [], sinais = [], administracoes = [], linhasReconciliacao = [],
} = {}, agora = new Date()) {
  if (!episodio) return null;

  const admissao = anamneses.find(a => a.categoria === "medica") || anamneses[0] || null;
  const presc = prescricaoVigente(prescricoes);
  const ativos = presc ? itensAtivos(itens.filter(i => i.prescricao_id === presc.id), eventos) : [];
  const serie = serieSinaisVitais(sinais);
  const ultima = serie[serie.length - 1] || null;

  return {
    prontuario: episodio.prontuario,
    episodio_id: episodio.id,
    admissao_em: episodio.admissao_em || null,
    alta_em: agora.toISOString(),
    dias_internacao: diasInternacao(episodio, agora),
    setor: episodio.setor || null,
    leito: episodio.leito || null,

    // O diagnóstico de ALTA nasce vazio de propósito, mesmo havendo CID de
    // entrada e hipótese na admissão. Ele costuma ser diferente do de
    // entrada — é justamente essa diferença que interessa a quem vai
    // atender depois. Pré-preencher com a hipótese da admissão faria a
    // conferência dar o campo por resolvido, e o diagnóstico de entrada
    // sairia no documento como se fosse a conclusão da internação.
    // O que veio do prontuário fica em `referencia`, à vista, para copiar.
    cid_principal: episodio.cid_principal || null,
    cid_secundarios: episodio.cid_secundarios || null,
    diagnostico_principal: "",
    referencia: {
      hipotese_admissao: admissao?.hipoteses_diagnosticas || null,
      cid_entrada: episodio.cid_principal || null,
    },
    motivo_internacao: episodio.motivo_internacao || "",

    desfecho: "",
    condicao_alta: "",
    resumo_internacao: "",
    procedimentos: "",
    exames_relevantes: "",
    orientacoes: "",
    sinais_de_alerta: "",
    retorno_em: null,
    retorno_servico: "",

    // Números que o médico não deveria ter de contar à mão.
    contexto: {
      evolucoes: evolucoes.length,
      administracoes: administracoes.length,
      aferições: serie.length,
      ultima_afericao: ultima || null,
      medicamentos_em_curso: ativos.length,
      reconciliacao_pendentes: linhasReconciliacao.filter(l => l.pendente).length,
    },
  };
}

// ── CONFERÊNCIA ─────────────────────────────────────────────

/**
 * O que falta para este sumário poder ser assinado.
 *
 * Duas gravidades e a diferença importa:
 *   "impede"  — o documento sairia errado ou ilegível para quem vai
 *               continuar o cuidado. Bloqueia a assinatura.
 *   "avisa"   — falta qualidade, não validade. Aparece, não trava.
 *
 * A régua é deliberadamente curta. Lista de 20 obrigatoriedades num
 * plantão de sexta à noite não produz sumário melhor: produz sumário
 * preenchido com "-" em vinte campos.
 */
export function conferirSumario(sumario, { reconciliacao } = {}) {
  const faltas = [];
  const falta = (nivel, campo, texto) => faltas.push({ nivel, campo, texto });
  if (!sumario) return [{ nivel: "impede", campo: "sumario", texto: "Nada preenchido." }];

  const desfecho = sumario.desfecho;
  if (!desfecho) falta("impede", "desfecho", "Informe o desfecho da internação.");
  const d = DESFECHOS[desfecho];

  if (!String(sumario.diagnostico_principal || "").trim())
    falta("impede", "diagnostico_principal", "Diagnóstico de alta é conteúdo mínimo do prontuário (CFM 1.638/2002, art. 5º).");
  if (!String(sumario.resumo_internacao || "").trim())
    falta("impede", "resumo_internacao", "Sem o resumo da internação, quem atender depois não sabe o que aconteceu aqui.");

  if (d?.exigeReceita) {
    if (!String(sumario.orientacoes || "").trim())
      falta("impede", "orientacoes", "Orientações de alta: é o que o paciente leva para casa como instrução.");
    if (!String(sumario.condicao_alta || "").trim())
      falta("avisa", "condicao_alta", "Descreva a condição clínica na saída.");
    if (!String(sumario.sinais_de_alerta || "").trim())
      falta("avisa", "sinais_de_alerta", "Quando o paciente deve voltar ao serviço? É o campo que evita reinternação tardia.");
    if (!sumario.retorno_em && !String(sumario.retorno_servico || "").trim())
      falta("avisa", "retorno", "Sem seguimento definido, a alta termina no vazio.");

    // A reconciliação de alta é o motivo pelo qual este módulo existe.
    // Não bloqueia a alta — bloquear seria segurar o paciente no leito por
    // causa de software — mas é a falta mais grave da lista, e aparece
    // como tal.
    if (!reconciliacao || !reconciliacao.completa)
      falta("impede", "reconciliacao",
        reconciliacao?.pendentes
          ? `Reconciliação de alta: ${reconciliacao.pendentes} medicamento(s) sem decisão.`
          : "Faça a reconciliação medicamentosa de alta antes de assinar.");
  }

  if (desfecho === "obito") {
    if (!sumario.alta_em) falta("impede", "alta_em", "Data e hora do óbito.");
    if (!String(sumario.condicao_alta || "").trim())
      falta("impede", "condicao_alta", "Causa do óbito e circunstância.");
  }
  if (desfecho === "transferencia" && !String(sumario.retorno_servico || "").trim())
    falta("impede", "retorno_servico", "Para qual serviço o paciente foi transferido.");

  return faltas;
}

/** Pode assinar? Só quando nada de nível "impede" restar. */
export function podeAssinarSumario(faltas = []) {
  return !faltas.some(f => f.nivel === "impede");
}

// ── DOCUMENTO ───────────────────────────────────────────────

const dataBR = v => (v ? new Date(v).toLocaleDateString("pt-BR") : "—");
const dataHoraBR = v => (v ? new Date(v).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

/**
 * O sumário como texto, para impressão e assinatura física.
 *
 * Enquanto o hospital não tiver assinatura qualificada (ICP-Brasil), a
 * COFEN 754/2024, art. 2º, §3º, manda imprimir e assinar à mão — então
 * este texto não é um extra: é o caminho legal principal hoje. Por isso
 * traz nome e registro de conselho de quem assina, e nunca omite uma seção
 * por estar vazia: seção ausente some sem deixar rastro, "não informado"
 * é uma informação.
 */
export function textoSumario(sumario, { hospital, paciente, assinante, medicamentos = [], suspensos = [] } = {}) {
  if (!sumario) return "";
  const linhas = [];
  const secao = (titulo, corpo) => {
    linhas.push("", titulo.toUpperCase(), "-".repeat(titulo.length));
    linhas.push(String(corpo || "").trim() || "Não informado.");
  };

  linhas.push(hospital?.nome || "SUMÁRIO DE ALTA");
  linhas.push("SUMÁRIO DE ALTA HOSPITALAR");
  linhas.push("");
  linhas.push(`Paciente: ${paciente?.iniciais || paciente?.nome || "—"}    Prontuário: ${sumario.prontuario || "—"}`);
  if (paciente?.nascimento) linhas.push(`Nascimento: ${dataBR(paciente.nascimento)}`);
  if (paciente?.documento) linhas.push(`Documento: ${paciente.documento}`);
  linhas.push(`Internação: ${dataHoraBR(sumario.admissao_em)}  →  Alta: ${dataHoraBR(sumario.alta_em)}`);
  linhas.push(`Permanência: ${sumario.dias_internacao ?? "—"} dia(s)` +
              (sumario.setor ? `    Setor: ${sumario.setor}` : "") +
              (sumario.leito ? `    Leito: ${sumario.leito}` : ""));
  linhas.push(`Desfecho: ${DESFECHOS[sumario.desfecho]?.label || "—"}`);

  secao("Diagnóstico principal", sumario.diagnostico_principal +
        (sumario.cid_principal ? `  (CID ${sumario.cid_principal})` : ""));
  if (sumario.cid_secundarios) secao("Diagnósticos secundários", sumario.cid_secundarios);
  secao("Motivo da internação", sumario.motivo_internacao);
  secao("Resumo da internação", sumario.resumo_internacao);
  secao("Procedimentos realizados", sumario.procedimentos);
  secao("Exames relevantes", sumario.exames_relevantes);
  secao("Condição na alta", sumario.condicao_alta);

  if (DESFECHOS[sumario.desfecho]?.exigeReceita) {
    const receita = medicamentos.length
      ? medicamentos.map(m => `• ${m.descricao}${m.dose ? ` — ${m.dose}` : ""}${m.via ? ` ${m.via}` : ""}` +
          `${m.frequencia ? ` — ${m.frequencia}` : ""}${m.duracao_dias ? ` por ${m.duracao_dias} dia(s)` : ""}` +
          `${m.observacao ? `  (${m.observacao})` : ""}`).join("\n")
      : "Nenhum medicamento na alta.";
    secao("Medicamentos em uso após a alta", receita);

    // A lista do que PARAR vai separada: misturada com a do que continuar,
    // é a que o paciente lê por cima e continua tomando.
    if (suspensos.length)
      secao("Medicamentos SUSPENSOS — não tomar mais",
        suspensos.map(m => `• ${m.descricao}${m.motivo ? ` — ${m.motivo}` : ""}`).join("\n"));

    secao("Orientações", sumario.orientacoes);
    secao("Sinais de alerta — procure atendimento se", sumario.sinais_de_alerta);
    secao("Retorno / seguimento",
      [sumario.retorno_em ? `Data: ${dataBR(sumario.retorno_em)}` : null,
       sumario.retorno_servico || null].filter(Boolean).join("    "));
  }

  linhas.push("", "", `${assinante?.profissional_nome || "________________________"}`);
  linhas.push(assinante?.registro_conselho
    ? `${assinante.conselho || ""} ${assinante.registro_conselho}`
    : "Conselho profissional: ______________");
  linhas.push(`Emitido em ${dataHoraBR(sumario.alta_em)}`);
  // Sem assinatura qualificada, o documento vale assinado à mão. Dizer isso
  // no rodapé evita que alguém entregue a via impressa sem assinar.
  linhas.push("Documento gerado eletronicamente — requer assinatura do profissional responsável.");

  return linhas.join("\n");
}
