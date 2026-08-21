// ═══════════════════════════════════════════════════════════
// RECEPÇÃO — as regras da porta de entrada
//
// Este arquivo não sabe o que é React nem o que é banco. Só as regras:
// como se procura um paciente, o que é um número de prontuário válido, o
// que impede (e o que apenas alerta) na abertura de um atendimento, e como
// se registra quem chegou sem poder dizer o próprio nome.
//
// A DECISÃO QUE ORGANIZA O ARQUIVO INTEIRO
// A recepção é o único lugar do sistema onde o certo é ser PERMISSIVO com
// o cadastro e RÍGIDO com o vínculo. Quem chega inconsciente entra com o
// que se sabe dele — nada aqui bloqueia por falta de nome, endereço ou
// documento. O que não se abre mão é do vínculo: todo atendimento nasce
// preso a um prontuário que existe. Cadastro incompleto é pendência
// visível; atendimento órfão é histórico perdido.
// ═══════════════════════════════════════════════════════════

import { conferirCadastro, limparDoc, validarCPF, validarCNS, normalizarSexo, normalizarNome } from "../pacientes/identidade.js";

// ── COMO O PACIENTE CHEGOU ──────────────────────────────────
// Estas listas moraram no App.jsx enquanto a chegada só existia no PS.
// Passam a viver aqui porque agora a porta é uma só: o PS as importa.

/** Vias de transferência externa usadas na rede. */
export const PS_VIAS_TRANSF = ["Vaga Zero", "GERINT", "Contato direto", "Outro"];

/** Como o paciente chegou — dado de pactuação regional e epidemiologia. */
export const PS_ORIGENS = ["Meios próprios", "SAMU", "Transalva", "Polícia Militar", "Bombeiros", "GERINT (aceite)", "Outro"];

/** Unidades de origem quando o aceite vem pela regulação. */
export const PS_ORIGEM_UNIDADES = ["PA Torres", "Arroio do Sal", "Três Cachoeiras", "Outra unidade"];

/** Origens que exigem detalhar a unidade de procedência. */
export const psPedeDetalhe = o => o === "GERINT (aceite)" || o === "Outro";

// ── NATUREZA DO ATENDIMENTO ─────────────────────────────────

/**
 * O que a recepção está abrindo.
 *
 * `disponivel: false` não é enfeite: a tela esconde o que ainda não
 * funciona em vez de oferecer um botão que não leva a lugar nenhum. O
 * catálogo fica completo aqui porque a coluna `tipo_atendimento` do banco
 * já aceita os três — quando o ambulatorial existir, é só virar a chave.
 */
export const TIPOS_ATENDIMENTO = [
  { chave: "emergencia",   label: "Emergência",   disponivel: true,
    descricao: "Chegada espontânea ou trazida ao Pronto-Socorro. Segue para triagem de Manchester." },
  { chave: "ambulatorial", label: "Ambulatorial", disponivel: false,
    descricao: "Consulta agendada por especialidade." },
  { chave: "eletivo",      label: "Internação eletiva", disponivel: false,
    descricao: "Internação programada, sem passagem pelo PS." },
];

export const TIPOS_DISPONIVEIS = TIPOS_ATENDIMENTO.filter(t => t.disponivel);

// ── NÚMERO DO PRONTUÁRIO ────────────────────────────────────

/** Sem espaço nas pontas; vazio vira "". É a forma canônica de comparar. */
export const normalizarProntuario = v => String(v ?? "").trim();

/**
 * O número serve como chave?
 *
 * Aceita alfanumérico porque o prontuário deste hospital é alfanumérico
 * ("T9035") e recusar isso quebraria o acervo existente. O que se recusa é
 * o que vira problema de chave: vazio, espaço no meio (colar de planilha
 * traz), e caractere que atrapalha a URL da consulta.
 */
