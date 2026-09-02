// ═══════════════════════════════════════════════════════════
// RECEPÇÃO — camada de dados
//
// Só acesso ao banco. As regras vivem em `recepcao.js` (puras, testadas);
// a interface, em `Recepcao.jsx`.
//
// TODA ESCRITA DA RECEPÇÃO PASSA POR AQUI, pelo mesmo motivo que no PEP:
// enquanto cada tela montava o próprio `body`, uma delas gravou em quatro
// colunas inexistentes e o PostgREST recusou o INSERT inteiro — em
// silêncio. Com a escrita concentrada num arquivo, `contrato-banco.test.js`
// confere cada chave contra `supabase/auditoria-banco.sql`.
//
// `sb` é o sbFetch do App.jsx, injetado. Ele NUNCA lança: devolve `null`
// quando a chamada falha. Por isso cada função aqui devolve um resultado
// explícito ({ ok, ... }) em vez de confiar em exceção — e nenhuma delas
// trata `null` como sucesso.
// ═══════════════════════════════════════════════════════════

import {
  filtroBuscaPacientes, filtroBuscaPacientesLegado, normalizarProntuario, dadosNaoIdentificado,
} from "./recepcao.js";
import { camposDaFicha, DOMINIOS } from "./ficha.js";
// Só o catálogo de motivos, para o cancelamento da vaga antiga dizer POR
// EXTENSO por que ela sumiu. Quem lê a agenda não decora chave de código.
import { MOTIVO_REMARCACAO_POR_CHAVE } from "./agenda.js";
import { iniciaisDe } from "../pacientes/identidade.js";
import { CATALOGO_POR_CHAVE, corpoDoCatalogo } from "./catalogo.js";
import { camposDaCorrecao, FILTRO_ATENDIMENTO_ABERTO } from "./ciclo.js";
import { CAMPOS_DO_EPISODIO } from "./consultas.js";
import { camposDaProducao } from "./producao.js";
import { camposDoResponsavel } from "./responsavel.js";
import { camposDaConta, camposDoItem } from "./faturamento.js";
import { listaLida, naoDeuParaLer } from "../util/leitura.js";

// Campos do paciente que a recepção precisa ver na lista de resultados.
// Lista explícita em vez de `*`: a busca aparece no balcão, com gente
// atrás, e não há motivo para trazer endereço e telefone de várias pessoas
// para uma tela que só precisa desempatar quem é quem.
const CAMPOS_BUSCA = [
  "prontuario", "iniciais", "nome_completo", "nome_social", "nome_mae",
  "data_nascimento", "ano_nascimento", "sexo", "cpf", "cns",
  // `obito_origem` e `obito_em` vêm junto porque o aviso diz DE ONDE veio o
  // óbito — e sem a origem a mensagem manda corrigir sem dizer onde.
  "nao_identificado", "identificado_em", "obito", "obito_em", "obito_origem",
].join(",");

/**
 * Procura o paciente pelo que a recepção digitou.
 *
 * 🔴 DEVOLVE `{ ok, lista }`, E NÃO UMA LISTA — a distinção é a defesa.
 *
 * "Procurei e não achei" e "não consegui perguntar" levam a tela ao MESMO
 * lugar quando os dois viram `[]`: "Nenhum paciente encontrado", com os
 * botões de cadastrar logo abaixo. Aí uma oscilação de rede, ou uma coluna
 * que o banco ainda não tem, produz um prontuário DUPLICADO — e duplicata
 * neste sistema é permanente, porque não existe unificação.
 *
 * O comentário abaixo já defendia essa diferença desde o PR #108 e mesmo
 * assim as três saídas seguintes colapsavam em `[]`. Defender no comentário
 * e perder no `return` é o modo de falhar mais caro que este módulo tem.
 *
 *   { ok: true,  lista }        → perguntei e esta é a resposta (pode ser [])
 *   { ok: false, motivo }       → NÃO deu para perguntar. A tela não pode
 *                                 oferecer "cadastrar novo" neste caso.
 *
 * `curto: true` acompanha o termo curto demais para consultar: também é
 * `ok`, porque a decisão de não perguntar foi nossa e não do banco.
 */
export async function buscarPacientes(sb, termo, { limite = 25 } = {}) {
  const filtro = filtroBuscaPacientes(termo);
  if (!filtro) return { ok: true, lista: [], curto: true };
  const consulta = f => sb(`pacientes?${f}&select=${CAMPOS_BUSCA}&limit=${limite}&order=prontuario`);

  const r = await consulta(filtro);
  if (Array.isArray(r)) return { ok: true, lista: r };

  // `null` NÃO é lista vazia. Lista vazia é "procurei e não achei"; `null` é
  // "não deu para perguntar" — e aqui a causa previsível é uma só: a coluna
  // `nome_busca` ainda não existe neste banco, porque a migração é manual e
  // roda DEPOIS do deploy. Sem este recuo, a recepção passaria o intervalo
  // inteiro entre o merge e o SQL vendo "nenhum paciente encontrado" para
  // TODO MUNDO, no balcão, sem nenhuma pista do motivo.
  //
  // O recuo é para a busca antiga, que é pior mas funciona. Depois que o SQL
  // rodar nos dois bancos, nada mais passa por aqui.
  const legado = filtroBuscaPacientesLegado(termo);
  // Busca por documento ou prontuário tem o mesmo filtro nos dois caminhos:
  // não há recuo a tentar, e a falha é falha. Antes esta linha devolvia `[]`
  // e a tela dizia "não existe" para um paciente que ninguém conseguiu
  // procurar.
  if (!legado || legado === filtro) {
    return { ok: false, motivo: "Não consegui consultar o cadastro agora." };
  }
  const r2 = await consulta(legado);
  if (Array.isArray(r2)) return { ok: true, lista: r2 };
  return { ok: false, motivo: "Não consegui consultar o cadastro agora." };
}

/**
 * Os bebês que ESTA MÃE já tem cadastrados no mesmo dia.
 *
 * É como se descobre que o parto foi múltiplo ANTES de criar o segundo
 * cadastro — e é o que permite oferecer a ordem certa (2º do parto) em vez
 * de deixar a recepção criar dois "RN de Maria" idênticos, que é
 * exatamente a situação que a enfermagem do berçário não consegue desfazer.
 */
export async function irmaosDoMesmoParto(sb, prontuarioMae, data) {
  const mae = String(prontuarioMae ?? "").trim();
  const dia = String(data ?? "").slice(0, 10);
  if (!mae || !dia) return [];
  const r = await sb(
    `pacientes?prontuario_mae=eq.${encodeURIComponent(mae)}&data_nascimento=eq.${dia}` +
    `&select=prontuario,nome_completo,dnv,ordem_nascimento,hora_nascimento&order=ordem_nascimento`);
  return listaLida(r);
}

/**
 * Cadastra o recém-nascido: prontuário próprio, vínculo com a mãe.
 *
 * O BEBÊ É OUTRA PESSOA. Ele ganha prontuário próprio porque o histórico
 * dele é dele — juntar ao da mãe pareceria conveniente no dia do parto e
 * seria irreversível depois. O que liga os dois é `prontuario_mae`.
 *
 * HERDA DA MÃE o endereço e o telefone, e só isso: eles moram no mesmo
 * lugar e o telefone de contato é o mesmo. Não herda documento nem
 * convênio — documento do bebê é a DNV, e a elegibilidade do convênio para
 * recém-nascido tem regra própria de carência que a recepção confere na
 * hora.
 */
export async function cadastrarRecemNascido(sb, { mae, dados }, user) {
  if (!mae?.prontuario) return { ok: false, motivo: "Sem a mãe não dá para cadastrar o bebê." };

  const pront = await emitirProntuario(sb);
  if (!pront?.ok) return { ok: false, motivo: pront?.motivo || "Não consegui emitir o prontuário do bebê." };

  const corpo = {
    prontuario: pront.prontuario,
    nome_completo: dados.nome_completo,
    iniciais: iniciaisDe(dados.nome_completo) || "RN",
    nome_mae: mae.nome_completo || null,
    prontuario_mae: mae.prontuario,
    data_nascimento: dados.data_nascimento || null,
    hora_nascimento: dados.hora_nascimento || null,
    dnv: String(dados.dnv ?? "").trim() || null,
    ordem_nascimento: dados.ordem_nascimento || null,
    sexo: dados.sexo || null,
    // Herança do endereço: moram no mesmo lugar.
    end_logradouro: mae.end_logradouro || null,
    end_numero: mae.end_numero || null,
    end_complemento: mae.end_complemento || null,
    end_bairro: mae.end_bairro || null,
    end_municipio: mae.end_municipio || null,
    end_uf: mae.end_uf || null,
    end_cep: mae.end_cep || null,
    telefone: mae.telefone || null,
    // Naturalidade do bebê é onde ele nasceu, não onde a mãe nasceu — e
    // isso é o município do hospital, que esta função não conhece. Fica em
    // branco e a conferência do cadastro cobra, em vez de herdar errado.
    nacionalidade: "brasileira",
    usuario: user?.name || null,
    updated_at: new Date().toISOString(),
  };

  const r = await sb("pacientes", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(corpo),
  }).catch(() => null);

  // O PostgREST devolve 2xx mesmo quando nada muda — confere o RETORNO.
  // Aqui o motivo mais provável de recusa é o índice único da DNV: alguém
  // já cadastrou este mesmo nascimento.
  if (!Array.isArray(r) || !r.length) {
    return { ok: false, motivo: `Nada foi gravado. Se a DNV ${dados.dnv || "informada"} já está em outro cadastro, este nascimento já foi registrado — procure por ela antes de criar outro.` };
  }
  return { ok: true, paciente: r[0] };
}

/** O cadastro completo de um paciente, ou `null`. */
export async function carregarPaciente(sb, prontuario) {
  const p = normalizarProntuario(prontuario);
  if (!p) return null;
  const r = await sb(`pacientes?prontuario=eq.${encodeURIComponent(p)}&select=*`);
  return Array.isArray(r) && r.length ? r[0] : null;
}

/**
 * Pede ao banco o próximo número de prontuário.
 *
 * A emissão é do BANCO, não da tela: dois recepcionistas atendendo ao
 * mesmo tempo em dois computadores calculariam o mesmo "maior + 1" e
 * criariam o mesmo número. A sequência do Postgres é atômica; um `select
 * max()` no cliente não é.
 *
 * Quando falha (migração não aplicada, permissão), devolve o motivo em vez
 * de um número inventado — a tela cai no preenchimento manual, que é ruim
 * mas é honesto.
 */
