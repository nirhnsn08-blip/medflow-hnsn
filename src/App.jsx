import { useState, useEffect, useCallback, useRef, Fragment, Component } from "react";
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine, Legend, ComposedChart, Area
} from "recharts";

// Motor de alertas da farmácia clínica — dose máxima, interação, alergia,
// Beers, sonda, ajuste renal/hepático. Vive fora do App.jsx por ser o código
// mais crítico do sistema: lá ele é testável (src/clinico/alertas.test.js).
import {
  FARM_GRAV, FARM_CROSS, FARM_SCORE_COR,
  farmFmtQtd, normTxt, parseAlergias, checarAlergia,
  analisarPrescricaoClinica, scoreItemClinico, scorePrescricao,
} from "./clinico/alertas.js";
import { sugerirGerme, camposDoGerme } from "./clinico/germes.js";
import { ISOLAMENTOS, precaucaoDe } from "./clinico/isolamento.js";
// Alergia como atributo do paciente (fonte única pep_alergias, com o campo
// legado do atendimento fundido durante a transição).
import { situacaoAlergica, textoAlergiasParaAlerta } from "./clinico/alergias.js";
// Prontuário do paciente internado — em arquivo próprio para o módulo
// evoluir sem disputar espaço neste arquivo, que já tem 14 mil linhas.
import ProntuarioInternado from "./prontuario/ProntuarioInternado.jsx";
// 🔴 A LIGAÇÃO QUE FALTAVA: ocupar o leito não abria o prontuário da
// internação, e sem episódio TUDO que se registra sobre o internado ficava
// vazio por construção. Ver prontuario/internacao.js.
import { abrirEpisodio, encerrarEpisodio } from "./prontuario/dados.js";
import { podeAbrirEpisodio, dadosDoEpisodio, desfechoDoLeito, avisoEpisodioNaoAberto } from "./prontuario/internacao.js";
// 🔴 pep_alergias era lida em 4 lugares — inclusive na pulseira — e escrita
// em nenhum. A tela MANDAVA registrar e não oferecia caminho.
import { registrarAlergia } from "./prontuario/dados.js";
import { validarAlergia, dadosDaAlergia, recadoDepoisDeGravar,
         TIPOS as TIPOS_ALERGIA, GRAVIDADES as GRAVIDADES_ALERGIA } from "./clinico/registro-alergia.js";
// Categorias profissionais — usadas na tela que classifica a equipe.
import { CATEGORIAS as CATEGORIAS_CLINICAS } from "./clinico/papeis.js";
import { permissoesEfetivas, podeVer, resumoDeAcesso, excecoesAplicadas,
         modulosExcecionaveis, validarExcecao, rotuloNivel, NIVEIS_EXCECAO } from "./acesso/permissoes.js";
import { GRUPOS } from "./acesso/modulos.js";
import { VX, HOSPITAL_NOME, HOSPITAL_SIGLA, MONTHS_FULL, MONTHS, Icon,
         btnContorno, VxWordmark, customTooltip, campoTexto, rotuloCampo } from "./ui/base.jsx";
import PerfisAcesso from "./acesso/PerfisAcesso.jsx";
import UsersPage from "./acesso/Usuarios.jsx";
import BlocoPage from "./bloco/BlocoPage.jsx";
import ScihPage from "./scih/ScihPage.jsx";
import PacientePage from "./pacientes/Paciente360.jsx";
import ProtocolosPage from "./protocolos/ProtocolosPage.jsx";
import { K, loadDB, saveDB, loadFromSupabase, saveRecord } from "./painel/dados.js";
import { aggregateMes, aggregateAno, comparativo, calcAlertas, ocupacaoSetor } from "./painel/agregados.js";
import { RingGauge, StatCard, DeltaBadge, SemaforoMeta } from "./painel/widgets.jsx";
import { ROLES } from "./acesso/papeis-sistema.js";
import { validarCbo, formatarCbo, cbosDoCatalogo } from "./acesso/cbo.js";
import ChecklistImplantacao from "./implantacao/ChecklistImplantacao.jsx";
import {
  SUP_LEAD_PADRAO, SUP_MARGEM_SEG, supPrazoReposicao, supSaldoTotal,
  supLeadTimeMap, custoMedioPonderado, supPedidoTotal,
} from "./suprimentos/kardex.js";
import ConciliacaoKardex from "./suprimentos/ConciliacaoKardex.jsx";
import SuprimentosPage, { SupInventarioView, SupContagemModal } from "./suprimentos/SuprimentosPage.jsx";
import {
  loadSupItens, loadSupLotes, loadSupMovimentos, loadSupMovimentosPeriodo, loadSupSaidasDesde,
  upsertSupItemRemote, deleteSupItemRemote, addSupMovimentoRemote, loadSupFornecedores, upsertSupFornecedorRemote,
  deleteSupFornecedorRemote, loadSupEntradasComForn, loadSupInventarios, addSupInventarioRemote,
  setSupItemCustoRemote, loadSupRequisicoes, addSupRequisicaoRemote, atualizarSupReqRemote,
  loadSupPedidos, addSupPedidoRemote, atualizarSupPedidoRemote, loadSupCotacoes, addSupCotacaoRemote,
  atualizarSupCotacaoRemote,
} from "./suprimentos/dados.js";
import {
  SUP_CATEGORIAS, SUP_UNIDADES, SUP_MOTIVOS_SAIDA, SUP_FARMACOS_MONITORADOS, SUP_PED_STATUS,
  SUP_REQ_STATUS, SUP_EXEC_COBERTURA_ALVO, SUP_INV_INTERVALO,
} from "./suprimentos/catalogo.js";
import { custoUnit } from "./farmacia/estoque.js";
import { casarComCatalogo, ehSetorNovo } from "./suprimentos/setores.js";
// A prescrição só fica "pronta para retirada" se saiu do estoque — ver o
// cabeçalho de preparo.js para o caminho que era válido e não deixava rastro.
import { podeMarcarPronto, dispensadoDoItem } from "./farmacia/preparo.js";
import { abasVisiveis, podeAbrirAba } from "./farmacia/abas.js";
import { FARM_FORMAS, FARM_UNIDADES, FARM_CLASSES, FARM_MOTIVOS_SAIDA, FARM_ALERTA_TIPOS,
         FARM_PREV_JANELA, FARM_PREV_HORIZONTE } from "./farmacia/catalogo.js";
import { somLigado, ligarSom, avisoSonoro } from "./ui/som.js";
import {
  loadFarmMedicamentos, loadFarmLotes, loadFarmMovimentos, loadFarmMovimentosPeriodo, loadFarmSaidasDesde,
  upsertFarmMedicamentoRemote, deleteFarmMedicamentoRemote, addFarmMovimentoRemote, loadFarmInteracoes,
  loadFarmIncompatY, upsertFarmInteracaoRemote, deleteFarmInteracaoRemote, upsertFarmIncompatRemote,
  deleteFarmIncompatRemote, loadFarmPreparo, receberPreparoRemote, atualizarPreparoRemote,
  loadFarmMovimentosByMeds, loadFarmNaoPadronizados, addFarmNaoPadronizadoRemote, updateFarmNaoPadronizadoRemote,
  deleteFarmNaoPadronizadoRemote, loadFarmIntervencoes, addFarmIntervencaoRemote, updateFarmIntervencaoRemote,
  deleteFarmIntervencaoRemote, loadFarmInventarios, addFarmInventarioRemote, loadFarmSaidasByAtendimentos,
  loadFarmSaidasByAtendimento,
} from "./farmacia/dados.js";
import { comGrupos } from "./ui/sub-nav.js";
// Lote vencido não vai para paciente — mas SAI por descarte, senão fica
// preso na prateleira. Ver o cabeçalho de validade.js.
import { podeSair, lotesParaEscolha, situacaoDoLote, infoDeValidade, DIAS_VENCENDO } from "./farmacia/validade.js";
import { saldoDoMedicamento } from "./farmacia/estoque.js";
import { podeAprovarPedido, descreverAlcada, validarLimite } from "./suprimentos/aprovacao.js";
import { carregarAlcada, salvarAlcada } from "./suprimentos/parametros.js";
import TrilhaAuditoria from "./auditoria/Trilha.jsx";
import { registrarAuditoria } from "./auditoria/dados.js";
import {
  MOTIVO_AJUSTE, documentoDaContagem, planejarAjuste, descreverPlano,
  podeEstornar, movimentoDeEstorno, idsJaEstornados,
} from "./suprimentos/inventario.js";
import {
  temConversao, comprarParaConsumo, custoPorUnidadeConsumo,
  custoPorUnidadeCompra, consumoParaCompra, rotuloCompra, descreverEntrada, validarConversao,
} from "./suprimentos/conversao.js";
// Renovação da sessão (crachá JWT) — decisão pura testável; a rede fica aqui.
import { precisaRenovar, deveTentarRenovar, exigeCracha } from "./acesso/sessao.js";
// Triagem pediátrica — sugestão de Manchester por faixa de idade (Fase 3).
import { avaliarSinaisVitaisPediatrico, faixasValidadas } from "./clinico/pediatria.js";
// Triagem obstétrica — sugestão por discriminadores + PA (pré-eclâmpsia).
import { avaliarObstetrica, obstetricasValidadas } from "./clinico/obstetricia.js";
// Mapa de risco de enfermagem por leito (Tier 1 Fase 1a).
import { montarMapaRisco } from "./clinico/mapa-risco.js";
import { montarChecagemSae } from "./clinico/sae.js";
import FarmaciaPage from "./farmacia/FarmaciaPage.jsx";
import PSPage from "./ps/PsPage.jsx";
import {
  PS_FREQUENCIAS, PS_DOSE_UNID, PS_PROTOCOLO, PS_DISCRIMINADORES, PS_AREAS, PS_SALA_STATUS, PS_DESFECHOS,
  PS_EXAME_CATEGORIAS, PS_EVOL_CATEGORIAS, PS_VIAS, PS_ADM_STATUS, PS_ADM_MOTIVOS, PS_ADM_CATEGORIAS,
  PS_PRIORIDADE, PS_CONSCIENCIA, MANCHESTER, fmtSinaisVitais,
} from "./ps/catalogo.js";
import {
  loadPsPrescricoesByAtendimentos, loadPsProtocolos, upsertPsProtocoloRemote, deletePsProtocoloRemote,
  loadPsSalas, upsertPsSalaRemote, deletePsSalaRemote, loadPsAtendimentos, loadPsFinalizadosHoje,
  loadPsAtendimentosPeriodo, loadPsExamesPeriodo, addPsAtendimentoRemote, updatePsAtendimentoRemote,
  patchPsAtendimentoDireto, addPsSinalRemote, loadPsSinais, loadPsRegistros, loadPsExamesPendentes,
  addPsRegistroRemote, updatePsRegistroRemote, loadPsPrescricaoItens, loadPsPrescricaoItensByAtendimentos,
  addPsPrescricaoItens, loadPsAdministracoes, loadPsAdministracoesByAtendimentos, addPsAdministracao,
} from "./ps/dados.js";
import LeitosPage from "./leitos/GiroDeLeitos.jsx";
import { LEITOS_KEY, loadLeitos, saveLeitos, loadLeitosFromSupabase, upsertLeitoRemote, deleteLeitoRemote,
         SETORES_KEY, loadSetoresLocal, saveSetoresLocal, loadSetoresFromSupabase, upsertSetorRemote, deleteSetorRemote,
         loadSolicitacoes, addSolicitacaoRemote, updateSolicitacaoRemote,
         registrarSaidaRemote, loadSaidas, registrarTurnoverRemote, loadTurnover } from "./leitos/dados.js";
import NSPPage, { NotificacaoRapida } from "./clinico/SegurancaPaciente.jsx";
import { CLASSES as NSP_CLASSES, GRAUS_DANO as NSP_GRAUS, TIPOS as NSP_TIPOS, STATUS as NSP_STATUS,
         matrizRisco, exigeRCA, notificacaoCompulsoria, resumoIncidentes,
         indicadoresSeguranca, farol, metasSeguranca, relatorioNsp, fichaNotivisa,
         METAS as NSP_METAS, STATUS_PROTOCOLO, protocoloRevisaoVencida, resumoProtocolos,
         STATUS_CAPACITACAO, capacitacaoVencida, resumoCapacitacoes,
         TIPO_COMUNICADO, PRIORIDADE_COMUNICADO, resumoComunicados,
         responderAssistenteNsp, NSP_ASSIST_AJUDA,
         ISHIKAWA_CATEGORIAS, FATORES_CONTRIBUINTES, METODOS_RCA, STATUS_ACAO,
         acaoAtrasada, resumoAcoes, incidentesAguardandoRca,
         rotuloTipo, rotuloClasse, rotuloGrau, rotuloStatus } from "./clinico/nsp.js";
// Protocolos clínicos gerenciados (Tier 1 Fase 3a) — gatilho/bundle/relógio/KPIs puros.
import { avaliarGatilhoSepse, avaliarGatilhoDorToracica, avaliarGatilhoAvc, janelaTerapeutica, escorePadua, recomendacaoTev, montarBundle, estadoAtivacao, indicadoresProtocolo } from "./clinico/protocolos.js";
import { PROTOCOLOS_CATALOGO, PROT_DESFECHO } from "./clinico/protocolos-catalogo.js";
// Utilitários puros extraídos deste arquivo — data/hora e número/moeda.
// São as funções mais reutilizadas do sistema (nowISO, fmtDur, fmtReais,
// diffMin); ficam testadas em src/util/*.test.js. `todayStr` mora aqui
// porque é onde o projeto já teve o bug de fuso mais caro.
import {
  todayStr, nowISO, diffMin, fmtDur, horaFmt, isoToLocal, localToIso,
  fmtDataBR, compDe, compLabel, horaMin,
} from "./util/datas.js";
import { fmt, fmtBRL, fmtReais, taxa } from "./util/formato.js";
// Previsão de alta e sinaleira de permanência do Giro de Leitos (puras).
import { sugerirCid, calcAlta, sinalLeito, diasDesde, corEsperaFila } from "./clinico/leitos.js";
import { resumoExamesPorCategoria } from "./clinico/exames.js";
import { COMORBIDADES, rotulosComorbidades } from "./clinico/comorbidades.js";
// Identificação do paciente: conteúdo mínimo da CFM 1.638/2002, validação
// de CPF/CNS e idade EXATA. A idade por subtração de anos errava até 11
// meses — o que trocava a faixa de referência na triagem pediátrica.
import { conferirCadastro, idadeMesesParaTriagem, comoExibir, rotuloSexo } from "./pacientes/identidade.js";
import CadastroPaciente from "./pacientes/CadastroPaciente.jsx";
import Atendimento from "./atendimento/Atendimento.jsx";
import FaturamentoPage from "./atendimento/FaturamentoSus.jsx";
import { ESPECIALIDADES } from "./ambulatorio/especialidades.js";
import { PS_VIAS_TRANSF, PS_ORIGENS, PS_ORIGEM_UNIDADES, psPedeDetalhe } from "./atendimento/recepcao.js";
import { carregarPaciente, carregarCatalogos } from "./atendimento/dados.js";
import { avisoDeConta, dadosDeConta, geraConta, convenioSugerido, valoresIniciais } from "./atendimento/faturavel.js";
import { opcoesDeProcedimento, filtrarProcedimentos, avisoDeCatalogo, viaDaEscolha } from "./atendimento/escolha-procedimento.js";
// "Atendimento aberto" mora em ciclo.js. Antes o conceito estava repetido
// como `status !== "finalizado"` em três pontos daqui — e o status
// 'cancelado', criado depois, vazaria por todos eles: o Paciente 360
// passaria a dizer "está no PS agora (cancelado)".
import { atendimentoAberto, FILTRO_ATENDIMENTO_ABERTO } from "./atendimento/ciclo.js";

