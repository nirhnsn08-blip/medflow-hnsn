// ═══════════════════════════════════════════════════════════
// AGENDA DO AMBULATÓRIO — o painel do dia e a grade
//
// DUAS TELAS, DOIS TRABALHOS
//   Dia   — a recepção, todo dia: quem chegou, quem faltou, quem entra na
//           fila. É onde o atendimento nasce.
//   Grade — o gestor, algumas vezes por ano: quantas vagas a especialidade
//           oferece e como elas se dividem entre regulação, marcação
//           interna e ordem de chegada.
//
// A DIFERENÇA QUE A TELA TEM QUE DEIXAR ÓBVIA
// Marcar e transcrever não são o mesmo botão. "Marcar" é o hospital
// decidindo (retorno, convênio, particular). "Registrar da regulação" é a
// recepção copiando o que a central decidiu — e por isso exige o protocolo
// do papel que o paciente trouxe. Um botão só para as duas coisas seria a
// porta para ocupar cota da regulação com paciente do hospital.
//
// As regras estão em `agenda.js` (puras, testadas). Aqui só há tela.
// ═══════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from "react";
import { comoExibir } from "../pacientes/identidade.js";
import {
  ORIGENS_MARCACAO, STATUS_AGENDAMENTO, gradesDoDia, vagasDoDia, horariosLivres,
  validarGrade, podeMarcar, podeRegistrarDaRegulacao, producaoDoDia, bloqueioDoDia,
  agendamentosAtingidos, MOTIVOS_DE_FALTA, validarFalta,
  MOTIVOS_DE_REMARCACAO, validarRemarcacao, cadeiaDeRemarcacao, esperaDesdeAOrigem,
  horariosDaGrade, cotasSomadas, donoDaVaga,
} from "./agenda.js";
import {
  DESFECHOS_AMBULATORIAL, validarEncerramento, STATUS_ATENDIMENTO,
  filaDoAmbulatorio, validarChamada,
} from "./ciclo.js";
import {
  listarAmbulatoriaisAbertos, encerrarAtendimento,
  carregarGrades, salvarGrade, alternarAtivoGrade, carregarBloqueios, salvarBloqueio,
  carregarAgendaDoDia, marcarAgendamento, registrarFalta, remarcarAgendamento,
  carregarAncestraisDeRemarcacao,
  cancelarAgendamento, vincularPacienteAoAgendamento, carregarCatalogos,
  carregarProfissionais, buscarPacientes, carregarPaciente,
  carregarProducaoGravada, gravarProducao, carregarAgendamentosDoPeriodo,
  chamarParaAtendimento, confirmarAgendamento,
} from "./dados.js";
import ChegadaAmbulatorial from "./ChegadaAmbulatorial.jsx";
import Impressos from "./Impressos.jsx";
import { rotuloDominio } from "./impressos.js";
import { CATEGORIAS_SEM_CAMPO } from "./prioridade.js";
import PainelChamada from "./PainelChamada.jsx";
import ResponsavelDoEpisodio from "./Responsavel.jsx";
import { conciliarProducao, validarGravacao, CAMPOS_APURAVEIS } from "./producao.js";
import RelatorioAmbulatorio from "./RelatorioAmbulatorio.jsx";

const cartao = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1.1rem 1.25rem", marginBottom: 14 };
const rotulo = { fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 };
const inp = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" };
const lbl = { fontSize: 10.5, color: "var(--text-muted)", display: "block", marginBottom: 3 };
const btn = (cor, ativo = true) => ({
  background: ativo ? cor : "var(--surface-2)", color: ativo ? "#000" : "var(--text-muted)",
  border: ativo ? "none" : "1px solid var(--border)", borderRadius: 6, padding: "7px 13px",
  fontWeight: 700, cursor: ativo ? "pointer" : "not-allowed", fontSize: 12, whiteSpace: "nowrap",
});

