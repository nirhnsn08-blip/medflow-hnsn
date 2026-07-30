// ═══════════════════════════════════════════════════════════
// PRODUÇÃO DO AMBULATÓRIO — fechar o laço com a tabela `atendimentos`
//
// O PROBLEMA
// O painel do Ambulatório lê a tabela agregada `atendimentos` (uma linha
// por dia e especialidade: ofertadas, realizadas, primeiras, retornos,
// faltas, livres, emergências). Esses números são DIGITADOS À MÃO, num
// formulário, por alguém que olhou a agenda.
//
// Desde que a agenda existe, o mesmo número tem duas fontes: o que foi
// digitado e o que aconteceu. Duas fontes para o mesmo número é pior do que
// uma fonte ruim — com uma, todo mundo sabe onde olhar; com duas, cada tela
// conta uma história e a discussão vira sobre qual acreditar.
//
// A DECISÃO: CONCILIAR, NÃO SOBRESCREVER SOZINHO.
// Este arquivo apura o número real e o compara com o gravado. Quem grava é
// uma pessoa, clicando, vendo a diferença. Não há job, não há gatilho no
// banco. Duas razões:
//   1. A agenda ainda não é a única porta — o ambulatório recebe paciente
//      que nunca passou por uma vaga, e sobrescrever apagaria o registro
//      manual de quem sabia disso.
//   2. Migração que DEDUZ dado já causou estrago neste sistema: a sequência
//      do prontuário ancorou num número que um backfill tinha acabado de
//      inventar. Dado apurado alimenta DECISÃO de gente; não se promove
//      sozinho a verdade.
//
// O QUE ESTE ARQUIVO SE RECUSA A APURAR: `emergencias`. Emergência não
// passa pela agenda do ambulatório — vem do Pronto-Socorro, e a coluna é
// por especialidade, coisa que o PS não registra. Chutar zero apagaria o
// que alguém digitou sabendo. O valor gravado é preservado intacto.
// ═══════════════════════════════════════════════════════════

import { producaoDoDia, gradesDoDia, bloqueioDoDia } from "./agenda.js";
import { ESPECIALIDADE_POR_ID, idDaEspecialidade } from "../ambulatorio/especialidades.js";

/** As colunas numéricas da tabela agregada `atendimentos`. */
export const CAMPOS_PRODUCAO = [
  "ofertadas", "realizadas", "primeiras", "retornos", "faltas", "livres", "emergencias",
];

/**
 * O que a agenda sabe apurar.
 *
 * `emergencias` fica de fora de propósito — ver o cabeçalho. Esta lista é o
 * que separa "o sistema calculou" de "alguém digitou", e é ela que decide o
 * que a conciliação tem direito de sobrescrever.
 */
export const CAMPOS_APURAVEIS = [
  "ofertadas", "realizadas", "primeiras", "retornos", "faltas", "livres",
];

const num = v => {
  const n = Number(v);
  // `Number(undefined)` é NaN, e NaN somado a um total contamina a linha
  // inteira sem erro nenhum. Já aconteceu no cálculo do NEWS.
  return Number.isFinite(n) ? n : 0;
};

/**
 * Os códigos de especialidade que aparecem neste dia — pela grade ou por um
 * agendamento avulso.
 *
 * O agendamento entra na conta porque grade desligada depois de o dia
 * acontecer faria a produção daquele dia desaparecer da conciliação.
 */
export function especialidadesDoDia({ grades = [], agendamentos = [], data } = {}) {
  const dia = String(data ?? "").slice(0, 10);
  const codigos = new Set();
  for (const g of gradesDoDia(grades, dia)) {
    if (g.especialidade_cod) codigos.add(g.especialidade_cod);
  }
  for (const a of agendamentos) {
    if (String(a.data ?? "").slice(0, 10) === dia && a.especialidade_cod) codigos.add(a.especialidade_cod);
  }
  return [...codigos].sort();
}

/** A produção apurada de UMA especialidade — `producaoDoDia` com o recorte. */
export function producaoDaEspecialidade({ grades = [], agendamentos = [], bloqueios = [], data, especialidadeCod } = {}) {
  return producaoDoDia({
    grades: grades.filter(g => g.especialidade_cod === especialidadeCod),
    agendamentos: agendamentos.filter(a => a.especialidade_cod === especialidadeCod),
    bloqueios, data,
  });
}