// ═══════════════════════════════════════════════════════════
// SUPABASE CONFIG — substitua pelas suas credenciais
// ═══════════════════════════════════════════════════════════
const SUPABASE_URL = typeof window !== "undefined" ? (import.meta.env?.VITE_SUPABASE_URL || window.SUPABASE_URL || "") : "";
const SUPABASE_KEY = typeof window !== "undefined" ? (import.meta.env?.VITE_SUPABASE_KEY || window.SUPABASE_KEY || "") : "";
const USE_SUPABASE = SUPABASE_URL.length > 10 && SUPABASE_KEY.length > 10;

// O que os módulos extraídos recebem no lugar da dupla `sbFetch` +
// `USE_SUPABASE`: a função de rede quando o Supabase está ligado, `null`
// quando não. Assim o módulo pergunta `if (!sb)` e não importa flag global
// nenhuma — o `sbFetch` fica aqui com a máquina de sessão que ele usa.
const SB = () => (USE_SUPABASE ? sbFetch : null);

/**
 * O poste CRU: grava e devolve `{ ok, erro }` em vez de engolir a falha.
 *
 * 🔴 Existe por causa das QUATRO escritas que precisam do motivo: o
 * movimento de estoque da Farmácia, o desfecho do Pronto-Socorro, e no
 * Almoxarifado o movimento de estoque e a exclusão de item.
 * O `sbFetch` devolve `null` em qualquer erro e manda o detalhe para o
 * aviso global — o que serve para as outras 130 chamadas, que não têm o que
 * fazer com a mensagem. Não serve para dispensar medicamento: a recusa vem
 * de um GATILHO do banco ("saldo insuficiente", "lote vencido") e quem está
 * na bancada precisa LER o motivo.
 *
 * Fica aqui, e não no módulo da Farmácia, porque é aqui que moram a URL, a
 * chave e o token. O módulo recebe esta função e não sabe o que é credencial.
 *
 * ⚠️ Não passa pela renovação de sessão do `sbFetch`: token vencido aqui
 * falha em vez de renovar. Era assim antes da extração — está anotado para
 * não parecer decisão nova.
 */
async function escreverCru(caminho, corpo, { method = "POST" } = {}) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${caminho}`, {
      method,
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${AUTH_TOKEN || SUPABASE_KEY}`,
        "Content-Type": "application/json",
        "Prefer": "return=representation",
      },
      // DELETE não leva corpo; mandar `undefined` faria o fetch enviar a
      // string "undefined" e o PostgREST recusar por JSON inválido.
      ...(corpo == null ? {} : { body: JSON.stringify(corpo) }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      return { ok: false, erro: body?.message || `Erro ${res.status}` };
    }
    // `row` para quem precisa da linha gravada (o PATCH direto do PS usa);
    // quem só quer saber se deu certo ignora e continua lendo `ok`.
    const rows = await res.json().catch(() => null);
    return { ok: true, row: Array.isArray(rows) ? rows[0] : null };
  } catch (e) {
    return { ok: false, erro: String(e?.message || e) };
  }
}
const SB_CRU = () => (USE_SUPABASE ? escreverCru : null);

// Identidade do hospital — permite usar o MESMO app para vários hospitais,
// cada um com seu próprio banco (VITE_SUPABASE_*) e seu nome (VITE_HOSPITAL_*).
// Rótulo do ambiente. VAZIO = produção (nenhum aviso na tela, para não
// poluir o sistema de quem trabalha no hospital). Preenchido = mostra a
// faixa de alerta no topo.
//
// Existe porque a origem do erro mais caro daqui é sempre a mesma: duas
// telas idênticas, bancos diferentes, e nada avisando qual é qual. Já
// mandou dado de teste para a produção uma vez.
const AMBIENTE = import.meta.env?.VITE_AMBIENTE || "";
// Referência do projeto Supabase (o "ufxqdv..." da URL). Mostrada na faixa
// para não depender só do rótulo: se o .env estiver errado, o número exposto
// denuncia na hora em qual banco você realmente está.
const SUPABASE_REF = (SUPABASE_URL.match(/https:\/\/([a-z0-9]+)\.supabase/) || [])[1] || "?";

// ═══════════════════════════════════════════════════════════
// FALHAS DE BANCO — nunca silenciosas
// ═══════════════════════════════════════════════════════════
// Antes, QUALQUER erro do Supabase virava `return null`: banco fora do ar,
// coluna faltando e RLS bloqueando ficavam indistinguíveis, e a tela só
// aparecia vazia. Numa GRAVAÇÃO isso é pior ainda — o usuário sai achando
// que salvou. Agora toda falha vai para o console com tabela e motivo, e as
// que enganam o usuário aparecem na tela.
//
// O retorno continua sendo `null` em caso de falha: as 122 chamadas
// existentes seguem funcionando sem alteração nenhuma.
const ouvintesFalhaSb = new Set();
const assinarFalhasSb = fn => { ouvintesFalhaSb.add(fn); return () => ouvintesFalhaSb.delete(fn); };

function registrarFalhaSb({ alvo, metodo, status, detalhe }) {
  console.error(`[Supabase] ${metodo} ${alvo} → ${status || "sem resposta"}${detalhe ? ` — ${detalhe}` : ""}`);
  // Escrita SEMPRE avisa: o dano é o usuário acreditar que gravou.
  // Leitura avisa só em 400/401/403/404 — erro de estrutura ou permissão,
  // que é defeito de verdade. Queda de rede em leitura fica só no console,
  // senão o modo offline (que é previsto no app) viraria uma metralhadora
  // de alertas.
  const escrita = metodo !== "GET";
  const estrutural = [400, 401, 403, 404, 409, 500].includes(status);
  if (!escrita && !estrutural) return;
  // Migração ainda não aplicada: previsto, não é defeito. Ver TABELAS_OPCIONAIS.
  if (status === 404 && TABELAS_OPCIONAIS.has(alvo)) return;
  // Mesma ideia, um nível abaixo: COLUNA que só passa a existir depois da
  // migração. Aqui a tabela existe, então o PostgREST devolve 400 e não 404.
  // Quem faz a leitura já sabe recuar sozinho (ver `buscarPacientes`), então
  // a tela NÃO fica sem dado — mas sem esta linha a recepcionista levaria um
  // alerta vermelho a CADA busca durante todo o intervalo entre o deploy e o
  // SQL rodado. Alerta que aparece quando não há nada de errado é o que
  // ensina a equipe a fechar alerta sem ler, e aí o próximo, que é de
  // verdade, passa junto.
  if (status === 400 && !escrita
      && [...COLUNAS_OPCIONAIS].some(c => String(detalhe).includes(`.${c} does not exist`))) return;
  const falha = { alvo, metodo, status, detalhe, escrita, em: Date.now() };
  ouvintesFalhaSb.forEach(fn => { try { fn(falha); } catch {} });
}

// Tabelas cuja AUSÊNCIA é esperada enquanto a migração correspondente não
// for aplicada. O código sempre roda na Vercel antes de alguém abrir o
// painel do Supabase — é a ordem inevitável, já que a migração é manual.
//
// Sem esta lista, o intervalo entre o merge e o SQL rodado enche a tela de
// TODO MUNDO com um alerta vermelho sobre uma tabela que ninguém ainda
// deveria ter. Alerta que aparece quando não há nada de errado é o que
// ensina a equipe a fechar alerta sem ler — e aí o próximo, que é de
// verdade, também passa batido.
//
// A falha continua indo para o console. É só o alarme na tela que se cala,
// e só para 404 (tabela inexistente) — 401/403 continuam gritando, porque
// aí é permissão, não migração pendente.
const TABELAS_OPCIONAIS = new Set(["perfis_acesso", "perfis_permissoes", "usuarios_permissoes", "ps_faixas_pediatricas", "ps_faixas_obstetricas",
  "nsp_meta_faixas", "nsp_meta_medicoes", "nsp_protocolos", "nsp_capacitacoes", "nsp_comunicados",
  "prot_catalogo", "prot_setor", "prot_ativacoes", "prot_bundle_itens",
  "sigtap_procedimentos"]);

// Colunas cuja ausência é esperada até a migração correspondente rodar. Só
// entra aqui coluna com RECUO PRONTO no código que a lê — senão o alarme
// estaria escondendo uma tela que de fato não funciona, que é o oposto do
// motivo desta lista existir.
//
//   • nome_busca (migracao-pacientes-busca.sql) — `buscarPacientes` cai
//     sozinha na busca antiga enquanto ela não existe.
//
// Ao rodar a migração nos DOIS bancos, a linha correspondente pode sair.
const COLUNAS_OPCIONAIS = new Set(["nome_busca"]);