export async function emitirProntuario(sb) {
  const r = await sb("rpc/proximo_prontuario", { method: "POST", body: "{}" });
  const valor = typeof r === "string" ? r : (r && typeof r === "object" ? r.proximo_prontuario : null);
  if (!valor) {
    return { ok: false, motivo: "O banco não emitiu o número. Confirme que a migração `migracao-atendimento-recepcao.sql` foi aplicada neste banco." };
  }
  return { ok: true, prontuario: String(valor) };
}

/**
 * Cria o cadastro de quem chegou sem identificação.
 *
 * Ver `dadosNaoIdentificado` em recepcao.js para o que NÃO se grava aqui
 * (idade aparente não vira data de nascimento).
 */
export async function criarPacienteNaoIdentificado(sb, dados, user) {
  const corpo = dadosNaoIdentificado(dados);
  const r = await sb("pacientes", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ ...corpo, usuario: user?.name || null, updated_at: new Date().toISOString() }),
  });
  // O PostgREST devolve 204 mesmo quando o RLS bloqueia e nada muda — por
  // isso se confere o RETORNO, não o status.
  if (!Array.isArray(r) || !r.length) {
    return { ok: false, motivo: "Nada foi gravado. Confirme que seu perfil permite cadastrar paciente e que a migração foi aplicada." };
  }
  return { ok: true, paciente: r[0] };
}

/** Atendimentos deste paciente que ainda não foram finalizados. */
export async function atendimentosAbertos(sb, prontuario) {
  const p = normalizarProntuario(prontuario);
  if (!p) return [];
  const r = await sb(`ps_atendimentos?prontuario=eq.${encodeURIComponent(p)}&${FILTRO_ATENDIMENTO_ABERTO}&select=id,prontuario,iniciais,status,chegada_em,classificacao,tipo_atendimento&order=chegada_em.desc`);
  return listaLida(r);
}

/**
 * Abre o atendimento.
 *
 * As `iniciais` são copiadas do cadastro em vez de digitadas de novo: era
 * o campo em que a chegada do PS divergia do cadastro sem ninguém notar —
 * a fila mostrava um nome e o Paciente 360, outro.
 */
export async function abrirAtendimento(sb, { paciente, tipo = "emergencia", origem, origemDetalhe, queixa, ficha, medico, agendamentoId }, user) {
  const prontuario = normalizarProntuario(paciente?.prontuario);
  if (!prontuario) return { ok: false, motivo: "Atendimento sem paciente não é gravado." };

  const corpo = {
    prontuario,
    // As iniciais SAEM DO NOME quando há nome, e só caem na coluna
    // `iniciais` do cadastro quando não há. A coluna é denormalizada e pode
    // ficar velha: quem corrige um nome por um caminho que não a atualiza
    // deixa as duas divergindo, e é a `iniciais` que aparece na fila do PS e
    // na pulseira. `CadastroPaciente` já deriva assim ao gravar — aqui a
    // regra passa a ser a mesma, em vez de confiar no que estiver guardado.
    iniciais: iniciaisDe(paciente?.nome_social || paciente?.nome_completo)
      || String(paciente?.iniciais || "?").trim(),
    queixa: String(queixa ?? "").trim() || null,
    origem: origem || null,
    origem_detalhe: String(origemDetalhe ?? "").trim() || null,
    tipo_atendimento: tipo,
    chegada_em: new Date().toISOString(),
    // O status de entrada depende do tipo. Emergência entra AGUARDANDO
    // TRIAGEM porque a classificação de Manchester é o que ordena a fila.
    // Ambulatorial não é triado: a consulta já tem hora marcada e
    // especialidade definida, então o paciente entra aguardando o
    // profissional. Cravar "aguardando_triagem" para os dois punha consulta
    // agendada na fila do plantão, onde ela ficaria para sempre — ninguém
    // vai triar quem já tem consulta marcada.
    status: tipo === "emergencia" ? "aguardando_triagem" : "aguardando_atendimento",
    usuario: user?.name || null,
    updated_at: new Date().toISOString(),
    // A parte administrativa da ficha. `camposDaFicha` devolve exatamente
    // as colunas que existem — o `contrato-banco.test.js` confere isso
    // contra a auditoria, que é o que impede a volta do INSERT recusado em
    // silêncio.
    ...(ficha ? camposDaFicha(ficha) : {}),
    // Médico e CBO congelados no momento da abertura, pelo mesmo motivo da
    // assinatura no PEP: quem atendeu pode mudar de ocupação depois, e a
    // conta daquele mês precisa continuar contando a história daquele mês.
    ...(medico ? { medico: medico.nome || null, medico_cbo: medico.cbo || null } : {}),
    // De qual agendamento este atendimento nasceu. É o que faz "realizadas"
    // deixar de ser digitado: consulta realizada é agendamento com
    // atendimento aberto.
    ...(agendamentoId ? { agendamento_id: agendamentoId } : {}),
  };

  const r = await sb("ps_atendimentos", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(corpo),
  });
  if (!Array.isArray(r) || !r.length) {
    return { ok: false, motivo: "Nada foi gravado. Se o paciente foi cadastrado agora, confirme que o cadastro concluiu antes de abrir o atendimento." };
  }
  return { ok: true, atendimento: r[0] };
}

/**
 * Os catálogos que a ficha consome, numa ida só.
 *
 * Devolve SEMPRE todas as chaves, com array vazio quando não há nada
 * cadastrado — é isso que permite a tela distinguir "o hospital ainda não
 * configurou" de "a recepcionista não preencheu", e cobrar só o segundo.
 *
 * Falha de rede também cai em array vazio, e não em exceção: catálogo que
 * não carregou não pode derrubar a recepção. A consequência é a tela pedir
 * menos, nunca travar.
 */
export async function carregarCatalogos(sb) {
  const vazio = { convenios: [], planos: [], procedimentos: [], sigtap: [] };
  for (const d of DOMINIOS) vazio[d.chave] = [];

  const [convenios, planos, procedimentos, dominios, sigtap] = await Promise.all([
    sb("at_convenios?ativo=is.true&select=*&order=nome"),
    sb("at_planos?ativo=is.true&select=*&order=nome"),
    sb("at_procedimentos?ativo=is.true&select=*&order=nome"),
    sb("at_dominios?ativo=is.true&select=*&order=dominio,ordem,nome"),
    // 🔴 O catálogo que a tela não enxergava. `at_procedimentos` está vazia
    // no banco do hospital enquanto `sigtap_procedimentos` tem centenas de
    // procedimentos reais — e o motor de conta já sabe cruzar os dois.
    // Só as colunas que a ESCOLHA usa: a tabela é grande e o resto (faixas
    // etárias, CIDs, valores) quem lê é `montar-conta.js`, na hora da conta.
    sb("sigtap_procedimentos?select=codigo,nome,via,competencia&order=codigo"),
  ]);

  const out = {
    ...vazio,
    // `sigtap_procedimentos` está em TABELAS_OPCIONAIS: num banco onde a
    // migração ainda não rodou, o sbFetch devolve null. Array vazio faz a
    // escolha oferecer só o catálogo do hospital, em vez de quebrar.
    sigtap: listaLida(sigtap),
    convenios: listaLida(convenios),
    planos: listaLida(planos),
    procedimentos: listaLida(procedimentos),
  };
  for (const linha of listaLida(dominios)) {
    if (out[linha.dominio]) out[linha.dominio].push(linha);
    else out[linha.dominio] = [linha];
  }
  return out;
}

/**
 * Quem pode aparecer como profissional responsável.
 *
 * Traz o CBO junto porque é ele que será congelado no atendimento — e
 * porque a tela precisa avisar quando o profissional escolhido não tem CBO
 * cadastrado, antes de a produção ser rejeitada.
 */
export async function carregarProfissionais(sb) {
  const r = await sb("profiles?select=username,nome,categoria,conselho,registro_conselho,cbo&order=nome");
  const lista = listaLida(r);
  // Só quem tem competência clínica assinala atendimento; administrativo
  // não vira responsável por ato assistencial.
  return lista.filter(p => p.categoria && p.categoria !== "administrativo");
}

// ── PESQUISA DE ATENDIMENTOS (aba Consultas) ────────────────

/**
 * Todo o histórico de episódios de um paciente.
 *
 * Traz só `CAMPOS_DO_EPISODIO` — a lista sem dado clínico. É o que permite
 * a recepção responder "esse paciente já veio?" sem ter acesso ao
 * prontuário, que é a separação que a COFEN 754/2024, art. 6º, exige.
 *
 * Inclui os CANCELADOS de propósito: quem pesquisa precisa ver que houve um
 * atendimento cancelado, senão "abri e cancelei por engano" fica
 * indistinguível de "nunca abri". Quem filtra é o consumidor.
 */
export async function historicoDoPaciente(sb, prontuario, { limite = 200 } = {}) {
  const p = normalizarProntuario(prontuario);
  if (!p) return [];
  const r = await sb(`ps_atendimentos?prontuario=eq.${encodeURIComponent(p)}` +
    `&select=${CAMPOS_DO_EPISODIO.join(",")}&order=chegada_em.desc&limit=${limite}`);
  return listaLida(r);
}

/**
 * O que este paciente tem marcado a partir de hoje.
 *
 * Responde a pergunta que evita o erro mais comum do balcão: marcar de novo
 * quem já está marcado. Sem isso, a mesma pessoa acaba com duas consultas da
 * mesma especialidade no mesmo dia — e ocupa uma vaga que faltaria para
 * outro.
 */
export async function agendamentosFuturos(sb, prontuario, { de } = {}) {
  const p = normalizarProntuario(prontuario);
  if (!p) return [];
  const inicio = de || new Date().toISOString().slice(0, 10);
  const r = await sb(`ag_agendamentos?prontuario=eq.${encodeURIComponent(p)}` +
    // `confirmado` entra na lista: sem ele, o paciente que confirmou na
    // vespera SUMIRIA do cartao "tem consulta hoje" da Recepcao — e quem
    // confirmou e justamente quem mais garantidamente vem.
    `&data=gte.${inicio}&status=in.(agendado,confirmado,presente)` +
    // `profissional_username` entra porque a chegada precisa dele para
    // congelar o médico e o CBO no atendimento — sem CBO a produção SUS é
    // rejeitada, não glosada.
    `&select=id,data,hora,especialidade_cod,origem_marcacao,tipo_atendimento_cod,status,protocolo_regulacao,profissional_username,grade_id` +
    `&order=data,hora`);
  return listaLida(r);
}