const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const hojeISO = () => {
  // Data local, não UTC: `toISOString()` num fim de tarde no Brasil devolve
  // o dia seguinte, e a agenda abriria no dia errado.
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const CORES_ORIGEM = { regulacao: "#6366f1", interna: "#0d9488", chegada: "#d97706" };

export default function Agenda({ sb, currentUser, canEdit }) {
  const [vista, setVista] = useState("dia");
  const [data, setData] = useState(hojeISO());

  const [grades, setGrades] = useState([]);
  const [bloqueios, setBloqueios] = useState([]);
  const [agendamentos, setAgendamentos] = useState([]);
  const [catalogos, setCatalogos] = useState({});
  const [profissionais, setProfissionais] = useState([]);

  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [carregando, setCarregando] = useState(true);

  // formulários
  const [nova, setNova] = useState(null);        // grade em edição
  const [bloq, setBloq] = useState(null);        // bloqueio em edição
  const [marcando, setMarcando] = useState(null); // { grade, origem }
  // A REMARCAÇÃO ATRAVESSA A TROCA DE DIA, e é por isso que ela é um estado
  // separado de `marcando`. Remarcar quase sempre é mandar o paciente para
  // OUTRA data — se o vínculo morresse ao mudar o dia, a recepcionista
  // marcaria a vaga nova solta e a corrente se perderia de novo, que é
  // exatamente o defeito que isto conserta.
  const [remarcando, setRemarcando] = useState(null); // { original, motivo }
  // Os elos ANTERIORES das remarcações do dia. Estado separado de propósito:
  // são agendamentos de OUTRAS datas, e misturá-los em `agendamentos` faria
  // `vagasDoDia` e a contagem de livres enxergarem vagas que não são deste
  // dia. Só a reconstrução da corrente os enxerga.
  const [ancestrais, setAncestrais] = useState([]);
  // O painel da sala de espera é TELA CHEIA, não uma aba: ele cobre a
  // interface inteira porque a máquina fica ligada nele o dia todo, virada
  // para a sala. Sair é ato deliberado de quem opera.
  const [painel, setPainel] = useState(false);
  const [buscaPac, setBuscaPac] = useState("");
  const [achados, setAchados] = useState([]);
  const [ambAbertos, setAmbAbertos] = useState([]);
  const [verAbertos, setVerAbertos] = useState(false);
  // A chegada em andamento: { agendamento, paciente, ficha, medico }.
  const [presenca, setPresenca] = useState(null);
  // Depois de confirmada: { paciente, atendimento } — a etapa de responsável
  // e impressos, a mesma que a Recepção faz.
  const [imprimindo, setImprimindo] = useState(null);
  // O comprovante que o paciente leva do balcão. Estado próprio e não
  // `imprimindo`: lá existe atendimento, aqui só existe agendamento, e um
  // objeto que às vezes tem uma coisa e às vezes outra vira `?.` em toda
  // linha que o lê.
  const [comprovante, setComprovante] = useState(null);
  const [responsaveis, setResponsaveis] = useState([]);
  const [producaoGravada, setProducaoGravada] = useState([]);

  const recarregarDia = useCallback(async () => {
    setCarregando(true);
    const [g, b, a, p] = await Promise.all([
      carregarGrades(sb),
      carregarBloqueios(sb, { de: data, ate: data }),
      carregarAgendaDoDia(sb, data),
      carregarProducaoGravada(sb, data),
    ]);
    setGrades(g); setBloqueios(b); setAgendamentos(a); setProducaoGravada(p);
    // Os elos anteriores vêm DEPOIS e só se houver remarcação no dia: é uma
    // consulta a mais numa tela de balcão, e a esmagadora maioria dos dias
    // não tem nenhuma remarcação para reconstruir.
    setAncestrais(a.some(x => x?.remarcado_de != null)
      ? await carregarAncestraisDeRemarcacao(sb, a) : []);
    setAmbAbertos(await listarAmbulatoriaisAbertos(sb));
    setCarregando(false);
  }, [sb, data]);

  /**
   * Encerra um ambulatorial que ficou preso aberto.
   *
   * O desfecho é PERGUNTADO, nunca deduzido. Encerrar em massa como
   * "atendido" escolheria um dado assistencial que ninguém conferiu — e
   * quem sabe se o paciente foi atendido ou desistiu é quem estava lá.
   */
  async function encerrar(a) {
    if (!canEdit) return;
    const opcoes = DESFECHOS_AMBULATORIAL.map((d, i) => `${i + 1} - ${d.label}`).join("\n");
    const escolha = prompt(`Como terminou o atendimento #${a.id} (reg. ${a.prontuario})?\n\n${opcoes}\n\nDigite o número:`);
    if (escolha === null) return;
    const d = DESFECHOS_AMBULATORIAL[Number(escolha) - 1];
    const v = validarEncerramento({ atendimento: a, desfecho: d?.chave });
    if (!v.ok) { setMsg({ tom: "erro", texto: v.erros.join(" ") }); return; }
    setBusy(true);
    const r = await encerrarAtendimento(sb, a.id, d.chave, null, currentUser);
    setBusy(false);
    if (!r.ok) { setMsg({ tom: "erro", texto: r.motivo }); return; }
    setMsg({ tom: "ok", texto: `Atendimento #${a.id} encerrado como "${d.label}".` });
    recarregarDia();
  }

  useEffect(() => { recarregarDia(); }, [recarregarDia]);

  useEffect(() => {
    Promise.all([carregarCatalogos(sb), carregarProfissionais(sb)])
      .then(([c, p]) => { setCatalogos(c); setProfissionais(p); });
  }, [sb]);

  // A fila sai dos ambulatoriais em aberto, que a tela já carrega para o
  // card de pendência de encerramento — o mesmo dado, com um uso a mais.
  const fila = filaDoAmbulatorio(ambAbertos);

  const aplicaveis = gradesDoDia(grades, data);
  const producao = producaoDoDia({ grades, data, agendamentos, bloqueios, tiposDeAtendimento: catalogos.tipo_atendimento });
  const bloqueioGeral = bloqueioDoDia(bloqueios, data, {});
  const conciliacao = conciliarProducao({
    grades, agendamentos, bloqueios, data,
    gravado: producaoGravada, catalogoEspecialidades: catalogos.especialidade || [],
  });

  /**
   * Grava a produção apurada de uma especialidade na agregada.
   *
   * Uma linha por clique, de propósito. "Gravar tudo" pareceria mais
   * prático e faria alguém substituir sete números sem olhar nenhum — que é
   * exatamente a diferença entre conciliar e sobrescrever.
   */
  async function gravarLinha(linha) {
    if (!canEdit || busy) return;
    const v = validarGravacao(linha);
    if (!v.ok) { setMsg({ tom: "erro", texto: v.erros.join(" ") }); return; }
    setBusy(true);
    const r = await gravarProducao(sb, {
      data, especialidadeId: linha.id,
      apurada: linha.apurada, gravadaAnterior: linha.gravada,
    }, currentUser);
    setBusy(false);
    if (!r.ok) { setMsg({ tom: "erro", texto: r.motivo }); return; }
    setMsg({ tom: "ok", texto: `Produção de ${linha.label} gravada no painel do Ambulatório.` });
    setProducaoGravada(await carregarProducaoGravada(sb, data));
  }

  // ── ações ──
  async function marcar() {
    if (!canEdit || busy || !marcando) return;
    const { grade, origem, hora, prontuario, protocolo, tipo, observacao, paciente } = marcando;
    const v = origem === "regulacao"
      ? podeRegistrarDaRegulacao({ grade, data, hora, protocolo, agendamentos, bloqueios, paciente })
      : podeMarcar({ grade, data, hora, origem, agendamentos, bloqueios, paciente });
    if (!v.ok) { setMsg({ tom: "erro", texto: v.erros.join(" ") }); return; }

    // A busca de paciente continua aberta durante a remarcação — é a mesma
    // tela. Sem esta conferência, procurar outro nome ali ligaria o
    // agendamento de quem foi empurrado ao prontuário de um terceiro.
    if (remarcando) {
      const vr = validarRemarcacao({
        original: remarcando.original, motivo: remarcando.motivo, prontuarioNovo: prontuario });
      if (!vr.ok) { setMsg({ tom: "erro", texto: vr.erros.join(" ") }); return; }
    }
    if (v.avisos.length && !confirm(v.avisos.join("\n\n") + "\n\nSeguir?")) return;

    const corpo = {
      data, hora, especialidade_cod: grade.especialidade_cod,
      profissional_username: grade.profissional_username, grade_id: grade.id,
      prontuario, origem_marcacao: origem, tipo_atendimento_cod: tipo,
      protocolo_regulacao: protocolo, observacao,
    };

    setBusy(true);
    // Uma remarcação em curso muda o que este botão faz: em vez de criar uma
    // vaga solta, cria a vaga LIGADA à antiga e cancela a antiga. A regra de
    // o que pode ser remarcado é pura e mora em `agenda.js`.
    const r = remarcando
      ? await remarcarAgendamento(sb, remarcando.original, corpo, remarcando.motivo, currentUser)
      : await marcarAgendamento(sb, corpo, currentUser);
    setBusy(false);
    if (!r.ok) { setMsg({ tom: "erro", texto: r.motivo || (r.erros || []).join(" ") }); return; }
    setMarcando(null); setBuscaPac(""); setAchados([]);
    if (remarcando) {
      // A origem raramente está no dia que está na tela, então a corrente é
      // montada com o que já se conhece MAIS o agendamento que acabou de
      // nascer e o que ele substituiu — este a gente tem na mão.
      const c = cadeiaDeRemarcacao(
        [...agendamentos, ...ancestrais, remarcando.original, r.agendamento], r.agendamento?.id);
      const dias = esperaDesdeAOrigem(c, data);
      setMsg({
        tom: r.aviso ? "erro" : "ok",
        texto: r.aviso || `Remarcado — ${c.vezes}ª vez` +
          (c.porHospital ? `, ${c.porHospital} pelo hospital` : "") +
          (dias != null ? `. Este paciente espera desde ${c.origem.data} (${dias} dias).` : "."),
      });
      setRemarcando(null);
    } else {
      setMsg({ tom: "ok", texto: "Vaga registrada." });
    }
    recarregarDia();

    // 🔴 O PACIENTE SAÍA DO BALCÃO SEM NADA NA MÃO.
    //
    // "Vaga registrada" aparece para quem MARCOU, não para quem vai voltar
    // daqui a três semanas. O comprovante é o que sustenta a data — e é o
    // único momento em que dá para conferir o telefone do cadastro com a
    // pessoa na frente, que é o número para onde a confirmação da véspera
    // liga.
    //
    // O cadastro é recarregado inteiro de propósito: `marcando.paciente`
    // vem da busca, que NÃO traz telefone (decisão de `CAMPOS_BUSCA` — não
    // se despeja telefone de várias pessoas numa lista de balcão). Usar o
    // resultado da busca faria o comprovante afirmar "não temos telefone
    // seu" para quem tem — e a recepção corrigiria um número que já estava
    // certo.
    const completo = prontuario ? await carregarPaciente(sb, prontuario) : null;
    setComprovante({
      paciente: completo || paciente,
      agendamento: r.agendamento,
      profissional: profissionais.find(pr => pr.username === grade.profissional_username) || null,
      especialidade: espec(grade.especialidade_cod),
      tipoAtendimento: rotuloDominio(catalogos, "tipo_atendimento", tipo),
    });
  }

  /**
   * Abre a CHEGADA — a etapa que faltava entre o agendamento e o atendimento.
   *
   * POR QUE ISTO DEIXOU DE SER UM CLIQUE SÓ
   * "Presença" gravava direto e abria o atendimento com a ficha vazia: sem
   * convênio, sem carteira, sem plano, sem senha de autorização. As colunas
   * existem em `ps_atendimentos` e ficavam todas nulas. `conferirFicha` — que
   * já sabe cobrar carteira, validade e autorização — era chamada na Recepção
   * e no fechamento da conta, e NUNCA aqui.
   *
   * O custo aparecia 40 dias depois: toda consulta de convênio que entrasse
   * pela Agenda chegava ao faturamento sem carteira e sem senha, com o
   * paciente em casa. Glosa integral, e o retrabalho é telefone.
   *
   * Carrega o cadastro do paciente de verdade, e não um `{ prontuario,
   * iniciais: "?" }` montado na hora — era isso que fazia TODO atendimento
   * ambulatorial nascer com as iniciais "?" gravadas no episódio.
   */
  async function abrirPresenca(a) {
    if (!canEdit) return;
    if (!a.prontuario) {
      setMsg({ tom: "erro", texto: "Esta vaga está reservada sem paciente. Use \"Quem veio?\" para dizer quem chegou antes de dar presença." });
      return;
    }
    setBusy(true);
    const paciente = await carregarPaciente(sb, a.prontuario);
    setBusy(false);
    if (!paciente) {
      setMsg({ tom: "erro", texto: `Não achei o cadastro do prontuário ${a.prontuario}. A presença não foi registrada.` });
      return;
    }
    setMsg(null);
    setPresenca({ agendamento: a, paciente });
  }

  /**
   * Reimprime o comprovante de um agendamento que já existe.
   *
   * Sem isto o papel só existiria no INSTANTE da marcação — quem perdeu a
   * folha, quem marcou por telefone e vem buscar, e quem pediu segunda via
   * ficariam sem. Documento que só é alcançável no momento em que nasce é
   * documento que não existe no dia em que alguém precisa dele.
   *
   * Recarrega o cadastro pelo mesmo motivo da marcação: a linha da agenda
   * não traz telefone, e o comprovante existe em boa parte para conferir
   * justamente esse número.
   */
  async function reimprimirComprovante(a) {
    setMsg(null);
    setBusy(true);
    const paciente = await carregarPaciente(sb, a.prontuario);
    setBusy(false);
    if (!paciente) {
      setMsg({ tom: "erro", texto: `Não achei o cadastro do prontuário ${a.prontuario}. O comprovante não foi emitido.` });
      return;
    }
    setComprovante({
      paciente,
      agendamento: a,
      profissional: profissionais.find(pr => pr.username === a.profissional_username) || null,
      especialidade: espec(a.especialidade_cod),
      tipoAtendimento: rotuloDominio(catalogos, "tipo_atendimento", a.tipo_atendimento_cod),
    });
  }

  /**
   * Começa uma remarcação: guarda a origem e espera a escolha do novo dia.
   *
   * NÃO grava nada aqui. Do balcão, remarcar é "para quando?", e a resposta
   * costuma estar em outra semana — gravar no clique obrigaria a decidir a
   * data antes de olhar a agenda.
   *
   * O motivo é pedido AGORA, e não no fim, porque é ele que separa o que o
   * hospital desmarcou do que o paciente pediu — e essa é a metade sobre a
   * qual o hospital pode agir. Perguntado depois de escolher o horário, ele
   * vira um clique a mais no caminho de quem quer terminar.
   */
  function comecarRemarcacao(a, motivo) {
    const v = validarRemarcacao({ original: a, motivo });
    if (!v.ok) { setMsg({ tom: "erro", texto: v.erros.join(" ") }); return; }
    setMarcando(null);
    setBuscaPac(""); setAchados([]);
    setRemarcando({ original: a, motivo: v.motivo });
    setMsg({ tom: "ok", texto: "Escolha o novo dia e horário e clique em Marcar. A vaga antiga é cancelada só quando a nova existir." });
  }

  async function vincular(a) {
    if (!canEdit) return;
    const p = prompt("Número do prontuário de quem veio:");
    if (!p) return;
    const r = await vincularPacienteAoAgendamento(sb, a.id, p, undefined, currentUser);
    if (!r.ok) { setMsg({ tom: "erro", texto: r.motivo }); return; }
    recarregarDia();
  }

  /**
   * Registra a falta — e o MOTIVO, que é o que a torna acionável.
   *
   * Antes era um clique e um `confirm()`: gravava o status e mais nada. O
   * indicador de absenteísmo mostrava o tamanho do problema e não dizia o
   * que fazer com ele. Transporte que não veio é problema da rede; "esqueci"
   * se resolve com comprovante e lembrete; e "resolveu em outro serviço"
   * nem é falta — é cadastro a atualizar.
   */
  async function faltar(a) {
    if (!canEdit) return;
    const opcoes = MOTIVOS_DE_FALTA.map((m, i) => `${i + 1} - ${m.label}`).join("\n");
    const escolha = prompt(
      `Registrar FALTA de ${a.prontuario ? `reg. ${a.prontuario}` : "vaga reservada"}.\n\n` +
      `Por que não veio?\n\n${opcoes}\n\nDigite o número:`);
    if (escolha === null) return;
    const m = MOTIVOS_DE_FALTA[Number(escolha) - 1];
    const v = validarFalta(m?.chave);
    if (!v.ok) { setMsg({ tom: "erro", texto: v.erro }); return; }
    setBusy(true);
    const r = await registrarFalta(sb, a.id, v.valor, currentUser);
    setBusy(false);
    if (!r.ok) { setMsg({ tom: "erro", texto: r.motivo }); return; }
    setMsg({ tom: "ok", texto: `Falta registrada como "${m.label}". ${m.acao}` });
    recarregarDia();
  }

  /**
   * A confirmação da véspera — a alavanca que derruba absenteísmo.
   *
   * A vaga CONTINUA ocupada: quem confirmou que vem é quem mais
   * garantidamente vem. O índice único do banco sabe disso desde a migração
   * `migracao-agenda-confirmacao.sql`.
   */
  async function confirmar(a) {
    if (!canEdit || busy) return;
    setBusy(true);
    const r = await confirmarAgendamento(sb, a.id, currentUser);
    setBusy(false);
    if (!r.ok) { setMsg({ tom: "erro", texto: r.motivo }); return; }
    setMsg({ tom: "ok", texto: "Confirmado — o paciente disse que vem." });
    recarregarDia();
  }

  async function cancelar(a) {
    if (!canEdit) return;
    const motivo = prompt("Motivo do cancelamento:");
    if (motivo === null) return;
    const r = await cancelarAgendamento(sb, a.id, motivo, currentUser);
    if (!r.ok) { setMsg({ tom: "erro", texto: r.motivo }); return; }
    recarregarDia();
  }

  async function salvarAGrade() {
    if (!canEdit || busy) return;
    const v = validarGrade(nova);
    if (!v.ok) { setMsg({ tom: "erro", texto: v.erros.join(" ") }); return; }
    setBusy(true);
    const r = await salvarGrade(sb, nova, currentUser);
    setBusy(false);
    if (!r.ok) { setMsg({ tom: "erro", texto: r.motivo }); return; }
    setNova(null); setMsg({ tom: "ok", texto: "Grade salva." });
    recarregarDia();
  }

  async function salvarOBloqueio() {
    if (!canEdit || busy) return;
    if (!bloq?.data_inicio || !String(bloq?.motivo ?? "").trim()) {
      setMsg({ tom: "erro", texto: "Informe a data e o motivo do bloqueio." }); return;
    }
    // 🔴 QUEM JÁ ESTÁ MARCADO NO PERÍODO.
    // O bloqueio impedia MARCAR daqui para a frente e não olhava para trás:
    // publicar "congresso do ortopedista, quinta" deixava os pacientes já
    // marcados naquela quinta como `agendado`, aparecendo no dia como se
    // nada tivesse acontecido. Ninguém liga para eles, e eles vêm de outra
    // cidade encontrar a porta fechada.
    //
    // Aqui o modal é o certo, e a razão é a de sempre: ele é RARO. Publicar
    // bloqueio é ato de quem monta a grade, não gesto de balcão repetido 80
    // vezes por dia — e o que ele diz é que alguém precisa telefonar.
    // Carregado na hora, e não do estado do dia: o bloqueio é um PERÍODO, e
    // a tela só tem em mãos os agendamentos da data que está aberta.
    setBusy(true);
    const doPeriodo = await carregarAgendamentosDoPeriodo(sb, {
      de: String(bloq.data_inicio).slice(0, 10),
      ate: String(bloq.data_fim || bloq.data_inicio).slice(0, 10),
    });
    setBusy(false);
    const atingidos = agendamentosAtingidos({ agendamentos: doPeriodo, bloqueio: bloq });
    if (atingidos.length) {
      const lista = atingidos.slice(0, 12).map(a =>
        `• ${String(a.data).slice(0, 10)}${a.hora ? " " + String(a.hora).slice(0, 5) : ""}` +
        ` — ${espec(a.especialidade_cod)}${a.prontuario ? ` · reg. ${a.prontuario}` : " · vaga reservada"}`).join("\n");
      const resto = atingidos.length > 12 ? `\n… e mais ${atingidos.length - 12}.` : "";
      if (!confirm(
        `${atingidos.length} paciente(s) JÁ ESTÃO MARCADOS neste período:\n\n${lista}${resto}\n\n` +
        "O bloqueio não desmarca ninguém — eles continuam na agenda e vão aparecer no dia.\n" +
        "Alguém precisa remarcar ou avisar cada um, ou eles virão e encontrarão a porta fechada.\n\n" +
        "Registrar o bloqueio assim mesmo?")) return;
    }

    setBusy(true);
    const r = await salvarBloqueio(sb, bloq, currentUser);
    setBusy(false);
    if (!r.ok) { setMsg({ tom: "erro", texto: r.motivo }); return; }
    setBloq(null);
    setMsg(atingidos.length
      ? { tom: "erro", texto: `Bloqueio registrado. ⚠️ ${atingidos.length} paciente(s) seguem marcados neste período e NÃO foram avisados — remarque ou telefone antes do dia.` }
      : { tom: "ok", texto: "Bloqueio registrado." });
    recarregarDia();
  }

  async function chamar(a) {
    if (!canEdit || busy) return;
    const v = validarChamada(a);
    if (!v.ok) { setMsg({ tom: "erro", texto: v.erro }); return; }
    setBusy(true);
    const r = await chamarParaAtendimento(sb, a.id, currentUser);
    setBusy(false);
    if (!r.ok) { setMsg({ tom: "erro", texto: r.motivo }); return; }
    setMsg({ tom: "ok", texto: `${a.iniciais || a.prontuario} chamado — a hora de início do atendimento foi registrada.` });
    recarregarDia();
  }

  async function procurarPaciente() {
    const r = await buscarPacientes(sb, buscaPac);
    // Falha de consulta não vira lista vazia: aqui a lista vazia faz a
    // recepcionista concluir que o paciente não está cadastrado e marcar
    // para outra pessoa, ou desistir da vaga.
    if (!r.ok) { setAchados([]); setMsg({ tom: "erro", texto: `${r.motivo} Tente de novo — não é que o paciente não exista.` }); return; }
    setAchados(r.lista);
    if (!r.lista.length) setMsg({ tom: "erro", texto: "Nenhum paciente encontrado com esse dado." });
  }

  const espec = cod => (catalogos.especialidade || []).find(e => e.codigo === cod)?.nome || cod;
  const prof = u => profissionais.find(p => p.username === u)?.nome || u;


  return (
    <div style={{ padding: "1.25rem 1.5rem", overflowY: "auto", height: "100%" }}>
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Atendimento — Agenda do Ambulatório</div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>
        A vaga tem dono: <strong>regulação</strong> (a central marca, o hospital recebe),
        <strong> marcação interna</strong> (retorno, convênio, particular) e <strong>ordem de chegada</strong>.
        Marcar numa vaga que não é sua faz dois pacientes chegarem para o mesmo horário.
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {[["dia", "Dia"],
          // A contagem no rótulo não é enfeite: é o número que a recepção
          // precisa saber sem abrir a aba — quantas pessoas estão esperando
          // agora.
          ["fila", fila.esperando.length ? `Fila (${fila.esperando.length})` : "Fila"],
          ["grade", "Grade e bloqueios"],
          ["producao", conciliacao.divergentes ? `Produção (${conciliacao.divergentes})` : "Produção"],
          ["relatorio", "Relatório do mês"]].map(([k, l]) => (
          <button key={k} onClick={() => { setVista(k); setMsg(null); }}
            style={{ ...btn(vista === k ? "#22d3ee" : "var(--surface-2)", vista === k),
                     color: vista === k ? "#000" : "var(--text)" }}>{l}</button>
        ))}
        {/* NÃO é uma vista como as outras — abre em tela cheia, virada para
            a sala de espera. Fica separado das abas por isso. */}
        <button onClick={() => setPainel(true)} title="Tela cheia para a TV da sala de espera"
          style={{ ...btn("var(--surface-2)", false), marginLeft: "auto", color: "var(--text)" }}>
          📺 Painel da sala
        </button>
      </div>

      {painel && (
        <PainelChamada
          fila={fila}
          especialidades={Object.fromEntries((catalogos.especialidade || []).map(e => [e.codigo, e.nome]))}
          profissionais={Object.fromEntries(profissionais.map(p => [p.username, p.nome || p.username]))}
          onAtualizar={recarregarDia}
          onSair={() => setPainel(false)}
        />
      )}

      {msg && (
        <div style={{ ...cartao, borderLeft: `4px solid ${msg.tom === "erro" ? "#f43f5e" : "#34d399"}`,
                      background: msg.tom === "erro" ? "#f43f5e10" : "#34d39910", fontSize: 13 }}>
          {msg.texto}
        </div>
      )}

      {/* ── PENDÊNCIA DE ENCERRAMENTO ── */}
      {ambAbertos.length > 0 && (
        <div style={{ ...cartao, borderLeft: "4px solid #d97706" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <strong style={{ fontSize: 13 }}>
              {ambAbertos.length} atendimento(s) ambulatorial(is) aguardando encerramento
            </strong>
            <button onClick={() => setVerAbertos(v => !v)}
              style={{ ...btn("#d97706"), marginLeft: "auto", color: "#fff" }}>
              {verAbertos ? "Ocultar" : "Ver lista"}
            </button>
          </div>
          <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 7, lineHeight: 1.5 }}>
            Consulta que não é encerrada continua contando como atendimento em aberto — e faz o aviso de
            duplicidade disparar na próxima visita do paciente. Aviso que sempre dispara é aviso que
            ninguém lê.
          </div>
          {verAbertos && (
            <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 10 }}>
              {ambAbertos.map(a => (
                <div key={a.id} style={{ display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap",
                                         background: "var(--surface-2)", border: "1px solid var(--border)",
                                         borderRadius: 8, padding: "8px 11px" }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, minWidth: 52 }}>#{a.id}</span>
                  <span style={{ fontSize: 12.5, minWidth: 90 }}>reg. {a.prontuario}</span>
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    {a.especialidade_cod ? espec(a.especialidade_cod) : "—"} · {STATUS_ATENDIMENTO[a.status]?.label || a.status}
                    {" · desde "}{new Date(a.chegada_em).toLocaleDateString("pt-BR")}
                  </span>
                  {canEdit && (
                    <button onClick={() => encerrar(a)} disabled={busy}
                      style={{ ...btn("#0d9488", !busy), marginLeft: "auto", color: "#fff", padding: "4px 10px", fontSize: 11 }}>
                      Encerrar
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════════ DIA ══════════ */}
      {/* ── FILA VIVA ──
          Confirmada a presença, nascia um atendimento
          `aguardando_atendimento` que o painel do PS exclui (lá o filtro é
          só emergência, e está certo) e que não aparecia em NENHUMA outra
          tela. O paciente ficava presente no sistema e invisível para todo
          mundo — e a recepção respondia "quanto falta?" de cabeça. */}
      {vista === "fila" && (
        <div style={cartao}>
          <div style={rotulo}>Quem está esperando agora</div>
          {fila.esperando.length === 0 && fila.emAtendimento.length === 0 ? (
            <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
              Ninguém na fila do ambulatório. Quem tem presença confirmada aparece aqui até ser chamado.
            </div>
          ) : (
            <>
              {fila.esperando.map(a => (
                <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
                                         padding: "9px 0", borderBottom: "1px solid var(--border)" }}>
                  <div style={{ minWidth: 72, fontSize: 15, fontWeight: 800,
                                // O relógio muda de cor por tempo de espera: é o
                                // sinal que a recepção lê de longe, sem contar.
                                color: (a.esperaMin ?? 0) >= 60 ? "#f43f5e" : (a.esperaMin ?? 0) >= 30 ? "#d97706" : "var(--text)" }}>
                    {a.esperaMin == null ? "—" : `${a.esperaMin} min`}
                  </div>
                  <div style={{ flex: 1, minWidth: 200, fontSize: 13 }}>
                    <strong>{a.iniciais || "—"}</strong>
                    {/* 🔴 O SELO DIZ POR QUE ESTA PESSOA ESTÁ NA FRENTE.
                        Sem ele a fila muda de ordem e ninguém sabe por quê —
                        e ordem que não se explica é ordem que a recepção
                        desconfia e refaz de cabeça, que era exatamente o
                        problema. O motivo vai junto (idade, gestante) porque
                        é o que se confere olhando a pessoa. */}
                    {a.prioridade?.tem && (
                      <span title={a.prioridade.norma}
                        style={{ marginLeft: 6, fontSize: 10, fontWeight: 800, letterSpacing: ".04em",
                                 color: a.prioridade.nivel === 2 ? "#f43f5e" : "#d97706",
                                 border: `1px solid ${a.prioridade.nivel === 2 ? "#f43f5e66" : "#d9770666"}`,
                                 borderRadius: 5, padding: "1px 5px", whiteSpace: "nowrap" }}>
                        {a.prioridade.rotulo.toUpperCase()}
                        {a.prioridade.motivos.filter(m => m.legal).length
                          ? ` · ${a.prioridade.motivos.filter(m => m.legal).map(m => m.rotulo).join(" · ")}`
                          : ""}
                      </span>
                    )}
                    <span style={{ color: "var(--text-muted)" }}>
                      {" · reg. "}{a.prontuario} · {espec(a.especialidade_cod)}
                      {a.medico ? ` · ${prof(a.medico)}` : ""}
                    </span>
                    {/* Idade desconhecida NÃO é silêncio: sem data de
                        nascimento o sistema não sabe se a pessoa é idosa, e
                        quem está no balcão precisa conferir isso com ela em
                        vez de confiar numa ordem que foi calculada sem o
                        dado. */}
                    {a.prioridade?.motivos.some(m => m.chave === "idade_desconhecida") && (
                      <div style={{ fontSize: 11, color: "#d97706" }}>
                        Sem data de nascimento — confirme a idade com a pessoa antes de seguir a ordem.
                      </div>
                    )}
                    {a.esperaLonga && !a.prioridade?.tem && (
                      <div style={{ fontSize: 11, color: "#f43f5e" }}>
                        Espera longa e sem prioridade legal — está sendo ultrapassado.
                      </div>
                    )}
                    {a.queixa && <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{a.queixa}</div>}
                  </div>
                  {canEdit && (
                    <button onClick={() => chamar(a)} disabled={busy}
                      style={{ ...btn("#0d9488", !busy), color: "#fff" }}>Chamar</button>
                  )}
                </div>
              ))}

              {fila.emAtendimento.length > 0 && (
                <>
                  <div style={{ ...rotulo, marginTop: 16 }}>Em atendimento</div>
                  {fila.emAtendimento.map(a => (
                    <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
                                             padding: "9px 0", borderBottom: "1px solid var(--border)" }}>
                      <div style={{ minWidth: 72, fontSize: 12, color: "var(--text-muted)" }}>
                        {/* O relógio dele PAROU na chamada: este é o tempo que
                            ele esperou, não quanto a consulta está durando. */}
                        esperou {a.esperaMin == null ? "—" : `${a.esperaMin} min`}
                      </div>
                      <div style={{ flex: 1, minWidth: 200, fontSize: 13 }}>
                        <strong>{a.iniciais || "—"}</strong>
                        <span style={{ color: "var(--text-muted)" }}>
                          {" · reg. "}{a.prontuario} · {espec(a.especialidade_cod)}
                        </span>
                      </div>
                      {canEdit && (
                        <button onClick={() => encerrar(a)} style={{ ...btn("var(--surface-2)", false), color: "var(--text)" }}>
                          Encerrar
                        </button>
                      )}
                    </div>
                  ))}
                </>
              )}
            </>
          )}
          <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 12, lineHeight: 1.5 }}>
            <strong>A ordem segue a prioridade legal</strong> (Lei 10.048/2000; Estatuto do Idoso,
            art. 3º, §2º, para o maior de 80) e só depois o tempo de espera.{" "}
            {/* ⚠️ A FILA DIZ O QUE NÃO SABE VER.
                Ordenar por prioridade e silenciar sobre as categorias que o
                cadastro não guarda seria pior que não ordenar: a recepção
                passaria a confiar na ordem e pararia de conferir justamente
                o que depende dela. */}
            <span style={{ color: "#d97706" }}>
              O sistema ainda não reconhece {CATEGORIAS_SEM_CAMPO.map(c => c.rotulo.toLowerCase()).join(", ")} —
              essas continuam por conta de quem está no balcão.
            </span>{" "}
            O relógio conta da chegada. Chamar grava a hora de início do atendimento — é dela que
            sai o tempo de espera que a gestão cobra, e sem ela o atraso não deixa rastro.
          </div>
        </div>
      )}

      {vista === "dia" && (
        <>
          <div style={cartao}>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div style={{ width: 170 }}>
                <label style={lbl}>Dia</label>
                <input type="date" value={data} onChange={e => setData(e.target.value)} style={inp} />
              </div>
              <div style={{ fontSize: 12.5, color: "var(--text-muted)", paddingBottom: 8 }}>
                {DIAS[new Date(data + "T00:00:00").getDay()] || "—"}
              </div>
              <button onClick={() => setData(hojeISO())} style={{ ...btn("var(--surface-2)", false), color: "var(--text)", marginBottom: 2 }}>Hoje</button>
            </div>

            {bloqueioGeral && (
              <div style={{ marginTop: 10, padding: "9px 12px", borderRadius: 8, fontSize: 12.5,
                            background: "#f43f5e10", border: "1px solid #f43f5e55" }}>
                <strong>Dia bloqueado:</strong> {bloqueioGeral.motivo}. Nenhuma vaga é ofertada.
              </div>
            )}

            {/* produção — o que hoje é digitado à mão */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 8, marginTop: 12 }}>
              {[
                ["Ofertadas", producao.ofertadas, "#6366f1"],
                ["Realizadas", producao.realizadas, "#0d9488"],
                ["Faltas", producao.faltas, "#f43f5e"],
                ["Livres", producao.livres, "#22d3ee"],
                ["Absenteísmo", producao.absenteismo == null ? "—" : `${producao.absenteismo}%`, "#d97706"],
              ].map(([l, v, cor]) => (
                <div key={l} style={{ background: "var(--surface-2)", border: "1px solid var(--border)",
                                      borderLeft: `3px solid ${cor}`, borderRadius: 8, padding: "8px 11px" }}>
                  <div style={{ fontSize: 9.5, color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>{l}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: cor, fontFamily: "JetBrains Mono, monospace" }}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>
              Estes números saem da agenda — não são digitados. Ofertadas vem da grade; realizadas, de quem teve presença confirmada.
            </div>
          </div>

          {carregando ? (
            <div style={{ ...cartao, fontSize: 13, color: "var(--text-muted)" }}>Carregando o dia…</div>
          ) : aplicaveis.length === 0 ? (
            <div style={{ ...cartao, fontSize: 12.5, color: "var(--text-muted)" }}>
              Nenhuma grade nesta data. Cadastre em <strong>Grade e bloqueios</strong> — sem grade não há vaga para marcar
              nem para receber da regulação.
            </div>
          ) : aplicaveis.map(g => {
            const vagas = vagasDoDia(g, data, agendamentos);
            const bloqueado = bloqueioDoDia(bloqueios, data, {
              especialidade: g.especialidade_cod, profissional: g.profissional_username });
            // Pelo MESMO dono que `vagasDoDia` usa para contar. Filtrar a
            // lista por especialidade enquanto o contador conta por
            // profissional fazia o card dizer "1/4" e listar dois pacientes
            // logo abaixo — cada médico via os agendamentos do outro na
            // própria agenda. Contador e lista têm que sair da mesma chave.
            const doDia = agendamentos.filter(a => donoDaVaga(a) === donoDaVaga(g));
            return (
              <div key={g.id} style={cartao}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                  <strong style={{ fontSize: 14 }}>{espec(g.especialidade_cod)}</strong>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    {String(g.hora_inicio).slice(0, 5)}–{String(g.hora_fim).slice(0, 5)} · {g.duracao_min}min
                    {g.profissional_username ? ` · ${prof(g.profissional_username)}` : ""}
                  </span>
                  {bloqueado && <span style={{ fontSize: 11, fontWeight: 800, color: "#f43f5e" }}>BLOQUEADO — {bloqueado.motivo}</span>}
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                  {Object.entries(ORIGENS_MARCACAO).map(([k, cfg]) => (
                    <div key={k} style={{ background: "var(--surface-2)", border: "1px solid var(--border)",
                                          borderLeft: `3px solid ${CORES_ORIGEM[k]}`, borderRadius: 8, padding: "7px 11px", minWidth: 150 }}>
                      <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, textTransform: "uppercase" }}>{cfg.label}</div>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>
                        {vagas[k].ocupadas}/{vagas[k].total}
                        <span style={{ fontWeight: 400, color: "var(--text-muted)", fontSize: 11.5 }}> · {vagas[k].livres} livre(s)</span>
                      </div>
                      {canEdit && !bloqueado && vagas[k].livres > 0 && (
                        <button onClick={() => setMarcando({ grade: g, origem: k, hora: "", protocolo: "", tipo: "",
                          // Numa remarcação o paciente já está decidido — é o
                          // da origem. Entra preenchido para a recepcionista
                          // ver de quem é a vaga que está criando, em vez de
                          // um campo em branco ao lado de uma busca aberta.
                          prontuario: remarcando?.original?.prontuario || "" })}
                          style={{ ...btn(CORES_ORIGEM[k]), marginTop: 6, padding: "4px 9px", fontSize: 11, color: "#fff" }}>
                          {k === "regulacao" ? "Registrar da regulação" : k === "chegada" ? "+ Fila de chegada" : "+ Marcar"}
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {doDia.length === 0 ? (
                  <div style={{ fontSize: 12.5, color: "var(--text-muted)", padding: "0.8rem",
                                border: "1px dashed var(--border)", borderRadius: 8 }}>
                    Ninguém registrado nesta agenda hoje.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    {doDia.map(a => (
                      <div key={a.id} style={{ display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap",
                                               background: "var(--surface-2)", border: "1px solid var(--border)",
                                               borderLeft: `3px solid ${CORES_ORIGEM[a.origem_marcacao]}`,
                                               borderRadius: 8, padding: "8px 11px",
                                               opacity: STATUS_AGENDAMENTO[a.status]?.vivo ? 1 : 0.55 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 700, fontFamily: "JetBrains Mono, monospace", minWidth: 48 }}>
                          {a.hora ? String(a.hora).slice(0, 5) : "fila"}
                        </span>
                        <span style={{ fontSize: 12.5, minWidth: 90 }}>
                          {a.prontuario ? `reg. ${a.prontuario}` : <em style={{ color: "var(--text-muted)" }}>vaga reservada</em>}
                        </span>
                        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                          {ORIGENS_MARCACAO[a.origem_marcacao]?.label}
                          {a.protocolo_regulacao ? ` · ${a.protocolo_regulacao}` : ""}
                          {a.tipo_atendimento_cod ? ` · ${a.tipo_atendimento_cod.replace(/_/g, " ")}` : ""}
                        </span>
                        {/* 🔴 A ESPERA REAL, que a remarcação apagava.
                            Sem isto, quem foi marcado em março e empurrado
                            três vezes aparece como "marcado há 5 dias", e a
                            fila do hospital parece curta porque o relógio foi
                            zerado a cada remarque.

                            Os elos anteriores quase sempre estão em OUTRA
                            data — remarcar é justamente mudar de dia — por
                            isso são carregados à parte. Sem eles, a tela
                            dizia "0ª remarcação, espera 0 dia(s)" logo
                            depois de remarcar: o número que a coluna existe
                            para responder, respondendo zero. */}
                        {/* 🔴 O LADO DE CÁ DA REMARCAÇÃO.
                            A vaga antiga fica "CANCELADO" e mais nada. Quem
                            abre o dia de origem — e é esse dia que a pessoa
                            tem anotado no papel — não consegue distinguir
                            "foi remarcado para tal data" de "foi desmarcado
                            e ninguém remarcou". São as duas situações que
                            mais geram telefonema, e a diferença já estava
                            gravada: só não era desenhada.

                            Vale para todo cancelamento, não só o de
                            remarcação: o motivo digitado à mão também some
                            hoje. */}
                        {a.status === "cancelado" && a.cancelado_motivo && (
                          <span style={{ fontSize: 10.5, color: "var(--text-muted)", fontStyle: "italic" }}>
                            {a.cancelado_motivo}
                          </span>
                        )}
                        {a.remarcado_de != null && (() => {
                          const c = cadeiaDeRemarcacao([...agendamentos, ...ancestrais], a.id);
                          const dias = esperaDesdeAOrigem(c, data);
                          return (
                            <span title="Remarcado — a espera conta desde a primeira marcação"
                              style={{ fontSize: 10.5, fontWeight: 700, color: "#6366f1",
                                       border: "1px solid #6366f155", borderRadius: 5, padding: "1px 5px" }}>
                              ↻ remarcado
                              {c.porHospital > 0 ? ` · ${c.porHospital}× pelo hospital` : ""}
                              {dias != null ? ` · espera ${dias} dia(s)` : ""}
                            </span>
                          );
                        })()}
                        <span style={{ fontSize: 11, fontWeight: 800, marginLeft: "auto",
                                       color: a.status === "presente" ? "#0d9488" : a.status === "falta" ? "#f43f5e" : "var(--text-muted)" }}>
                          {STATUS_AGENDAMENTO[a.status]?.label?.toUpperCase()}
                        </span>
                        {/* `confirmado` é um passo ANTES de presente: quem
                            confirmou na véspera continua ocupando a vaga e
                            ainda precisa dar presença quando chegar. Por
                            isso os dois status oferecem as mesmas ações — só
                            "Confirmar" some depois de confirmado. */}
                        {canEdit && ["agendado", "confirmado"].includes(a.status) && (
                          <>
                            {!a.prontuario && (
                              <button onClick={() => vincular(a)} style={{ ...btn("#6366f1"), color: "#fff", padding: "4px 9px", fontSize: 11 }}>Quem veio?</button>
                            )}
                            {a.status === "agendado" && a.prontuario && (
                              <button onClick={() => confirmar(a)} disabled={busy}
                                title="Contato da véspera — é o que derruba o absenteísmo"
                                style={{ ...btn("#6366f1", !busy), color: "#fff", padding: "4px 9px", fontSize: 11 }}>Confirmar</button>
                            )}
                            <button onClick={() => abrirPresenca(a)} disabled={busy}
                              style={{ ...btn("#0d9488", !busy), color: "#fff", padding: "4px 9px", fontSize: 11 }}>Presença</button>
                            <button onClick={() => faltar(a)} style={{ ...btn("var(--surface-2)", false), color: "var(--text)", padding: "4px 9px", fontSize: 11 }}>Falta</button>
                            <button onClick={() => cancelar(a)} style={{ ...btn("var(--surface-2)", false), color: "var(--text)", padding: "4px 9px", fontSize: 11 }}>Cancelar</button>
                          </>
                        )}
                        {/* Fora do bloco de `canEdit`: reimprimir não altera
                            nada, e quem só consulta precisa poder dar a
                            segunda via para quem perdeu a primeira. */}
                        {a.prontuario && ["agendado", "confirmado"].includes(a.status) && (
                          <button onClick={() => reimprimirComprovante(a)} disabled={busy}
                            style={{ ...btn("var(--surface-2)", false), color: "var(--text)", padding: "4px 9px", fontSize: 11 }}>Comprovante</button>
                        )}
                        {/* REMARCAR — inclusive depois da FALTA, que é o caso
                            mais comum: a pessoa não veio, liga no dia
                            seguinte e é reencaixada. A falta anterior
                            continua contando; o elo não a apaga. */}
                        {canEdit && a.prontuario && ["agendado", "confirmado", "falta"].includes(a.status) && (
                          <select value="" disabled={busy}
                            onChange={e => { if (e.target.value) comecarRemarcacao(a, e.target.value); }}
                            title="Remarcar — escolha de quem partiu"
                            style={{ background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6,
                                     padding: "3px 6px", color: "var(--text)", fontSize: 11 }}>
                            <option value="">Remarcar…</option>
                            {MOTIVOS_DE_REMARCACAO.map(m => (
                              <option key={m.chave} value={m.chave}>{m.label}</option>
                            ))}
                          </select>
                        )}
                        {a.atendimento_id && (
                          <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>atend. #{a.atendimento_id}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* ── DEPOIS DA CHEGADA: responsável e impressos ──
              A mesma sequência da Recepção, pelo mesmo motivo escrito lá:
              quem trouxe o paciente ainda está na frente, e depois que sai,
              descobrir quem era vira telefonema. `pendenciaDeResponsavel`
              (menor de idade, curatela) nunca era avaliada para quem entrava
              pelo ambulatório — e a pulseira, que o hospital exige, não saía. */}
          {imprimindo && (
            <>
              <ResponsavelDoEpisodio
                sb={sb} currentUser={currentUser} canEdit={canEdit}
                paciente={imprimindo.paciente} atendimento={imprimindo.atendimento}
                onMudou={setResponsaveis}
              />
              <Impressos
                responsaveis={responsaveis}
                paciente={imprimindo.paciente}
                atendimento={imprimindo.atendimento}
                catalogos={catalogos}
                convenio={(catalogos.convenios || []).find(c => String(c.id) === String(imprimindo.atendimento?.convenio_id)) || null}
                plano={(catalogos.planos || []).find(p => String(p.id) === String(imprimindo.atendimento?.plano_id)) || null}
                procedimento={(catalogos.procedimentos || []).find(p => p.codigo === imprimindo.atendimento?.procedimento_cod) || null}
                currentUser={currentUser}
                onFechar={() => { setImprimindo(null); setResponsaveis([]); }}
              />
            </>
          )}

          {/* 🔴 A FAIXA QUE ATRAVESSA A TROCA DE DIA.
              Remarcar quase sempre é mandar o paciente para outra data. Sem
              uma marca visível fora do dia de origem, a recepcionista muda a
              data, vê a agenda limpa e marca uma vaga solta — a corrente se
              perde exatamente como se perdia antes, com a diferença de que
              agora existiria uma coluna vazia dizendo que não. */}
          {remarcando && (
            <div style={{ ...cartao, borderLeft: "4px solid #6366f1", background: "#6366f110",
                          display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 12.5 }}>
              <strong style={{ color: "#6366f1" }}>Remarcando</strong>
              <span>
                #{remarcando.original.id} · reg. {remarcando.original.prontuario} ·
                {" "}era {remarcando.original.data}{remarcando.original.hora ? ` ${String(remarcando.original.hora).slice(0, 5)}` : ""}
              </span>
              <span style={{ color: "var(--text-muted)" }}>
                {MOTIVOS_DE_REMARCACAO.find(m => m.chave === remarcando.motivo)?.label}
              </span>
              <span style={{ color: "var(--text-muted)" }}>
                Escolha o novo dia e horário. A vaga antiga só é cancelada depois que a nova existir.
              </span>
              <button onClick={() => { setRemarcando(null); setMarcando(null); setMsg(null); }}
                style={{ ...btn("var(--surface-2)", false), color: "var(--text)", marginLeft: "auto", padding: "4px 10px", fontSize: 11 }}>
                Desistir da remarcação
              </button>
            </div>
          )}

          {/* O papel que o paciente leva embora. Fica fora do bloco de
              `imprimindo` porque acontece em outro momento: ali o paciente
              está entrando, aqui está indo para casa com uma data. */}
          {comprovante && (
            <Impressos
              paciente={comprovante.paciente}
              agendamento={comprovante.agendamento}
              profissional={comprovante.profissional}
              especialidade={comprovante.especialidade}
              tipoAtendimento={comprovante.tipoAtendimento}
              catalogos={catalogos}
              currentUser={currentUser}
              onFechar={() => setComprovante(null)}
            />
          )}

          {/* ── CHEGADA — o componente compartilhado com a Recepção.
              Era código inline aqui; virou componente quando a Recepção
              passou a precisar da MESMA etapa, e uma terceira cópia
              divergente deste formulário custaria caro. */}
          {presenca && (
            <ChegadaAmbulatorial
              sb={sb} currentUser={currentUser} canEdit={canEdit}
              agendamento={presenca.agendamento} paciente={presenca.paciente}
              catalogos={catalogos} profissionais={profissionais} espec={espec}
              onCancelar={() => setPresenca(null)}
              onConfirmado={({ atendimento, paciente, aviso }) => {
                setPresenca(null);
                setMsg({ tom: aviso ? "erro" : "ok",
                         texto: aviso || `Presença confirmada — atendimento ${atendimento.id} aberto.` });
                setImprimindo({ paciente, atendimento });
                recarregarDia();
              }}
            />
          )}

          {/* ── formulário de marcação ── */}
          {marcando && (
            <div style={{ ...cartao, borderLeft: `4px solid ${CORES_ORIGEM[marcando.origem]}` }}>
              <div style={rotulo}>
                {marcando.origem === "regulacao" ? "Registrar vaga da regulação"
                  : marcando.origem === "chegada" ? "Entrada por ordem de chegada" : "Marcar consulta"}
                {" — "}{espec(marcando.grade.especialidade_cod)}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 10 }}>
                {ORIGENS_MARCACAO[marcando.origem].quem}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
                {marcando.origem !== "chegada" && (
                  <div>
                    <label style={lbl}>Horário *</label>
                    <select value={marcando.hora} onChange={e => setMarcando(p => ({ ...p, hora: e.target.value }))} style={inp}>
                      <option value="">—</option>
                      {horariosLivres(marcando.grade, data, agendamentos).map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                )}
                {marcando.origem === "regulacao" && (
                  <div>
                    <label style={lbl}>Protocolo da regulação *</label>
                    <input value={marcando.protocolo} onChange={e => setMarcando(p => ({ ...p, protocolo: e.target.value }))}
                      style={inp} placeholder="o número do papel do paciente" />
                    <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 3 }}>
                      Obrigatório: é o que comprova que a vaga foi marcada pela central.
                    </div>
                  </div>
                )}
                <div>
                  <label style={lbl}>Tipo de atendimento</label>
                  <select value={marcando.tipo} onChange={e => setMarcando(p => ({ ...p, tipo: e.target.value }))} style={inp}>
                    <option value="">—</option>
                    {(catalogos.tipo_atendimento || []).map(t => <option key={t.codigo} value={t.codigo}>{t.nome}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ marginTop: 12 }}>
                <label style={lbl}>Paciente {marcando.origem === "regulacao" ? "(pode ficar em branco até ele chegar)" : "*"}</label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <input value={buscaPac} onChange={e => setBuscaPac(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && procurarPaciente()}
                    placeholder="Nome, CPF, Cartão SUS ou prontuário" style={{ ...inp, flex: 1, minWidth: 220 }} />
                  <button onClick={procurarPaciente} style={btn("#22d3ee")}>Procurar</button>
                </div>
                {marcando.prontuario && (
                  <div style={{ fontSize: 12.5, marginTop: 7 }}>
                    Escolhido: <strong>reg. {marcando.prontuario}</strong>
                    {/* NUMA REMARCAÇÃO O PACIENTE NÃO SE TROCA. Oferecer o
                        botão seria oferecer um caminho que a regra recusa
                        depois — e a corrente trocando de pessoa no meio é
                        justamente o dano que não tem desfazer. A busca fica
                        de pé para quem chegou aqui pelo "+ Marcar" comum. */}
                    {!remarcando && (
                      <button onClick={() => setMarcando(p => ({ ...p, prontuario: "" }))}
                        style={{ ...btn("var(--surface-2)", false), color: "var(--text)", marginLeft: 8, padding: "3px 8px", fontSize: 11 }}>trocar</button>
                    )}
                    {remarcando && (
                      <span style={{ marginLeft: 8, fontSize: 11, color: "var(--text-muted)" }}>
                        — é a remarcação deste paciente, não se troca por outro
                      </span>
                    )}
                  </div>
                )}
                {achados.length > 0 && !marcando.prontuario && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 7 }}>
                    {achados.map(p => (
                      <button key={p.prontuario}
                        // Guarda o CADASTRO, não só o número: é o que permite
                        // a `podeMarcar` recusar óbito. Antes só o prontuário
                        // sobrevivia à escolha, e a regra ficava cega.
                        onClick={() => { setMarcando(x => ({ ...x, prontuario: p.prontuario, paciente: p })); setAchados([]); }}
                        style={{ ...btn("var(--surface-2)", false), color: "var(--text)" }}>
                        {comoExibir(p) || p.iniciais} · reg. {p.prontuario}
                        {p.obito ? <span style={{ color: "#fb7185" }}> · óbito registrado</span> : ""}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <button onClick={marcar} disabled={busy} style={btn("#22d3ee", !busy)}>
                  {busy ? "Registrando…" : "Registrar"}
                </button>
                <button onClick={() => { setMarcando(null); setAchados([]); setBuscaPac(""); }}
                  style={{ ...btn("var(--surface-2)", false), color: "var(--text)" }}>Cancelar</button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ══════════ GRADE ══════════ */}
      {vista === "grade" && (
        <>
          {canEdit && (
            <div style={cartao}>
              {!nova ? (
                <button onClick={() => setNova({
                  especialidade_cod: "", dia_semana: 1, hora_inicio: "08:00", hora_fim: "12:00",
                  duracao_min: 20, vagas_regulacao: 0, vagas_internas: 0, vagas_chegada: 0,
                  vigencia_inicio: hojeISO(), ativo: true,
                })} style={btn("#34d399")}>+ Nova grade</button>
              ) : (() => {
                const v = validarGrade(nova);
                return (
                  <>
                    <div style={rotulo}>{nova.id ? "Editar grade" : "Nova grade"}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
                      <div>
                        <label style={lbl}>Especialidade *</label>
                        <select value={nova.especialidade_cod} onChange={e => setNova(p => ({ ...p, especialidade_cod: e.target.value }))} style={inp}>
                          <option value="">—</option>
                          {(catalogos.especialidade || []).map(x => <option key={x.codigo} value={x.codigo}>{x.nome}</option>)}
                        </select>
                        {(catalogos.especialidade || []).length === 0 && (
                          <div style={{ fontSize: 10.5, color: "#d97706", marginTop: 3 }}>
                            Nenhuma especialidade cadastrada — cadastre na aba Tabelas.
                          </div>
                        )}
                      </div>
                      <div>
                        <label style={lbl}>Dia da semana *</label>
                        <select value={nova.dia_semana} onChange={e => setNova(p => ({ ...p, dia_semana: Number(e.target.value) }))} style={inp}>
                          {DIAS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={lbl}>Profissional</label>
                        <select value={nova.profissional_username || ""} onChange={e => setNova(p => ({ ...p, profissional_username: e.target.value }))} style={inp}>
                          <option value="">— definir na escala</option>
                          {profissionais.map(p => <option key={p.username} value={p.username}>{p.nome || p.username}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={lbl}>Início *</label>
                        <input type="time" value={nova.hora_inicio} onChange={e => setNova(p => ({ ...p, hora_inicio: e.target.value }))} style={inp} />
                      </div>
                      <div>
                        <label style={lbl}>Término *</label>
                        <input type="time" value={nova.hora_fim} onChange={e => setNova(p => ({ ...p, hora_fim: e.target.value }))} style={inp} />
                      </div>
                      <div>
                        <label style={lbl}>Duração (min) *</label>
                        <input type="number" min="5" max="240" value={nova.duracao_min}
                          onChange={e => setNova(p => ({ ...p, duracao_min: Number(e.target.value) }))} style={inp} />
                      </div>
                      <div>
                        <label style={lbl}>Vagas — regulação</label>
                        <input type="number" min="0" value={nova.vagas_regulacao}
                          onChange={e => setNova(p => ({ ...p, vagas_regulacao: Number(e.target.value) }))} style={inp} />
                      </div>
                      <div>
                        <label style={lbl}>Vagas — marcação interna</label>
                        <input type="number" min="0" value={nova.vagas_internas}
                          onChange={e => setNova(p => ({ ...p, vagas_internas: Number(e.target.value) }))} style={inp} />
                      </div>
                      <div>
                        <label style={lbl}>Vagas — ordem de chegada</label>
                        <input type="number" min="0" value={nova.vagas_chegada}
                          onChange={e => setNova(p => ({ ...p, vagas_chegada: Number(e.target.value) }))} style={inp} />
                      </div>
                      <div>
                        <label style={lbl}>Vigência — início</label>
                        <input type="date" value={nova.vigencia_inicio || ""} onChange={e => setNova(p => ({ ...p, vigencia_inicio: e.target.value }))} style={inp} />
                      </div>
                      <div>
                        <label style={lbl}>Vigência — fim</label>
                        <input type="date" value={nova.vigencia_fim || ""} onChange={e => setNova(p => ({ ...p, vigencia_fim: e.target.value }))} style={inp} />
                      </div>
                    </div>

                    <div style={{ marginTop: 10, padding: "9px 12px", borderRadius: 8, fontSize: 12,
                                  background: v.erros.length ? "#f43f5e10" : "var(--surface-2)",
                                  border: `1px solid ${v.erros.length ? "#f43f5e55" : "var(--border)"}` }}>
                      <strong>{v.totalHorarios} horário(s)</strong> neste período · <strong>{v.cotasSomadas}</strong> vaga(s) distribuída(s)
                      {v.erros.map((e, i) => <div key={i} style={{ marginTop: 5 }}>⚠ {e}</div>)}
                      {v.avisos.map((a, i) => <div key={i} style={{ marginTop: 5, color: "var(--text-muted)" }}>{a}</div>)}
                    </div>

                    <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                      <button onClick={salvarAGrade} disabled={busy || !v.ok} style={btn("#22d3ee", !busy && v.ok)}>Salvar grade</button>
                      <button onClick={() => setNova(null)} style={{ ...btn("var(--surface-2)", false), color: "var(--text)" }}>Cancelar</button>
                    </div>
                  </>
                );
              })()}
            </div>
          )}

          <div style={cartao}>
            <div style={rotulo}>Grades cadastradas ({grades.length})</div>
            {grades.length === 0 ? (
              <div style={{ fontSize: 12.5, color: "var(--text-muted)", padding: "1rem", border: "1px dashed var(--border)", borderRadius: 8 }}>
                Nenhuma grade. Sem grade o ambulatório não oferece vaga — nem para a regulação, nem para marcação interna.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {grades.map(g => (
                  <div key={g.id} style={{ display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap",
                                           background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8,
                                           padding: "8px 11px", opacity: g.ativo ? 1 : 0.55 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, minWidth: 74 }}>{DIAS[g.dia_semana]}</span>
                    <span style={{ fontSize: 12.5, minWidth: 110 }}>{espec(g.especialidade_cod)}</span>
                    <span style={{ fontSize: 11.5, color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace" }}>
                      {String(g.hora_inicio).slice(0, 5)}–{String(g.hora_fim).slice(0, 5)} · {g.duracao_min}min
                    </span>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      {horariosDaGrade(g).length} horários · {cotasSomadas(g)} vagas
                      {" ("}{g.vagas_regulacao}R / {g.vagas_internas}I / {g.vagas_chegada}C{")"}
                    </span>
                    {g.profissional_username && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{prof(g.profissional_username)}</span>}
                    {!g.ativo && <span style={{ fontSize: 10, fontWeight: 800, color: "#d97706" }}>DESLIGADA</span>}
                    {canEdit && (
                      <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                        <button onClick={() => setNova({ ...g })} style={{ ...btn("var(--surface-2)", false), color: "var(--text)", padding: "4px 9px", fontSize: 11 }}>Editar</button>
                        <button onClick={async () => { await alternarAtivoGrade(sb, g.id, !g.ativo, currentUser); recarregarDia(); }}
                          style={{ ...btn("var(--surface-2)", false), color: "var(--text)", padding: "4px 9px", fontSize: 11 }}>
                          {g.ativo ? "Desligar" : "Religar"}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 10 }}>
              R = regulação · I = marcação interna · C = ordem de chegada. Grade não se apaga, só desliga —
              agendamento já feito aponta para ela.
            </div>
          </div>

          <div style={cartao}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
              <div style={{ ...rotulo, marginBottom: 0 }}>Bloqueios</div>
              {canEdit && !bloq && (
                <button onClick={() => setBloq({ data_inicio: data, data_fim: data, motivo: "" })}
                  style={{ ...btn("#d97706"), marginLeft: "auto", color: "#fff" }}>+ Bloquear período</button>
              )}
            </div>
            <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 10 }}>
              Feriado, férias, sala em reforma. Sem bloqueio a agenda oferece vaga em dia que o hospital não atende —
              e o paciente vem de outra cidade encontrar a porta fechada.
            </div>
            {bloq && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 10 }}>
                <div>
                  <label style={lbl}>De *</label>
                  <input type="date" value={bloq.data_inicio} onChange={e => setBloq(p => ({ ...p, data_inicio: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Até *</label>
                  <input type="date" value={bloq.data_fim} onChange={e => setBloq(p => ({ ...p, data_fim: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Especialidade</label>
                  <select value={bloq.especialidade_cod || ""} onChange={e => setBloq(p => ({ ...p, especialidade_cod: e.target.value }))} style={inp}>
                    <option value="">todas (feriado)</option>
                    {(catalogos.especialidade || []).map(x => <option key={x.codigo} value={x.codigo}>{x.nome}</option>)}
                  </select>
                </div>
                {/* PROFISSIONAL — a coluna existe desde a migração da agenda
                    e `salvarBloqueio` já a gravava; faltava o campo. Sem ele,
                    "o Dr. X está de férias mas a Dra. Y atende" obrigava a
                    bloquear a ESPECIALIDADE INTEIRA, o que zerava a produção
                    da colega no relatório. */}
                <div>
                  <label style={lbl}>Profissional</label>
                  <select value={bloq.profissional_username || ""} onChange={e => setBloq(p => ({ ...p, profissional_username: e.target.value }))} style={inp}>
                    <option value="">todos da especialidade</option>
                    {profissionais.map(p => <option key={p.username} value={p.username}>{p.nome || p.username}</option>)}
                  </select>
                  <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 3, lineHeight: 1.35 }}>
                    Escolha um só quando o afastamento for dele — bloquear a especialidade inteira zera a produção de quem continua atendendo.
                  </div>
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={lbl}>Motivo *</label>
                  <input value={bloq.motivo} onChange={e => setBloq(p => ({ ...p, motivo: e.target.value }))} style={inp} placeholder="Ex.: Feriado municipal" />
                </div>
                <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8 }}>
                  <button onClick={salvarOBloqueio} disabled={busy} style={btn("#22d3ee", !busy)}>Salvar bloqueio</button>
                  <button onClick={() => setBloq(null)} style={{ ...btn("var(--surface-2)", false), color: "var(--text)" }}>Cancelar</button>
                </div>
              </div>
            )}
            {bloqueios.length === 0 ? (
              <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Nenhum bloqueio alcança {data}.</div>
            ) : bloqueios.map(b => (
              <div key={b.id} style={{ fontSize: 12.5, padding: "6px 0", color: "var(--text-muted)" }}>
                {b.data_inicio} → {b.data_fim} · {b.especialidade_cod ? espec(b.especialidade_cod) : "todas"}
                {b.profissional_username ? ` · ${prof(b.profissional_username)}` : ""} · <strong>{b.motivo}</strong>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ══════════ PRODUÇÃO — conciliação com o painel do Ambulatório ══════════ */}
      {vista === "producao" && (
        <>
          <div style={cartao}>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div style={{ width: 170 }}>
                <label style={lbl}>Dia</label>
                <input type="date" value={data} onChange={e => setData(e.target.value)} style={inp} />
              </div>
              <button onClick={() => setData(hojeISO())} style={{ ...btn("var(--surface-2)", false), color: "var(--text)", marginBottom: 2 }}>Hoje</button>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 10, lineHeight: 1.55 }}>
              O painel do Ambulatório lê números <strong>digitados à mão</strong>. Aqui eles são apurados da
              agenda e comparados com o que está gravado. Gravar substitui o digitado pelo apurado —
              <strong> uma especialidade por vez, olhando a diferença</strong>. Emergências não aparecem:
              não passam pela agenda, então o número gravado é preservado como está.
            </div>
          </div>

          {conciliacao.semCorrespondencia.length > 0 && (
            <div style={{ ...cartao, borderLeft: "4px solid #d97706" }}>
              <div style={rotulo}>Sem correspondência no painel</div>
              {conciliacao.semCorrespondencia.map(s => (
                <div key={s.especialidadeCod} style={{ fontSize: 12.5, marginBottom: 4 }}>
                  <strong>{s.nome}</strong> — {s.apurada.realizadas} realizada(s), {s.apurada.ofertadas} ofertada(s).
                </div>
              ))}
              <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 6, lineHeight: 1.5 }}>
                O painel do Ambulatório tem cinco especialidades pactuadas, e esta não é nenhuma delas.
                A produção existe e não tem onde ser gravada — melhor dizer isso do que gravar numa chave
                que nenhuma tela lê.
              </div>
            </div>
          )}

          <div style={cartao}>
            <div style={rotulo}>Apurado da agenda × gravado no painel</div>
            {carregando ? (
              <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>carregando…</div>
            ) : conciliacao.linhas.length === 0 ? (
              <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
                Nenhuma especialidade com grade ou agendamento em {data}.
              </div>
            ) : conciliacao.linhas.map(l => (
              <div key={l.especialidadeCod} style={{ borderTop: "1px solid var(--border)", paddingTop: 10, marginTop: 10 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 7 }}>
                  <strong style={{ fontSize: 13 }}>{l.label}</strong>
                  {l.bloqueado && <span style={{ fontSize: 11, color: "#f43f5e" }}>dia bloqueado</span>}
                  <span style={{ fontSize: 11.5, color: l.divergente ? "#d97706" : "var(--text-muted)" }}>
                    {!l.gravada ? "ainda não lançado no painel"
                      : l.divergente ? `${l.divergencias.length} número(s) diferentes` : "confere"}
                  </span>
                  {canEdit && l.divergente && (
                    <button onClick={() => gravarLinha(l)} disabled={busy}
                      style={{ ...btn("#0d9488", !busy), marginLeft: "auto", color: "#fff" }}>
                      {l.gravada ? "Substituir pelo apurado" : "Lançar no painel"}
                    </button>
                  )}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(96px, 1fr))", gap: 7 }}>
                  {CAMPOS_APURAVEIS.map(c => {
                    const div = l.divergencias.find(d => d.campo === c);
                    return (
                      <div key={c} style={{ background: "var(--surface-2)", border: "1px solid var(--border)",
                                            borderLeft: `3px solid ${div ? "#d97706" : "var(--border)"}`,
                                            borderRadius: 8, padding: "7px 10px" }}>
                        <div style={{ fontSize: 9.5, color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>{c}</div>
                        <div style={{ fontSize: 17, fontWeight: 800, fontFamily: "JetBrains Mono, monospace" }}>
                          {l.apurada[c]}
                        </div>
                        <div style={{ fontSize: 10, color: div ? "#d97706" : "var(--text-muted)" }}>
                          {l.gravada ? `painel: ${l.gravada[c] ?? 0}` : "painel: —"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {conciliacao.orfas.length > 0 && (
            <div style={cartao}>
              <div style={rotulo}>Lançado à mão, sem agenda neste dia</div>
              {conciliacao.orfas.map(o => (
                <div key={o.id} style={{ fontSize: 12.5, marginBottom: 4 }}>
                  <strong>{o.label}</strong> — {o.gravada.realizadas ?? 0} realizada(s), {o.gravada.ofertadas ?? 0} ofertada(s).
                </div>
              ))}
              <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 6, lineHeight: 1.5 }}>
                Não é zerado nem sugerido para correção: pode ser produção legítima que não passou pela
                agenda, e apagar destruiria o único registro que existe dela.
              </div>
            </div>
          )}
        </>
      )}

      {/* ══════════ RELATÓRIO DO MÊS ══════════ */}
      {vista === "relatorio" && (
        <RelatorioAmbulatorio sb={sb} grades={grades}
          catalogoEspecialidades={catalogos.especialidade || []} />
      )}
    </div>
  );
}
