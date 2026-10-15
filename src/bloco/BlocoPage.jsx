// ═══════════════════════════════════════════════════════════
// BLOCO CIRÚRGICO — A TELA
//
// Saiu do App.jsx. O catálogo está em ./catalogo.js, o acesso ao banco em
// ./dados.js e as regras de agenda em ./agenda.js.
//
// ⚠️ O `sb` chega por prop. Nulo = sem banco.
// ═══════════════════════════════════════════════════════════

import { registrarAuditoria } from "../auditoria/dados.js";
import { assinaturaDe } from "../clinico/papeis.js";
import { btnContorno } from "../ui/base.jsx";
import { diffMin, fmtDur, horaFmt, nowISO, todayStr } from "../util/datas.js";
import { CC_STATUS, CHECKLIST_OMS } from "./catalogo.js";
import { linhaDaConferencia, linhaDoPulo, conferirPulo, resumoDaTrilha, pendenteAntesDe } from "./cirurgia-segura.js";
import { PAPEL_POR_CHAVE, conferirMembro, linhaDeEquipe, pendenciasDeFaturamento, resumoDaEquipe } from "./equipe.js";
import { addCcCirurgiaRemote, addMembroEquipe, deleteCcSalaRemote, loadCcChecklistDoDia, loadCcCirurgias, loadCcAldreteDoDia, loadCcAnestesiaDoDia, loadCcOpmeDoDia, loadItensDoEstoque, loadCcDescricoesDoDia, loadCcEquipeDoDia, loadCcSalas, loadPacientesDoMapa, loadProcedimentosDoCatalogo, loadProfissionaisDoBloco, rastrearLote, registrarAldrete, registrarAnestesia, registrarOpme, registrarChecklist, registrarDescricao, removerMembroEquipe, updateCcCirurgiaRemote, upsertCcSalaRemote } from "./dados.js";
import DescricaoCirurgicaModal from "./DescricaoCirurgica.jsx";
// 🔴 Os cinco componentes abaixo SAÍRAM deste arquivo em 13/10/2026, sem
// uma linha de mudança. O `BlocoPage.jsx` tinha 1.472 linhas.
import { AgendarCirurgiaModal, CancelarCirurgiaModal } from "./AgendarCirurgia.jsx";
import { BlocoIndicadores } from "./BlocoIndicadores.jsx";
import { CcSalasModal } from "./CcSalas.jsx";
import { ChecklistOmsModal } from "./ChecklistOms.jsx";
import { EquipeDaCirurgia } from "./EquipeDaCirurgia.jsx";
import { horasSemDescricao, jaOperou, semDescricao } from "./descricao.js";
import { FichaAnestesicaModal, RecuperacaoModal } from "./AnestesiaRpa.jsx";
import { resumoDaFicha } from "./anestesia.js";
import { OpmeModal, RastrearLote } from "./Opme.jsx";
import { implantesVigentes, resumoDoMaterial } from "./opme.js";
import { conferirIniciaisDaCirurgia, indexarCadastros } from "./identidade-cirurgia.js";
import { useEffect, useRef, useState } from "react";
import { naoDeuParaLer, algumaFalhou, avisoDeFalha } from "../util/leitura.js";

/**
 * A assinatura de quem conduziu, carimbada NO ATO.
 *
 * Nome + conselho + registro, como o resto do PEP faz (CFM 2.299/2021,
 * COFEN 754/2024). Carimbada e não referenciada porque o cadastro muda e
 * o registro não: quem assinou o Sign In de hoje assinou com o conselho
 * que tinha hoje.
 */
function assinaturaTexto(user) {
  const a = assinaturaDe(user);
  if (!a?.profissional_nome) return null;
  return [a.profissional_nome, a.conselho && a.registro_conselho ? `${a.conselho} ${a.registro_conselho}` : null]
    .filter(Boolean).join(" · ");
}