/** Os atendimentos abertos num período. As bordas vêm de `bordasDoPeriodo`. */
export async function atendimentosDoPeriodo(sb, { inicio, fim, tipo, status } = {}) {
  if (!inicio || !fim) return [];
  const extra = [
    tipo ? `&tipo_atendimento=eq.${encodeURIComponent(tipo)}` : "",
    status ? `&status=eq.${encodeURIComponent(status)}` : "",
  ].join("");
  const r = await sb(`ps_atendimentos?chegada_em=gte.${inicio}&chegada_em=lt.${fim}${extra}` +
    `&select=${CAMPOS_DO_EPISODIO.join(",")}&order=chegada_em.desc&limit=500`);
  return listaLida(r);
}

/** Um atendimento pelo número — sem dado clínico. */
export async function atendimentoPorNumero(sb, id) {
  const n = String(id ?? "").replace(/\D/g, "");
  if (!n) return null;
  const r = await sb(`ps_atendimentos?id=eq.${n}&select=${CAMPOS_DO_EPISODIO.join(",")}`);
  return Array.isArray(r) && r.length ? r[0] : null;
}

// ── CICLO DE VIDA DO ATENDIMENTO ────────────────────────────

/**
 * Quantos registros clínicos estão pendurados neste atendimento.
 *
 * É o número que decide se cancelar é possível. Cancelar um atendimento com
 * evolução ou prescrição deixaria registro clínico órfão, apontando para um
 * episódio que o sistema passa a negar.
 *
 * Conta com `HEAD` + `count=exact`: não traz o conteúdo clínico para a
 * tela da recepção, que não tem direito de ler prontuário (COFEN 754/2024,
 * art. 6º). Só a quantidade.
 */
export async function contarRegistrosClinicos(sb, atendimentoId) {
  if (!atendimentoId) return 0;
  const alvos = [
    `ps_registros?atendimento_id=eq.${atendimentoId}&select=id`,
    `ps_prescricao_itens?atendimento_id=eq.${atendimentoId}&select=id`,
    `ps_administracoes?atendimento_id=eq.${atendimentoId}&select=id`,
  ];
  const rs = await Promise.all(alvos.map(a => sb(a).catch(() => null)));
  return rs.reduce((s, r) => s + (Array.isArray(r) ? r.length : 0), 0);
}

/**
 * Encerra o atendimento ambulatorial.
 *
 * Reusa `desfecho` + `desfecho_em` + `status`, que já existiam para o PS —
 * assim tudo que já sabia ler "atendimento fechado" passa a funcionar sem
 * mudança. Inventar um campo novo de encerramento só para o ambulatório
 * criaria dois jeitos de estar fechado, e alguma tela leria só um deles.
 */
export async function encerrarAtendimento(sb, id, desfecho, observacao, user) {
  return patchAtendimento(sb, id, {
    desfecho,
    desfecho_em: new Date().toISOString(),
    status: "finalizado",
    ...(observacao ? { observacao: String(observacao).trim() } : {}),
  }, user);
}

/** Corrige o dado administrativo. `campos` já vem filtrado por `camposDaCorrecao`. */
export async function corrigirAtendimento(sb, id, campos, user) {
  const corpo = camposDaCorrecao(campos);
  if (!Object.keys(corpo).length) return { ok: false, motivo: "Nada a corrigir." };
  return patchAtendimento(sb, id, corpo, user);
}

/**
 * Cancela — com motivo e autor congelados.
 *
 * Não é `delete`. Apagar levaria embora a prova de que alguém esteve no
 * balcão, e deixaria agendamento e saída de estoque apontando para o vazio.
 */
export async function cancelarAtendimento(sb, id, motivo, user) {
  return patchAtendimento(sb, id, {
    status: "cancelado",
    cancelado_motivo: String(motivo ?? "").trim(),
    cancelado_em: new Date().toISOString(),
    cancelado_por: user?.name || null,
  }, user);
}

/**
 * A lista de trabalho do encerramento: ambulatoriais que ficaram abertos.
 *
 * Existe pelo mesmo motivo da lista de identificação pendente — pendência
 * que não aparece em lugar nenhum não é pendência, é esquecimento. E aqui a
 * pendência tem efeito colateral: cada um destes faz o aviso de duplicidade
 * disparar na próxima visita do paciente.
 */
export async function listarAmbulatoriaisAbertos(sb, { limite = 200 } = {}) {
  const r = await sb(
    `ps_atendimentos?tipo_atendimento=eq.ambulatorial&${FILTRO_ATENDIMENTO_ABERTO}` +
    // `gestante` e o vínculo com o cadastro entram para a PRIORIDADE LEGAL:
    // a idade sai de `data_nascimento`, e sem ela a fila não tem como saber
    // quem é idoso. O embed usa a FK `ps_atendimentos_paciente_fk` — uma
    // consulta só, não uma por paciente.
    `&select=id,prontuario,iniciais,status,chegada_em,atendimento_em,especialidade_cod,tipo_atendimento_cod,agendamento_id,medico,queixa,gestante,pacientes(data_nascimento)` +
    `&order=chegada_em&limit=${limite}`);
  return listaLida(r);
}

/**
 * Chama o paciente para a sala.
 *
 * Grava `atendimento_em` — a coluna que marca o INÍCIO real da consulta e
 * que, no ambulatório, nunca era escrita: só o fluxo do PS a preenchia.
 * Sem ela não existe tempo de espera, e o atraso do médico não deixa rastro
 * nenhum. É o que separa "quanto falta?" respondido de cabeça de um número
 * que a gestão pode cobrar.
 *
 * `atendimento_em` é gravado UMA vez, na primeira chamada: `validarChamada`
 * recusa a segunda. Reescrever a hora a cada clique apagaria a espera que já
 * tinha sido medida.
 */
export async function chamarParaAtendimento(sb, id, user) {
  if (!id) return { ok: false, motivo: "Atendimento inválido." };
  const r = await sb(`ps_atendimentos?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      status: "em_atendimento",
      atendimento_em: new Date().toISOString(),
      usuario: user?.name || null,
      updated_at: new Date().toISOString(),
    }),
  });
  // O PostgREST devolve 2xx mesmo alterando ZERO linhas — confere o retorno.
  if (!Array.isArray(r) || !r.length) {
    return { ok: false, motivo: "Nada foi alterado — confirme que seu perfil permite atualizar o atendimento." };
  }
  return { ok: true, atendimento: r[0] };
}

/** Um atendimento, com a ficha inteira — para a tela de correção. */
export async function carregarAtendimento(sb, id) {
  if (!id) return null;
  const r = await sb(`ps_atendimentos?id=eq.${encodeURIComponent(id)}&select=*`);
  return Array.isArray(r) && r.length ? r[0] : null;
}

async function patchAtendimento(sb, id, campos, user) {
  if (!id) return { ok: false, motivo: "Atendimento inválido." };
  const r = await sb(`ps_atendimentos?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ ...campos, usuario: user?.name || null, updated_at: new Date().toISOString() }),
  });
  if (!Array.isArray(r) || !r.length) {
    return { ok: false, motivo: "Nada foi alterado. Confirme que a migração `migracao-atendimento-ciclo.sql` foi aplicada e que seu perfil permite editar atendimento." };
  }
  return { ok: true, atendimento: r[0] };
}

// ── AGENDA DO AMBULATÓRIO ───────────────────────────────────

const CAMPOS_AGENDAMENTO = [
  "id", "data", "hora", "especialidade_cod", "profissional_username", "grade_id",
  "prontuario", "origem_marcacao", "tipo_atendimento_cod", "protocolo_regulacao",
  "status", "presente_em", "atendimento_id", "cancelado_motivo", "observacao",
  // 🔴 Estes cinco eram GRAVADOS E NUNCA LIDOS DE VOLTA. A lista é
  // explícita (sem `*`) de propósito, e ficou para trás duas vezes: o motivo
  // da falta e o carimbo da confirmação entraram no banco pelo PR da
  // confirmação da véspera e não entraram aqui — então a tela que existe
  // para tornar a falta ACIONÁVEL nunca via o motivo que ela mesma gravou.
  // Coluna que só sabe ir é coluna que não existe.
  "falta_motivo", "confirmado_em", "confirmado_por",
  "remarcado_de", "remarcacao_motivo",
].join(",");

/** As grades cadastradas, incluindo as desligadas (a tela precisa religar). */
export async function carregarGrades(sb) {
  const r = await sb("ag_grades?select=*&order=especialidade_cod,dia_semana,hora_inicio");
  return listaLida(r);
}

export async function salvarGrade(sb, grade, user) {
  const corpo = {
    ...(grade.id ? { id: grade.id } : {}),
    especialidade_cod: String(grade.especialidade_cod ?? "").trim(),
    profissional_username: String(grade.profissional_username ?? "").trim() || null,
    dia_semana: Number(grade.dia_semana),
    hora_inicio: grade.hora_inicio,
    hora_fim: grade.hora_fim,
    duracao_min: Number(grade.duracao_min) || 20,
    vagas_regulacao: Number(grade.vagas_regulacao) || 0,
    vagas_internas: Number(grade.vagas_internas) || 0,
    vagas_chegada: Number(grade.vagas_chegada) || 0,
    vigencia_inicio: grade.vigencia_inicio || new Date().toISOString().slice(0, 10),
    vigencia_fim: grade.vigencia_fim || null,
    ativo: grade.ativo !== false,
    observacao: String(grade.observacao ?? "").trim() || null,
    usuario: user?.name || null,
    updated_at: new Date().toISOString(),
  };
  const r = await sb("ag_grades", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(corpo),
  });
  if (!Array.isArray(r) || !r.length) {
    return { ok: false, motivo: "Nada foi gravado. Confirme que a migração `migracao-atendimento-agenda.sql` foi aplicada e que seu perfil permite editar a agenda." };
  }
  return { ok: true, grade: r[0] };
}

