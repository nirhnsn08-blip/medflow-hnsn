// ═══════════════════════════════════════════════════════════
// TORRE DE COMANDO — acesso a dados
//
// Onze leituras, de nove módulos diferentes. É a tela que mais lê do sistema
// inteiro, e por isso é também a que mais tem a perder com o falso-vazio:
// aqui uma recusa de banco não deixa um card estranho, deixa a direção
// achando que está tudo certo.
//
// ── O CONTRATO DESTA CAMADA ─────────────────────────────────
// Cada bloco devolve `{ lista, lido }`. O `lido` viaja até o card, e o motor
// (torre.js) transforma `lido:false` em medida SEM VALOR. Nenhuma leitura
// falha vira zero em lugar nenhum do caminho.
//
// ⚠️ TUDO EM PARALELO, NADA EM CASCATA. São leituras independentes: em série
// a tela levaria onze viagens para abrir. E uma que falhe não pode derrubar
// as outras dez — por isso cada `sb` tem seu `.catch`.
//
// ⚠️ JANELAS CURTAS DE PROPÓSITO. O painel é do AGORA: cirurgia e agenda são
// do dia, saídas de leito são dos últimos 90 dias (que é o que sustenta
// permanência e giro). Ler o histórico inteiro para mostrar o dia de hoje
// seria caro e não mudaria um número na tela.
// ═══════════════════════════════════════════════════════════

import { listaLida, naoDeuParaLer } from "../util/leitura.js";
import { diaDe } from "./torre.js";

/** `{ lista, lido }` a partir do que o `sb` devolveu. */
function lida(r) {
  const lista = listaLida(r);
  return { lista, lido: !naoDeuParaLer(lista) };
}

/** A data de N dias atrás, no formato do banco. */
export function diasAtras(n, hoje = new Date()) {
  const d = new Date(hoje);
  d.setDate(d.getDate() - n);
  return diaDe(d);
}

/**
 * Tudo o que a Torre precisa, numa viagem só (em paralelo).
 *
 * Devolve um objeto com um bloco por fonte, cada um com seu `lido`. Quem
 * monta os cards é a tela, chamando o motor — esta camada não interpreta
 * nada, só busca e marca o que não veio.
 */
export async function carregarTorre(sb, { hoje = new Date(), janelaDias = 90 } = {}) {
  const dia = diaDe(hoje);
  const desde = diasAtras(janelaDias, hoje);

  if (!sb) {
    const cego = { lista: [], lido: false };
    return {
      dia, desde, semConexao: true,
      leitos: cego, setores: cego, saidas: cego, ps: cego,
      cirurgias: cego, grades: cego, agendamentos: cego,
      supItens: cego, supLotes: cego, farmItens: cego, farmLotes: cego,
    };
  }

  const [
    leitosR, setoresR, saidasR, psR,
    cirurgiasR, gradesR, agendamentosR,
    supItensR, supLotesR, farmItensR, farmLotesR,
  ] = await Promise.all([
    sb("leitos?select=identificacao,status,setor,prontuario,iniciais,data_internacao,isolamento&limit=2000").catch(() => null),
    sb("setores?select=nome,ordem,alerta_amarelo,alerta_vermelho,meta_ocupacao,meta_giro,meta_permanencia&order=ordem&limit=200").catch(() => null),
    sb(`leitos_saidas?data_alta=gte.${desde}&select=data_alta,dias_permanencia,setor,leito,prontuario,desfecho&order=data_alta.desc&limit=5000`).catch(() => null),
    // O PS do dia + tudo que ainda está aberto: a fila de agora não cabe
    // num recorte de data, porque quem chegou ontem à noite e não foi
    // atendido é exatamente o caso que o painel precisa mostrar.
    sb(`ps_atendimentos?or=(chegada_em.gte.${desde},status.neq.finalizado)` +
       "&select=id,chegada_em,triagem_em,atendimento_em,desfecho_em,cancelado_em,status,classificacao,origem,origem_detalhe" +
       "&order=chegada_em.desc&limit=3000").catch(() => null),
    sb(`cc_cirurgias?data=eq.${dia}&select=id,data,status,iniciais,prontuario,procedimento,sala,cirurgiao,hora_prevista,cancelamento_motivo&limit=500`).catch(() => null),
    sb("ag_grades?select=id,dia_semana,especialidade_cod,profissional_username,vagas_chegada,vagas_internas,vagas_regulacao,vigencia_inicio,vigencia_fim,ativo&limit=1000").catch(() => null),
    sb(`ag_agendamentos?data=eq.${dia}&select=id,data,hora,status,especialidade_cod,profissional_username,prontuario,cancelado_motivo&limit=2000`).catch(() => null),
    sb("sup_itens?select=id,nome,unidade,estoque_minimo,categoria,ativo&limit=3000").catch(() => null),
    sb("sup_lotes?select=item_id,quantidade,validade&limit=8000").catch(() => null),
    sb("farm_medicamentos?select=id,nome,unidade,estoque_minimo,ativo&limit=3000").catch(() => null),
    sb("farm_lotes?select=medicamento_id,quantidade,validade&limit=8000").catch(() => null),
  ]);

  return {
    dia, desde, semConexao: false,
    leitos: lida(leitosR),
    setores: lida(setoresR),
    saidas: lida(saidasR),
    ps: lida(psR),
    cirurgias: lida(cirurgiasR),
    grades: lida(gradesR),
    agendamentos: lida(agendamentosR),
    supItens: lida(supItensR),
    supLotes: lida(supLotesR),
    farmItens: lida(farmItensR),
    farmLotes: lida(farmLotesR),
  };
}