// ── Página Bloco Cirúrgico ──
export default function BlocoPage({ sb, currentUser, canEdit }) {
  const [data, setData] = useState(todayStr());
  const [salas, setSalas] = useState([]);
  const [cirurgias, setCirurgias] = useState([]);
  const [showSalas, setShowSalas] = useState(false);
  const [agendando, setAgendando] = useState(false); // false | true (nova) | objeto (edição)
  const [cancelando, setCancelando] = useState(null);
  const [checklist, setChecklist] = useState(null); // { cirurgia, fase }
  const [sub, setSub] = useState("mapa"); // mapa | indicadores
  const [, setTick] = useState(0);
  // 🔴 Ver o comentário de `refresh`: é o que impede gravar estado numa
  // tela que a pessoa já deixou.
  const naTela = useRef(true);
  const timers = useRef(new Set());
  /** Recarrega depois de um instante, e cancela se a tela sair antes. */
  const refreshDepois = (ms = 300) => {
    const t = setTimeout(() => { timers.current.delete(t); refresh(); }, ms);
    timers.current.add(t);
  };
  // Escrita que não se confirmou e leitura que não deu — as duas aparecem
  // na tela, porque as duas mudam o que a pessoa deveria fazer em seguida.
  const [erro, setErro] = useState(null);
  const [leituraFalhou, setLeituraFalhou] = useState(false);
  // A trilha de cirurgia segura do dia, numa consulta só.
  const [trilha, setTrilha] = useState([]);
  const [equipe, setEquipe] = useState([]);
  // O cadastro dos pacientes do mapa, indexado por prontuário. `null`
  // enquanto não li — e `null` também quando a leitura falha, porque o
  // cartão tem de dizer "não conferi" em vez de "confere".
  const [cadastros, setCadastros] = useState(null);
  const [procedimentos, setProcedimentos] = useState([]);
  const [profissionais, setProfissionais] = useState([]);
  // Qual cirurgia está com o painel de equipe aberto.
  const [vendoEquipe, setVendoEquipe] = useState(null);
  // As descrições cirúrgicas do dia, e qual está aberta para escrever.
  const [descricoes, setDescricoes] = useState([]);
  const [descrevendo, setDescrevendo] = useState(null);
  // A ficha anestésica e a recuperação pós-anestésica do dia.
  const [fichas, setFichas] = useState([]);
  const [aldrete, setAldrete] = useState([]);
  const [anestesiando, setAnestesiando] = useState(null);
  const [recuperando, setRecuperando] = useState(null);
  // O material do dia, o catálogo do almoxarifado e a cirurgia aberta.
  const [materiais, setMateriais] = useState([]);
  const [itensEstoque, setItensEstoque] = useState([]);
  const [materiando, setMateriando] = useState(null);
  const subBtn = ativo => ({ background: ativo ? "#22d3ee" : "transparent", color: ativo ? "#000" : "var(--text-3)", border: `1px solid ${ativo ? "#22d3ee" : "var(--border)"}`, borderRadius: 7, padding: "8px 16px", fontWeight: 700, cursor: "pointer", fontSize: 13 });

  // 🔴 "Não li" nunca vira "não tem". Com a rede caída, esta tela afirmava
  // "Nenhuma sala cadastrada" e — pior — "Sala livre neste dia" para cada
  // sala. A segunda é afirmação de ausência de cirurgia: alguém olha o mapa,
  // vê sala livre e encaixa uma urgência na sala onde há cirurgia marcada.
  /**
   * 🔴 A BANDEIRA É DO COMPONENTE, NÃO DO EFEITO — e a primeira versão
   * deste conserto errou exatamente nisso.
   *
   * O merge do #277 deixou a main vermelha com 4.342 testes passando:
   *
   *     ReferenceError: window is not defined
   *      ❯ refresh src/bloco/BlocoPage.jsx:104
   *     This error was caught after test environment was torn down.
   *
   * `refresh` espera DUAS rodadas de leitura — hoje nove tabelas — e só
   * então aplica o estado. Saindo da tela no meio, o `setState` cai num
   * componente que não existe mais: em produção é vazamento silencioso;
   * no vitest o ambiente já foi derrubado e o React estoura em `window`.
   *
   * ⚠️ MINHA PRIMEIRA TENTATIVA PASSOU O SINAL POR PARÂMETRO, a partir do
   * efeito — e o CI continuou vermelho, agora duas linhas abaixo. O
   * motivo: `refresh` é chamado de OUTROS TREZE lugares (toda gravação
   * faz `setTimeout(() => refresh(), 300)` ou `await refresh()`), e
   * todos usavam o padrão "estou viva". O arquivo que quebrava era
   * justamente `equipe.test.jsx`, que grava equipe.
   *
   * Guarda parcial é pior que guarda nenhuma: parece resolvido.
   *
   * Com `useRef` a bandeira vale para TODO caminho, inclusive o timer
   * que dispara 300 ms depois de a pessoa já ter trocado de tela.
   */
  async function refresh(d = data) {
    if (!sb) return;
    const [s, c] = await Promise.all([loadCcSalas(sb), loadCcCirurgias(sb, d)]);
    // A trilha depende dos ids, então vem num segundo tempo — mas o estado
    // é aplicado TUDO JUNTO, num render só. Com `setTrilha` depois de um
    // `await` solto, o mapa renderizava duas vezes a cada atualização (e
    // esta tela se atualiza sozinha a cada 30s); o segundo render trocava
    // os nós do DOM por baixo de quem estava clicando.
    const ids = (Array.isArray(c) ? c : []).map(x => x.id);
    const pronts = (Array.isArray(c) ? c : []).map(x => x.prontuario);
    const [t, eq, de, pac, fi, al, op] = await Promise.all([
      loadCcChecklistDoDia(sb, ids), loadCcEquipeDoDia(sb, ids),
      loadCcDescricoesDoDia(sb, ids), loadPacientesDoMapa(sb, pronts),
      loadCcAnestesiaDoDia(sb, ids), loadCcAldreteDoDia(sb, ids), loadCcOpmeDoDia(sb, ids),
    ]);
    // Saiu da tela enquanto as nove leituras voltavam: nada a aplicar.
    if (!naTela.current) return;
    // A marca é a IDENTIDADE do array — conferir ANTES de filtrar.
    setLeituraFalhou(algumaFalhou(s, c));
    // `indexarCadastros` devolve null quando a leitura falhou: é o que faz
    // o cartão dizer "não conferi" em vez de inventar "não cadastrado".
    setSalas(s); setCirurgias(c); setTrilha(t); setEquipe(eq);
    setDescricoes(de); setCadastros(indexarCadastros(pac));
    setFichas(fi); setAldrete(al); setMateriais(op);
  }
  // O catálogo de procedimentos não muda com o dia do mapa: carrega uma
  // vez, e não a cada 30s junto com o resto.
  useEffect(() => {
    if (!sb) return;
    // Mesma guarda: três leituras que podem voltar depois de a tela sair.
    let vivo = true;
    loadProcedimentosDoCatalogo(sb).then(r => { if (vivo) setProcedimentos(r); });
    loadProfissionaisDoBloco(sb).then(r => { if (vivo) setProfissionais(r); });
    loadItensDoEstoque(sb).then(r => { if (vivo) setItensEstoque(r); });
    return () => { vivo = false; };
  }, [sb]);

  useEffect(() => {
    refresh(data);
    const onFocus = () => refresh(data);
    window.addEventListener("focus", onFocus);
    const id = setInterval(() => setTick(t => t + 1), 30000);
    return () => { window.removeEventListener("focus", onFocus); clearInterval(id); };
  }, [data]);

  /**
   * A bandeira sobe no primeiro render e cai na saída, uma vez só. Os
   * timers que as gravações agendam são cancelados junto: sem isso, a tela
   * que a pessoa já deixou dispara nove leituras 300 ms depois, para
   * jogar fora.
   */
  useEffect(() => {
    naTela.current = true;
    return () => {
      naTela.current = false;
      for (const t of timers.current) clearTimeout(t);
      timers.current.clear();
    };
  }, []);

  const inp = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 11px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none", boxSizing: "border-box" };
  const secLbl = { fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 };

  // 🔴 A AUDITORIA SÓ É GRAVADA DEPOIS QUE A ESCRITA SE CONFIRMA.
  //
  // Antes, as quatro funções abaixo chamavam `registrarAuditoria` logo após
  // o `await`, sem olhar o resultado. Com a RLS barrando, o PostgREST
  // responde 2xx sem linha: nada ia para o banco e a TRILHA afirmava que
  // tinha ido. No checklist de cirurgia segura isso é registro
  // contraditório num evento sentinela — a trilha dizendo que a conferência
  // aconteceu, e o campo apagado.
  async function salvarCirurgia(c, idEdicao) {
    const r = idEdicao
      ? await updateCcCirurgiaRemote(sb, idEdicao, c)
      : await addCcCirurgiaRemote(sb, { ...c, status: "agendada" }, currentUser);
    if (!r.ok) { setErro(r.motivo); return; }
    registrarAuditoria(sb, currentUser, idEdicao ? "editar cirurgia" : "agendar cirurgia", `${c.iniciais} · ${c.procedimento}`, {});
    setErro(null); setAgendando(false); refreshDepois(400);
  }
  async function cancelar(c, motivo) {
    // Autor e hora: cirurgia CANCELADA na véspera e SUSPENSA com o
    // paciente já em jejum são indicadores diferentes, com donos
    // diferentes, e eram a mesma linha. Sem autor, a reunião de bloco
    // vira "quem cancelou isso?" sem resposta.
    const r = await updateCcCirurgiaRemote(sb, c.id, {
      status: "cancelada", cancelamento_motivo: motivo,
      cancelado_em: nowISO(), cancelado_por: currentUser?.name || null,
    });
    if (!r.ok) { setErro(r.motivo); return; }
    registrarAuditoria(sb, currentUser, "cancelar cirurgia", `${c.iniciais} · ${motivo}`, {});
    setErro(null); setCancelando(null); refreshDepois(300);
  }
  async function marcar(c, campos, acao) {
    const r = await updateCcCirurgiaRemote(sb, c.id, campos);
    if (!r.ok) { setErro(`${acao}: ${r.motivo}`); return; }
    registrarAuditoria(sb, currentUser, `bloco: ${acao}`, c.iniciais, {});
    setErro(null); refreshDepois(300);
  }
  /**
   * Grava a CONFERÊNCIA na trilha. O gatilho acende o selo no mesmo INSERT.
   *
   * Antes isto escrevia só `chk_<fase> = true` e os itens marcados morriam
   * no estado do modal. Agora vai a linha inteira — quais itens, o que
   * divergiu, a contagem em número — porque é o REGISTRO que a RDC 36/2013
   * exige, não a marcação.
   */
  async function concluirChecklist(c, faseKey, { marcados, divergencia, contagem } = {}) {
    const fase = CHECKLIST_OMS[faseKey];
    const r = await registrarChecklist(sb, linhaDaConferencia({
      cirurgia: c, fase: faseKey, marcados, divergencia, contagem, assinatura: assinaturaTexto(currentUser),
    }), currentUser);
    // O modal NÃO fecha quando a gravação não se confirmou: fechar daria a
    // impressão de concluído, e é a impressão que leva a equipe adiante.
    if (!r.ok) return { erro: `Checklist ${fase.label}: ${r.motivo}` };
    registrarAuditoria(sb, currentUser, `bloco: checklist ${fase.label}`, c.iniciais, {});
    setErro(null); setChecklist(null); refreshDepois(300);
    return { ok: true };
  }

  /**
   * Registra que um momento do checklist foi PULADO, e por quê.
   *
   * 🔴 Hoje pular não deixa rastro: a tela pergunta "entrar em sala mesmo
   * assim?" e quem clica OK segue. No mês seguinte o único vestígio é a
   * adesão caindo de 100% para 94% — sem saber em qual cirurgia, por
   * decisão de quem, nem por quê. É exatamente o que a análise de causa
   * raiz de um evento sentinela procura e não acha.
   *
   * Não trava: há politrauma em choque e cesárea de emergência, e travar a
   * porta do bloco por campo inverteria a prioridade. Custa uma frase.
   */
  async function acrescentarMembro(c, dados) {
    const falta = conferirMembro({ ...dados, jaNaEquipe: equipe.filter(m => String(m.cirurgia_id) === String(c.id)) });
    if (falta) return { erro: falta };
    const r = await addMembroEquipe(sb, linhaDeEquipe({ cirurgia: c, ...dados }), currentUser);
    if (!r.ok) return { erro: r.motivo };
    registrarAuditoria(sb, currentUser, "bloco: equipe +" + dados.papel, c.iniciais, {});
    setErro(null); await refresh();
    return { ok: true };
  }

  /**
   * Grava a DESCRIÇÃO CIRÚRGICA. O gatilho calcula a versão e acende o selo
   * `descricao_em` no mesmo INSERT.
   *
   * ⚠️ O modal NÃO fecha quando a gravação não se confirmou — e aqui isso
   * custa mais que no checklist: a pessoa acabou de escrever três
   * parágrafos. Fechar daria a impressão de documento gravado, e o
   * prontuário ficaria sem ele.
   */
  async function gravarDescricao(c, corpo) {
    const r = await registrarDescricao(sb, corpo, currentUser);
    if (!r.ok) return { ok: false, motivo: r.motivo };
    registrarAuditoria(sb, currentUser,
      corpo.corrige_id ? "bloco: corrigir descrição cirúrgica" : "bloco: descrição cirúrgica",
      `${c.iniciais} · ${corpo.procedimento_realizado || "?"}`, {});
    setErro(null); refreshDepois(300);
    return { ok: true };
  }

  /** Grava a ficha anestésica. O gatilho calcula a versão e acende o selo. */
  async function gravarAnestesia(c, corpo) {
    const r = await registrarAnestesia(sb, corpo, currentUser);
    if (!r.ok) return { ok: false, motivo: r.motivo };
    registrarAuditoria(sb, currentUser,
      corpo.corrige_id ? "bloco: corrigir ficha anestésica" : "bloco: ficha anestésica", c.iniciais, {});
    setErro(null); refreshDepois(300);
    return { ok: true };
  }

  /** Grava uma avaliação da recuperação. O `total` é coluna gerada no banco. */
  async function gravarAldrete(c, corpo) {
    const r = await registrarAldrete(sb, corpo, currentUser);
    if (!r.ok) return { ok: false, motivo: r.motivo };
    registrarAuditoria(sb, currentUser, "bloco: avaliação da RPA (Aldrete)", c.iniciais, {});
    setErro(null); await refresh();
    return { ok: true };
  }

  /**
   * 🔴 A ALTA DA RPA, que deixou de ser um clique.
   *
   * A frase de recusa vem do BANCO — é o gatilho que sabe qual foi o melhor
   * escore e qual parâmetro está zerado. Repetir a regra aqui criaria duas
   * versões para divergirem, e a do banco é a que vale.
   */
  async function altaDaRpa(c) {
    const r = await updateCcCirurgiaRemote(sb, c.id, { status: "concluida", rpa_saida_em: nowISO() });
    if (!r.ok) return { ok: false, motivo: r.motivo };
    registrarAuditoria(sb, currentUser, "bloco: alta da RPA", c.iniciais, {});
    setErro(null); await refresh();
    return { ok: true };
  }

  /**
   * Grava uma linha de material. O gatilho decide a baixa no kardex e,
   * quando ela falha, registra a pendência SEM derrubar o rastreio.
   */
  async function gravarOpme(c, corpo) {
    const r = await registrarOpme(sb, corpo, currentUser);
    if (!r.ok) return { ok: false, motivo: r.motivo };
    registrarAuditoria(sb, currentUser,
      corpo.estorno_de ? "bloco: estorno de OPME" : "bloco: OPME",
      `${c.iniciais} · ${corpo.descricao || "?"}${corpo.lote ? ` · lote ${corpo.lote}` : ""}`, {});
    setErro(null); await refresh();
    return { ok: true };
  }

  async function tirarMembro(c, membro) {
    if (!confirm(`Tirar ${membro.nome} (${PAPEL_POR_CHAVE[membro.papel]?.label || membro.papel}) da equipe desta cirurgia?`)) return;
    const r = await removerMembroEquipe(sb, membro.id);
    if (!r.ok) { setErro(r.motivo); return; }
    registrarAuditoria(sb, currentUser, "bloco: equipe −" + membro.papel, c.iniciais, {});
    setErro(null); await refresh();
  }

  async function pularChecklist(c, faseKey) {
    const fase = CHECKLIST_OMS[faseKey];
    const motivo = prompt(
      `Seguir SEM o ${fase.label} (${fase.quando}).\n\n` +
      "Por quê? A justificativa fica gravada com seu nome na trilha de cirurgia segura — " +
      "é o que alguém vai ler se este caso virar análise de evento.");
    if (motivo === null) return false;
    const falta = conferirPulo({ cirurgia: c, fase: faseKey, motivo });
    if (falta) { setErro(falta); return false; }
    const r = await registrarChecklist(sb, linhaDoPulo({
      cirurgia: c, fase: faseKey, motivo, assinatura: assinaturaTexto(currentUser),
    }), currentUser);
    if (!r.ok) { setErro(`Não consegui registrar o pulo do ${fase.label}: ${r.motivo}`); return false; }
    registrarAuditoria(sb, currentUser, `bloco: PULOU ${fase.label}`, c.iniciais, {});
    setErro(null); refreshDepois(300);
    return true;
  }

  const ativas = cirurgias.filter(c => c.status !== "cancelada");
  const canceladas = cirurgias.filter(c => c.status === "cancelada");
  const emAndamento = cirurgias.filter(c => ["checkin", "em_cirurgia", "recuperacao"].includes(c.status));
  const concluidas = cirurgias.filter(c => c.status === "concluida");
  const salasAtivas = salas.filter(s => s.ativa !== false);
  // agrupa por sala pro mapa
  const porSala = salasAtivas.map(s => ({ sala: s.nome, lista: ativas.filter(c => c.sala === s.nome) }));
  const semSala = ativas.filter(c => !c.sala || !salasAtivas.some(s => s.nome === c.sala));

  // Mesma razão do `cartaoDaCirurgia`: função, não componente definido
  // dentro do render. Aqui o estrago é menor (não há input a perder o
  // foco), mas o remount a cada 30s é o mesmo.
  const cardDeNumero = (label, valor, cor) => (
    <div key={label} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 16px", minWidth: 120, flex: 1 }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: cor || "var(--text)", fontFamily: "JetBrains Mono, monospace", marginTop: 4 }}>{valor}</div>
    </div>
  );
  const StatusBadge = ({ st }) => { const v = CC_STATUS[st]; if (!v) return null;
    return <span style={{ background: v.cor + "22", color: v.cor, border: `1px solid ${v.cor}55`, borderRadius: 99, padding: "2px 10px", fontSize: 11, fontWeight: 800 }}>{v.label}</span>; };

  /**
   * 🔴 FUNÇÃO, NÃO COMPONENTE — o mesmo motivo do `par` no checklist de
   * cirurgia segura, e a mesma armadilha que este projeto já documentou.
   *
   * Era `const CirurgiaCard = ({ c }) => ...`, usado como
   * `<CirurgiaCard c={c} />`. Definido DENTRO do render, isso cria um
   * tipo de componente NOVO a cada render — e o React, vendo tipo novo,
   * desmonta e remonta a árvore inteira em vez de atualizá-la.
   *
   * Esta tela se atualiza sozinha a cada 30 segundos. Até aqui, de meio
   * em meio minuto, TODOS os cartões do mapa eram destruídos e
   * reconstruídos — trocando os nós do DOM debaixo de quem estava
   * clicando num botão. É o mesmo defeito que já tinha sido corrigido no
   * `refresh` ("o segundo render trocava os nós do DOM por baixo de quem
   * estava clicando"), sobrevivendo aqui com outra cara.
   *
   * Como função chamada — `{cartaoDaCirurgia(c)}` — não há tipo novo: o
   * React só vê o JSX que ela devolve, e reconcilia normalmente.
   *
   * ⚠️ E por isso ela NÃO virou arquivo separado: precisaria receber 20
   * props do escopo de fora, e assinatura de 20 parâmetros é outro
   * cheiro. O ganho aqui é o remount, não a contagem de linhas.
   */
  const cartaoDaCirurgia = c => {
   // 🔴 QUEM VAI SER OPERADO VEM DO CADASTRO, PELO PRONTUÁRIO — não do que
   // alguém digitou no agendamento. O carimbo não some: vira o aviso.
   const id = conferirIniciaisDaCirurgia(c, cadastros);
   return (
    // A `key` saiu do ponto de uso e veio para cá — era `<CirurgiaCard
    // key={c.id} />`, e sem ela a lista remontaria a cada reordenação.
    <div key={c.id} style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderLeft: `4px solid ${CC_STATUS[c.status]?.cor || "var(--border)"}`, borderRadius: 8, padding: "10px 13px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: 800, fontSize: 13 }}>{c.hora_prevista ? c.hora_prevista.slice(0, 5) : "—"}</span>
        <strong>{id.exibir}</strong>
        {c.prontuario && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>reg. {c.prontuario}</span>}
        {id.estado === "divergem" && (
          <span style={{ background: "#f43f5e22", color: "#f43f5e", border: "1px solid #f43f5e66", borderRadius: 99, padding: "2px 9px", fontSize: 10.5, fontWeight: 800 }}>
            iniciais divergem do cadastro
          </span>
        )}
        <StatusBadge st={c.status} />
        <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-muted)" }}>{c.duracao_prev_min ? `${c.duracao_prev_min}min prev.` : ""}</span>
      </div>
      {/* O aviso por extenso, com os dois valores e o nome — é por ele que
          alguém decide se o cartão aponta para a pessoa certa. Vermelho só
          na divergência: "não conferi" é cinza-âmbar, e dizer as duas
          coisas no mesmo tom treinaria a equipe a ignorar as duas. */}
      {id.aviso && (
        <div role={id.grave ? "alert" : undefined}
          style={{ fontSize: 11.5, marginTop: 4, fontWeight: id.grave ? 700 : 500,
                   color: id.grave ? "#f43f5e" : "var(--text-muted)" }}>
          {id.grave ? "🔴 " : ""}{id.aviso}
        </div>
      )}
      <div style={{ fontSize: 12.5, color: "var(--text-2)", marginTop: 4 }}>{c.procedimento}{c.cirurgiao ? ` · Dr(a). ${c.cirurgiao}` : ""}</div>
      {c.opme && <div style={{ fontSize: 11.5, color: "#d97706", marginTop: 3 }}>OPME/materiais: {c.opme}</div>}
      {c.observacao && <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 2 }}>Obs.: {c.observacao}</div>}
      {c.status === "cancelada" && c.cancelamento_motivo && <div style={{ fontSize: 11.5, color: "#f43f5e", marginTop: 3, fontWeight: 600 }}>Motivo: {c.cancelamento_motivo}</div>}

      {/* Selos do checklist de cirurgia segura */}
      {!["agendada", "cancelada"].includes(c.status) && (
        <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
          {Object.entries(CHECKLIST_OMS).map(([k, fase]) => (
            <span key={k} style={{ fontSize: 10, fontWeight: 800, borderRadius: 99, padding: "2px 8px", background: c[fase.campo] ? fase.cor + "22" : "var(--surface-3)", color: c[fase.campo] ? fase.cor : "var(--text-muted)", border: `1px solid ${c[fase.campo] ? fase.cor + "55" : "var(--border)"}` }}>
              {c[fase.campo] ? "✓ " : ""}{fase.label}
            </span>
          ))}
        </div>
      )}

      {/* A EQUIPE, e o que ela impede de faturar.
          Antes o cartão mostrava um sobrenome. O aviso de CBO não trava
          nada: a cirurgia acontece antes de a conta existir, e barrar o
          registro do ato por campo de faturamento inverteria a
          prioridade. O que não pode é alguém descobrir a falta no
          processamento do mês seguinte. */}
      {(() => {
        const minha = equipe.filter(m => String(m.cirurgia_id) === String(c.id));
        const pend = c.status === "cancelada" ? [] : pendenciasDeFaturamento(minha);
        return (
          <div style={{ marginTop: 6, fontSize: 11.5, lineHeight: 1.5 }}>
            <span style={{ color: "var(--text-muted)" }}>
              {minha.length ? resumoDaEquipe(minha) : "Equipe não registrada"}
            </span>
            {canEdit && (
              <button onClick={() => setVendoEquipe(vendoEquipe === c.id ? null : c.id)}
                style={{ marginLeft: 8, background: "transparent", border: "1px solid var(--border)",
                         borderRadius: 5, padding: "1px 7px", fontSize: 10.5, cursor: "pointer",
                         color: "var(--text-3)" }}>
                {vendoEquipe === c.id ? "fechar" : "equipe"}
              </button>
            )}
            {/* ⚠️ OS AVISOS FICAM SEMPRE DENTRO DESTE DIV, mesmo quando não
                há nenhum — e isso não é estilo, é correção de defeito.
                Antes eles eram irmãos soltos do painel de equipe: ao
                registrar o cirurgião, o aviso sumia, o número de filhos
                mudava, o React REMONTAVA o `EquipeDaCirurgia` e o
                formulário se esvaziava no meio do uso (achado caminhando
                pela tela — o teste não pegava, porque o teste não
                acrescenta um membro e continua digitando). Com o contêiner
                fixo, a posição do painel entre os irmãos não muda. */}
            <div>
              {pend.map((a, i) => (
                <div key={i} style={{ color: "#fbbf24", fontSize: 11, marginTop: 2 }}>⚠ {a}</div>
              ))}
            </div>
            {vendoEquipe === c.id && (
              <EquipeDaCirurgia key={`equipe-${c.id}`} membros={minha} perfis={profissionais}
                onAdd={d => acrescentarMembro(c, d)} onTirar={m => tirarMembro(c, m)} />
            )}
          </div>
        );
      })()}

      {/* 🔴 A TRILHA, NA LINHA DA CIRURGIA.
          Sem ela, uma cirurgia com os três selos acesos e uma com três
          momentos PULADOS com justificativa ficam idênticas no mapa — e são
          opostas. O pulo não acende selo (o gatilho cuida disso), então sem
          esta linha ele seria invisível exatamente como antes. */}
      {(() => {
        const minhas = trilha.filter(t => String(t.cirurgia_id) === String(c.id));
        const r = resumoDaTrilha(minhas);
        if (!r?.texto) return null;
        return (
          <div style={{ marginTop: 5, fontSize: 11, color: "#fbbf24", lineHeight: 1.5 }}>
            ⚠ {r.texto}
            {minhas.filter(t => t.tipo === "pulo" || (t.divergencia || "").trim()).map(t => (
              <div key={t.id} style={{ color: "var(--text-muted)", fontStyle: "italic", marginTop: 1 }}>
                {t.tipo === "pulo" ? "PULOU" : "divergência"} {CHECKLIST_OMS[t.fase]?.label || t.fase} — {t.divergencia}
                {t.assinatura ? ` · ${t.assinatura}` : t.usuario ? ` · ${t.usuario}` : ""}
              </div>
            ))}
          </div>
        );
      })()}

      {/* Tempos registrados */}
      {(c.entrada_sala_em || c.checkin_em) && c.status !== "cancelada" && (
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6, lineHeight: 1.7 }}>
          {c.checkin_em && <span>Check-in {horaFmt(c.checkin_em).slice(-5)} · </span>}
          {c.entrada_sala_em && <span>Sala {horaFmt(c.entrada_sala_em).slice(-5)} · </span>}
          {c.inicio_anestesia_em && <span>Anestesia {horaFmt(c.inicio_anestesia_em).slice(-5)} · </span>}
          {c.inicio_cirurgia_em && <span>Incisão {horaFmt(c.inicio_cirurgia_em).slice(-5)} · </span>}
          {c.fim_cirurgia_em && <span>Fim {horaFmt(c.fim_cirurgia_em).slice(-5)} · </span>}
          {c.inicio_cirurgia_em && c.fim_cirurgia_em && <strong style={{ color: "var(--text-3)" }}>cirurgia {fmtDur(diffMin(c.inicio_cirurgia_em, c.fim_cirurgia_em))} · </strong>}
          {c.rpa_entrada_em && !c.rpa_saida_em && <strong style={{ color: "#d97706" }}>na RPA há {fmtDur(diffMin(c.rpa_entrada_em, nowISO()))}</strong>}
          {c.rpa_entrada_em && c.rpa_saida_em && <span>RPA {fmtDur(diffMin(c.rpa_entrada_em, c.rpa_saida_em))}</span>}
        </div>
      )}

      {/* 🔴 A DESCRIÇÃO CIRÚRGICA — fora do bloco de ações acima, e de
          propósito: aquele bloco esconde tudo quando a cirurgia está
          `concluida`, que é exatamente quando o documento mais falta. Era o
          caminho para o documento exigido pela CFM 1.638/2002 ficar
          inalcançável justamente na cirurgia terminada. */}
      {jaOperou(c) && c.status !== "cancelada" && (
        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button onClick={() => setDescrevendo(c)}
            style={btnContorno(c.descricao_em ? "var(--text-3)" : "#8b5cf6")}>
            {c.descricao_em ? "Ver / corrigir descrição cirúrgica" : "Escrever a descrição cirúrgica"}
          </button>
          <button onClick={() => setMateriando(c)}
            style={btnContorno(c.opme_em ? "var(--text-3)" : "#8b5cf6")}>
            {c.opme_em ? "Ver / registrar material" : "Material e OPME"}
          </button>
          {/* Os implantes no próprio cartão: é o que a equipe confere no
              fim da sala, e é o que falta quando chega um recall. */}
          {(() => {
            const meus = implantesVigentes(materiais.filter(m => String(m.cirurgia_id) === String(c.id)));
            if (!meus.length) return null;
            return (
              <span style={{ fontSize: 11.5, color: "#8b5cf6", lineHeight: 1.5 }}>
                {meus.length} implante(s): {meus.map(resumoDoMaterial).join(" | ")}
              </span>
            );
          })()}
          <button onClick={() => setAnestesiando(c)}
            style={btnContorno(c.anestesia_em ? "var(--text-3)" : "#8b5cf6")}>
            {c.anestesia_em ? "Ver / corrigir ficha anestésica" : "Escrever a ficha anestésica"}
          </button>
          {/* A ficha anestésica resumida no cartão: é o que a equipe da RPA
              lê antes de receber o paciente — e "via aérea difícil" é a
              linha que muda a conduta se ele precisar ser reintubado. */}
          {(() => {
            const f = fichas.find(x => String(x.cirurgia_id) === String(c.id)
              && !fichas.some(y => String(y.corrige_id) === String(x.id)));
            if (!f) return null;
            return (
              <span style={{ fontSize: 11.5, color: f.via_aerea_dificil ? "#f43f5e" : "var(--text-3)", lineHeight: 1.5 }}>
                {resumoDaFicha(f)}
              </span>
            );
          })()}
          {!c.descricao_em && (() => {
            const h = horasSemDescricao(c);
            return (
              <span style={{ fontSize: 11.5, color: "#f43f5e", lineHeight: 1.5 }}>
                SEM descrição cirúrgica{h != null ? ` há ${h}h` : ""} — é exigência legal, e o
                faturamento cobra o código do agendamento até ela existir.
              </span>
            );
          })()}
        </div>
      )}

      {canEdit && c.status !== "cancelada" && c.status !== "concluida" && (
        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
          {c.status === "agendada" && <>
            <button onClick={() => marcar(c, { status: "checkin", checkin_em: nowISO() }, "check-in")} style={btnContorno("#3b82f6")}>Check-in do paciente</button>
            <button onClick={() => setAgendando(c)} style={btnContorno("var(--text-3)")}>Editar</button>
            <button onClick={() => setCancelando(c)} style={btnContorno("#f43f5e")}>Cancelar cirurgia</button>
          </>}
          {c.status === "checkin" && <>
            {!c.chk_sign_in && <button onClick={() => setChecklist({ cirurgia: c, fase: "sign_in" })} style={btnContorno("#3b82f6")}>Cirurgia segura: Sign In</button>}
            <button onClick={async () => { if (pendenteAntesDe(c, "entrada_sala") && !(await pularChecklist(c, "sign_in"))) return; marcar(c, { status: "em_cirurgia", entrada_sala_em: nowISO() }, "entrada na sala"); }} style={btnContorno("#22d3ee")}>Entrada na sala</button>
            <button onClick={() => setCancelando(c)} style={btnContorno("#f43f5e")}>Cancelar</button>
          </>}
          {c.status === "em_cirurgia" && <>
            {!c.inicio_anestesia_em && <button onClick={() => marcar(c, { inicio_anestesia_em: nowISO() }, "inicio anestesia")} style={btnContorno("var(--text-3)")}>Início da anestesia</button>}
            {!c.chk_time_out && <button onClick={() => setChecklist({ cirurgia: c, fase: "time_out" })} style={btnContorno("#d97706")}>Cirurgia segura: Time Out</button>}
            {!c.inicio_cirurgia_em && <button onClick={async () => { if (pendenteAntesDe(c, "incisao") && !(await pularChecklist(c, "time_out"))) return; marcar(c, { inicio_cirurgia_em: nowISO() }, "inicio cirurgia"); }} style={btnContorno("#22d3ee")}>Início da cirurgia</button>}
            {c.inicio_cirurgia_em && !c.fim_cirurgia_em && <button onClick={() => marcar(c, { fim_cirurgia_em: nowISO() }, "fim cirurgia")} style={btnContorno("#22d3ee")}>Fim da cirurgia</button>}
            {c.fim_cirurgia_em && !c.chk_sign_out && <button onClick={() => setChecklist({ cirurgia: c, fase: "sign_out" })} style={btnContorno("#34d399")}>Cirurgia segura: Sign Out</button>}
            {c.fim_cirurgia_em && <button onClick={async () => { if (pendenteAntesDe(c, "rpa") && !(await pularChecklist(c, "sign_out"))) return; marcar(c, { status: "recuperacao", saida_sala_em: nowISO(), rpa_entrada_em: nowISO() }, "envio RPA"); }} style={btnContorno("#d97706")}>Enviar para RPA</button>}
          </>}
          {c.status === "recuperacao" && (
            /* 🔴 Era um clique que concluía a cirurgia. Agora ABRE a ficha de
               recuperação: a alta só aparece depois de um escore que libere.
               Não é uma trava a mais na frente do mesmo botão — é o botão
               passando a fazer o que quem está na RPA ia fazer de todo jeito. */
            <button onClick={() => setRecuperando(c)} style={btnContorno("#34d399")}>Recuperação (Aldrete) — avaliar e dar alta</button>
          )}
        </div>
      )}
    </div>
   );
  };

  return (
    <div style={{ padding: "1.25rem 1.5rem", overflowY: "auto", height: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Bloco Cirúrgico — Mapa e Agenda</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: "1.25rem" }}>Agenda por sala, cirurgia segura e tempos do dia. Dados de saúde — use iniciais e prontuário (LGPD).</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {canEdit && <button onClick={() => setShowSalas(true)} style={{ background: "transparent", color: "var(--text-2)", border: "1px solid var(--border-2)", borderRadius: 6, padding: "8px 16px", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>Salas ({salasAtivas.length})</button>}
          {canEdit && <button onClick={() => setAgendando(true)} style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "8px 18px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>+ Agendar cirurgia</button>}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: "1.25rem", flexWrap: "wrap" }}>
        <button onClick={() => setSub("mapa")} style={subBtn(sub === "mapa")}>Mapa do dia</button>
        <button onClick={() => setSub("indicadores")} style={subBtn(sub === "indicadores")}>Indicadores</button>
        {/* 🔴 A aba que justifica a tabela de OPME existir. Fica no
            primeiro nível porque quem a abre está com um comunicado de
            recall na mão — não é relatório para procurar em submenu. */}
        <button onClick={() => setSub("rastreio")} style={subBtn(sub === "rastreio")}>Rastrear lote</button>
      </div>

      {sub === "indicadores" && <BlocoIndicadores sb={sb} salasAtivas={salasAtivas} />}
      {sub === "rastreio" && (
        <div style={{ padding: "0 0 1.5rem" }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Rastrear lote de OPME</div>
          <RastrearLote onBuscar={t => rastrearLote(sb, t)} />
        </div>
      )}

      {sub === "mapa" && (<>
      {/* Escrita que não se confirmou. Fica no topo porque muda o que a
          pessoa deve fazer AGORA: conferir antes de seguir o fluxo. */}
      {erro && (
        <div role="alert" style={{ marginBottom: 14, background: "#f43f5e10", border: "1px solid #f43f5e55",
                                   borderLeft: "3px solid #f43f5e", borderRadius: 8, padding: "10px 13px",
                                   fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.5 }}>
          {erro}
        </div>
      )}
      {/* Leitura que falhou. O mapa continua desenhado — o que não pode é
          ele passar por completo. */}
      {leituraFalhou && (
        <div role="alert" style={{ marginBottom: 14, background: "#fbbf2410", border: "1px solid #fbbf2455",
                                   borderLeft: "3px solid #fbbf24", borderRadius: 8, padding: "10px 13px",
                                   fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.5 }}>
          {avisoDeFalha("as salas e as cirurgias deste dia")} <strong>Não encaixe cirurgia por este mapa enquanto ele estiver assim.</strong>
        </div>
      )}
      {/* 🔴 O PASSIVO DOCUMENTAL DO DIA, somado.
          Cartão por cartão a falta aparece; somada, ela vira trabalho a
          fazer antes de o plantão acabar — e é essa a leitura que faz
          alguém escrever a descrição hoje, e não na véspera da auditoria.
          Usa o SELO `descricao_em`, que o gatilho mantém. */}
      {(() => {
        const faltam = semDescricao(cirurgias);
        if (!faltam.length) return null;
        return (
          <div style={{ marginBottom: 14, background: "#8b5cf610", border: "1px solid #8b5cf655",
                        borderLeft: "3px solid #8b5cf6", borderRadius: 8, padding: "10px 13px",
                        fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.5 }}>
            <strong>{faltam.length} cirurgia(s) deste dia sem descrição cirúrgica</strong> — {faltam.map(c => c.iniciais).join(", ")}.
            O documento é exigência da CFM 1.638/2002, e até ele existir a conta cobra o código do agendamento.
          </div>
        );
      })()}
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: "1.25rem", flexWrap: "wrap" }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-3)" }}>Dia do mapa</label>
        <input type="date" value={data} onChange={e => setData(e.target.value)} style={inp} />
        {data !== todayStr() && <button onClick={() => setData(todayStr())} style={btnContorno("#22d3ee")}>Hoje</button>}
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: "1.25rem" }}>
        {cardDeNumero("Cirurgias no dia", ativas.length, "#22d3ee")}
        {cardDeNumero("Em andamento", emAndamento.length, "#3b82f6")}
        {cardDeNumero("Concluídas", concluidas.length, "#34d399")}
        {cardDeNumero("Canceladas", canceladas.length, canceladas.length > 0 ? "#f43f5e" : "var(--text)")}
      </div>

      {/* MAPA CIRÚRGICO POR SALA */}
      <div style={secLbl}>Mapa cirúrgico — {new Date(data + "T00:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" })}</div>
      {salasAtivas.length === 0 ? (
        <div style={{ background: "var(--surface)", border: "1px dashed var(--border)", borderRadius: 10, padding: "1.5rem", textAlign: "center", color: "var(--text-muted)", fontSize: 13, marginBottom: "1.25rem" }}>
          {leituraFalhou
            ? "Não consegui ler o catálogo de salas — não sei se há salas cadastradas. Recarregue."
            : <>Nenhuma sala cadastrada. {canEdit ? "Clique em Salas para cadastrar as salas do bloco." : ""}</>}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 12, marginBottom: "1.25rem" }}>
          {porSala.map(({ sala, lista }) => (
            <div key={sala} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                {sala}
                <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>{lista.length} cirurgia(s)</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {lista.length === 0 && <div style={{ fontSize: 12, color: leituraFalhou ? "#fbbf24" : "var(--text-muted)", textAlign: "center", padding: "10px 0" }}>{leituraFalhou ? "Não consegui ler as cirurgias — NÃO é \"livre\"." : "Sala livre neste dia."}</div>}
                {lista.map(c => cartaoDaCirurgia(c))}
              </div>
            </div>
          ))}
        </div>
      )}
      {semSala.length > 0 && (
        <div style={{ marginBottom: "1.25rem" }}>
          <div style={secLbl}>Sem sala definida ({semSala.length})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{semSala.map(c => cartaoDaCirurgia(c))}</div>
        </div>
      )}

      {/* CANCELADAS DO DIA */}
      {canceladas.length > 0 && (
        <details style={{ marginBottom: "1.25rem" }}>
          <summary style={{ ...secLbl, cursor: "pointer" }}>Canceladas no dia ({canceladas.length})</summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>{canceladas.map(c => cartaoDaCirurgia(c))}</div>
        </details>
      )}
      </>)}

      {agendando && <AgendarCirurgiaModal sb={sb} procedimentos={procedimentos} cirurgia={agendando === true ? null : agendando} data={data} salas={salasAtivas} cirurgiasDoDia={cirurgias} onClose={() => setAgendando(false)} onSave={salvarCirurgia} />}
      {cancelando && <CancelarCirurgiaModal cirurgia={cancelando} onClose={() => setCancelando(null)} onConfirm={cancelar} />}
      {/* A conferência de identidade vai COM a cirurgia para o modal: é ali
          que o item 1 do Sign In manda confirmar a identidade, e era ali
          que apareciam as iniciais digitadas. */}
      {checklist && <ChecklistOmsModal cirurgia={checklist.cirurgia} fase={checklist.fase} identidade={conferirIniciaisDaCirurgia(checklist.cirurgia, cadastros)} onClose={() => setChecklist(null)} onConfirm={dados => concluirChecklist(checklist.cirurgia, checklist.fase, dados)} />}
      {descrevendo && (
        <DescricaoCirurgicaModal
          cirurgia={descrevendo}
          /* ⚠️ Filtra da lista do dia, mas a MARCA de falha precisa chegar
             ao modal: `descricoes` é o array marcado, e filtrar devolve um
             array comum. Por isso o modal recebe a lista crua quando a
             leitura falhou — é ela que decide entre "não tem descrição" e
             "não consegui ler". */
          descricoes={naoDeuParaLer(descricoes) ? descricoes
            : descricoes.filter(d => String(d.cirurgia_id) === String(descrevendo.id))}
          procedimentos={procedimentos}
          assinatura={assinaturaTexto(currentUser)}
          onClose={() => setDescrevendo(null)}
          onConfirm={corpo => gravarDescricao(descrevendo, corpo)} />
      )}
      {materiando && (
        <OpmeModal
          cirurgia={materiando}
          /* A marca de FALHA precisa chegar ao modal: filtrar devolve
             array comum, e aqui "não li" viraria "não usou material". */
          materiais={naoDeuParaLer(materiais) ? materiais
            : materiais.filter(m => String(m.cirurgia_id) === String(materiando.id))}
          itens={itensEstoque}
          assinatura={assinaturaTexto(currentUser)}
          onClose={() => setMateriando(null)}
          onRegistrar={corpo => gravarOpme(materiando, corpo)}
          onEstornar={corpo => gravarOpme(materiando, corpo)} />
      )}
      {anestesiando && (
        <FichaAnestesicaModal
          cirurgia={anestesiando}
          /* A MARCA de falha precisa chegar ao modal: filtrar devolve um
             array comum, e aí "não consegui ler" viraria "não tem ficha". */
          fichas={naoDeuParaLer(fichas) ? fichas
            : fichas.filter(f => String(f.cirurgia_id) === String(anestesiando.id))}
          assinatura={assinaturaTexto(currentUser)}
          onClose={() => setAnestesiando(null)}
          onConfirm={corpo => gravarAnestesia(anestesiando, corpo)} />
      )}
      {recuperando && (
        <RecuperacaoModal
          cirurgia={recuperando}
          avaliacoes={naoDeuParaLer(aldrete) ? aldrete
            : aldrete.filter(x => String(x.cirurgia_id) === String(recuperando.id))}
          assinatura={assinaturaTexto(currentUser)}
          onClose={() => setRecuperando(null)}
          onAvaliar={corpo => gravarAldrete(recuperando, corpo)}
          onAlta={() => altaDaRpa(recuperando)} />
      )}
      {showSalas && <CcSalasModal salas={salas} onClose={() => setShowSalas(false)} onSave={async s => { await upsertCcSalaRemote(sb, s, currentUser); refresh(); }} onDelete={async n => { await deleteCcSalaRemote(sb, n); refresh(); }} isMaster={currentUser?.role === "adm_master"} />}
    </div>
  );
}