/**
 * Liga ou desliga uma grade. Não existe apagar: agendamento já feito aponta
 * para ela, e sumir com a grade faria a agenda de meses atrás perder a
 * referência de quantas vagas existiam naquele dia.
 */
export async function alternarAtivoGrade(sb, id, ativo, user) {
  if (!id) return { ok: false, motivo: "Grade inválida." };
  const r = await sb(`ag_grades?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ ativo: !!ativo, usuario: user?.name || null, updated_at: new Date().toISOString() }),
  });
  if (!Array.isArray(r) || !r.length) return { ok: false, motivo: "Nada foi alterado." };
  return { ok: true, grade: r[0] };
}

/** Os bloqueios que alcançam um período. */
export async function carregarBloqueios(sb, { de, ate } = {}) {
  const filtros = [];
  if (ate) filtros.push(`data_inicio=lte.${ate}`);
  if (de) filtros.push(`data_fim=gte.${de}`);
  const q = filtros.length ? filtros.join("&") + "&" : "";
  const r = await sb(`ag_bloqueios?${q}select=*&order=data_inicio`);
  return listaLida(r);
}

export async function salvarBloqueio(sb, b, user) {
  const corpo = {
    ...(b.id ? { id: b.id } : {}),
    data_inicio: b.data_inicio,
    data_fim: b.data_fim || b.data_inicio,
    especialidade_cod: String(b.especialidade_cod ?? "").trim() || null,
    profissional_username: String(b.profissional_username ?? "").trim() || null,
    motivo: String(b.motivo ?? "").trim(),
    usuario: user?.name || null,
  };
  const r = await sb("ag_bloqueios", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(corpo),
  });
  if (!Array.isArray(r) || !r.length) return { ok: false, motivo: "Nada foi gravado." };
  return { ok: true, bloqueio: r[0] };
}

/** Os agendamentos de um dia. */
export async function carregarAgendaDoDia(sb, data) {
  if (!data) return [];
  const r = await sb(`ag_agendamentos?data=eq.${encodeURIComponent(data)}&select=${CAMPOS_AGENDAMENTO}&order=hora,criado_em`);
  return listaLida(r);
}

/**
 * Os agendamentos de um período — a base do relatório do mês.
 *
 * `data` é coluna DATE (dia civil, sem hora), então `lte` no último dia
 * está certo aqui. A regra do "lt no dia seguinte" vale para as colunas de
 * TIMESTAMP, como `chegada_em`, onde quem chegou 23:59:30 ficaria de fora
 * da própria data.
 */
export async function carregarAgendamentosDoPeriodo(sb, { de, ate, limite = 3000 } = {}) {
  if (!de || !ate) return [];
  const r = await sb(`ag_agendamentos?data=gte.${encodeURIComponent(de)}&data=lte.${encodeURIComponent(ate)}` +
    `&select=${CAMPOS_AGENDAMENTO}&order=data,hora&limit=${limite}`);
  return listaLida(r);
}

/**
 * Marca uma vaga.
 *
 * A conferência da REGRA (vaga da regulação, cota esgotada, horário tomado)
 * é de `podeMarcar` em agenda.js e acontece antes desta chamada. Aqui fica a
 * última linha de defesa, que é do banco: o índice único
 * `ag_agend_vaga_unica` recusa duas pessoas no mesmo horário mesmo que duas
 * recepcionistas cliquem no mesmo instante — coisa que validação de tela
 * nenhuma consegue impedir.
 */
/**
 * Amarra à agenda um atendimento que já foi aberto no balcão.
 *
 * É o caminho INVERSO do `confirmarPresenca`: lá o agendamento existe e vira
 * atendimento; aqui o paciente chegou sem ter marcado, o atendimento já é
 * real, e falta a vaga que o faz CONTAR.
 *
 * Sem isto, quem chega sem marcar some da produção do ambulatório — o
 * relatório do mês conta agendamentos, e esse episódio não tinha um. O
 * número saía menor que a realidade, em silêncio.
 *
 * Nasce direto como `presente`, com `presente_em` e `atendimento_id`: não há
 * um instante em que ele seja uma vaga esperando alguém, porque a pessoa já
 * está aqui. Marcá-lo como `agendado` criaria uma vaga fantasma que a lista
 * de faltas cobraria no fim do dia.
 *
 * Falhar aqui NÃO desfaz o atendimento — ele é o registro do que aconteceu
 * com a pessoa, e vale por si. Quem chama reporta o que ficou faltando.
 */
export async function amarrarChegadaNaAgenda(sb, { atendimento, grade, tipoAtendimentoCod }, user) {
  if (!atendimento?.id) return { ok: false, motivo: "Atendimento inválido." };
  if (!grade?.id) return { ok: false, motivo: "Sem grade para amarrar." };

  const corpo = {
    data: String(atendimento.chegada_em ?? "").slice(0, 10) || new Date().toISOString().slice(0, 10),
    hora: null,                       // fila de chegada não tem relógio: tem ordem
    especialidade_cod: grade.especialidade_cod,
    profissional_username: grade.profissional_username || null,
    grade_id: grade.id,
    prontuario: atendimento.prontuario,
    origem_marcacao: "chegada",
    tipo_atendimento_cod: tipoAtendimentoCod || atendimento.tipo_atendimento_cod || null,
    status: "presente",
    presente_em: new Date().toISOString(),
    atendimento_id: atendimento.id,
    usuario: user?.name || null,
    updated_at: new Date().toISOString(),
  };
  const r = await sb("ag_agendamentos", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(corpo),
  });
  if (!Array.isArray(r) || !r.length) {
    return { ok: false, motivo: "A vaga de chegada não foi registrada — o atendimento está aberto, mas ele não vai contar na produção do dia." };
  }
  return { ok: true, agendamento: r[0] };
}

export async function marcarAgendamento(sb, dados, user) {
  const corpo = {
    data: dados.data,
    hora: dados.origem_marcacao === "chegada" ? null : (dados.hora || null),
    especialidade_cod: dados.especialidade_cod,
    profissional_username: String(dados.profissional_username ?? "").trim() || null,
    grade_id: dados.grade_id || null,
    prontuario: String(dados.prontuario ?? "").trim() || null,
    origem_marcacao: dados.origem_marcacao,
    tipo_atendimento_cod: String(dados.tipo_atendimento_cod ?? "").trim() || null,
    protocolo_regulacao: String(dados.protocolo_regulacao ?? "").trim() || null,
    observacao: String(dados.observacao ?? "").trim() || null,
    // O elo da remarcação. Entra AQUI e não num insert próprio porque o
    // corpo é montado por lista explícita: campo que não estiver nesta
    // lista some sem erro nenhum — o PostgREST grava a linha, devolve 201,
    // e a coluna fica nula.
    remarcado_de: dados.remarcado_de ?? null,
    remarcacao_motivo: String(dados.remarcacao_motivo ?? "").trim() || null,
    status: "agendado",
    usuario: user?.name || null,
    updated_at: new Date().toISOString(),
  };
  const r = await sb("ag_agendamentos", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(corpo),
  });
  if (!Array.isArray(r) || !r.length) {
    return { ok: false, motivo: "Nada foi gravado. Se outra pessoa marcou este mesmo horário agora, o banco recusou a segunda — recarregue o dia e escolha outro horário." };
  }
  return { ok: true, agendamento: r[0] };
}

/**
 * Confirma presença: abre o atendimento e liga os dois lados.
 *
 * A ordem importa. Primeiro o ATENDIMENTO, porque é ele que faz o paciente
 * existir no fluxo assistencial; só depois o carimbo no agendamento. Se o
 * segundo passo falhar, o paciente está atendido e o vínculo pode ser
 * refeito — o inverso deixaria o agendamento marcado como presente sem
 * ninguém na fila.
 */
export async function confirmarPresenca(sb, agendamento, { paciente, ficha, medico, queixa }, user) {
  if (!agendamento?.id) return { ok: false, motivo: "Agendamento inválido." };
  if (!paciente?.prontuario) return { ok: false, motivo: "Confirme quem é o paciente antes de dar presença." };

  const at = await abrirAtendimento(sb, {
    paciente,
    tipo: "ambulatorial",
    origem: "Meios próprios",
    queixa,
    ficha: {
      ...(ficha || {}),
      tipo_atendimento_cod: ficha?.tipo_atendimento_cod || agendamento.tipo_atendimento_cod || null,
      especialidade_cod: ficha?.especialidade_cod || agendamento.especialidade_cod || null,
      unidade_origem_cod: ficha?.unidade_origem_cod || "ambulatorio",
    },
    medico,
    agendamentoId: agendamento.id,
  }, user);
  if (!at.ok) return at;

  const r = await sb(`ag_agendamentos?id=eq.${encodeURIComponent(agendamento.id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      status: "presente",
      presente_em: new Date().toISOString(),
      atendimento_id: at.atendimento.id,
      prontuario: paciente.prontuario,
      usuario: user?.name || null,
      updated_at: new Date().toISOString(),
    }),
  });
  if (!Array.isArray(r) || !r.length) {
    return {
      ok: true, atendimento: at.atendimento, agendamento: null,
      aviso: `O atendimento ${at.atendimento.id} foi aberto, mas o agendamento não ficou marcado como presente. O paciente está na fila; o indicador de produção deste dia vai sair errado até alguém corrigir.`,
    };
  }
  return { ok: true, atendimento: at.atendimento, agendamento: r[0] };
}

/**
 * Registra falta.
 *
 * Falta LIBERA a vaga de propósito (ver `ocupaVaga` em agenda.js): o horário
 * volta para quem remarca. O registro fica, porque absenteísmo é indicador
 * que a gestão cobra.
 */
export async function registrarFalta(sb, id, motivo, user) {
  // O MOTIVO passou a ser obrigatório (`validarFalta` em agenda.js). Sem
  // causa, o indicador de absenteísmo mostra o tamanho do problema e não diz
  // o que fazer com ele — transporte que não veio, paciente já atendido em
  // outro serviço e "esqueci" pedem respostas diferentes do hospital, e um
  // deles nem é falta.
  return patchAgendamento(sb, id, { status: "falta", falta_motivo: motivo || null }, user);
}