/**
 * A conciliação do dia: o que a agenda apurou × o que está gravado.
 *
 * `linhas` traz uma entrada por especialidade DA AGENDA. `orfas` traz o
 * contrário: linha gravada à mão para uma especialidade que não teve grade
 * nem agendamento no dia. Ela NÃO é zerada — pode ser produção legítima que
 * não passou pela agenda, e apagar seria destruir o único registro que
 * existe. Aparece para alguém decidir.
 *
 * `semCorrespondencia` é o caso que mais merece atenção: especialidade
 * cadastrada no catálogo da agenda que não é nenhuma das cinco do painel.
 * A produção dela não tem onde ser gravada — e é melhor dizer isso na tela
 * do que gravar numa chave que nenhuma consulta lê.
 */
export function conciliarProducao({
  grades = [], agendamentos = [], bloqueios = [], data, gravado = [], catalogoEspecialidades = [],
} = {}) {
  const dia = String(data ?? "").slice(0, 10);
  const nomeDe = cod => (catalogoEspecialidades || []).find(e => e.codigo === cod)?.nome || null;
  const gravadoDe = id => (gravado || []).find(g =>
    String(g.data ?? "").slice(0, 10) === dia && g.especialidade === id) || null;

  const linhas = [];
  const semCorrespondencia = [];

  for (const cod of especialidadesDoDia({ grades, agendamentos, data: dia })) {
    const nome = nomeDe(cod);
    const id = idDaEspecialidade(cod, nome);
    const apurada = producaoDaEspecialidade({ grades, agendamentos, bloqueios, data: dia, especialidadeCod: cod });

    if (!id) {
      semCorrespondencia.push({ especialidadeCod: cod, nome: nome || cod, apurada });
      continue;
    }

    const gr = gravadoDe(id);
    const divergencias = CAMPOS_APURAVEIS
      .map(c => ({ campo: c, apurado: num(apurada[c]), gravado: gr ? num(gr[c]) : null }))
      .filter(d => d.gravado !== null && d.gravado !== d.apurado);

    linhas.push({
      especialidadeCod: cod,
      id,
      label: ESPECIALIDADE_POR_ID[id]?.label || id,
      apurada,
      gravada: gr,
      divergencias,
      // Nunca gravado ainda conta como divergente: o número existe e não
      // está no painel, que é a mesma consequência prática.
      divergente: !gr || divergencias.length > 0,
      bloqueado: !!bloqueioDoDia(bloqueios, dia, { especialidade: cod }),
    });
  }

  const idsDaAgenda = new Set(linhas.map(l => l.id));
  const orfas = (gravado || [])
    .filter(g => String(g.data ?? "").slice(0, 10) === dia && !idsDaAgenda.has(g.especialidade))
    .filter(g => CAMPOS_PRODUCAO.some(c => num(g[c]) > 0))
    .map(g => ({
      id: g.especialidade,
      label: ESPECIALIDADE_POR_ID[g.especialidade]?.label || g.especialidade,
      gravada: g,
    }));

  return {
    data: dia,
    linhas,
    orfas,
    semCorrespondencia,
    divergentes: linhas.filter(l => l.divergente).length,
  };
}

/**
 * O corpo a gravar em `atendimentos`.
 *
 * Devolve exatamente as colunas que existem — é o mesmo contrato das outras
 * escritas do módulo, conferido por `contrato-banco.test.js` contra a
 * auditoria. Foi assim que se parou de descobrir coluna inexistente pelo
 * INSERT que o PostgREST recusa em silêncio.
 *
 * `emergencias` vem do que JÁ ESTÁ GRAVADO, e nunca da apuração: o upsert
 * substitui a linha inteira, então omitir o campo zeraria o número que
 * alguém digitou olhando o Pronto-Socorro.
 */
export function camposDaProducao({ data, especialidadeId, apurada = {}, gravadaAnterior = null } = {}) {
  const corpo = {
    data: String(data ?? "").slice(0, 10),
    especialidade: especialidadeId,
    emergencias: num(gravadaAnterior?.emergencias),
  };
  for (const c of CAMPOS_APURAVEIS) corpo[c] = num(apurada[c]);
  return corpo;
}

/**
 * Pode gravar esta linha?
 *
 * Recusa o que não tem chave de destino e o que não mudou — gravar de novo
 * o que já está igual só polui o `updated_at` e faz a auditoria mostrar
 * atividade onde não houve nenhuma.
 */
export function validarGravacao(linha) {
  const erros = [];
  if (!linha?.id) erros.push("Esta especialidade da agenda não corresponde a nenhuma do painel do Ambulatório.");
  if (!linha?.especialidadeCod) erros.push("Linha sem especialidade.");
  if (linha?.id && !linha.divergente) erros.push("O número gravado já é igual ao apurado.");
  return { ok: erros.length === 0, erros };
}