export function validarProntuario(valor) {
  const v = normalizarProntuario(valor);
  if (!v) return { ok: false, erro: "Informe o número do prontuário." };
  if (/\s/.test(v)) return { ok: false, erro: "O número do prontuário não pode ter espaços." };
  if (!/^[A-Za-z0-9._-]+$/.test(v))
    return { ok: false, erro: "Use apenas letras, números, ponto, hífen ou sublinhado." };
  if (v.length > 30) return { ok: false, erro: "Número longo demais para um prontuário." };
  return { ok: true, valor: v };
}

// ── BUSCA ───────────────────────────────────────────────────

/**
 * Caracteres que quebram a sintaxe de filtro do PostgREST.
 *
 * `or=(a.eq.1,b.eq.2)` é delimitado por vírgula e parêntese — um paciente
 * chamado "Maria (Bia)" ou uma busca com vírgula montaria uma consulta
 * inválida, e o erro apareceria como "nenhum resultado", que é a mentira
 * mais cara que uma busca de paciente pode contar.
 */
export const escaparTermoBusca = t =>
  String(t ?? "").replace(/[(),.*:"'\\]/g, " ").replace(/\s+/g, " ").trim();

/**
 * O que a pessoa digitou?
 *
 * A recepção digita as três coisas no mesmo campo — é assim que se
 * trabalha no balcão. Aqui se decide o que foi, para a busca ir direto ao
 * ponto em vez de varrer nome com um CPF.
 */
export function classificarBusca(termo) {
  const bruto = String(termo ?? "").trim();
  if (!bruto) return { tipo: "vazio", valor: "" };
  const doc = limparDoc(bruto);
  // 15 dígitos só existe em CNS; 11 só em CPF. O comprimento decide antes
  // do dígito verificador, para o cartão digitado errado ainda ser buscado
  // como cartão (e não cair no nome, onde nunca acharia).
  if (doc.length === 15 && doc === bruto.replace(/[\s.-]/g, ""))
    return { tipo: "cns", valor: doc, valido: validarCNS(doc) };
  if (doc.length === 11 && doc === bruto.replace(/[\s.-]/g, ""))
    return { tipo: "cpf", valor: doc, valido: validarCPF(doc) };
  if (/^[A-Za-z]?\d[A-Za-z0-9._-]*$/.test(bruto) && bruto.length <= 30)
    return { tipo: "prontuario", valor: bruto };
  return { tipo: "nome", valor: escaparTermoBusca(bruto) };
}

/**
 * O filtro PostgREST correspondente — ou `null` quando não há o que
 * consultar (busca curta demais varreria a tabela inteira para nada).
 *
 * Devolve a string do parâmetro `or=(...)`, sem `?` e sem encode: quem
 * monta a URL é a camada de dados.
 */
export function filtroBuscaPacientes(termo) {
  const c = classificarBusca(termo);
  if (c.tipo === "vazio") return null;
  if (c.tipo === "cpf") return `or=(cpf.eq.${c.valor})`;
  if (c.tipo === "cns") return `or=(cns.eq.${c.valor})`;
  // Prontuário por `ilike` SEM curinga, que é comparação exata sem
  // diferenciar maiúscula de minúscula. Com `eq` (case-sensitive) digitar
  // "t9035" não achava o "T9035" do acervo — e ninguém digita maiúscula com
  // fila na frente. A tela então dizia "nenhum paciente encontrado" para um
  // paciente que está lá, e a recepcionista concluía que ele não existe e
  // cadastrava de novo: busca que não acha é a máquina de duplicatas.
  if (c.tipo === "prontuario") return `or=(prontuario.ilike.${c.valor})`;
  const palavras = palavrasDeBusca(c.valor);
  if (!palavras.length) return null;
  // Nome: TODAS as palavras têm que aparecer em `nome_busca` — a coluna
  // gerada que guarda nome de registro + social + da mãe, em maiúscula e sem
  // acento (ver migracao-pacientes-busca.sql).
  return `and=(${palavras.map(p => `nome_busca.ilike.*${p}*`).join(",")})`;
}

/**
 * As palavras que a busca por nome vai exigir.
 *
 * Reaproveita `normalizarNome`, que tira acento e derruba tudo que não é
 * letra ou número — o que também torna o valor seguro para a URL do
 * PostgREST por construção: vírgula, parêntese, `%` e `_` não sobrevivem, e
 * são justamente os caracteres que quebrariam o filtro ou virariam curinga.
 *
 * Palavra de UMA letra sai fora: quase sempre é inicial ou sobra de
 * pontuação ("J. SILVA"), e exigi-la só faria a busca achar menos.
 *
 * O mínimo de 3 caracteres é do TERMO INTEIRO, não de cada palavra — "Jo"
 * segue recusado (varreria a tabela por nada), mas "Ana" passa.
 */
export function palavrasDeBusca(termo) {
  const limpo = normalizarNome(termo);
  if (limpo.replace(/\s/g, "").length < 3) return [];
  return limpo.toUpperCase().split(" ").filter(p => p.length >= 2);
}

/**
 * O filtro ANTIGO, por `ilike` em cada coluna de nome.
 *
 * Continua aqui porque a migração é MANUAL e roda DEPOIS do deploy — é a
 * ordem inevitável neste projeto. No intervalo entre o merge e o SQL, a
 * coluna `nome_busca` não existe, o PostgREST devolve 400, e a busca da
 * recepção pararia INTEIRA: a tela diria "nenhum paciente encontrado" para
 * todo mundo, no balcão, sem nenhuma pista do motivo.
 *
 * `buscarPacientes` cai aqui quando a consulta nova falha. Assim que o SQL
 * roda, este caminho deixa de ser usado sozinho — e ele pode ser removido na
 * limpeza seguinte, quando os dois bancos estiverem migrados.
 */
export function filtroBuscaPacientesLegado(termo) {
  const c = classificarBusca(termo);
  if (c.tipo !== "nome") return filtroBuscaPacientes(termo);
  const t = c.valor;
  if (t.length < 3) return null;
  return `or=(nome_completo.ilike.*${t}*,nome_social.ilike.*${t}*,nome_mae.ilike.*${t}*)`;
}

// ── PACIENTE NÃO IDENTIFICADO ───────────────────────────────

/**
 * O registro de quem chega sem poder se identificar.
 *
 * O QUE ESTA FUNÇÃO SE RECUSA A FAZER: transformar idade aparente em data
 * de nascimento. A triagem pediátrica escolhe faixa de sinal vital pela
 * idade, e uma faixa escolhida a partir de um palpite decide conduta com
 * base em nada. A idade observada vai para a observação, em texto, onde
 * nenhum cálculo a consome. É a mesma regra que já vale no cadastro:
 * quando o dado aproximado pode trocar decisão clínica, recusar é melhor
 * do que estimar.
 *
 * O sexo, sim, é registrado: é observável na chegada e o resto do sistema
 * já trata "" como desconhecido.
 */
export function dadosNaoIdentificado({ prontuario, sexo, idadeAparente, sinalParticular, agora = new Date() } = {}) {
  const p = normalizarProntuario(prontuario);
  if (!p) throw new Error("dadosNaoIdentificado: prontuário é obrigatório");

  const notas = [];
  if (idadeAparente) notas.push(`Idade aparente informada na chegada: ${String(idadeAparente).trim()} (observação — NÃO é data de nascimento).`);
  if (sinalParticular) notas.push(`Sinais para identificação: ${String(sinalParticular).trim()}.`);
  notas.push("Paciente admitido sem identificação (CFM 1.638/2002, art. 5º, I, \"e\"). Completar o cadastro assim que a identidade for conhecida.");

  return {
    prontuario: p,
    // `iniciais` é NOT NULL no banco e aparece em toda listagem. "NÃO
    // IDENTIFICADO" por extenso, e não uma sigla, para ninguém confundir
    // com as iniciais de uma pessoa real numa lista de fila.
    iniciais: "NÃO IDENTIFICADO",
    sexo: normalizarSexo(sexo) || null,
    nao_identificado: true,
    identificado_em: null,
    origem_cadastro: "recepcao",
    observacao: notas.join(" "),
    criado_em: new Date(agora).toISOString(),
  };
}

/** Este cadastro ainda está aguardando identificação? */
export const aguardandoIdentificacao = p =>
  !!p?.nao_identificado && !p?.identificado_em;

// ── PENDÊNCIAS ──────────────────────────────────────────────

/**
 * O que falta neste cadastro — sem nunca virar bloqueio.
 *
 * Reaproveita `conferirCadastro` (a régua da CFM 1.638) e acrescenta o
 * único estado que ela não conhece: o paciente que entrou como não
 * identificado e continua assim.
 */
export function pendenciasDeIdentificacao(paciente) {
  const base = conferirCadastro(paciente);
  if (!aguardandoIdentificacao(paciente)) return base;
  return {
    ...base,
    completo: false,
    aguardandoIdentificacao: true,
    pendencias: [
      { campo: "nao_identificado", nivel: "essencial", label: "Identidade do paciente",
        porque: "Admitido sem identificação. Enquanto ninguém completar, o atendimento não pode ser cobrado, o resultado de exame não pode ser entregue e o histórico dele não se une ao que já existe." },
      ...base.pendencias,
    ],
  };
}

// ── ABERTURA DO ATENDIMENTO ─────────────────────────────────

/**
 * Pode abrir?
 *
 * Separa o que IMPEDE do que AVISA, de propósito:
 *   erros   — sem isso o registro nasce quebrado (sem paciente, sem origem)
 *   avisos  — precisa aparecer na tela, mas quem decide é a recepção
 *
 * O aviso de atendimento já aberto é o que evita o defeito clássico: a
 * mesma pessoa com dois atendimentos correndo ao mesmo tempo, um com a
 * prescrição e outro com o exame.
 */
export function validarAbertura({ paciente, tipo, origem, origemDetalhe, atendimentosAbertos = [] } = {}) {
  const erros = [];
  const avisos = [];

  const prontuario = normalizarProntuario(paciente?.prontuario);
  if (!prontuario) {
    erros.push("Selecione ou cadastre o paciente antes de abrir o atendimento. O atendimento precisa nascer ligado a um prontuário — sem isso, o que for registrado hoje não aparece no histórico dele amanhã.");
  }

  const t = TIPOS_ATENDIMENTO.find(x => x.chave === tipo);
  if (!t) erros.push("Informe o tipo de atendimento.");
  else if (!t.disponivel) erros.push(`Atendimento ${t.label.toLowerCase()} ainda não é aberto por esta tela.`);

  if (!origem) erros.push("Informe por onde o paciente chegou.");
  else if (psPedeDetalhe(origem) && !String(origemDetalhe ?? "").trim())
    erros.push("Informe a unidade/origem de procedência.");

  // ── avisos ──
  const abertos = (atendimentosAbertos || []).filter(
    a => normalizarProntuario(a?.prontuario) === prontuario && a?.status !== "finalizado");
  if (prontuario && abertos.length) {
    avisos.push({
      chave: "atendimento_aberto",
      texto: `Este paciente já tem ${abertos.length} atendimento${abertos.length > 1 ? "s" : ""} em aberto. Abrir outro divide o registro entre os dois — confira se não é o mesmo episódio.`,
    });
  }

  if (paciente?.obito) {
    avisos.push({
      chave: "obito",
      texto: "O cadastro deste paciente está marcado como óbito. Confirme que é a pessoa certa antes de seguir.",
    });
  }

  if (prontuario) {
    const pend = pendenciasDeIdentificacao(paciente);
    if (pend.aguardandoIdentificacao) {
      avisos.push({ chave: "nao_identificado",
        texto: "Paciente sem identificação. Pode atender — mas a pendência fica aberta até alguém completar o cadastro." });
    } else if (!pend.completo) {
      avisos.push({ chave: "cadastro_incompleto",
        texto: `Cadastro incompleto para a CFM 1.638: falta ${pend.pendencias.filter(x => x.nivel === "essencial").map(x => x.label).join(", ")}.` });
    }
  }

  return { ok: erros.length === 0, erros, avisos };
}