/**
 * Confirma que o paciente vem — o contato ativo da véspera.
 *
 * É a alavanca que de fato derruba absenteísmo no ambulatório, e o sistema
 * não tinha onde registrá-la: quem ligava anotava no papel. `confirmado_por`
 * guarda QUEM confirmou, porque sem autor não há como saber se a lista do
 * dia foi percorrida ou se alguém marcou por marcar.
 */
export async function confirmarAgendamento(sb, id, user) {
  return patchAgendamento(sb, id, {
    status: "confirmado",
    confirmado_em: new Date().toISOString(),
    confirmado_por: user?.name || null,
  }, user);
}

export async function cancelarAgendamento(sb, id, motivo, user) {
  return patchAgendamento(sb, id, {
    status: "cancelado",
    cancelado_motivo: String(motivo ?? "").trim() || null,
  }, user);
}

/**
 * Remarca: cria a vaga nova LIGADA à antiga e cancela a antiga.
 *
 * A ORDEM É A REGRA DESTA FUNÇÃO, e é a mesma de `confirmarPresenca`.
 *
 *   Primeiro a VAGA NOVA. Se ela falhar, o paciente continua com o
 *   agendamento que tinha — perdeu-se um clique, não um lugar na fila.
 *
 *   Só depois o cancelamento da antiga. Se ESTE falhar, o paciente fica com
 *   duas vagas, as duas visíveis na agenda, e alguém desfaz. É ruim e é
 *   recuperável.
 *
 * A ordem inversa é que não se recupera: cancelar primeiro e falhar ao
 * marcar deixa a pessoa SEM vaga nenhuma e sem ninguém sabendo — ela
 * descobre no dia em que vier.
 *
 * O motivo é gravado nos DOIS lados de propósito: no novo, porque é ele que
 * nasce da remarcação e é por ele que a corrente é lida; no antigo, no
 * `cancelado_motivo`, porque quem olhar a vaga cancelada precisa entender
 * por que ela sumiu sem ter que caçar o sucessor.
 */
export async function remarcarAgendamento(sb, original, dados, motivo, user) {
  if (!original?.id) return { ok: false, motivo: "Agendamento de origem inválido." };
  // Última barreira contra a corrente trocar de pessoa no meio. A regra pura
  // já recusa isso antes, mas esta função é chamável de qualquer lugar — e o
  // dano (o histórico de uma pessoa ligado ao de outra) não tem desfazer.
  const alvo = String(dados?.prontuario ?? "").trim();
  if (alvo && String(original.prontuario ?? "").trim() && alvo !== String(original.prontuario).trim())
    return { ok: false, motivo: `Remarcação é do prontuário ${original.prontuario}, não de ${alvo}.` };

  const novo = await marcarAgendamento(sb, {
    ...dados,
    prontuario: dados.prontuario || original.prontuario,
    remarcado_de: original.id,
    remarcacao_motivo: motivo || null,
  }, user);
  if (!novo.ok) return novo;

  const rotulo = MOTIVO_REMARCACAO_POR_CHAVE[motivo]?.label || motivo || "sem motivo";
  const fechado = await cancelarAgendamento(
    sb, original.id, `Remarcado para ${dados.data} — ${rotulo}`, user);

  // O aviso é devolvido, não engolido: a remarcação FUNCIONOU (a vaga nova
  // existe), mas a antiga continua de pé ocupando um horário. Quem está no
  // balcão precisa saber disso agora, e não descobrir pelo paciente que
  // aparece duas vezes na lista do dia.
  return {
    ok: true,
    agendamento: novo.agendamento,
    aviso: fechado.ok ? null
      : `A vaga nova foi criada, mas a antiga (#${original.id}) NÃO foi cancelada e continua ocupando o horário. Cancele-a à mão.`,
  };
}

/**
 * 🔴 OS ELOS ANTERIORES, QUE QUASE SEMPRE ESTÃO EM OUTRO DIA.
 *
 * A agenda carrega UM dia por vez, e remarcar é justamente mandar o
 * paciente para outra data — então o antecessor quase nunca está na lista
 * carregada. Sem esta busca, `cadeiaDeRemarcacao` para no primeiro elo e a
 * tela mostra "0ª remarcação, espera 0 dia(s)" logo depois de remarcar.
 *
 * Não é um detalhe de exibição: é o número que a coluna existe para
 * responder, dizendo zero. Número que a gente SABE estar errado é pior que
 * número nenhum — o primeiro é lido como verdade.
 *
 * Sobe em degraus, não com recursão no banco: cada volta pega todos os
 * antecessores que faltam de uma vez. Corrente longa é rara, e `limite`
 * existe para o caso em que os dados estejam circulares apesar da trava do
 * banco — girar para sempre é o único erro que a tela não sobrevive.
 */
export async function carregarAncestraisDeRemarcacao(sb, agendamentos = [], { limite = 10 } = {}) {
  const conhecidos = new Map((agendamentos || []).filter(a => a?.id != null).map(a => [String(a.id), a]));
  const extras = [];
  const pendentes = a => (a || []).map(x => x?.remarcado_de)
    .filter(id => id != null && !conhecidos.has(String(id)));

  let faltando = [...new Set(pendentes(agendamentos))];
  for (let volta = 0; faltando.length && volta < limite; volta++) {
    const r = await sb(`ag_agendamentos?id=in.(${faltando.join(",")})&select=${CAMPOS_AGENDAMENTO}`);
    if (!Array.isArray(r) || !r.length) break;
    for (const a of r) { conhecidos.set(String(a.id), a); extras.push(a); }
    faltando = [...new Set(pendentes(r))];
  }
  return extras;
}

/** Liga o paciente a uma vaga da regulação que estava reservada sem nome. */
export async function vincularPacienteAoAgendamento(sb, id, prontuario, protocolo, user) {
  return patchAgendamento(sb, id, {
    prontuario: normalizarProntuario(prontuario) || null,
    ...(protocolo !== undefined ? { protocolo_regulacao: String(protocolo ?? "").trim() || null } : {}),
  }, user);
}

async function patchAgendamento(sb, id, campos, user) {
  if (!id) return { ok: false, motivo: "Agendamento inválido." };
  const r = await sb(`ag_agendamentos?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ ...campos, usuario: user?.name || null, updated_at: new Date().toISOString() }),
  });
  if (!Array.isArray(r) || !r.length) return { ok: false, motivo: "Nada foi alterado — confirme que seu perfil permite editar a agenda." };
  return { ok: true, agendamento: r[0] };
}

// ── FATURAMENTO — a conta do atendimento ────────────────────

const CAMPOS_CONTA = [
  "id", "atendimento_id", "prontuario", "convenio_id", "plano_id", "via",
  "competencia", "status", "fechada_em", "fechada_por", "observacao", "criado_em",
  // A transmissão também VOLTA. Gravar quem/quando/protocolo e não trazer
  // de volta na leitura seria a mesma coluna de mão única que este módulo
  // já teve oito vezes — e é justamente o que se procura quando a glosa
  // chega meses depois.
  "faturada_em", "faturada_por", "remessa_protocolo",
].join(",");

const CAMPOS_ITEM = [
  "id", "conta_id", "tipo", "codigo", "descricao", "quantidade",
  "valor_unitario", "valor_total", "executante", "executante_cbo",
  "data_execucao", "cobrar_do_paciente", "observacao", "cancelado", "criado_em",
].join(",");

/** A conta viva de um atendimento, ou `null`. Cancelada não conta. */
export async function carregarConta(sb, atendimentoId) {
  if (!atendimentoId) return null;
  const r = await sb(`at_contas?atendimento_id=eq.${encodeURIComponent(atendimentoId)}` +
    `&status=neq.cancelada&select=${CAMPOS_CONTA}&order=criado_em.desc&limit=1`);
  return Array.isArray(r) && r.length ? r[0] : null;
}

export async function carregarItensDaConta(sb, contaId) {
  if (!contaId) return [];
  const r = await sb(`at_conta_itens?conta_id=eq.${encodeURIComponent(contaId)}` +
    `&select=${CAMPOS_ITEM}&order=criado_em`);
  return listaLida(r);
}

/**
 * A medicação administrada de um atendimento — para a conta se montar do que
 * foi de fato realizado, e não do que foi só prescrito. Somente leitura: a
 * checagem à beira-leito é do PS/PEP; aqui o faturamento apenas conta o que
 * já foi dado. O acesso é da política de leitura de `ps_administracoes`
 * (o faturamento entra nela porque a medicação é item cobrável da conta).
 */
export async function carregarAdministracoes(sb, atendimentoId) {
  if (!atendimentoId) return [];
  const r = await sb(`ps_administracoes?atendimento_id=eq.${encodeURIComponent(atendimentoId)}` +
    `&select=id,atendimento_id,medicamento_id,medicamento_nome,dose,via,status,administrado_em,categoria,criado_em` +
    `&order=administrado_em`);
  return listaLida(r);
}

/**
 * As fontes de internação do episódio, para a conta usar a permanência REAL da
 * estadia (não a passagem pelo PS): o leito ainda OCUPADO (ligado pelo
 * `ps_atendimento_id`, internação em curso) e as SAÍDAS do prontuário (com
 * admissão, alta e dias de permanência). Só leitura — a escolha de qual saída
 * casa com o episódio é do motor puro (`escolherInternacao`). O faturamento
 * alcança as duas pela leitura de `leitos`/`leitos_saidas`.
 */
export async function carregarLeitosDoEpisodio(sb, { atendimentoId, prontuario } = {}) {
  const [ativo, saidas] = await Promise.all([
    atendimentoId
      ? sb(`leitos?ps_atendimento_id=eq.${encodeURIComponent(atendimentoId)}&status=eq.ocupado&select=data_internacao,prontuario,status&limit=1`)
      : Promise.resolve([]),
    prontuario
      ? sb(`leitos_saidas?prontuario=eq.${encodeURIComponent(prontuario)}&select=data_internacao,data_alta,dias_permanencia,leito,setor&order=data_internacao.desc&limit=20`)
      : Promise.resolve([]),
  ]);
  return {
    leitoAtivo: Array.isArray(ativo) && ativo.length ? ativo[0] : null,
    saidas: listaLida(saidas),
  };
}

/**
 * A lista de trabalho do faturamento: as internações (desfecho `internacao`)
 * e as contas que já existem para elas. O cruzamento e a ordem de trabalho
 * são do motor puro (`montarWorklist`); aqui só se busca.
 *
 * Traz as contas num segundo select por `atendimento_id in (...)` em vez de um
 * join do PostgREST: o faturamento lê as duas tabelas por módulos diferentes,
 * e dois selects simples não dependem de relação declarada no schema.
 */
export async function carregarWorklistFaturamento(sb, { limite = 100 } = {}) {
  const internacoes = await sb(`ps_atendimentos?desfecho=eq.internacao` +
    `&select=id,prontuario,iniciais,chegada_em,desfecho,desfecho_em,convenio_id,procedimento_cod,cid` +
    `&order=chegada_em.desc&limit=${limite}`);
  const lista = listaLida(internacoes);
  if (!lista.length) return { internacoes: [], contas: [] };

  const ids = lista.map((a) => a.id).filter((v) => v != null);
  const contas = ids.length
    ? await sb(`at_contas?atendimento_id=in.(${ids.join(",")})&status=neq.cancelada` +
      `&select=id,atendimento_id,status,competencia`)
    : [];
  return { internacoes: lista, contas: listaLida(contas) };
}

/**
 * A produção faturável para a visão por via: os atendimentos CONCLUÍDOS
 * (`status=finalizado`) que têm procedimento — o universo que vira AIH (as
 * internações), BPA/APAC (o ambulatório) ou TISS/direta (o privado). É mais
 * amplo que a worklist de internações (essa é só o `desfecho=internacao`);
 * aqui entra também o ambulatório, que é de onde nascem BPA e APAC. Só as
 * colunas que a resolução da via e o valor de referência precisam. Cancelado
 * fica de fora (não é `finalizado`). Grant de leitura de `ps_atendimentos`.
 */
export async function carregarProducaoFaturavel(sb, { limite = 500 } = {}) {
  const r = await sb(`ps_atendimentos?status=eq.finalizado&procedimento_cod=not.is.null` +
    `&select=id,convenio_id,procedimento_cod,desfecho&order=chegada_em.desc&limit=${limite}`);
  return listaLida(r);
}

/**
 * Abre a conta de um atendimento.
 *
 * O índice único parcial do banco (`at_contas_atend_unica`) é a última
 * linha de defesa: duas telas abrindo conta ao mesmo tempo para o mesmo
 * episódio fariam o atendimento ser transmitido duas vezes, e validação de
 * tela nenhuma impede isso.
 */
export async function abrirConta(sb, dados, user) {
  const corpo = camposDaConta(dados);
  if (!corpo.atendimento_id) return { ok: false, motivo: "Conta sem atendimento não é gravada." };
  const r = await sb("at_contas", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ ...corpo, usuario: user?.name || null, updated_at: new Date().toISOString() }),
  });
  if (!Array.isArray(r) || !r.length) {
    return { ok: false, motivo: "Nada foi gravado. Se este atendimento já tem conta aberta, o banco recusou a segunda — recarregue. Confirme também que a migração `migracao-atendimento-faturamento.sql` foi aplicada." };
  }
  return { ok: true, conta: r[0] };
}

export async function acrescentarItem(sb, dados, user) {
  const corpo = camposDoItem(dados);
  if (!corpo.conta_id) return { ok: false, motivo: "Item sem conta não é gravado." };
  const r = await sb("at_conta_itens", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      ...corpo,
      cobrar_do_paciente: dados.cobrar_do_paciente === true,
      usuario: user?.name || null, updated_at: new Date().toISOString(),
    }),
  });
  if (!Array.isArray(r) || !r.length) {
    return { ok: false, motivo: "Nada foi gravado. Se o item foi marcado para cobrança do paciente numa conta do SUS, o banco recusou — e recusou certo: atendimento SUS não pode ser cobrado do paciente." };
  }
  return { ok: true, item: r[0] };
}

/** Cancela um item — não apaga. A diferença entre a conta de ontem e a de hoje precisa ter explicação. */
export async function cancelarItem(sb, id, user) {
  if (!id) return { ok: false, motivo: "Item inválido." };
  const r = await sb(`at_conta_itens?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ cancelado: true, usuario: user?.name || null, updated_at: new Date().toISOString() }),
  });
  if (!Array.isArray(r) || !r.length) return { ok: false, motivo: "Nada foi alterado." };
  return { ok: true, item: r[0] };
}