async function sbFetch(path, opts = {}, _jaRenovou = false) {
  if (!USE_SUPABASE) return null;
  const metodo = opts.method || "GET";
  const alvo = String(path).split("?")[0];      // nome da tabela, sem os filtros
  const tinhaToken = !!AUTH_TOKEN;              // chamada feita como usuário logado?

  // GRAVAÇÃO SEM CRACHÁ NÃO SAI. Ver `exigeCracha` (acesso/sessao.js): toda
  // política de escrita exige `my_role()`, nulo para o anônimo — então a
  // chamada só pode falhar, e falha MENTINDO ("violates row-level security
  // policy" quando o problema é sessão).
  //
  // Antes de desistir, tenta renovar: o `refresh_token` pode estar vivo no
  // localStorage mesmo com o `AUTH_TOKEN` ainda nulo em memória (é a corrida
  // que acontece no carregamento da página). Aí a gravação segue normal, com
  // o crachá novo.
  if (exigeCracha(metodo) && !tinhaToken) {
    if (!_jaRenovou && await renovarSessao()) return sbFetch(path, opts, true);
    registrarFalhaSb({
      alvo, metodo, status: 401,
      detalhe: "Sessão não está ativa — a gravação NÃO foi enviada. Entre de novo antes de refazer o registro.",
    });
    avisarSessaoExpirada();
    return null;
  }

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...opts,
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${AUTH_TOKEN || SUPABASE_KEY}`,
        "Content-Type": "application/json",
        "Prefer": opts.method === "POST" ? "return=representation" : undefined,
        ...opts.headers,
      },
    });
    if (!res.ok) {
      // O PostgREST devolve o motivo em JSON (message/hint/details). É essa
      // mensagem que diz "column X does not exist", "permission denied" ou
      // "JWT expired".
      let corpo = "";
      try { corpo = await res.text(); } catch {}
      // Crachá vencido: renova uma vez e repete a chamada, transparente. Se o
      // refresh também morreu, um aviso limpo e de volta ao login — nunca mais
      // a enxurrada de um erro por tabela.
      if (deveTentarRenovar(res.status, tinhaToken, _jaRenovou, corpo)) {
        if (await renovarSessao()) return sbFetch(path, opts, true);
        avisarSessaoExpirada();
        return null;
      }
      let detalhe = "";
      try {
        const j = JSON.parse(corpo);
        detalhe = [j.message, j.details, j.hint].filter(Boolean).join(" — ");
      } catch { detalhe = corpo.slice(0, 200); }
      registrarFalhaSb({ alvo, metodo, status: res.status, detalhe });
      return null;
    }
    return res.json().catch(() => null);
  } catch (e) {
    // Sem isto, queda de rede rejeitava a promise e estourava no chamador —
    // a maioria das 122 não tem try/catch.
    registrarFalhaSb({ alvo, metodo, status: 0, detalhe: e?.message || "sem conexão" });
    return null;
  }
}

// ═══════════════════════════════════════════════════════════
// DADOS MESTRES
// ═══════════════════════════════════════════════════════════
// A lista saiu daqui para `src/ambulatorio/especialidades.js` quando ganhou
// um segundo leitor: a conciliação da agenda, que precisa saber para qual
// chave gravar a produção apurada. Duas cópias fariam uma ganhar
// especialidade nova e a outra não — e o número gravado sumiria numa chave
// que nenhuma tela lê.
const SPECS = ESPECIALIDADES;
// ═══════════════════════════════════════════════════════════
// MARCA VALENTRAX — Healthcare Operations
// Símbolo: hub radial de correntes curvas convergindo no núcleo
// (setores do hospital conectados ao centro analítico).
// ═══════════════════════════════════════════════════════════
function VxLogo({ size = 30 }) {
  const ray = (rot, cor, w, r, op = 1) => (
    <g key={rot} transform={`rotate(${rot} 36 36)`} opacity={op}>
      <path d="M45 35.4 C 51 34.6, 55.5 32.6, 59 29.6" stroke={cor} strokeWidth={w} fill="none" strokeLinecap="round" />
      <circle cx="60.6" cy="28.2" r={r} fill={cor} />
    </g>
  );
  return (
    <svg viewBox="0 0 72 72" width={size} height={size} aria-hidden="true" style={{ flexShrink: 0 }}>
      {[0, 90, 180, 270].map(a => ray(a, VX.turquesa, 3.2, 2.8))}
      {[45, 225].map(a => ray(a, VX.azul, 2.5, 2.2))}
      {[135, 315].map(a => ray(a, VX.prata, 2.5, 2.2, 0.85))}
      <circle cx="36" cy="36" r="12.5" fill="none" stroke={VX.turquesa} strokeWidth="1" opacity=".25" />
      <circle cx="36" cy="36" r="8.2" fill={VX.turquesa} />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════
// STORAGE — localStorage + Supabase fallback
// ═══════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════
// AUDITORIA
// ═══════════════════════════════════════════════════════════
// A trilha mudou-se para src/auditoria/dados.js, junto da leitura. Fica
// aqui só o adaptador que injeta o `sb`: são 107 pontos de chamada, e
// reescrever todos esconderia a mudança de verdade no meio do ruído. Os
// módulos já extraídos importam `registrarAuditoria` direto, com o `sb`
// que eles próprios recebem.
const addAuditLog = (user, acao, alvo, dados) => registrarAuditoria(SB(), user, acao, alvo, dados);

// ═══════════════════════════════════════════════════════════
// AGGREGATE
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════
const SESSION_KEY = "hnsn_auth_v2";   // { access_token, refresh_token, user }
const AUTH_DOMAIN = "@hnsn.local";    // "laura" -> laura@hnsn.local (o Supabase Auth exige formato de e-mail)

// Token JWT do usuário logado — enviado nas chamadas ao banco (ver sbFetch).
let AUTH_TOKEN = null;

const loadSession = () => {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY));
    AUTH_TOKEN = s?.access_token || null;
    return s?.user || null;
  } catch { return null; }
};
const saveSession = s => { AUTH_TOKEN = s?.access_token || null; localStorage.setItem(SESSION_KEY, JSON.stringify(s)); };
const clearSession = () => { AUTH_TOKEN = null; localStorage.removeItem(SESSION_KEY); };

// ── Renovação automática do crachá (JWT) ────────────────────────────────
// O access_token do Supabase vive ~1h. Sem renovar, depois de 1h de tela
// aberta TODA chamada volta 401 "JWT expired". Aqui o crachá é renovado
// sozinho, usando o refresh_token (de vida longa) que já fica na sessão.

// Quem quer saber que a sessão morreu DE VEZ (refresh também expirado) se
// inscreve aqui — o App usa isto para voltar ao login com UM aviso, no lugar
// da enxurrada de erros por tabela. Mesmo padrão de `ouvintesFalhaSb`.
const ouvintesSessao = new Set();
const assinarSessaoExpirada = fn => { ouvintesSessao.add(fn); return () => ouvintesSessao.delete(fn); };
let sessaoJaAvisada = false;
function avisarSessaoExpirada() {
  clearSession();
  if (sessaoJaAvisada) return;            // um aviso só, não um por tabela
  sessaoJaAvisada = true;
  ouvintesSessao.forEach(fn => { try { fn(); } catch {} });
}

const lerSessao = () => { try { return JSON.parse(localStorage.getItem(SESSION_KEY)) || null; } catch { return null; } };

// Single-flight: várias tabelas carregando juntas disparam só UMA renovação;
// todas aguardam a mesma promessa e depois repetem com o crachá novo.
let promessaRenovacao = null;
async function renovarSessao() {
  if (!USE_SUPABASE) return false;
  if (promessaRenovacao) return promessaRenovacao;
  promessaRenovacao = (async () => {
    const atual = lerSessao();
    const refresh = atual?.refresh_token;
    if (!refresh) return false;
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: "POST",
        headers: { "apikey": SUPABASE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refresh }),
      });
      if (!res.ok) return false;                       // refresh também expirou/invalidado
      const auth = await res.json().catch(() => null);
      if (!auth?.access_token) return false;
      saveSession({
        access_token: auth.access_token,
        refresh_token: auth.refresh_token || refresh,  // pode vir rotacionado
        expires_at: auth.expires_at || Math.floor(Date.now() / 1000) + (auth.expires_in || 3600),
        user: atual?.user || null,
      });
      sessaoJaAvisada = false;                         // sessão viva de novo
      return true;
    } catch { return false; }
  })();
  try { return await promessaRenovacao; }
  finally { promessaRenovacao = null; }
}

// Login REAL via Supabase Auth. Retorna { ok, user } ou { ok:false, error }.
async function signIn(username, password) {
  if (!USE_SUPABASE) return { ok: false, error: "Login indisponível (banco não configurado)." };
  const email = username.trim().toLowerCase() + AUTH_DOMAIN;
  let res;
  try {
    res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { "apikey": SUPABASE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  } catch { return { ok: false, error: "Sem conexão com o servidor." }; }
  if (!res.ok) return { ok: false, error: "Usuário ou senha incorretos." };
  const auth = await res.json();
  AUTH_TOKEN = auth.access_token;
  let profile = null;
  try {
    // `categoria` e o registro do conselho vêm junto: sem eles, todo
    // usuário seria tratado como administrativo e nenhum ato clínico
    // passaria. `select=*` para não repetir este esquecimento a cada
    // coluna nova no perfil.
    const p = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${auth.user.id}&select=*`, {
      headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${auth.access_token}` },
    });
    if (p.ok) profile = (await p.json())[0];
  } catch {}
  const user = {
    id: auth.user.id,
    name: profile?.nome || username,
    username: profile?.username || username.trim().toLowerCase(),
    role: profile?.role || "visualizador",
    // Eixo clínico, separado do papel de acesso. Ausente = administrativo,
    // que não pratica ato clínico (nega por omissão).
    categoria: profile?.categoria || "administrativo",
    conselho: profile?.conselho || null,
    registro_conselho: profile?.registro_conselho || null,
    uf_conselho: profile?.uf_conselho || null,
  };
  saveSession({
    access_token: auth.access_token,
    refresh_token: auth.refresh_token,
    expires_at: auth.expires_at || Math.floor(Date.now() / 1000) + (auth.expires_in || 3600),
    user,
  });
  sessaoJaAvisada = false;                    // login novo zera o aviso de expiração
  return { ok: true, user };
}

// Troca a senha do próprio usuário logado (Supabase Auth).
async function changeMyPassword(newPassword) {
  if (!AUTH_TOKEN) return { ok: false, error: "Sessão expirada. Entre novamente." };
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: "PUT",
      headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${AUTH_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ password: newPassword }),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); return { ok: false, error: e.msg || e.error_description || "Não foi possível trocar a senha." }; }
    return { ok: true };
  } catch { return { ok: false, error: "Sem conexão." }; }
}



// Administração de usuários (só adm_master). Chama a Edge Function protegida
// que roda no servidor com a service_role — o navegador nunca vê a chave admin.
// Ações: "list" | "create" | "update" | "reset_senha" | "set_ativo".
async function adminUsuarios(action, payload = {}) {
  if (!USE_SUPABASE) return { error: "banco não configurado" };
  if (!AUTH_TOKEN) return { error: "sessão expirada — entre novamente" };
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-usuarios`, {
      method: "POST",
      headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${AUTH_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: data.error || `erro ${res.status} (a Edge Function foi publicada?)` };
    return data;
  } catch { return { error: "sem conexão com o servidor" }; }
}


// ═══════════════════════════════════════════════════════════
// ALERTAS AUTOMÁTICOS
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// HELPERS VISUAIS
// ═══════════════════════════════════════════════════════════





// ═══════════════════════════════════════════════════════════
// BANNER DE ALERTAS (topo do app)
// ═══════════════════════════════════════════════════════════
function AlertBanner({ db }) {
  const [open, setOpen] = useState(false);
  const alerts = calcAlertas(db);
  const crits  = alerts.filter(a => a.level === "critical").length;
  const warns  = alerts.filter(a => a.level === "warning").length;
  if (alerts.length === 0) return null;
  return (
    <div style={{ background: "var(--bg-2)", borderBottom: "1px solid var(--border)" }}>
      <button onClick={() => setOpen(p => !p)} style={{
        width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "6px 1.5rem",
        background: "none", border: "none", cursor: "pointer", textAlign: "left",
      }}>
        {crits > 0 && <span style={{ background: "#3d0f18", color: "#fb7185", borderRadius: 99, fontSize: 11, fontWeight: 700, padding: "2px 8px" }}>{crits} crítico{crits > 1 ? "s" : ""}</span>}
        {warns > 0 && <span style={{ background: "#3d2e06", color: "#fbbf24", borderRadius: 99, fontSize: 11, fontWeight: 700, padding: "2px 8px" }}>{warns} atenção</span>}
        {alerts.filter(a => a.level === "success").length > 0 && <span style={{ background: "#0a3d2a", color: "#34d399", borderRadius: 99, fontSize: 11, fontWeight: 700, padding: "2px 8px" }}>{alerts.filter(a => a.level === "success").length} meta(s) atingida(s)</span>}
        <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: "auto" }}>{open ? "▲ fechar" : "▼ ver alertas"}</span>
      </button>
      {open && (
        <div style={{ padding: "0 1.5rem .75rem", display: "flex", flexDirection: "column", gap: 4 }}>
          {alerts.map((a, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "flex-start", gap: 8, padding: "6px 10px", borderRadius: 6,
              background: a.level === "critical" ? "#3d0f18" : a.level === "warning" ? "#3d2e06" : "#0a3d2a",
              borderLeft: `3px solid ${a.level === "critical" ? "#fb7185" : a.level === "warning" ? "#fbbf24" : "#34d399"}`,
              fontSize: 12, color: a.level === "critical" ? "#fb7185" : a.level === "warning" ? "#fbbf24" : "#34d399",
            }}>
              ● {a.msg}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ESPECIALIDADE PAGE
// ═══════════════════════════════════════════════════════════
function EspecialidadePage({ spec, db, onSave, readOnly = false, currentUser }) {
  const now = new Date();
  const [date, setDate]   = useState(todayStr());
  const [form, setForm]   = useState({ primeiras:"", retornos:"", ofertadas:"", realizadas:"", livres:"", emergencias:"", faltas:"" });
  const [saved, setSaved] = useState(false);
  const [mes, setMes]     = useState(now.getMonth());
  const [ano, setAno]     = useState(now.getFullYear());

  useEffect(() => {
    const rec = db[date]?.[spec.id];
    if (rec) setForm({ primeiras: String(rec.primeiras ?? ""), retornos: String(rec.retornos ?? ""), ofertadas: String(rec.ofertadas ?? ""), realizadas: String(rec.realizadas ?? ""), livres: String(rec.livres ?? ""), emergencias: String(rec.emergencias ?? ""), faltas: String(rec.faltas ?? "") });
    else setForm({ primeiras:"", retornos:"", ofertadas:"", realizadas:"", livres:"", emergencias:"", faltas:"" });
  }, [date, db, spec.id]);

  const f = k => parseInt(form[k]) || 0;
  const totalDia = f("primeiras") + f("retornos") + f("emergencias");

  async function handleSave() {
    const data = { primeiras: f("primeiras"), retornos: f("retornos"), ofertadas: f("ofertadas"), realizadas: f("realizadas"), livres: f("livres"), emergencias: f("emergencias"), faltas: f("faltas") };
    const syncStatus = await saveRecord(SB(), date, spec.id, data, currentUser);
    const newDb = loadDB();
    onSave(newDb);
    setSaved(syncStatus); // "cloud" | "local"
    setTimeout(() => setSaved(false), 4000);
  }

  const mesData   = aggregateMes(db, ano, mes, spec.id);
  const totalMes  = mesData.primeiras + mesData.retornos + mesData.emergencias;
  const pctMes    = spec.metaM > 0 ? (totalMes / spec.metaM) * 100 : 0;
  const faltaMes  = Math.max(spec.metaM - totalMes, 0);
  const diaAtual  = date.startsWith(`${ano}-${String(mes+1).padStart(2,"0")}`) ? parseInt(date.slice(8)) : new Date(ano, mes+1, 0).getDate();
  const diasNoMes = new Date(ano, mes + 1, 0).getDate();
  const diasRest  = Math.max(diasNoMes - diaAtual, 0);
  const ritmo     = diaAtual > 0 ? totalMes / diaAtual : 0;
  const projecao  = Math.round(ritmo * diasNoMes);
  const precisaDia = diasRest > 0 ? Math.ceil(faltaMes / diasRest) : 0;

  const anoData    = aggregateAno(db, ano, spec.id);
  const totalAno   = anoData.reduce((a, m) => a + m.total, 0);
  const total1aAno = anoData.reduce((a, m) => a + m.primeiras, 0);

  // Comparativo
  const comp = comparativo(db, ano, mes, spec.id);

  // 12 meses de tendência
  const trend12 = Array.from({ length: 12 }, (_, i) => {
    const m = (mes - 11 + i + 12) % 12;
    const a = mes - 11 + i < 0 ? ano - 1 : ano;
    const d = aggregateMes(db, a, m, spec.id);
    return { name: MONTHS[m], total: d.primeiras + d.retornos + d.emergencias, meta: spec.metaM, primeiras: d.primeiras };
  });

  const barData = anoData.map((m, i) => ({ name: MONTHS[i], Total: m.total, Meta: spec.metaM, "1ª Consulta": m.primeiras }));
  const compData = [
    { name: "Ofertadas",  value: mesData.ofertadas },
    { name: "Realizadas", value: mesData.realizadas },
    { name: "Livres",     value: mesData.livres },
    { name: "1ª Cons.",   value: mesData.primeiras },
    { name: "Retorno",    value: mesData.retornos },
    { name: "Faltas",     value: mesData.faltas },
    { name: "Emerg.",     value: mesData.emergencias },
  ];

  const inp = { background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: 6, padding: "7px 10px", color: "var(--text)", fontFamily: "JetBrains Mono, monospace", fontSize: 14, width: "100%", outline: "none" };

  return (
    <div style={{ padding: "1.25rem 1.5rem", overflowY: "auto", height: "100%" }}>
      {/* Título */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "1.25rem" }}>
        <div style={{ width: 4, height: 32, background: spec.color, borderRadius: 2 }} />
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: spec.color }}>{spec.label}</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Ambulatório {HOSPITAL_SIGLA} · Meta mensal {fmt(spec.metaM)} · Anual {fmt(spec.metaA)} · 30% 1ª consulta = {fmt(spec.meta1a)}/ano</div>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <SemaforoMeta pct={pctMes} diasRestantes={diasRest} />
        </div>
      </div>

      {/* Grid: formulário + KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: "1rem", marginBottom: "1rem" }}>
        {/* Formulário */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1rem", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em" }}>Lançar dados</span>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ ...inp, width: "auto", fontSize: 12, padding: "4px 8px" }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[
              { key: "ofertadas",   label: "Ofertadas (Gercon)" },
              { key: "realizadas",  label: "Realizadas" },
              { key: "livres",      label: "Livres" },
              { key: "primeiras",   label: "1ª Consulta" },
              { key: "retornos",    label: "Retorno" },
              { key: "faltas",      label: "Faltas" },
              { key: "emergencias", label: "Emergências" },
            ].map(({ key, label }) => (
              <div key={key}>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", marginBottom: 4, display: "block" }}>{label}</label>
                <input type="number" min="0" value={form[key]}
                  onChange={e => !readOnly && setForm(p => ({ ...p, [key]: e.target.value }))}
                  onFocus={e => !readOnly && (e.target.style.borderColor = spec.color)}
                  onBlur={e => e.target.style.borderColor = "var(--border)"}
                  disabled={readOnly} placeholder="0"
                  style={{ ...inp, opacity: readOnly ? .5 : 1, cursor: readOnly ? "not-allowed" : "text" }} />
              </div>
            ))}
          </div>
          {readOnly ? (
            <div style={{ background: "#1e3a5f", borderRadius: 6, padding: "8px 12px", fontSize: 12, color: "#38bdf8", textAlign: "center", marginTop: 4 }}>Modo visualização</div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
              <button onClick={handleSave} style={{ background: spec.color, color: "#000", border: "none", borderRadius: 6, padding: "8px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer", flex: 1 }}>Salvar</button>
              {saved === "cloud" && <span style={{ color: "#34d399", fontSize: 12, fontWeight: 700 }}>Salvo e sincronizado</span>}
              {saved === "local" && <span style={{ color: "#fbbf24", fontSize: 12, fontWeight: 700 }}>⚠️ Salvo SÓ neste aparelho</span>}
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ background: "var(--input-bg)", borderRadius: 6, padding: "6px 10px", flex: 1, textAlign: "center" }}>
              <div style={{ fontSize: 10, color: "var(--text-muted)" }}>TOTAL DIA</div>
              <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 20, color: spec.color, fontWeight: 700 }}>{totalDia}</div>
            </div>
            <div style={{ background: "var(--input-bg)", borderRadius: 6, padding: "6px 10px", flex: 1, textAlign: "center" }}>
              <div style={{ fontSize: 10, color: "var(--text-muted)" }}>1ªS</div>
              <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 20, color: "#38bdf8", fontWeight: 700 }}>{f("primeiras")}</div>
            </div>
            <div style={{ background: "var(--input-bg)", borderRadius: 6, padding: "6px 10px", flex: 1, textAlign: "center" }}>
              <div style={{ fontSize: 10, color: "var(--text-muted)" }}>LIVRES</div>
              <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 20, color: "#34d399", fontWeight: 700 }}>{f("livres")}</div>
            </div>
          </div>
        </div>

        {/* KPIs + comparativo */}
        <div style={{ display: "flex", flexDirection: "column", gap: ".75rem" }}>
          <div style={{ display: "flex", gap: ".75rem" }}>
            <StatCard label="Produção no mês" value={fmt(totalMes)} sub={`meta: ${fmt(spec.metaM)} · 1ªs+ret+emerg.`} color={spec.color} big />
            <StatCard label="Faltam para meta"    value={fmt(faltaMes)} sub={`${diasRest} dias restantes`} color={faltaMes === 0 ? "#34d399" : "#fb7185"} big />
            <StatCard label="Projeção fechamento" value={fmt(projecao)} sub={projecao >= spec.metaM ? "✓ supera meta" : `⚠ faltarão ~${fmt(spec.metaM - projecao)}`} color={projecao >= spec.metaM ? "#34d399" : "#fbbf24"} big />
            <StatCard label="Ritmo necessário"    value={`${precisaDia}/dia`} sub="para atingir meta" color={spec.color} big />
          </div>

          {/* Comparativo mês a mês */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1rem" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 }}>
              Comparativo de Desempenho
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
              {[
                { label: `${MONTHS_FULL[mes]} ${ano}`,           value: comp.mesAtual,       sub: "mês atual",                    color: spec.color },
                { label: `${comp.mesAnteriorLabel} (mês ant.)`,  value: comp.mesAnterior,    sub: `${comp.variacaoMes >= 0 ? "▲" : "▼"} ${Math.abs(comp.variacaoMes).toFixed(0)}% vs mês anterior`, color: comp.variacaoMes >= 0 ? "#34d399" : "#fb7185" },
                { label: `${MONTHS_FULL[mes]} ${ano-1}`,         value: comp.mesAnoAnterior, sub: `${comp.variacaoAno >= 0 ? "▲" : "▼"} ${Math.abs(comp.variacaoAno).toFixed(0)}% vs ano anterior`,  color: comp.variacaoAno >= 0 ? "#34d399" : "#fb7185" },
              ].map(({ label, value, sub, color }) => (
                <div key={label} style={{ background: "var(--bg-2)", borderRadius: 6, padding: "8px 10px" }}>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 3 }}>{label}</div>
                  <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 20, color, fontWeight: 700 }}>{fmt(value)}</div>
                  <div style={{ fontSize: 10, color, marginTop: 2 }}>{sub}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Barra mensal */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Meta Mensal — {MONTHS_FULL[mes]}/{ano}</span>
                <DeltaBadge value={totalMes} meta={spec.metaM} />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <select value={mes} onChange={e => setMes(+e.target.value)} style={{ ...inp, width: "auto", fontSize: 12, padding: "4px 8px" }}>
                  {MONTHS_FULL.map((m, i) => <option key={i} value={i}>{m}</option>)}
                </select>
                <input type="number" value={ano} onChange={e => setAno(+e.target.value)} style={{ ...inp, width: 80, fontSize: 12, padding: "4px 8px" }} />
              </div>
            </div>
            <div style={{ background: "var(--input-bg)", borderRadius: 99, height: 14, overflow: "hidden", marginBottom: 6 }}>
              <div style={{ width: `${Math.min(pctMes, 100)}%`, height: "100%", borderRadius: 99, background: pctMes >= 100 ? "#34d399" : pctMes >= 70 ? spec.color : pctMes >= 40 ? "#fbbf24" : "#fb7185", transition: "width .6s" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-3)" }}>
              <span>Realizado: <strong style={{ color: "var(--text)" }}>{fmt(totalMes)}</strong></span>
              <span style={{ color: spec.color, fontWeight: 700, fontFamily: "JetBrains Mono, monospace" }}>{pctMes.toFixed(1)}%</span>
              <span>Meta: <strong style={{ color: "var(--text)" }}>{fmt(spec.metaM)}</strong></span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 12 }}>
              {[
                { label: "Comparec. Gercon", v: mesData.realizadas, max: mesData.ofertadas, c: "#0d9488" },
                { label: "Livres",     v: mesData.livres,     max: mesData.ofertadas, c: "#3b82f6" },
                { label: "1ªs Cons.",  v: mesData.primeiras,  max: mesData.primeiras + mesData.retornos, c: "#6366f1" },
              ].map(({ label, v, max, c }) => {
                const p = max > 0 ? Math.min((v / max) * 100, 100) : 0;
                return (
                  <div key={label} style={{ background: "var(--input-bg)", borderRadius: 6, padding: "6px 10px" }}>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 4 }}>{label}</div>
                    <div style={{ background: "var(--surface-3)", borderRadius: 99, height: 5, overflow: "hidden", marginBottom: 4 }}>
                      <div style={{ width: `${p}%`, height: "100%", background: c, borderRadius: 99, transition: "width .5s" }} />
                    </div>
                    <div title={v > max ? "Inconsistência: valor maior que o ofertado — revisar o lançamento" : undefined} style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 13, color: v > max ? "#fb7185" : c }}>{fmt(v)} <span style={{ fontSize: 10, color: "var(--text-muted)" }}>/ {fmt(max)}</span>{v > max ? " ⚠" : ""}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Gauges + linha últimos dias */}
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "1rem", marginBottom: "1rem" }}>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1rem", display: "flex", gap: "1.5rem", alignItems: "center" }}>
          <RingGauge value={totalMes}   max={spec.metaM}  color={spec.color} label="Meta Mensal"  sub={`${fmt(totalMes)}/${fmt(spec.metaM)}`} />
          <RingGauge value={totalAno}   max={spec.metaA}  color={spec.color} label="Meta Anual"   sub={`${fmt(totalAno)}/${fmt(spec.metaA)}`} />
          <RingGauge value={total1aAno} max={spec.meta1a} color="#6366f1"    label="30% 1ª Cons." sub={`${fmt(total1aAno)}/${fmt(spec.meta1a)}`} />
        </div>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1rem" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 }}>Tendência — últimos 12 meses</div>
          <ResponsiveContainer width="100%" height={110}>
            <ComposedChart data={trend12} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fill: "var(--text-muted)", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip content={customTooltip} />
              <ReferenceLine y={spec.metaM} stroke="var(--border-2)" strokeDasharray="4 2" />
              <Area type="monotone" dataKey="total" name="Total" fill={spec.color + "22"} stroke={spec.color} strokeWidth={2} />
              <Line type="monotone" dataKey="primeiras" name="1ª Consulta" stroke="#6366f1" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Barras anuais + composição mensal + meta anual */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1rem", marginBottom: "1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em" }}>Atendimentos mensais — {ano}</span>
          <DeltaBadge value={totalAno} meta={spec.metaA} />
        </div>
        <ResponsiveContainer width="100%" height={150}>
          <BarChart data={barData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <XAxis dataKey="name" tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "var(--text-muted)", fontSize: 10 }} axisLine={false} tickLine={false} width={35} />
            <Tooltip content={customTooltip} />
            <ReferenceLine y={spec.metaM} stroke="var(--border-2)" strokeDasharray="4 2" />
            <Bar dataKey="Total" radius={[4, 4, 0, 0]}>
              {barData.map((entry, i) => <Cell key={i} fill={entry.Total >= spec.metaM ? "#34d399" : entry.Total >= spec.metaM * .7 ? spec.color : "#fb7185"} fillOpacity={.9} />)}
            </Bar>
            <Bar dataKey="1ª Consulta" fill="#6366f1" fillOpacity={.7} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
        {/* Composição mensal */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1rem" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 }}>Composição — {MONTHS_FULL[mes]}</div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={compData} layout="vertical" margin={{ top: 0, right: 20, left: 60, bottom: 0 }}>
              <XAxis type="number" tick={{ fill: "var(--text-muted)", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fill: "var(--text-3)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={customTooltip} />
              <Bar dataKey="value" name="Qtd." radius={[0, 4, 4, 0]}>
                {compData.map((_, i) => <Cell key={i} fill={["#0d9488","#3b82f6","#d97706","#6366f1","#e11d48","#64748b","#94a3b8"][i % 7]} fillOpacity={.85} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Meta anual + 30% */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1rem" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 }}>Progresso Anual — {ano}</div>
          {[
            { label: "Total de atendimentos", value: totalAno,   meta: spec.metaA,  color: spec.color },
            { label: "1ª Consultas (30%)",    value: total1aAno, meta: spec.meta1a, color: "#38bdf8" },
          ].map(({ label, value, meta, color }) => {
            const p = meta > 0 ? Math.min((value / meta) * 100, 100) : 0;
            return (
              <div key={label} style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{label}</span>
                  <DeltaBadge value={value} meta={meta} />
                </div>
                <div style={{ background: "var(--input-bg)", borderRadius: 99, height: 10, overflow: "hidden", marginBottom: 4 }}>
                  <div style={{ width: `${p}%`, height: "100%", background: value >= meta ? "#34d399" : color, borderRadius: 99, transition: "width .6s" }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-3)" }}>
                  <span>Realizado: <strong style={{ color: "var(--text)" }}>{fmt(value)}</strong></span>
                  <span style={{ fontFamily: "JetBrains Mono, monospace", color: value >= meta ? "#34d399" : color, fontWeight: 700 }}>{p.toFixed(1)}%</span>
                  <span>Meta: <strong style={{ color: "var(--text)" }}>{fmt(meta)}</strong></span>
                </div>
                {value < meta && <div style={{ fontSize: 11, color: "#fb7185", marginTop: 4 }}>Faltam <strong>{fmt(meta - value)}</strong></div>}
              </div>
            );
          })}
          {/* Tabela anual resumo */}
          <div style={{ maxHeight: 130, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead><tr>{["Mês","Total","1ª","Ret.","% Meta"].map(h => <th key={h} style={{ padding: "4px 6px", color: "var(--text-muted)", textAlign: "left", borderBottom: "1px solid var(--border)", fontWeight: 700 }}>{h}</th>)}</tr></thead>
              <tbody>
                {anoData.filter(m => m.total > 0).map(m => {
                  const pct = spec.metaM > 0 ? Math.round((m.total / spec.metaM) * 100) : 0;
                  const c = pct >= 100 ? "#34d399" : pct >= 70 ? spec.color : "#fb7185";
                  return (
                    <tr key={m.mes}>
                      <td style={{ padding: "4px 6px", color: "var(--text-3)" }}>{MONTHS[m.mes]}</td>
                      <td style={{ padding: "4px 6px", fontFamily: "JetBrains Mono, monospace", color: "var(--text)" }}>{m.total}</td>
                      <td style={{ padding: "4px 6px", fontFamily: "JetBrains Mono, monospace", color: "#38bdf8" }}>{m.primeiras}</td>
                      <td style={{ padding: "4px 6px", fontFamily: "JetBrains Mono, monospace", color: "#60a5fa" }}>{m.retornos}</td>
                      <td style={{ padding: "4px 6px" }}><span style={{ background: c + "22", color: c, borderRadius: 99, padding: "1px 6px", fontWeight: 700, fontFamily: "JetBrains Mono, monospace" }}>{pct}%</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// VISÃO GERAL
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// SETORES + SOLICITAÇÕES (monitoramento de leitos)
// ═══════════════════════════════════════════════════════════

function Overview({ db, currentUser, canEdit, perms, onNav }) {
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth());
  const [ano, setAno] = useState(now.getFullYear());
  const [leitos, setLeitos]   = useState([]);
  const [setores, setSetores] = useState([]);
  const [solic, setSolic]     = useState([]);
  const [saidas, setSaidas]   = useState([]);
  const [novo, setNovo] = useState({ iniciais: "", setor_origem: "", setor_destino: "" });
  const [, setTick] = useState(0);
  const inp = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, padding: "5px 8px", color: "var(--text)", fontFamily: "JetBrains Mono, monospace", fontSize: 12, outline: "none" };

  function refresh() {
    if (!USE_SUPABASE) { setLeitos(loadLeitos()); setSetores(loadSetoresLocal()); return; }
    loadLeitosFromSupabase(SB()).then(r => r && setLeitos(r));
    loadSetoresFromSupabase(SB()).then(r => r && setSetores(r));
    // `r &&`: agora estes dois distinguem falha (null) de "não há
    // nenhum" ([]). Sem a guarda, uma leitura que falhou apagaria a fila
    // de internação da tela e mostraria "0 aguardando".
    loadSolicitacoes(SB()).then(r => r && setSolic(r));
    loadSaidas(SB()).then(r => r && setSaidas(r));
  }
  useEffect(() => {
    refresh();
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    const id = setInterval(() => setTick(t => t + 1), 60000);
    return () => { window.removeEventListener("focus", onFocus); clearInterval(id); };
  }, []);

  // Métricas globais de leitos
  const operacionais = leitos.filter(l => l.status !== "interditado").length;
  const ocupadosG = leitos.filter(l => l.status === "ocupado").length;
  const higienizando = leitos.filter(l => l.status === "higienizacao").length;
  const ocupacaoG = operacionais > 0 ? Math.round((ocupadosG / operacionais) * 100) : 0;
  const inMesData = dstr => { if (!dstr) return false; const d = new Date(dstr + "T00:00:00"); return d.getMonth() === mes && d.getFullYear() === ano; };
  const sMes = saidas.filter(s => inMesData(s.data_alta));
  const altas = sMes.length;
  const giro = operacionais > 0 ? altas / operacionais : 0;
  const permVals = sMes.map(s => s.dias_permanencia).filter(v => v != null);
  const permMedia = permVals.length ? permVals.reduce((a, b) => a + b, 0) / permVals.length : null;
  const totalAguardando = solic.length;

  async function addSolic() {
    if (!novo.iniciais.trim() || !novo.setor_destino) { alert("Informe as iniciais do paciente e o setor de destino."); return; }
    await addSolicitacaoRemote(SB(), { iniciais: novo.iniciais.trim(), setor_origem: novo.setor_origem || null, setor_destino: novo.setor_destino, hora_pedido: nowISO(), status: "aguardando" }, currentUser);
    addAuditLog(currentUser, "solicitar leito", `${novo.setor_origem || "?"} → ${novo.setor_destino}`, {});
    setNovo({ iniciais: "", setor_origem: "", setor_destino: "" });
    setTimeout(refresh, 400);
  }
  async function resolverSolic(s, status) {
    await updateSolicitacaoRemote(SB(), s.id, { status, resolvido_em: nowISO() });
    addAuditLog(currentUser, status === "atendido" ? "leito atendido" : "solicitação cancelada", s.setor_destino, {});
    setTimeout(refresh, 300);
  }

  const specRows = SPECS.map(spec => {
    const m = aggregateMes(db, ano, mes, spec.id);
    const total = m.primeiras + m.retornos + m.emergencias;
    const pct = spec.metaM > 0 ? Math.round((total / spec.metaM) * 100) : 0;
    return { spec, total, pct };
  });

  const setoresOrd = [...setores].sort((a, b) => (a.ordem || 0) - (b.ordem || 0) || a.nome.localeCompare(b.nome));
  const nomesSetores = setoresOrd.map(s => s.nome);

  return (
    <div style={{ padding: "1.25rem 1.5rem", overflowY: "auto", height: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "1.25rem", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>Centro de Monitoramento — {HOSPITAL_SIGLA}</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Leitos, ocupação e solicitações em tempo real</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>

          <select value={mes} onChange={e => setMes(+e.target.value)} style={inp}>{MONTHS_FULL.map((m, i) => <option key={i} value={i}>{m}</option>)}</select>
          <input type="number" value={ano} onChange={e => setAno(+e.target.value)} style={{ ...inp, width: 80 }} />
        </div>
      </div>

      {/* MÉTRICAS GLOBAIS DE LEITOS */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: ".75rem", marginBottom: "1.25rem" }}>
        <StatCard label="Taxa de ocupação" value={ocupacaoG + "%"} color={ocupacaoG >= 90 ? "#f43f5e" : "#22d3ee"} big />
        <StatCard label={`Giro de leito — ${MONTHS[mes]}`} value={giro.toFixed(2)} color="#3b82f6" big />
        <StatCard label="Perman. média" value={permMedia != null ? permMedia.toFixed(1) + "d" : "—"} color="#0d9488" big />
        <StatCard label="Aguardando leito" value={totalAguardando} color={totalAguardando > 0 ? "#fbbf24" : "#34d399"} big />
        <StatCard label="Em higienização" value={higienizando} color="#fbbf24" big />
      </div>

      {/* CHECKLIST DE IMPLANTAÇÃO — some sozinho quando os cadastros-base
          estiverem feitos. Fica aqui, e não numa tela escondida, porque é
          logo abaixo que o vazio se manifesta: sem setor cadastrado a
          "Ocupação por setor" nasce vazia e nada explica por quê. */}
      <ChecklistImplantacao sb={sbFetch} perms={perms} canEdit={canEdit} onNav={onNav} />

      {/* ALERTAS POR SETOR */}
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 }}>Ocupação por setor</div>
      {setoresOrd.length === 0 ? (
        <div style={{ background: "var(--surface)", border: "1px dashed var(--border)", borderRadius: 10, padding: "1.25rem", textAlign: "center", color: "var(--text-muted)", fontSize: 13, marginBottom: "1.25rem" }}>
          Nenhum setor cadastrado. Cadastre em <strong>Giro de Leitos → aba Mapa de leitos → botão Setores</strong> (à direita da barra de cadastro) e marque o setor de cada leito.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 12, marginBottom: "1.5rem" }}>
          {setoresOrd.map(setor => {
            const o = ocupacaoSetor(leitos, solic, setor);
            return (
              <div key={setor.nome} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `4px solid ${o.cor}`, borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{setor.nome}</div>
                  {o.restringir && <span style={{ background: "#3d0f18", color: "#fb7185", borderRadius: 99, padding: "2px 8px", fontSize: 10, fontWeight: 800 }}>RESTRINGIR</span>}
                </div>
                <div style={{ fontSize: 30, fontWeight: 800, color: o.cor, fontFamily: "JetBrains Mono, monospace", marginTop: 4 }}>{o.pct == null ? "—" : o.pct + "%"}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{o.ocupados}/{o.operacionais} ocupados</div>
                {o.aguardando > 0 && (
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "#3d2e06", color: "#fbbf24", borderRadius: 99, padding: "3px 10px", fontSize: 11, fontWeight: 700, marginTop: 7 }}>
                    {o.aguardando} na fila · maior espera {fmtDur(o.maiorEsperaMin)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* SOLICITAÇÕES PENDENTES */}
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 }}>Lista de espera por leito ({totalAguardando})</div>
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1rem 1.25rem", marginBottom: "1.5rem" }}>
        {canEdit && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: solic.length ? 14 : 0 }}>
            <input value={novo.iniciais} onChange={e => setNovo(p => ({ ...p, iniciais: e.target.value }))} placeholder="Iniciais do paciente" style={{ ...inp, fontFamily: "Inter", width: 150 }} />
            <select value={novo.setor_origem} onChange={e => setNovo(p => ({ ...p, setor_origem: e.target.value }))} style={{ ...inp, fontFamily: "Inter" }}><option value="">Origem…</option>{nomesSetores.map(n => <option key={n} value={n}>{n}</option>)}<option value="Emergência">Emergência</option><option value="Centro Cirúrgico">Centro Cirúrgico</option></select>
            <span style={{ color: "var(--text-muted)" }}>→</span>
            <select value={novo.setor_destino} onChange={e => setNovo(p => ({ ...p, setor_destino: e.target.value }))} style={{ ...inp, fontFamily: "Inter" }}><option value="">Destino…</option>{nomesSetores.map(n => <option key={n} value={n}>{n}</option>)}</select>
            <button onClick={addSolic} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "7px 16px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>+ Solicitar</button>
          </div>
        )}
        {solic.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: canEdit ? "8px 0 4px" : "8px 0" }}>Nenhum paciente aguardando leito.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {solic.map(s => {
              const esperaMin = diffMin(s.hora_pedido, nowISO());
              const urg = corEsperaFila(esperaMin);
              return (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px", flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 700, minWidth: 70 }}>{s.iniciais}</span>
                  <span style={{ fontSize: 12, color: "var(--text-3)" }}>{s.setor_origem || "?"} <span style={{ color: "var(--text-muted)" }}>→</span> <strong style={{ color: "var(--text)" }}>{s.setor_destino}</strong></span>
                  {s.visto_em && <span title={s.visto_por ? `em regulação por ${s.visto_por}` : "em regulação"} style={{ fontSize: 10.5, fontWeight: 700, color: "#34d399", border: "1px solid #34d39955", borderRadius: 99, padding: "0 7px" }}>em regulação</span>}
                  <span style={{ fontSize: 12, color: urg.cor, fontWeight: 700, marginLeft: "auto", fontFamily: "JetBrains Mono, monospace" }}>{fmtDur(esperaMin)}</span>
                  {canEdit && <>
                    <button onClick={() => resolverSolic(s, "atendido")} style={btnContorno("#34d399")}>✓ Atendido</button>
                    <button onClick={() => resolverSolic(s, "cancelado")} style={btnContorno("var(--text-muted)")}>✕</button>
                  </>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ESPECIALIDADES — META x REALIZADO */}
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 }}>Ambulatório — meta mensal × realizado ({MONTHS[mes]})</div>
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1rem 1.25rem", display: "flex", flexDirection: "column", gap: 12 }}>
        {specRows.map(({ spec, total, pct }) => (
          <div key={spec.id}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
              <span style={{ fontWeight: 600, color: spec.color }}>{spec.label}</span>
              <span style={{ color: "var(--text-3)" }}><strong style={{ color: "var(--text)" }}>{fmt(total)}</strong> / {fmt(spec.metaM)} · {pct}%</span>
            </div>
            <div style={{ height: 7, background: "var(--surface-3)", borderRadius: 99, overflow: "hidden" }}>
              <div style={{ width: Math.min(pct, 100) + "%", height: "100%", background: pct >= 100 ? "#34d399" : spec.color, borderRadius: 99 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════
// PRINT DASHBOARD
// ═══════════════════════════════════════════════════════════
function PrintDashboard({ db }) {
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth());
  const [ano, setAno] = useState(now.getFullYear());
  const [preview, setPreview] = useState(false);
  const inp = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, padding: "7px 10px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none" };

  const aggAll = SPECS.map(spec => {
    const m = aggregateMes(db, ano, mes, spec.id);
    const total = m.primeiras + m.retornos + m.emergencias;
    const blocoTotal = Object.entries(db).filter(([d]) => d.startsWith(`${ano}-${String(mes+1).padStart(2,"0")}`)).reduce((a,[,day]) => a + (day?.bloco?.[spec.id] || 0), 0);
    return { spec, m, total, blocoTotal, diff: total - spec.metaM, pct: spec.metaM > 0 ? ((total / spec.metaM) * 100) : 0 };
  });

  const totalGeral = aggAll.reduce((a, r) => a + r.total, 0);
  const metaGeral  = SPECS.reduce((a, s) => a + s.metaM, 0);
  const diffGeral  = totalGeral - metaGeral;
  const pctGeral   = metaGeral > 0 ? ((totalGeral / metaGeral) * 100) : 0;
  const geradoEm   = new Date().toLocaleString("pt-BR");
  const printStyles = `@media print { body * { visibility: hidden !important; } #print-area, #print-area * { visibility: visible !important; } #print-area { position: fixed; inset: 0; background: #fff !important; color: #111 !important; padding: 18px; } @page { size: A4 landscape; margin: 10mm; } }`;

  return (
    <div style={{ padding: "1.5rem", overflowY: "auto", height: "100%" }}>
      <style>{printStyles}</style>
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Dashboard para Impressão</div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: "1.25rem" }}>Relatório visual por período — imprima ou salve como PDF</div>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", marginBottom: "1.5rem" }}>
        <div><div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", marginBottom: 5 }}>MÊS</div>
          <select value={mes} onChange={e => setMes(+e.target.value)} style={inp}>{MONTHS_FULL.map((m, i) => <option key={i} value={i}>{m}</option>)}</select></div>
        <div><div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", marginBottom: 5 }}>ANO</div>
          <input type="number" value={ano} onChange={e => setAno(+e.target.value)} style={{ ...inp, width: 90 }} /></div>
        <button onClick={() => setPreview(true)} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 7, padding: "9px 20px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Pré-visualizar</button>
        {preview && <button onClick={() => window.print()} style={{ background: "#34d399", color: "#000", border: "none", borderRadius: 7, padding: "9px 20px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Imprimir / PDF</button>}
      </div>
      {preview && (
        <div id="print-area" style={{ background: "#fff", color: "#111", borderRadius: 10, border: "1px solid #e5e7eb", padding: "24px 28px", fontFamily: "Inter, sans-serif", fontSize: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, paddingBottom: 12, borderBottom: "2px solid #e5e7eb" }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#0f172a" }}>DASHBOARD AMBULATÓRIO — {HOSPITAL_SIGLA}</div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 3 }}>{HOSPITAL_NOME} · Valentrax Healthcare Operations</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", background: "#f1f5f9", borderRadius: 8, padding: "6px 14px" }}>{MONTHS_FULL[mes]}/{ano}</div>
              <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 4 }}>Gerado em {geradoEm}</div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
            {[
              { label: "TOTAL ATENDIMENTOS", value: fmt(totalGeral), sub: "todas as especialidades", bg: "#f0fdf4", border: "#86efac", val: "#16a34a" },
              { label: "META TOTAL DO MÊS",  value: fmt(metaGeral),  sub: "soma das especialidades", bg: "#eff6ff", border: "#93c5fd", val: "#1d4ed8" },
              { label: "DIFERENÇA PARA A META", value: (diffGeral >= 0 ? "+" : "") + fmt(diffGeral), sub: diffGeral >= 0 ? "Acima da meta" : "Abaixo da meta", bg: diffGeral >= 0 ? "#f0fdf4" : "#fef2f2", border: diffGeral >= 0 ? "#86efac" : "#fca5a5", val: diffGeral >= 0 ? "#16a34a" : "#dc2626" },
              { label: "% DA META GERAL",    value: pctGeral.toFixed(1) + "%", sub: "desempenho geral", bg: pctGeral >= 100 ? "#f0fdf4" : "#fef9c3", border: pctGeral >= 100 ? "#86efac" : "#fde047", val: pctGeral >= 100 ? "#16a34a" : "#a16207" },
            ].map(({ label, value, sub, bg, border, val }) => (
              <div key={label} style={{ background: bg, border: `1.5px solid ${border}`, borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: val, lineHeight: 1, fontFamily: "JetBrains Mono, monospace" }}>{value}</div>
                <div style={{ fontSize: 10, color: "#64748b", marginTop: 4 }}>{sub}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 14 }}>
            {aggAll.map(({ spec, m, total, blocoTotal, diff, pct }) => {
              const above = diff >= 0;
              const barW  = Math.min(pct, 100);
              const barC  = pct >= 100 ? "#16a34a" : pct >= 70 ? "#2563eb" : pct >= 40 ? "#d97706" : "#dc2626";
              return (
                <div key={spec.id} style={{ border: "1.5px solid #e5e7eb", borderRadius: 10, overflow: "hidden", background: "#fff" }}>
                  <div style={{ background: spec.color + "18", borderBottom: "1.5px solid " + spec.color + "44", padding: "8px 12px", display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: spec.color }} />
                    <span style={{ fontSize: 12, fontWeight: 800, color: "#0f172a", textTransform: "uppercase" }}>{spec.label} — {MONTHS_FULL[mes].toUpperCase()}/{ano}</span>
                  </div>
                  <div style={{ padding: "10px 12px" }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <div style={{ width: 72, height: 72, borderRadius: "50%", background: spec.color + "15", border: `3px solid ${spec.color}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <div style={{ fontSize: 8, color: "#64748b", fontWeight: 600 }}>TOTAL</div>
                        <div style={{ fontSize: 20, fontWeight: 800, color: spec.color, lineHeight: 1 }}>{total}</div>
                      </div>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                        <tbody>
                          {[["1ª Consulta",m.primeiras,"#6366f1"],["Retorno",m.retornos,"#0891b2"],["Ofertadas",m.ofertadas,"#475569"],["Realizadas",m.realizadas,"#16a34a"],["Livres",m.livres,"#0891b2"],["Faltas",m.faltas,"#dc2626"],["Emergências",m.emergencias,"#ea580c"],["Bloco",blocoTotal,"#7c3aed"]].map(([l,v,c]) => (
                            <tr key={l} style={{ borderBottom: "1px solid #f1f5f9" }}>
                              <td style={{ padding: "2px 0", color: "#64748b" }}>{l}</td>
                              <td style={{ padding: "2px 0", fontWeight: 700, color: c, textAlign: "right", fontFamily: "JetBrains Mono, monospace" }}>{v}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div style={{ background: "#f1f5f9", borderRadius: 99, height: 7, overflow: "hidden", margin: "8px 0 4px" }}>
                      <div style={{ width: `${barW}%`, height: "100%", background: barC, borderRadius: 99 }} />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                      {[["Meta Mensal",spec.metaM,"#0f172a"],["Realizado",total,barC]].map(([l,v,c]) => (
                        <div key={l} style={{ background: "#f8fafc", borderRadius: 6, padding: "5px 8px", textAlign: "center" }}>
                          <div style={{ fontSize: 9, color: "#94a3b8", textTransform: "uppercase" }}>{l}</div>
                          <div style={{ fontSize: 15, fontWeight: 800, color: c }}>{v}</div>
                        </div>
                      ))}
                      <div style={{ background: above ? "#f0fdf4" : "#fef2f2", border: `1px solid ${above ? "#86efac" : "#fca5a5"}`, borderRadius: 6, padding: "5px 8px", textAlign: "center" }}>
                        <div style={{ fontSize: 9, color: above ? "#16a34a" : "#dc2626", textTransform: "uppercase", fontWeight: 700 }}>{above ? "ACIMA" : "ABAIXO"}</div>
                        <div style={{ fontSize: 15, fontWeight: 800, color: above ? "#16a34a" : "#dc2626" }}>{above ? "+" : ""}{Math.abs(diff)}</div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ borderTop: "1.5px solid #e5e7eb", paddingTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>RESUMO POR ESPECIALIDADE</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {aggAll.map(({ spec, total, pct }) => {
                const c = pct >= 100 ? "#16a34a" : pct >= 70 ? "#2563eb" : "#dc2626";
                return (
                  <div key={spec.id} style={{ background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: 8, padding: "7px 12px", minWidth: 130 }}>
                    <div style={{ fontSize: 10, color: spec.color, fontWeight: 700 }}>{spec.label}</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>{fmt(total)} / {fmt(spec.metaM)}</div>
                    <div style={{ fontSize: 11, color: c, fontWeight: 700 }}>{pct.toFixed(1)}% da meta</div>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 10, fontSize: 10, color: "#94a3b8", display: "flex", justifyContent: "space-between" }}>
              <span>Dados referente a {MONTHS_FULL[mes]}/{ano} · Fonte: Valentrax · {HOSPITAL_SIGLA}</span>
              <span>Gerado em {geradoEm}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// AUDITORIA PAGE
// ═══════════════════════════════════════════════════════════
// A tela antiga lia o `localStorage` (200 registros, do navegador de quem
// olhava) enquanto anunciava "histórico de todas as alterações da
// plataforma". Substituída por `src/auditoria/Trilha.jsx`, que lê a trilha
// institucional do banco. `addAuditLog` segue gravando nos dois lugares: o
// registro local ainda guarda o detalhe da ação, que por decisão de LGPD
// não é enviado ao servidor.

// ═══════════════════════════════════════════════════════════
// IMPORTAR
// ═══════════════════════════════════════════════════════════
function ImportPage({ onImport, currentUser }) {
  const [msg, setMsg] = useState("");
  function handleFile(e) {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const lines = ev.target.result.trim().split("\n");
      const db = loadDB(); let ok = 0, errs = 0;
      lines.slice(1).forEach(line => {
        const cols = line.split(",").map(c => c.trim().replace(/"/g, ""));
        if (cols.length < 5) { errs++; return; }
        const [dt, specId, primeiras, retornos, ofertadas, realizadas, livres, emergencias, faltas] = cols;
        if (!dt.match(/^\d{4}-\d{2}-\d{2}$/) || !SPECS.find(s => s.id === specId)) { errs++; return; }
        if (!db[dt]) db[dt] = {};
        db[dt][specId] = { primeiras: +primeiras || 0, retornos: +retornos || 0, ofertadas: +ofertadas || 0, realizadas: +realizadas || 0, livres: +livres || 0, emergencias: +emergencias || 0, faltas: +faltas || 0 };
        ok++;
      });
      saveDB(db);
      addAuditLog(currentUser, "importar CSV", `${ok} registros`, {});
      onImport(db);
      setMsg(`✓ ${ok} registros importados. ${errs > 0 ? `${errs} linhas ignoradas.` : ""}`);
    };
    reader.readAsText(file);
  }
  function downloadTemplate() {
    const rows = ["data,especialidade,primeiras,retornos,ofertadas,realizadas,livres,emergencias,faltas","2025-01-02,cirurgia_geral,5,12,20,17,3,2,1","2025-01-02,oftalmologia,4,10,18,14,4,0,0","2025-01-02,ginecologia,3,9,15,12,3,1,0","2025-01-02,urologia,3,8,14,11,3,0,2","2025-01-02,ortopedia,4,12,20,16,4,1,4"];
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([rows.join("\n")], { type: "text/csv" })); a.download = "modelo_hnsn.csv"; a.click();
  }
  const inp = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" };
  return (
    <div style={{ padding: "1.5rem", overflowY: "auto", height: "100%" }}>
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Importar Dados</div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: "1.5rem" }}>Carregue histórico via CSV</div>
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1.25rem", marginBottom: "1rem" }}>
        <label style={{ display: "flex", flexDirection: "column", alignItems: "center", border: "2px dashed var(--border-2)", borderRadius: 8, padding: "2rem", cursor: "pointer", marginBottom: 12 }}>
          <div style={{ marginBottom: 8, color: "var(--text-3)" }}><Icon name="upload" size={32} /></div>
          <strong>Clique para selecionar</strong>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>CSV com as colunas abaixo</div>
          <input type="file" accept=".csv" onChange={handleFile} style={{ display: "none" }} />
        </label>
        {msg && <div style={{ fontSize: 13, color: msg.startsWith("✓") ? "#34d399" : "#fbbf24", fontWeight: 600, marginBottom: 10 }}>{msg}</div>}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={downloadTemplate} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "7px 16px", fontWeight: 700, cursor: "pointer" }}>Baixar modelo CSV</button>
          <button onClick={() => { if (confirm("Apagar TODOS os dados?")) { localStorage.removeItem(K); onImport({}); addAuditLog(currentUser, "limpar dados", "todos", {}); } }} style={{ background: "transparent", color: "#fb7185", border: "1px solid #3d0f18", borderRadius: 6, padding: "7px 16px", fontWeight: 700, cursor: "pointer" }}>Apagar todos os dados</button>
        </div>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════
// SCIH — Serviço de Controle de Infecção Hospitalar (Fase A)
// ═══════════════════════════════════════════════════════════

// `sugerirGerme` mora em `src/clinico/germes.js` — lá é testável, e a
// comparação passou a tirar acento (aqui usava só `toLowerCase`, e
// "Virus sincicial respiratorio" não achava "Vírus sincicial
// respiratório", que é como o seed grava).

// ═══════════════════════════════════════════════════════════
// FARMÁCIA — Fase A: catálogo + estoque (lote/validade, kardex FEFO)
// ═══════════════════════════════════════════════════════════
// Classes terapêuticas (ordem de exibição no agrupamento)

// Situação de validade de um lote em relação a hoje


// A farmácia clínica (normTxt, alergias, analisarPrescricaoClinica, scores)
// foi extraída para ./clinico/alertas.js — funções puras, com testes.

// ═══════════════════════════════════════════════════════════
// SUPRIMENTOS (Estoque & Compras) — Fase A: catálogo de materiais + estoque
// por lote/validade (kardex imutável) + fornecedores. Mesmo modelo da Farmácia.
// ═══════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════
// PRONTO-SOCORRO — triagem Manchester + jornada do paciente
// ═══════════════════════════════════════════════════════════
// Conteúdo didático do protocolo adaptado — discriminadores e sinais por nível.
// Base: Manchester Triage Group + faixas usadas pelo apoio à decisão do sistema.
// Material de referência/treinamento — a classificação final é sempre da triadora.
// Discriminadores gerais do Manchester — atravessam todos os fluxogramas de queixa







// Saídas (dispensações) já registradas para calcular o quanto de cada item foi entregue
// Prioridade de ordenação da fila (menor = mais urgente)

// Linha compacta dos sinais vitais registrados (fila e Paciente 360)



// ═══════════════════════════════════════════════════════════
// PACIENTE 360 — registro clínico integrado (timeline + evoluções)
// ═══════════════════════════════════════════════════════════
/**
 * Busca de paciente por nome, iniciais, CPF ou Cartão SUS.
 *
 * Antes procurava só nas iniciais — que era tudo o que existia. Com o nome
 * no cadastro, procurar por "J.S.M." deixou de ser o jeito natural: quem
 * está no balcão tem o nome ou o documento na mão, não as iniciais.
 * O número puro continua sendo tratado como prontuário por quem chama.
 */




// ═══════════════════════════════════════════════════════════
// BLOCO CIRÚRGICO — agenda, mapa, workflow do dia e indicadores
// ═══════════════════════════════════════════════════════════







// ── Página Pronto-Socorro: chegada → triagem → atendimento → desfecho ──
// ═══════════════════════════════════════════════════════════
// PRONTO-SOCORRO — Relatório mensal (SOMENTE LEITURA)
// Mesmo padrão do SCIH: visão imprimível + window.print() nativo.
// Sem biblioteca de PDF e sem envio de dado clínico para fora do navegador.
// ═══════════════════════════════════════════════════════════









// ═══════════════════════════════════════════════════════════
// FARMÁCIA — Fase A: catálogo + estoque (lote/validade, kardex)
// ═══════════════════════════════════════════════════════════

/**
 * ⚠️ `podeControlados` NÃO É SELO NO DADO — é controle de quem lê o LIVRO.
 *
 * O Livro de Controlados é uma VISTA de `farm_movimentos` filtrada pelos
 * medicamentos com `controlado = true`. E `farm_movimentos` é legitimamente
 * da farmácia: é o kardex, a dispensação, o estorno. Tirar `farmacia` da
 * política de leitura dessa tabela quebraria o módulo inteiro.
 *
 * Então o que esta permissão restringe é quem PRODUZ E LÊ o documento
 * fiscalizável — que é o controle interno que a Portaria 344/98 pede. Quem
 * tem `farmacia` continua alcançando os movimentos pela API; o que ele não
 * alcança mais é o livro montado, com saldo e balanço por mês.
 *
 * Dizer que a tabela ficou selada seria mentira, e mentira sobre acesso é
 * pior que acesso aberto: o hospital para de olhar.
 */
























// Blindagem: um erro de render em QUALQUER módulo mostra a mensagem na tela (e
// deixa o resto do app funcionando), em vez de derrubar tudo numa tela branca.
// `key={active}` reseta o limite ao trocar de módulo.
class LimiteErro extends Component {
  constructor(props) { super(props); this.state = { erro: null }; }
  static getDerivedStateFromError(erro) { return { erro }; }
  componentDidCatch(erro, info) { console.error("[Valentrax] erro de render no módulo:", erro, info); }
  render() {
    if (this.state.erro) {
      const e = this.state.erro;
      return (
        <div style={{ padding: 24, fontFamily: "Inter, sans-serif", color: "var(--text)", overflow: "auto", height: "100%", boxSizing: "border-box" }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#f43f5e", marginBottom: 8 }}>Este módulo teve um erro ao abrir</div>
          <div style={{ fontSize: 13, color: "var(--text-3)", marginBottom: 12 }}>O resto do sistema continua funcionando — é só trocar de módulo na barra lateral. Se puder, copie o texto abaixo e mande para o suporte.</div>
          <pre style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: 14, fontSize: 12, whiteSpace: "pre-wrap", overflowX: "auto", maxHeight: "55vh", color: "#fca5a5", margin: 0 }}>{String(e && e.message ? e.message : e)}{"\n\n"}{String((e && e.stack) || "").split("\n").slice(0, 14).join("\n")}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}


// ═══════════════════════════════════════════════════════════
// PROTOCOLOS CLÍNICOS GERENCIADOS — Tier 1 · Fase 3a (Sepse)
//
// Linhas de cuidado tempo-dependentes, POR SETOR assistencial (cada setor tem a
// sua instância). Gatilho acende do NEWS; bundle com relógio; KPIs porta→ação.
// Toda a lógica é pura e testável em src/clinico/protocolos.js — aqui só a tela
// e a persistência. Tabelas blindadas (TABELAS_OPCIONAIS) + LimiteErro do router.
// ═══════════════════════════════════════════════════════════



// ═══════════════════════════════════════════════════════════
// SUPRIMENTOS (Estoque & Compras) — página com barra lateral própria (padrão Farmácia)
// ═══════════════════════════════════════════════════════════























// ═══════════════════════════════════════════════════════════
// ADMIN DE USUÁRIOS — só adm_master (via Edge Function admin-usuarios)
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// USUÁRIOS
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// LOGIN
// ═══════════════════════════════════════════════════════════
function LoginScreen({ onLogin, avisoSessao }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError]       = useState("");
  const [shake, setShake]       = useState(false);
  const [loading, setLoading]   = useState(false);
  async function handleLogin() {
    if (loading) return;
    if (!username.trim() || !password) { setError("Preencha usuário e senha."); return; }
    setLoading(true); setError("");
    const r = await signIn(username, password);
    setLoading(false);
    if (r.ok) onLogin(r.user);
    else { setError(r.error); setShake(true); setTimeout(() => setShake(false), 500); }
  }
  const inp = { width: "100%", padding: "11px 14px", borderRadius: 8, border: `1.5px solid #2a4166`, fontSize: 14, outline: "none", fontFamily: "Inter, sans-serif", background: "#0f1b2e", color: "#e9eef5", transition: "border .15s", boxSizing: "border-box" };
  return (
    <div style={{ minHeight: "100vh", background: `radial-gradient(90% 130% at 75% -25%, #1c3356 0%, ${VX.marinho} 60%)`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter, sans-serif" }}>
      <div style={{ background: VX.marinho2, border: `1px solid #2a4166`, borderRadius: 16, padding: "2.5rem 2rem", width: 380, boxShadow: "0 20px 60px rgba(2,8,20,.55)", animation: shake ? "shake .4s ease" : "fadeIn .4s ease" }}>
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <div style={{ margin: "0 auto 12px", width: 58 }}><VxLogo size={58} /></div>
          <VxWordmark size={22} color="#f2f6fb" spacing=".12em" />
          <div style={{ fontSize: 10, color: VX.turquesa, marginTop: 4, letterSpacing: ".2em", fontWeight: 600 }}>HEALTHCARE OPERATIONS</div>
          <div style={{ fontSize: 12, color: "#c6d2e2", marginTop: 8 }}>Inteligência para o fluxo hospitalar.</div>
        </div>
        {avisoSessao && (
          <div style={{ background: "#0e2a33", border: `1px solid ${VX.turquesa}`, borderRadius: 8, padding: "9px 12px", fontSize: 12.5, color: "#bdeee6", marginBottom: 16, lineHeight: 1.45 }}>
            Sua sessão expirou por inatividade. Entre novamente para continuar — nenhum dado foi perdido.
          </div>
        )}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: "#9db1cd", display: "block", marginBottom: 6 }}>USUÁRIO</label>
          <input type="text" value={username} placeholder="Digite seu usuário" onChange={e => { setUsername(e.target.value); setError(""); }} onKeyDown={e => e.key === "Enter" && handleLogin()} onFocus={e => e.target.style.borderColor = VX.turquesa} onBlur={e => e.target.style.borderColor = "#2a4166"} style={inp} autoComplete="username" />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: "#9db1cd", display: "block", marginBottom: 6 }}>SENHA</label>
          <div style={{ position: "relative" }}>
            <input type={showPass ? "text" : "password"} value={password} placeholder="••••••••" onChange={e => { setPassword(e.target.value); setError(""); }} onKeyDown={e => e.key === "Enter" && handleLogin()} onFocus={e => e.target.style.borderColor = VX.turquesa} onBlur={e => e.target.style.borderColor = "#2a4166"} style={{ ...inp, paddingRight: 44 }} autoComplete="current-password" />
            <button onClick={() => setShowPass(p => !p)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "#5b76a0" }}>{showPass ? "🙈" : "👁"}</button>
          </div>
        </div>
        {error && <div style={{ background: "#3d0f18", border: "1px solid #7f1d2e", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: "#fda4af", marginBottom: 14 }}>⚠️ {error}</div>}
        <button onClick={handleLogin} disabled={loading} style={{ width: "100%", padding: "12px", borderRadius: 8, border: "none", background: loading ? "#5b76a0" : `linear-gradient(90deg, ${VX.turquesa}, ${VX.azul})`, color: "#062a35", fontSize: 15, fontWeight: 700, cursor: loading ? "default" : "pointer", fontFamily: "Inter, sans-serif", boxShadow: "0 4px 18px rgba(45,212,191,.3)" }}>{loading ? "Entrando…" : "Entrar"}</button>
        <div style={{ textAlign: "center", marginTop: 20, fontSize: 11, color: "#5b76a0", letterSpacing: ".06em" }}>VALENTRAX HEALTHCARE OPERATIONS</div>
        <div style={{ textAlign: "center", marginTop: 6, fontSize: 12, color: "#7f97b8" }}>Acesso restrito · {HOSPITAL_NOME}</div>
      </div>
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}@keyframes shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-8px)}40%,80%{transform:translateX(8px)}}`}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// APP PRINCIPAL
// ═══════════════════════════════════════════════════════════
// Faixa fixa no topo identificando o ambiente quando NÃO é produção.
// Não é dispensável de propósito: se der para fechar, alguém fecha e volta
// a ficar no escuro — que é exatamente o problema que ela resolve.
// Mostra também a referência do projeto Supabase, para o aviso não depender
// do rótulo estar certo.
function FaixaAmbiente() {
  if (!AMBIENTE) return null;               // produção: nada na tela
  return (
    <div
      role="status"
      style={{
        flexShrink: 0, background: "#b45309", color: "#fff",
        fontSize: 11.5, fontWeight: 700, letterSpacing: ".04em",
        padding: "5px 12px", display: "flex", alignItems: "center",
        justifyContent: "center", gap: 10, textAlign: "center",
      }}
    >
      <span>⚠ {AMBIENTE.toUpperCase()}</span>
      <span style={{ fontWeight: 500, opacity: 0.9 }}>
        banco <code style={{ fontFamily: "JetBrains Mono, monospace" }}>{SUPABASE_REF}</code>
        {" "}— o que você salvar aqui não vai para o hospital
      </span>
    </div>
  );
}

// Faixa de aviso quando o banco recusa uma operação. Fica no topo, não
// bloqueia a tela (diferente de `alert`, que trava tudo e viraria um
// pesadelo se várias gravações falhassem em sequência) e some quando o
// usuário fecha. Mostra a tabela e o motivo devolvido pelo PostgREST,
// para o suporte saber o que aconteceu sem precisar abrir o console.
function AvisoFalhaBanco() {
  const [falhas, setFalhas] = useState([]);
  useEffect(() => assinarFalhasSb(f => {
    setFalhas(prev => {
      // agrupa por tabela+operação para não empilhar 50 avisos iguais
      const chave = `${f.metodo}:${f.alvo}`;
      const achou = prev.find(x => x.chave === chave);
      if (achou) return prev.map(x => x.chave === chave ? { ...x, ...f, chave, vezes: x.vezes + 1 } : x);
      return [...prev, { ...f, chave, vezes: 1 }].slice(-4);
    });
  }), []);

  if (!falhas.length) return null;
  return (
    <div style={{ position: "fixed", top: 8, left: "50%", transform: "translateX(-50%)", zIndex: 9999, display: "flex", flexDirection: "column", gap: 6, maxWidth: 620, width: "calc(100% - 24px)" }}>
      {falhas.map(f => (
        <div key={f.chave} role="alert" style={{ background: "var(--bg-2)", border: `1px solid ${f.escrita ? "#e11d48" : "#d97706"}`, borderLeft: `4px solid ${f.escrita ? "#e11d48" : "#d97706"}`, borderRadius: 8, padding: "10px 12px", boxShadow: "0 6px 24px rgba(0,0,0,.35)", display: "flex", alignItems: "flex-start", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: f.escrita ? "#f43f5e" : "#f59e0b" }}>
              {f.escrita
                ? `Não foi salvo em "${f.alvo}"`
                : `Não foi possível carregar "${f.alvo}"`}
              {f.vezes > 1 && <span style={{ fontWeight: 500, opacity: .7 }}> ({f.vezes}×)</span>}
            </div>
            <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 2, wordBreak: "break-word" }}>
              {f.detalhe || (f.status ? `erro ${f.status}` : "sem conexão com o servidor")}
            </div>
            {f.escrita && (
              <div style={{ fontSize: 11.5, color: "var(--text-2)", marginTop: 4, fontWeight: 600 }}>
                Confira antes de seguir — este registro pode não ter sido gravado.
              </div>
            )}
          </div>
          <button
            onClick={() => setFalhas(prev => prev.filter(x => x.chave !== f.chave))}
            aria-label="Fechar aviso"
            style={{ background: "none", border: "none", color: "var(--text-3)", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: 2 }}
          >×</button>
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const [currentUser, setCurrentUser] = useState(() => loadSession());
  // Sessão expirada de vez (refresh também venceu): mostra UM aviso no login,
  // em vez da enxurrada de "JWT expired" por tabela.
  const [sessaoExpirou, setSessaoExpirou] = useState(false);
  const [db, setDb] = useState(() => loadDB());
  const [active, setActive] = useState("overview");
  const [ambOpen, setAmbOpen] = useState(true);
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem("hnsn_theme") || "dark"; } catch { return "dark"; } });
  useEffect(() => { document.title = `Valentrax · ${HOSPITAL_SIGLA}`; }, []);
  useEffect(() => { document.documentElement.setAttribute("data-theme", theme); try { localStorage.setItem("hnsn_theme", theme); } catch {} }, [theme]);

  // Sessão morreu de vez (refresh expirado): volta ao login com um aviso só.
  useEffect(() => assinarSessaoExpirada(() => {
    setSessaoExpirou(true);
    setCurrentUser(null);
    setActive("overview");
  }), []);

  // Renovação proativa: ao voltar para a aba (ou focar a janela), se o crachá
  // está perto de vencer, renova ANTES de a próxima ação bater no banco. Cobre
  // o caso clássico de deixar a tela aberta o plantão (ou a noite) inteiro.
  useEffect(() => {
    if (!USE_SUPABASE || !currentUser) return;
    const aoVoltar = () => {
      if (document.visibilityState === "hidden") return;
      const s = lerSessao();
      if (s?.expires_at && precisaRenovar(s.expires_at, Date.now())) renovarSessao();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("focus", aoVoltar);
    return () => {
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("focus", aoVoltar);
    };
  }, [currentUser]);
  
  const handleSave = useCallback(newDb => {
    setDb(prev => ({ ...newDb }));
  }, []);

  // O perfil é relido a cada carga do app, não apenas quando falta algum
  // campo. São duas razões:
  //   1. Quem já estava logado quando a categoria profissional passou a
  //      existir tem um usuário salvo sem ela;
  //   2. Quando o administrador reclassifica alguém, a mudança precisa
  //      valer no próximo carregamento — e não só depois de a pessoa sair
  //      e entrar de novo. Papel e categoria decidem o que ela pode
  //      registrar clinicamente; guardar isso indefinidamente no
  //      localStorage é guardar uma permissão vencida.
  // Roda uma vez por carga (depende só do id), então não fica em laço.
  useEffect(() => {
    if (!USE_SUPABASE || !currentUser?.id) return;
    let vivo = true;
    sbFetch(`profiles?id=eq.${currentUser.id}&select=*`).then(rows => {
      const p = Array.isArray(rows) ? rows[0] : null;
      if (!vivo || !p) return;
      setCurrentUser(atual => {
        const novo = {
          ...atual,
          role: p.role || atual.role,
          categoria: p.categoria || "administrativo",
          conselho: p.conselho || null,
          registro_conselho: p.registro_conselho || null,
          uf_conselho: p.uf_conselho || null,
          perfil: p.perfil || null,
          setor: p.setor || null,
        };
        // nada mudou: devolve o mesmo objeto para não re-renderizar à toa
        const igual = ["role", "categoria", "conselho", "registro_conselho", "uf_conselho", "perfil", "setor"]
          .every(k => atual[k] === novo[k]);
        if (igual) return atual;
        try {
          const s = JSON.parse(localStorage.getItem(SESSION_KEY) || "{}");
          saveSession({ ...s, user: novo });
        } catch {}
        return novo;
      });
    }).catch(() => {});
    return () => { vivo = false; };
  }, [currentUser?.id]);

  // ── PERMISSÕES DE MÓDULO ──────────────────────────────────
  // Carrega o perfil da pessoa e as exceções dela. Enquanto não carregar,
  // `permsCarregadas` fica false e o menu mostra tudo — é a escolha certa
  // aqui: perder acesso por meio segundo no meio de um plantão é pior do que
  // ver por meio segundo um módulo que não é seu. A barreira real é o RLS
  // (fase 3), não o menu.
  const [perms, setPerms] = useState(null);
  useEffect(() => {
    if (!USE_SUPABASE || !currentUser?.id) return;
    let vivo = true;
    (async () => {
      const chave = currentUser.perfil;
      // SEM CARGO CONHECIDO, NÃO SE DECIDE NADA.
      //
      // `currentUser` vem da sessão salva, que pode ser anterior ao campo
      // `perfil` existir — e o perfil só chega depois que a consulta a
      // `profiles` responde. Nesse intervalo, calcular permissão com uma
      // lista vazia de grants escondia o sistema INTEIRO: o usuário via só
      // "Usuários" e achava que tinha perdido o acesso.
      //
      // Aconteceu comigo testando, com o cargo correto no banco. Num
      // plantão seria alguém ligando para a TI achando que foi bloqueado.
      // O menu não é a barreira de segurança (a barreira é o RLS), então
      // aqui se falha ABERTO — mostrar um módulo a mais por um instante é
      // menos grave que tirar o sistema de quem está trabalhando.
      if (!chave) { setPerms(null); return; }

      const [gs, exc] = await Promise.all([
        sbFetch(`perfis_permissoes?perfil_chave=eq.${encodeURIComponent(chave)}&select=modulo,nivel`).catch(() => null),
        sbFetch(`usuarios_permissoes?user_id=eq.${currentUser.id}&select=modulo,nivel`).catch(() => null),
      ]);
      if (!vivo) return;
      // Sem tabela de perfis no banco (migração ainda não aplicada), `gs` é
      // null e não `[]` — e as duas coisas significam o oposto uma da outra:
      // null = "não sei", [] = "sei que não tem nada". Tratar null como
      // vazio esconderia o sistema inteiro de todo mundo.
      if (gs == null) { setPerms(null); return; }
      const grants = {};
      for (const g of gs) grants[g.modulo] = g.nivel;
      setPerms(permissoesEfetivas(currentUser, { grants }, exc || []));
    })();
    return () => { vivo = false; };
  }, [currentUser?.id, currentUser?.perfil, currentUser?.role]);

  // ── AVISO DA FILA DE LEITO (NIR) ──────────────────────────
  // Selo de contagem no menu Giro de Leitos, para o NIR não depender de lembrar
  // de abrir o módulo. Busca leve (só id/hora/visto), a cada 60s e ao focar a
  // aba; a cor segue o mesmo corEsperaFila da fila (mais antigo manda).
  const [filaAviso, setFilaAviso] = useState({ n: 0, cor: null, maiorMin: 0 });
  useEffect(() => {
    if (!USE_SUPABASE || !currentUser?.id) return;
    let vivo = true;
    const puxar = async () => {
      const rows = await sbFetch("solicitacoes?status=eq.aguardando&select=id,hora_pedido,visto_em").catch(() => null);
      if (!vivo || !Array.isArray(rows)) return;
      const agora = nowISO();
      const maiorMin = rows.reduce((m, s) => { const d = diffMin(s.hora_pedido, agora); return d != null && d > m ? d : m; }, 0);
      setFilaAviso({ n: rows.length, cor: rows.length ? corEsperaFila(maiorMin).cor : null, maiorMin });
    };
    puxar();
    const iv = setInterval(puxar, 60000);
    const onF = () => puxar();
    window.addEventListener("focus", onF);
    return () => { vivo = false; clearInterval(iv); window.removeEventListener("focus", onF); };
  }, [currentUser?.id]);

  // Se a pessoa estava num módulo que o perfil dela não alcança, a tela
  // ficaria em branco sem explicar nada. Traz de volta para a Visão Geral —
  // ou, se nem essa ela tiver, para Usuários (adm_master) / a primeira que
  // sobrar. Tela em branco faz o usuário achar que o sistema quebrou.
  useEffect(() => {
    if (!perms || active === "users") return;
    const especialidade = SPECS.some(s => s.id === active);
    const alvo = especialidade ? "ambulatorio" : active;
    if (podeVer(perms, alvo)) return;
    const primeiro = ["overview", "ps", "leitos", "paciente", "farmacia", "suprimentos", "ambulatorio", "bloco", "scih"]
      .find(k => podeVer(perms, k));
    setActive(primeiro || (currentUser?.role === "adm_master" ? "users" : "overview"));
  }, [perms, active, currentUser?.role]);

  // Busca os dados no Supabase (fonte compartilhada entre os computadores) e
  // FUNDE com o que já existe localmente — sem apagar nada. O Supabase tem
  // prioridade por (data, especialidade); dados locais que ainda não estão na
  // nuvem são preservados. Se falhar/offline, mantém o localStorage.
  // Roda ao abrir E sempre que a janela volta ao foco (troca de aba/computador),
  // pra ver os números novos sem precisar apertar F5.
  useEffect(() => {
    if (!USE_SUPABASE || !currentUser) return;
    let cancelled = false;
    const syncFromCloud = () => {
      loadFromSupabase(SB()).then(cloud => {
        if (cancelled || !cloud) return;
        const prev = loadDB();
        const merged = { ...prev };
        for (const d in cloud) merged[d] = { ...(merged[d] || {}), ...cloud[d] };
        saveDB(merged);
        setDb(merged);
        // MIGRAÇÃO AUTOMÁTICA: registros que só existem neste aparelho
        // (digitados antes da nuvem, ou salvos offline) sobem para o Supabase.
        const pendentes = [];
        for (const d in merged) {
          for (const s in merged[d]) {
            if (!cloud[d] || !cloud[d][s]) {
              pendentes.push({ data: d, especialidade: s, ...merged[d][s], usuario: "migracao-auto" });
            }
          }
        }
        if (pendentes.length > 0) {
          sbFetch("atendimentos?on_conflict=data,especialidade", {
            method: "POST",
            headers: { "Prefer": "resolution=merge-duplicates" },
            body: JSON.stringify(pendentes),
          });
        }
      });
    };
    syncFromCloud();
    const onFocus = () => syncFromCloud();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [currentUser]);

  // Permissões por nível
  const isMaster    = currentUser?.role === "adm_master";
  const isSilver    = currentUser?.role === "adm_silver";
  const isAnalista  = currentUser?.role === "analista";
  const isReadOnly  = currentUser?.role === "visualizador";

  const canEdit     = isMaster || isSilver || isAnalista === false && !isReadOnly; // silver e acima lançam dados
  const canLaunch   = isMaster || isSilver;   // master e silver lançam dados
  const canPrint    = isMaster || isSilver || isAnalista; // master, silver e analista geram dashboard
  const canImport   = isMaster || isSilver;   // master e silver importam
  const canAudit    = isMaster || isSilver;   // master e silver veem auditoria
  const canUsers    = isMaster;               // só master gerencia usuários

  function handleLogout() { clearSession(); setCurrentUser(null); setActive("overview"); }

  // Os dois avisos valem já na tela de login: o de falha, porque se o banco
  // recusar a autenticação o usuário precisa ver o motivo em vez de um
  // formulário que "não faz nada"; e o de ambiente, para saber em qual banco
  // está ANTES de digitar qualquer coisa.
  if (!currentUser) return (
    <>
      <FaixaAmbiente />
      <AvisoFalhaBanco />
      <LoginScreen avisoSessao={sessaoExpirou} onLogin={u => { setSessaoExpirou(false); setCurrentUser(u); }} />
    </>
  );

  const now = new Date();
  const role = ROLES[currentUser.role];

  // O menu passa a respeitar o perfil de acesso. `perms === null` significa
  // que o banco ainda não tem os perfis (migração não aplicada) ou que a
  // consulta ainda não voltou — nos dois casos mostramos tudo, como antes.
  // Falhar ABERTO aqui é deliberado: o menu não é a barreira de segurança, e
  // esconder módulo por engano trava o trabalho de alguém no plantão.
  const verModulo = (chave, padrao = true) => (perms ? podeVer(perms, chave) : padrao);

  // 🔴 A ORDEM E O AGRUPAMENTO SAEM DE `modulos.js`, não daqui.
  // Antes esta lista era plana, com dois separadores anônimos (`d1`/`d2`) —
  // 17 itens em fila, sem dizer o que se agrupa com o quê. E o campo `grupo`
  // já existia no catálogo desde sempre: quem o consumia era só a matriz de
  // perfis. Quem configura acesso via o sistema organizado; quem trabalha
  // nele, não.
  //
  // Os grupos estão na ordem do TRABALHO: onde o paciente entra, quem vigia
  // o cuidado, o que sustenta a assistência, o que vira dinheiro, e o que só
  // a administração toca. Quem aprende o menu aprende o fluxo do hospital.
  //
  // ⚠️ O grupo "Geral" NÃO ganha cabeçalho: é a home, e um título acima de
  // um item só é ruído. `verModulo` continua decidindo item a item, e um
  // grupo cujos itens todos sumiram não desenha cabeçalho órfão.
  const itensDoMenu = [
    { grupo: "Geral", id: "overview", icon: "dashboard", label: "Centro de Monitoramento", ver: verModulo("overview") },

    { grupo: "Jornada do paciente", id: "atendimento", icon: "door", label: "Atendimento", ver: verModulo("atendimento") },
    { grupo: "Jornada do paciente", id: "ps", icon: "activity", label: "Pronto-Socorro", ver: verModulo("ps") },
    { grupo: "Jornada do paciente", id: "bloco", icon: "scissors", label: "Bloco Cirúrgico", ver: verModulo("bloco") },
    { grupo: "Jornada do paciente", id: "leitos", icon: "bed", label: "Giro de Leitos", ver: verModulo("leitos"), aviso: filaAviso.n ? filaAviso : null },
    { grupo: "Jornada do paciente", id: "paciente", icon: "record", label: "Paciente 360", ver: verModulo("paciente") },

    // Ordenados por TEMPO ATÉ AGIR, não por hierarquia: protocolo tem
    // relógio contando, notificação é do dia, vigilância é de meses.
    { grupo: "Qualidade e vigilância", id: "protocolos", icon: "activity", label: "Protocolos Clínicos", ver: verModulo("protocolos") },
    { grupo: "Qualidade e vigilância", id: "nsp", icon: "clipboard", label: "Segurança do Paciente", ver: verModulo("nsp") },
    { grupo: "Qualidade e vigilância", id: "scih", icon: "shield", label: "SCIH", ver: verModulo("scih") },

    // Farmácia antes: ela consome o catálogo do almoxarifado e toca
    // paciente; o estoque não toca ninguém.
    { grupo: "Farmácia e suprimentos", id: "farmacia", icon: "pill", label: "Farmácia", ver: verModulo("farmacia") },
    { grupo: "Farmácia e suprimentos", id: "suprimentos", icon: "cart", label: "Estoque & Compras", ver: verModulo("suprimentos") },

    { grupo: "Receita e produção", id: "faturamento", icon: "briefcase", label: "Faturamento SUS", ver: verModulo("faturamento") },
    { grupo: "Receita e produção", id: "ambulatorio", icon: "clinic", label: "Ambulatório", ver: verModulo("ambulatorio"), children: SPECS.map(s => ({ id: s.id, label: s.label, color: s.color })) },
    { grupo: "Receita e produção", id: "print", icon: "printer", label: "Imprimir Dashboard", ver: canPrint && verModulo("print") },

    { grupo: "Administração do sistema", id: "auditoria", icon: "clipboard", label: "Auditoria", ver: canAudit && verModulo("auditoria") },
    { grupo: "Administração do sistema", id: "import", icon: "upload", label: "Importar Dados", ver: canImport && verModulo("import") },
    // `users` ignora `verModulo` de propósito — é a porta de volta quando um
    // perfil é configurado errado (ver `modulos.js`, `exigeMaster`).
    { grupo: "Administração do sistema", id: "users", icon: "users", label: "Usuários e Perfis", ver: canUsers },
  ].filter(it => it.ver);

  // Intercala os cabeçalhos, pulando grupo que ficou sem nenhum item.
  const sidebarItems = GRUPOS.flatMap(g => {
    const doGrupo = itensDoMenu.filter(it => it.grupo === g);
    if (!doGrupo.length) return [];
    return g === "Geral" ? doGrupo : [{ grupoTitulo: g }, ...doGrupo];
  });
  const currentSpec = SPECS.find(s => s.id === active);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--bg)", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 14 }}>
      <FaixaAmbiente />
      <AvisoFalhaBanco />
      {/* HEADER */}
      <div style={{ background: "var(--bg-2)", borderBottom: "1px solid var(--border)", height: 52, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 1.5rem", flexShrink: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <VxLogo size={30} />
          <div>
            <VxWordmark size={14} />
            <div style={{ fontSize: 8.5, color: VX.turquesa, letterSpacing: ".18em", fontWeight: 600 }}>HEALTHCARE OPERATIONS</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontSize: 11, color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 20, padding: "3px 11px", whiteSpace: "nowrap" }}>{HOSPITAL_NOME}</span>
          <div style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "JetBrains Mono, monospace" }}>{now.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}</div>
          <button onClick={() => setTheme(t => t === "dark" ? "light" : "dark")} title="Alternar tema claro/escuro" style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 9px", color: "var(--text-3)", cursor: "pointer", fontSize: 14, lineHeight: 1 }}>{theme === "dark" ? "☀️" : "🌙"}</button>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{currentUser.name}</div>
              <div style={{ fontSize: 10, color: role.color, fontWeight: 700 }}>{role.label}</div>
            </div>
            <div style={{ width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: role.color, background: role.color + "22", border: `1px solid ${role.color}44` }}>
              {(currentUser.name || "?").charAt(0).toUpperCase()}
            </div>
            <button onClick={handleLogout} style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 6, padding: "5px 10px", color: "var(--text-muted)", cursor: "pointer", fontSize: 12, fontFamily: "Inter, sans-serif" }}
              onMouseOver={e => { e.currentTarget.style.borderColor = "#fb7185"; e.currentTarget.style.color = "#fb7185"; }}
              onMouseOut={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-muted)"; }}>
              Sair
            </button>
          </div>
        </div>
      </div>

      {/* ALERTAS */}
      <AlertBanner db={db} />
      <NotificacaoRapida sb={SB()} currentUser={currentUser} />

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* SIDEBAR */}
        <nav style={{ width: 215, minWidth: 215, background: "var(--bg-2)", borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", padding: ".75rem 0", overflowY: "auto", flexShrink: 0 }}>
          {isReadOnly && <div style={{ margin: "0 10px 8px", background: "var(--surface-3)", border: "1px solid var(--border-2)", borderRadius: 6, padding: "6px 10px", fontSize: 11, color: "var(--text-muted)", textAlign: "center" }}>Somente visualização</div>}
          {sidebarItems.map((item, i) => {
            // Cabeçalho de grupo. Substituiu os separadores anônimos: a linha
            // dizia "aqui muda alguma coisa" e não dizia o quê.
            if (item.grupoTitulo) return (
              <div key={item.grupoTitulo} style={{ padding: "16px 1rem 5px", fontSize: 10, fontWeight: 700, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--text-muted)" }}>
                {item.grupoTitulo}
              </div>
            );

            // Grupo expansível (ex.: Ambulatório → especialidades)
            if (item.children) {
              const childActive = item.children.some(c => c.id === active);
              return (
                <div key={item.id}>
                  <button onClick={() => setAmbOpen(o => !o)} style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", padding: ".5rem 1rem", border: "none", borderLeft: `3px solid ${childActive ? "#22d3ee" : "transparent"}`, color: childActive ? "#22d3ee" : "var(--text-2)", cursor: "pointer", textAlign: "left", fontSize: 13, fontWeight: 600, fontFamily: "Inter, sans-serif", background: childActive ? "var(--surface)" : "transparent" }}>
                    <Icon name={item.icon} />{item.label}
                    <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--text-muted)" }}>{ambOpen ? "▾" : "▸"}</span>
                  </button>
                  {ambOpen && item.children.map(c => {
                    const isActive = active === c.id;
                    return (
                      <button key={c.id} onClick={() => setActive(c.id)} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: ".4rem 1rem .4rem 2.4rem", border: "none", borderLeft: `3px solid ${isActive ? (c.color || "#22d3ee") : "transparent"}`, color: isActive ? (c.color || "#22d3ee") : "var(--text-3)", cursor: "pointer", textAlign: "left", fontSize: 12.5, fontWeight: 500, fontFamily: "Inter, sans-serif", background: isActive ? "var(--surface)" : "transparent" }}>
                        <span style={{ width: 7, height: 7, borderRadius: 99, background: c.color || "var(--text-muted)", flexShrink: 0 }} />{c.label}
                      </button>
                    );
                  })}
                </div>
              );
            }

            const isActive = active === item.id;
            return (
              <button key={item.id} onClick={() => setActive(item.id)} style={{ display: "flex", alignItems: "center", gap: 9, padding: ".5rem 1rem", border: "none", borderLeft: `3px solid ${isActive ? (item.color || "#22d3ee") : "transparent"}`, color: isActive ? (item.color || "#22d3ee") : "var(--text-3)", cursor: "pointer", textAlign: "left", fontSize: 13, fontWeight: 500, fontFamily: "Inter, sans-serif", transition: "all .12s", background: isActive ? "var(--surface)" : "transparent" }}>
                <Icon name={item.icon} />{item.label}
                {item.aviso && <span title={`${item.aviso.n} aguardando leito${item.aviso.maiorMin ? ` · mais antigo há ${fmtDur(item.aviso.maiorMin)}` : ""}`} style={{ marginLeft: "auto", fontSize: 10.5, fontWeight: 800, fontFamily: "JetBrains Mono, monospace", color: "#fff", background: item.aviso.cor || "var(--text-muted)", borderRadius: 99, minWidth: 18, textAlign: "center", padding: "0 6px", lineHeight: "17px" }}>{item.aviso.n}</span>}
              </button>
            );
          })}
        </nav>

        {/* CONTENT */}
        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <LimiteErro key={active}>
          {active === "overview"  && <Overview db={db} currentUser={currentUser} canEdit={canLaunch} perms={perms} onNav={setActive} />}
          {currentSpec            && <EspecialidadePage spec={currentSpec} db={db} onSave={handleSave} readOnly={!canLaunch} currentUser={currentUser} />}
          {active === "atendimento" && <Atendimento sb={sbFetch} currentUser={currentUser} canEdit={canLaunch} />}
          {active === "ps"        && <PSPage sb={SB()} sbCru={SB_CRU()} currentUser={currentUser} canEdit={canLaunch} />}
          {active === "bloco"     && <BlocoPage sb={SB()} currentUser={currentUser} canEdit={canLaunch} />}
          {active === "leitos"    && <LeitosPage sb={SB()} currentUser={currentUser} canEdit={canLaunch} />}
          {active === "scih"      && <ScihPage sb={SB()} currentUser={currentUser} canEdit={canLaunch} />}
          {active === "nsp"       && <NSPPage sb={SB()} currentUser={currentUser} canEdit={canLaunch} />}
          {active === "protocolos" && <ProtocolosPage sb={SB()} currentUser={currentUser} canEdit={canLaunch} />}
          {/* 🔴 `false` COMO PADRÃO — e é o único lugar do menu onde isso vale.
              `verModulo` falha ABERTO de propósito (ver o comentário na
              montagem da barra): esconder módulo por engano trava alguém no
              plantão, e a barreira de verdade é o RLS. O Livro de Controlados
              é a exceção: é documento fiscalizável (Portaria 344/98), não é
              trabalho de beira de leito, e ninguém para de atender porque o
              livro demorou a aparecer. Aqui o custo de abrir por engano é
              maior que o de fechar por engano — então falha FECHADO. */}
          {active === "farmacia"  && <FarmaciaPage sb={SB()} sbCru={SB_CRU()} currentUser={currentUser} canEdit={canLaunch} podeControlados={verModulo("controlados", false)} />}
          {active === "suprimentos" && <SuprimentosPage sb={SB()} sbCru={SB_CRU()} currentUser={currentUser} canEdit={canLaunch} />}
          {active === "faturamento" && <FaturamentoPage sb={sbFetch} currentUser={currentUser} canEdit={canLaunch} />}
          {active === "paciente"  && <PacientePage sb={SB()} currentUser={currentUser} canEdit={canLaunch} />}
          {active === "print"     && canPrint    && <PrintDashboard db={db} />}
          {active === "auditoria" && canAudit    && <TrilhaAuditoria sb={sbFetch} />}
          {active === "import"    && canImport   && <ImportPage onImport={newDb => setDb({ ...newDb })} currentUser={currentUser} />}
          {active === "users"     && canUsers    && <UsersPage sb={SB()} adminUsuarios={adminUsuarios} trocarSenha={changeMyPassword} currentUser={currentUser} />}
          </LimiteErro>
        </div>
      </div>
    </div>
  );
}