/** Fecha a conta na competência. A validação é de `validarFechamento`. */
export async function fecharConta(sb, id, { via, competencia }, user) {
  return patchConta(sb, id, {
    status: "fechada", via: via || null, competencia: competencia || null,
    fechada_em: new Date().toISOString(), fechada_por: user?.name || null,
  }, user);
}

/**
 * Reabre uma conta fechada.
 *
 * `faturada` não reabre: a partir dela existe remessa transmitida, e mexer
 * no que já foi enviado faz a conta e o arquivo contarem histórias
 * diferentes. Correção depois disso é glosa, que é outro fluxo.
 */
export async function reabrirConta(sb, id, user) {
  return patchConta(sb, id, { status: "aberta", fechada_em: null, fechada_por: null }, user);
}

/**
 * Registra a transmissão de uma remessa: as contas viram `faturada`, e
 * junto com o estado vai QUEM transmitiu, QUANDO e sob qual protocolo.
 *
 * 🔴 A versão anterior (`marcarContaFaturada`) gravava só o status — e
 * nunca era chamada por ninguém. Se um dia fosse, teria perdido as três
 * coisas que alguém procura quando a glosa chega. `fecharConta` carimba
 * `fechada_em`/`fechada_por` desde sempre; a transmissão, que é o passo
 * SEM VOLTA, não carimbava nada.
 *
 * Em lote e numa ida só: a remessa é do mês inteiro, e trezentos PATCHes
 * em sequência é uma tela que trava no meio e deixa metade transmitida.
 *
 * A validação é de `validarTransmissao` — aqui só se grava.
 */
export async function registrarTransmissao(sb, ids, { protocolo, transmitidaEm }, user) {
  const lista = (Array.isArray(ids) ? ids : []).filter(v => v != null);
  if (!lista.length) return { ok: false, motivo: "Nenhuma conta para transmitir." };

  const r = await sb(`at_contas?id=in.(${lista.map(encodeURIComponent).join(",")})&status=eq.fechada`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      status: "faturada",
      faturada_em: transmitidaEm || null,
      faturada_por: user?.name || null,
      remessa_protocolo: (protocolo || "").trim() || null,
      usuario: user?.name || null,
      updated_at: new Date().toISOString(),
    }),
  });

  // O PostgREST devolve 2xx mesmo alterando ZERO linha — o RETORNO é a
  // única prova. E o `status=eq.fechada` no filtro é o que impede
  // reprocessar conta já faturada se a tela for clicada duas vezes.
  //
  // 🔴 DUAS CAUSAS DIFERENTES, E ELAS ESTAVAM NO MESMO BALDE.
  // `null` é a REQUISIÇÃO que falhou (coluna que a migração ainda não
  // criou, RLS negando, rede caída) — `sbFetch` já mandou o motivo exato
  // para o alerta vermelho do topo. `[]` é a requisição que FUNCIONOU e
  // não achou nenhuma conta ainda fechada.
  //
  // Juntar as duas fazia a mensagem afirmar uma causa que ela não sabe:
  // "confirme que seu perfil permite editar faturamento" manda a pessoa
  // pedir permissão à TI por causa de um SQL que ninguém rodou. Mesmo
  // `null ≠ 0` de sempre, num lugar novo.
  if (r === null) {
    return { ok: false, motivo: "A gravação não chegou ao banco. O aviso vermelho no topo da tela diz o motivo exato — costuma ser migração ainda não aplicada ou permissão de escrita no faturamento." };
  }
  if (!Array.isArray(r) || !r.length) {
    return { ok: false, motivo: "Nenhuma conta foi transmitida: nenhuma delas ainda estava fechada. Alguém pode ter mexido nelas enquanto esta tela estava aberta — recarregue e confira." };
  }
  if (r.length !== lista.length) {
    return { ok: true, contas: r, parcial: true,
             motivo: `${r.length} de ${lista.length} contas foram marcadas. As demais já não estavam fechadas — alguém pode ter mexido nelas enquanto esta tela estava aberta.` };
  }
  return { ok: true, contas: r };
}

async function patchConta(sb, id, campos, user) {
  if (!id) return { ok: false, motivo: "Conta inválida." };
  const r = await sb(`at_contas?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ ...campos, usuario: user?.name || null, updated_at: new Date().toISOString() }),
  });
  if (!Array.isArray(r) || !r.length) {
    return { ok: false, motivo: "Nada foi alterado — confirme que seu perfil permite editar faturamento." };
  }
  return { ok: true, conta: r[0] };
}

/** As contas de uma competência — a lista de trabalho do faturamento. */
export async function contasDaCompetencia(sb, competencia, { status, limite = 500 } = {}) {
  if (!competencia) return [];
  const extra = status ? `&status=eq.${encodeURIComponent(status)}` : "";
  const r = await sb(`at_contas?competencia=eq.${encodeURIComponent(competencia)}${extra}` +
    `&select=${CAMPOS_CONTA}&order=criado_em.desc&limit=${limite}`);
  return listaLida(r);
}

/**
 * TODAS as contas, sem recorte de competência — a série histórica do BI.
 *
 * ⚠️ NÃO É `contasDaCompetencia(sb, null)`. Aquela devolve `[]` quando não
 * vem competência, e devolve certo: quem pergunta "as contas de nenhuma
 * competência" não tem nenhuma. Mas para o painel de Análises esse `[]`
 * viraria "o hospital não faturou nada", que é outra coisa. Duas perguntas
 * diferentes, duas funções.
 */
export async function todasAsContas(sb, { limite = 1000 } = {}) {
  const r = await sb(`at_contas?select=${CAMPOS_CONTA}&order=competencia.desc,criado_em.desc&limit=${limite}`);
  return listaLida(r);
}

// ── RESPONSÁVEL DO EPISÓDIO ─────────────────────────────────

const CAMPOS_RESPONSAVEL = [
  "id", "atendimento_id", "prontuario", "nome", "cpf", "data_nascimento",
  "telefone", "vinculo", "papel", "documento_judicial", "consente",
  "recebe_alta", "observacao", "ativo", "usuario", "criado_em",
].join(",");

/** Os responsáveis de um atendimento. */
export async function carregarResponsaveis(sb, atendimentoId) {
  if (!atendimentoId) return [];
  const r = await sb(`at_responsaveis?atendimento_id=eq.${encodeURIComponent(atendimentoId)}` +
    `&select=${CAMPOS_RESPONSAVEL}&order=criado_em.desc`);
  return listaLida(r);
}

/**
 * Os responsáveis registrados nos episódios ANTERIORES deste paciente.
 *
 * Serve para a tela oferecer "copiar do episódio anterior" — a mãe da
 * criança é a mesma toda visita, e obrigar a redigitar é como se acaba
 * registrando "mãe" sem CPF às pressas. Copiar CRIA UMA LINHA NOVA no
 * episódio de hoje: consentimento é ato no tempo, e reaproveitar a linha
 * antiga faria o registro de hoje reescrever a história de ontem.
 */
export async function responsaveisAnteriores(sb, prontuario, { limite = 10 } = {}) {
  const p = normalizarProntuario(prontuario);
  if (!p) return [];
  const r = await sb(`at_responsaveis?prontuario=eq.${encodeURIComponent(p)}&ativo=is.true` +
    `&select=${CAMPOS_RESPONSAVEL}&order=criado_em.desc&limit=${limite}`);
  return listaLida(r);
}

/**
 * Grava um responsável.
 *
 * `camposDoResponsavel` deriva `consente` e `recebe_alta` do papel — a tela
 * não escolhe. O banco confere de novo, por CHECK: acompanhante com poder
 * de consentir é recusado lá também.
 */
export async function salvarResponsavel(sb, dados, user) {
  const corpo = camposDoResponsavel(dados);
  if (!corpo.nome) return { ok: false, motivo: "Responsável sem nome não é gravado." };
  const r = await sb("at_responsaveis", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ ...corpo, usuario: user?.name || null, updated_at: new Date().toISOString() }),
  });
  if (!Array.isArray(r) || !r.length) {
    return { ok: false, motivo: "Nada foi gravado. Confirme que a migração `migracao-atendimento-responsavel.sql` foi aplicada neste banco e que seu perfil permite editar atendimento." };
  }
  return { ok: true, responsavel: r[0] };
}

/**
 * Desliga um responsável — não apaga.
 *
 * A pessoa que consentiu em março consentiu, e apagar a linha faria o
 * consentimento daquele dia deixar de ter autor. `ativo = false` tira das
 * listas de hoje e preserva o que foi feito.
 */
export async function desativarResponsavel(sb, id, user) {
  if (!id) return { ok: false, motivo: "Registro inválido." };
  const r = await sb(`at_responsaveis?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ ativo: false, usuario: user?.name || null, updated_at: new Date().toISOString() }),
  });
  if (!Array.isArray(r) || !r.length) return { ok: false, motivo: "Nada foi alterado." };
  return { ok: true, responsavel: r[0] };
}

// ── PRODUÇÃO DO AMBULATÓRIO (tabela agregada `atendimentos`) ─

/** O que já está gravado na agregada para um dia. */
export async function carregarProducaoGravada(sb, data) {
  const dia = String(data ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return [];
  const r = await sb(`atendimentos?data=eq.${dia}&select=*`);
  return listaLida(r);
}

/**
 * Grava a produção apurada de uma especialidade num dia.
 *
 * `on_conflict=data,especialidade` é o mesmo upsert que o formulário manual
 * do Ambulatório usa — de propósito. Duas rotas gravando a MESMA linha é o
 * que faz a conciliação valer alguma coisa; se esta escrevesse noutro
 * lugar, o painel continuaria lendo o número digitado e nada teria mudado.
 *
 * O upsert substitui a linha inteira, então `camposDaProducao` carrega
 * `emergencias` do que já estava lá. Sem isso, conciliar a agenda zeraria o
 * número que alguém digitou olhando o Pronto-Socorro.
 *
 * `atendimentos` NÃO tem `updated_at` (só `created_at`). Mandar o campo
 * faria o PostgREST recusar a linha inteira — em silêncio, como sempre.
 */
export async function gravarProducao(sb, { data, especialidadeId, apurada, gravadaAnterior }, user) {
  if (!especialidadeId) return { ok: false, motivo: "Especialidade sem correspondência no painel do Ambulatório." };
  const corpo = camposDaProducao({ data, especialidadeId, apurada, gravadaAnterior });
  const r = await sb("atendimentos?on_conflict=data,especialidade", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ ...corpo, usuario: user?.name || null }),
  });
  if (!Array.isArray(r) || !r.length) {
    return { ok: false, motivo: "Nada foi gravado — confirme que seu perfil permite lançar produção do ambulatório." };
  }
  return { ok: true, linha: r[0] };
}

// ── MANUTENÇÃO DOS CATÁLOGOS ────────────────────────────────

/**
 * Grava uma linha de catálogo (cria ou atualiza).
 *
 * Um `upsert` só, para os três tipos de tabela, porque `corpoDoCatalogo`
 * já devolve exatamente as colunas de destino. Montar o corpo aqui, tabela
 * por tabela, era o caminho para a chave inexistente que o PostgREST
 * recusa em silêncio.
 */
export async function salvarCatalogo(sb, chave, dados, user) {
  const cat = CATALOGO_POR_CHAVE[chave];
  if (!cat) return { ok: false, motivo: "Catálogo desconhecido." };

  const corpo = {
    ...corpoDoCatalogo(chave, dados),
    usuario: user?.name || null,
    updated_at: new Date().toISOString(),
  };

  const r = await sb(cat.tabela, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(corpo),
  });
  if (!Array.isArray(r) || !r.length) {
    return { ok: false, motivo: "Nada foi gravado. Confirme que a migração `migracao-atendimento-fase2.sql` foi aplicada e que seu perfil permite editar as tabelas." };
  }
  return { ok: true, linha: r[0] };
}

/**
 * Liga ou desliga uma linha do catálogo.
 *
 * NÃO existe apagar. Convênio, plano e procedimento aparecem em
 * atendimentos já gravados; remover a linha faria um relatório de meses
 * atrás mostrar código sem nome. `ativo = false` some das listas novas e
 * preserva o que já foi registrado.
 */
export async function alternarAtivoCatalogo(sb, chave, id, ativo, user) {
  const cat = CATALOGO_POR_CHAVE[chave];
  if (!cat || !id) return { ok: false, motivo: "Registro inválido." };
  const r = await sb(`${cat.tabela}?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ ativo: !!ativo, usuario: user?.name || null, updated_at: new Date().toISOString() }),
  });
  if (!Array.isArray(r) || !r.length) {
    return { ok: false, motivo: "Nada foi alterado — confirme que seu perfil permite editar as tabelas." };
  }
  return { ok: true, linha: r[0] };
}

/**
 * Lê um catálogo inteiro, INCLUINDO os inativos.
 *
 * `carregarCatalogos` (usado pela ficha) traz só os ativos, porque a
 * recepção não pode escolher convênio desligado. A tela de manutenção
 * precisa do contrário: mostrar o que está desligado é a única forma de
 * alguém religar.
 */
export async function carregarCatalogoCompleto(sb, chave) {
  const cat = CATALOGO_POR_CHAVE[chave];
  if (!cat) return [];
  const filtro = cat.dominio ? `dominio=eq.${encodeURIComponent(cat.dominio)}&` : "";
  const r = await sb(`${cat.tabela}?${filtro}select=*&order=nome`);
  return listaLida(r);
}

/**
 * A lista de trabalho da recepção: quem entrou sem identificação e
 * continua assim.
 *
 * Existe porque pendência que não aparece em lugar nenhum não é pendência,
 * é esquecimento. Sem esta tela, o paciente não identificado seria
 * lembrado só na hora de faturar — semanas depois, quando ninguém mais
 * lembra quem era.
 */
export async function listarAguardandoIdentificacao(sb, { limite = 100 } = {}) {
  const r = await sb(`pacientes?nao_identificado=is.true&identificado_em=is.null&select=${CAMPOS_BUSCA},observacao,criado_em&order=criado_em.desc&limit=${limite}`);
  return listaLida(r);
}

/**
 * Marca a identificação como concluída.
 *
 * Só o carimbo: quem preenche nome, documento e endereço é o
 * `CadastroPaciente`, que já existe e já valida. Aqui só se registra que a
 * pendência foi fechada, e quando.
 */
export async function concluirIdentificacao(sb, prontuario, user) {
  const p = normalizarProntuario(prontuario);
  if (!p) return { ok: false, motivo: "Sem prontuário." };
  const r = await sb(`pacientes?prontuario=eq.${encodeURIComponent(p)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      nao_identificado: false,
      identificado_em: new Date().toISOString(),
      usuario: user?.name || null,
      updated_at: new Date().toISOString(),
    }),
  });
  if (!Array.isArray(r) || !r.length) {
    return { ok: false, motivo: "Nada foi gravado — confirme que seu perfil permite editar cadastro." };
  }
  return { ok: true, paciente: r[0] };
}

// ── UNIFICAÇÃO DE PRONTUÁRIO ────────────────────────────────

/**
 * As fichas que foram unificadas NESTE prontuário.
 *
 * 🔴 É a metade que faz o ponteiro ter duas mãos. Sem ela, quem abre o
 * prontuário que sobreviveu não fica sabendo que existe histórico embaixo
 * de outro número — que é o problema inteiro que a unificação resolve.
 */
export async function fichasUnificadasEm(sb, prontuario) {
  const p = normalizarProntuario(prontuario);
  if (!p) return [];
  const r = await sb(`pacientes?unificado_para=eq.${encodeURIComponent(p)}` +
    `&select=prontuario,nome_completo,iniciais,data_nascimento,unificado_em,unificado_por,unificacao_motivo` +
    `&order=unificado_em.desc&limit=20`);
  return listaLida(r);
}

/**
 * Liga a ficha `origem` na ficha `destino`.
 *
 * A validação é de `podeUnificar` — aqui só se grava. O dado clínico NÃO
 * se move: ver o cabeçalho de `unificacao.js` para o porquê.
 *
 * O filtro `unificado_para=is.null` é o que impede unificar duas vezes
 * quando a tela é clicada em duplicidade — e, com ele, um clique repetido
 * devolve zero linha em vez de reescrever o ponteiro por cima.
 */
export async function unificarProntuario(sb, { origem, destino, motivo }, user) {
  const a = normalizarProntuario(origem);
  const b = normalizarProntuario(destino);
  if (!a || !b) return { ok: false, motivo: "Sem prontuário de origem ou de destino." };
  if (a === b) return { ok: false, motivo: "São o mesmo prontuário." };

  const r = await sb(`pacientes?prontuario=eq.${encodeURIComponent(a)}&unificado_para=is.null`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      unificado_para: b,
      unificado_em: new Date().toISOString(),
      unificado_por: user?.name || null,
      unificacao_motivo: String(motivo ?? "").trim() || null,
      usuario: user?.name || null,
      updated_at: new Date().toISOString(),
    }),
  });

  // `null` = a requisição FALHOU (o trigger de cadeia recusou, coluna que a
  // migração ainda não criou, RLS). `sbFetch` já mandou o motivo exato para
  // o alerta do topo. `[]` = funcionou e não achou ficha por unificar.
  // Juntar as duas faria a mensagem afirmar uma causa que ela não sabe.
  if (r === null) {
    return { ok: false, motivo: "A gravação não chegou ao banco. O aviso vermelho no topo da tela diz o motivo exato — o banco recusa cadeia de unificação, e é a recusa mais provável aqui." };
  }
  if (!Array.isArray(r) || !r.length) {
    return { ok: false, motivo: `O prontuário ${a} já havia sido unificado. Recarregue para ver para onde ele aponta.` };
  }
  return { ok: true, paciente: r[0] };
}

// ── GLOSA RECEBIDA ──────────────────────────────────────────
//
// A regra de negócio (prazo, fila, taxa de recuperação) mora em
// `glosas.js`; aqui só entra e sai do banco.
//
// 🔴 A ESCRITA CONFERE O RETORNO, não o status. Os CHECK de `at_glosas`
// recusam valor recuperado maior que o glosado e prazo anterior ao
// recebimento — e o PostgREST devolve 2xx alterando ZERO linha quando o RLS
// barra. Sem `return=representation`, "recusado pelo banco" chegaria na
// tela como "gravado com sucesso".

const CAMPOS_GLOSA = [
  "id", "conta_id", "item_id", "prontuario", "competencia",
  "valor_glosado", "motivo_codigo", "motivo",
  "recebida_em", "prazo_recurso_em",
  "situacao", "recurso_enviado_em", "recurso_protocolo",
  "valor_recuperado", "encerrada_em",
  "observacao", "usuario", "criado_em",
].join(",");

/**
 * As glosas de uma competência (ou todas, quando não vier competência).
 * Ordenadas por prazo — a fila de trabalho é montada em `glosas.js`, mas
 * vir já quase na ordem certa poupa a tela de reordenar tudo.
 */
export async function carregarGlosas(sb, { competencia, limite = 500 } = {}) {
  const filtro = competencia ? `competencia=eq.${encodeURIComponent(competencia)}&` : "";
  const r = await sb(`at_glosas?${filtro}select=${CAMPOS_GLOSA}` +
    `&order=prazo_recurso_em.asc.nullsfirst&limit=${limite}`);
  return listaLida(r);
}

/** As glosas de uma conta — para abrir dentro do episódio. */
export async function glosasDaConta(sb, contaId) {
  if (!contaId) return [];
  const r = await sb(`at_glosas?conta_id=eq.${encodeURIComponent(contaId)}` +
    `&select=${CAMPOS_GLOSA}&order=recebida_em.desc`);
  return listaLida(r);
}

const soCampos = g => ({
  conta_id: g.conta_id, item_id: g.item_id || null, prontuario: g.prontuario || null,
  competencia: g.competencia || null,
  valor_glosado: g.valor_glosado,
  motivo_codigo: g.motivo_codigo || null, motivo: g.motivo || null,
  recebida_em: g.recebida_em, prazo_recurso_em: g.prazo_recurso_em || null,
  situacao: g.situacao || "recebida",
  recurso_enviado_em: g.recurso_enviado_em || null,
  recurso_protocolo: g.recurso_protocolo || null,
  // ⚠️ "" vira null, e não 0: campo em branco é "o recurso não terminou",
  // zero é "recorremos e não voltou nada". Colapsar os dois estragaria a
  // taxa de recuperação, que é o número que julga o setor.
  valor_recuperado: g.valor_recuperado === "" || g.valor_recuperado == null ? null : Number(g.valor_recuperado),
  encerrada_em: g.encerrada_em || null,
  observacao: g.observacao || null,
});

/** Grava a glosa (nova ou existente). Devolve `{ ok, glosa?, motivo? }`. */
export async function salvarGlosa(sb, glosa, user) {
  if (!sb) return { ok: false, motivo: "Sem conexão com o banco." };
  const corpo = { ...soCampos(glosa), usuario: user?.name || null, updated_at: new Date().toISOString() };

  const r = glosa.id
    ? await sb(`at_glosas?id=eq.${encodeURIComponent(glosa.id)}`, {
        method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(corpo),
      }).catch(() => null)
    : await sb("at_glosas", {
        method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(corpo),
      }).catch(() => null);

  if (!Array.isArray(r) || !r.length) {
    return {
      ok: false,
      motivo: "Nada foi gravado. O banco recusa valor recuperado maior que o glosado, valor zero ou negativo, e prazo anterior ao recebimento — confira esses três antes de tentar de novo.",
    };
  }
  return { ok: true, glosa: r[0] };
}

/**
 * Os itens de VÁRIAS contas de uma vez, agrupados por conta.
 *
 * As Análises precisam do valor de todas as contas da competência. Uma
 * chamada por conta faria 200 idas ao banco para desenhar um cartão.
 *
 * ⚠️ Devolve `{ porConta, falhou }` em vez de só o mapa. Um mapa vazio
 * seria indistinguível de "nenhuma conta tem item" — e faturamento zero é
 * exatamente o número que não pode nascer de uma falha de leitura.
 */
export async function itensDasContas(sb, ids) {
  const lista = (Array.isArray(ids) ? ids : []).filter(v => v != null);
  if (!lista.length) return { porConta: {}, falhou: false };

  const r = await sb(`at_conta_itens?conta_id=in.(${lista.join(",")})` +
    `&select=${CAMPOS_ITEM}&order=criado_em`);
  const linhas = listaLida(r);
  if (naoDeuParaLer(linhas)) return { porConta: {}, falhou: true };

  const porConta = {};
  for (const i of linhas) (porConta[i.conta_id] ||= []).push(i);
  return { porConta, falhou: false };
}

// ── REPASSE (o dinheiro que ENTROU) ─────────────────────────
//
// As regras (conciliação, estados, agrupamentos) moram em `receitas.js`;
// aqui só entra e sai do banco.
//
// ⚠️ O único CHECK é `valor <> 0`. Negativo PASSA de propósito: é estorno,
// e o SUS faz desconto retroativo em competência posterior.

const CAMPOS_REPASSE = [
  "id", "conta_id", "competencia_repasse", "valor", "recebido_em",
  "documento", "observacao", "usuario", "criado_em",
].join(",");

/** Todos os repasses (ou os de uma competência de CRÉDITO). */
export async function carregarRepasses(sb, { competenciaRepasse, limite = 1000 } = {}) {
  const filtro = competenciaRepasse
    ? `competencia_repasse=eq.${encodeURIComponent(competenciaRepasse)}&` : "";
  const r = await sb(`at_repasses?${filtro}select=${CAMPOS_REPASSE}&order=recebido_em.desc&limit=${limite}`);
  return listaLida(r);
}

/**
 * Os repasses de VÁRIAS contas, agrupados por conta.
 *
 * ⚠️ Devolve `{ porConta, falhou }` pelo mesmo motivo de `itensDasContas`:
 * mapa vazio seria indistinguível de "nenhuma conta recebeu nada" — e
 * "não recebemos nada" é a acusação mais grave que esta tela pode fazer.
 */
export async function repassesDasContas(sb, ids) {
  const lista = (Array.isArray(ids) ? ids : []).filter(v => v != null);
  if (!lista.length) return { porConta: {}, falhou: false };

  const r = await sb(`at_repasses?conta_id=in.(${lista.join(",")})` +
    `&select=${CAMPOS_REPASSE}&order=recebido_em`);
  const linhas = listaLida(r);
  if (naoDeuParaLer(linhas)) return { porConta: {}, falhou: true };

  const porConta = {};
  for (const x of linhas) (porConta[x.conta_id] ||= []).push(x);
  return { porConta, falhou: false };
}

/** As glosas de VÁRIAS contas, agrupadas por conta. Mesmo contrato. */
export async function glosasDasContas(sb, ids) {
  const lista = (Array.isArray(ids) ? ids : []).filter(v => v != null);
  if (!lista.length) return { porConta: {}, falhou: false };

  const r = await sb(`at_glosas?conta_id=in.(${lista.join(",")})` +
    `&select=${CAMPOS_GLOSA}&order=recebida_em`);
  const linhas = listaLida(r);
  if (naoDeuParaLer(linhas)) return { porConta: {}, falhou: true };

  const porConta = {};
  for (const x of linhas) (porConta[x.conta_id] ||= []).push(x);
  return { porConta, falhou: false };
}

/** Grava um repasse (novo ou existente). Devolve `{ ok, repasse?, motivo? }`. */
export async function salvarRepasse(sb, rep, user) {
  if (!sb) return { ok: false, motivo: "Sem conexão com o banco." };
  const corpo = {
    conta_id: rep.conta_id,
    competencia_repasse: rep.competencia_repasse || null,
    valor: Number(String(rep.valor).replace(/\./g, "").replace(",", ".")),
    recebido_em: rep.recebido_em,
    documento: rep.documento || null,
    observacao: rep.observacao || null,
    usuario: user?.name || null,
    updated_at: new Date().toISOString(),
  };

  const r = rep.id
    ? await sb(`at_repasses?id=eq.${encodeURIComponent(rep.id)}`, {
        method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(corpo),
      }).catch(() => null)
    : await sb("at_repasses", {
        method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(corpo),
      }).catch(() => null);

  if (!Array.isArray(r) || !r.length) {
    return { ok: false, motivo: "Nada foi gravado. O banco recusa repasse de valor ZERO (negativo é permitido — é estorno) e exige a conta e a data do crédito." };
  }
  return { ok: true, repasse: r[0] };
}
