// ═══════════════════════════════════════════════════════════
// TORRE DE COMANDO — a tela do painel executivo
//
// O hospital inteiro em uma tela, para quem responde por ele. Não é o Centro
// de Monitoramento com mais cards: é outra pergunta. O Centro diz o que fazer
// agora; a Torre diz se o hospital está indo bem — e as duas leituras pedem
// telas diferentes, públicos diferentes e permissões diferentes.
//
// ── AS TRÊS REGRAS DO DESENHO ───────────────────────────────
//
// 1. **O QUE NÃO FOI LIDO APARECE.** Card sem leitura não mostra zero: mostra
//    tracejado e diz o que não deu para ler. Num painel de diretoria, "0
//    materiais em falta" e "não consegui ler o estoque" levam a atos opostos,
//    e um número bonito é a mentira mais cara que este sistema pode contar.
//
// 2. **NÚMERO GRANDE NÃO BASTA — PRECISA DE DENOMINADOR.** "82%" sozinho não
//    é informação; "82% · 41 de 50 leitos" é. Todo indicador carrega de onde
//    ele saiu, porque é isso que permite discordar dele.
//
// 3. **CANCELAMENTO TEM NOME.** A lista de cirurgias canceladas sai com
//    paciente e motivo. Um número agregado de cancelamentos não permite
//    agir; um nome, sim — e é sobre nomes que a direção cobra o bloco.
//
// O relógio corre sozinho: a tela recarrega a cada minuto e mostra há quanto
// tempo os dados são. Painel de comando que só atualiza no F5 mente com cara
// de atualizado.
// ═══════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  NIVEL, censoGeral, censoDeSetores, setoresDeUti, mapaDeSetores,
  altasDoDia, permanenciaMedia, giroDeLeito, esperaNoPa, aceitesGerint,
  fluxoCirurgico, ambulatorioDoDia, itensEmFalta, faltasConsolidadas,
  resumoDaTorre,
} from "./torre.js";
import { carregarTorre, diasAtras } from "./dados.js";
import { montarMapa } from "./mapa3d.js";
import { intervalosDeInternacao, censoDiario, direcaoDaSerie } from "./tendencia.js";
import { relatorioDeCancelamentos, ROTULO_ORIGEM } from "./cancelamentos.js";
import { acaoDoCard, destinoDoItem } from "./navegacao.js";
import MapaIsometrico from "./MapaIsometrico.jsx";
import GraficoTendencia from "./GraficoTendencia.jsx";
import { HOSPITAL_SIGLA } from "../ui/base.jsx";

/** Quantos dias a curva de tendência mostra. Curto de propósito: a direção
 *  olha o mês, e quanto mais para trás, mais a reconstrução fica cega. */
const DIAS_DA_CURVA = 30;

const COR = {
  [NIVEL.BOM]: "#34d399",
  [NIVEL.ATENCAO]: "#fbbf24",
  [NIVEL.CRITICO]: "#fb7185",
  [NIVEL.NEUTRO]: "#22d3ee",
};
const CEGO = "var(--text-3)";
const MONO = "JetBrains Mono, monospace";

const cx = {
  card: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px" },
  rotulo: { fontSize: 10, fontWeight: 700, letterSpacing: ".09em", textTransform: "uppercase", color: "var(--text-muted)" },
  secao: { fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--text-muted)", margin: "22px 0 10px" },
};

function haQuanto(ms) {
  if (ms == null) return "—";
  const s = Math.round(ms / 1000);
  if (s < 5) return "agora";
  if (s < 60) return `há ${s}s`;
  const m = Math.round(s / 60);
  return m < 60 ? `há ${m} min` : `há ${Math.round(m / 60)} h`;
}

// ── o anel de ocupação ───────────────────────────────────────
// Um arco, não uma barra: a ocupação tem um teto natural (100%) e o arco
// mostra o quanto falta para ele sem precisar de legenda.
function Anel({ pct, nivel, tamanho = 168 }) {
  const r = 68, c = 90, circ = 2 * Math.PI * r;
  const cheio = pct == null ? 0 : (Math.min(pct, 100) / 100) * circ;
  const cor = pct == null ? CEGO : COR[nivel];
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 180 180" role="img"
         aria-label={pct == null ? "ocupação não disponível" : `ocupação ${pct} por cento`}>
      <circle cx={c} cy={c} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={13} />
      <circle cx={c} cy={c} r={r} fill="none" stroke={cor} strokeWidth={13} strokeLinecap="round"
        strokeDasharray={pct == null ? "4 8" : `${cheio} ${circ}`}
        transform="rotate(-90 90 90)" style={{ transition: "stroke-dasharray .7s ease" }} />
      <text x={c} y={c + 4} textAnchor="middle" fill={cor} fontSize={38} fontWeight={800} fontFamily={MONO}>
        {pct == null ? "—" : pct}
      </text>
      {pct != null && <text x={c} y={c + 26} textAnchor="middle" fill="var(--text-muted)" fontSize={13} fontFamily="Inter, sans-serif">por cento</text>}
    </svg>
  );
}

/**
 * O cartão de indicador. Recebe a MEDIDA inteira (não só o número) porque é
 * ela que sabe se foi lida — a decisão de mostrar "—" em vez de "0" mora
 * aqui, num lugar só, e não em cada chamada.
 */
function Kpi({ m, sufixo = "", sub = null, acao = null }) {
  const lido = m?.lido !== false;
  const cor = lido ? COR[m?.nivel || NIVEL.NEUTRO] : CEGO;
  const vazio = m?.valor == null;
  // 🔴 O card só vira porta quando há PARA ONDE ir E permissão para ir.
  // `acaoDoCard` devolve inerte quando falta uma das duas — então aqui não
  // há `if` de permissão espalhado pela tela, só o resultado dele.
  const abre = !!acao?.clicavel;
  return (
    <div onClick={acao?.onClick} title={acao?.title}
      role={abre ? "button" : undefined} tabIndex={abre ? 0 : undefined}
      onKeyDown={abre ? (e => (e.key === "Enter" || e.key === " ") && acao.onClick()) : undefined}
      style={{
        ...cx.card, padding: "13px 15px", minWidth: 0, cursor: abre ? "pointer" : undefined,
        borderTop: `2px solid ${cor}`,
        borderStyle: lido ? "solid" : "dashed",
        opacity: lido ? 1 : .85,
      }}>
      <div style={{ ...cx.rotulo, marginBottom: 6, display: "flex", justifyContent: "space-between", gap: 6 }}>
        <span>{m?.rotulo}</span>
        {/* A setinha diz, sem texto, que este cartão leva a algum lugar — e a
            ausência dela diz que não leva. */}
        {abre && <span aria-hidden="true" style={{ color: "var(--text-muted)", fontWeight: 400 }}>↗</span>}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 27, fontWeight: 700, color: cor, lineHeight: 1 }}>
        {vazio ? "—" : `${m.valor}${m.unidade || sufixo}`}
      </div>
      <div style={{ fontSize: 11, color: lido ? "var(--text-3)" : "#fbbf24", marginTop: 5, lineHeight: 1.35 }}>
        {lido ? (sub ?? m?.detalhe ?? " ") : m?.detalhe}
      </div>
    </div>
  );
}

function Secao({ titulo, direita, children }) {
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <div style={cx.secao}>{titulo}</div>
        {direita && <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{direita}</div>}
      </div>
      {children}
    </>
  );
}

function NaoLido({ oQue }) {
  return (
    <div style={{ ...cx.card, borderStyle: "dashed", color: "#fbbf24", fontSize: 12.5 }}>
      Não consegui ler {oQue}. Este bloco está <b>em branco por falta de leitura</b>, não por não haver nada.
    </div>
  );
}

export default function TorreDeComando({ sb, verModulo = null, navegar = null }) {
  // O atalho de cada card. Memorizado junto das permissões: uma função por
  // card por render seria lixo sem ganho nenhum.
  const ir = useCallback(
    (chave, extra = null) => acaoDoCard(chave, { verModulo, navegar, extra }),
    [verModulo, navegar]);

  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [lidoEm, setLidoEm] = useState(null);
  const [, setTick] = useState(0);

  const recarregar = useCallback(async () => {
    setCarregando(true);
    const r = await carregarTorre(sb, { hoje: new Date() }).catch(() => null);
    setDados(r);
    setLidoEm(Date.now());
    setCarregando(false);
  }, [sb]);

  useEffect(() => { recarregar(); }, [recarregar]);
  useEffect(() => {
    const recarga = setInterval(recarregar, 60000);
    const relogio = setInterval(() => setTick(t => t + 1), 15000);
    const aoVoltar = () => recarregar();
    window.addEventListener("focus", aoVoltar);
    return () => { clearInterval(recarga); clearInterval(relogio); window.removeEventListener("focus", aoVoltar); };
  }, [recarregar]);

  const v = useMemo(() => {
    if (!dados) return null;
    const agora = new Date();
    const leitos = dados.leitos.lista, lidoLeitos = dados.leitos.lido;
    const setores = dados.setores.lista;

    const censo = censoGeral(leitos, { lido: lidoLeitos });
    const uti = censoDeSetores(leitos, setoresDeUti(setores), { lido: lidoLeitos && dados.setores.lido });
    const mapa = mapaDeSetores(leitos, setores, { lido: lidoLeitos && dados.setores.lido });

    const altas = altasDoDia(dados.saidas.lista, agora, { lido: dados.saidas.lido });
    const perm = permanenciaMedia(dados.saidas.lista, { desde: dados.desde, lido: dados.saidas.lido });
    const giro = giroDeLeito(dados.saidas.lista, censo.operacionais, { desde: dados.desde, lido: dados.saidas.lido && lidoLeitos });

    const pa = esperaNoPa(dados.ps.lista, agora, { lido: dados.ps.lido });
    const gerint = aceitesGerint(dados.ps.lista, { hoje: agora, desde: dados.desde, lido: dados.ps.lido });

    const cirurgias = fluxoCirurgico(dados.cirurgias.lista, agora, { lido: dados.cirurgias.lido });
    const ambulatorio = ambulatorioDoDia(dados.grades.lista, dados.agendamentos.lista, agora,
      { lido: dados.grades.lido && dados.agendamentos.lido });

    const falta = faltasConsolidadas(
      itensEmFalta(dados.supItens.lista, dados.supLotes.lista,
        { origem: "estoque", lido: dados.supItens.lido && dados.supLotes.lido }),
      itensEmFalta(dados.farmItens.lista, dados.farmLotes.lista,
        { chaveItem: "medicamento_id", origem: "farmacia", lido: dados.farmItens.lido && dados.farmLotes.lido }),
    );

    const internados = lidoLeitos
      ? { chave: "internados", rotulo: "Pacientes internados", valor: censo.ocupados, unidade: "", nivel: NIVEL.NEUTRO, lido: true,
          detalhe: `${censo.livres} leito${censo.livres === 1 ? "" : "s"} livre${censo.livres === 1 ? "" : "s"}` }
      : { chave: "internados", rotulo: "Pacientes internados", valor: null, lido: false, detalhe: "Não consegui ler os leitos." };

    // ── O mapa isométrico: um cubo por leito ──
    const mapa3d = lidoLeitos ? montarMapa(leitos, setores) : null;

    // ── A tendência: censo diário reconstruído do intervalo internação→alta ──
    // Só faz sentido com as DUAS fontes lidas; com uma só, a curva seria uma
    // metade do hospital desenhada como se fosse o todo.
    const podeTendencia = dados.saidas.lido && lidoLeitos;
    const { itens: intervalos, semInicio } = intervalosDeInternacao(dados.saidas.lista, leitos);
    const censoSerie = podeTendencia
      ? censoDiario(intervalos, {
          de: diasAtras(DIAS_DA_CURVA, agora), ate: dados.dia,
          operacionais: censo.operacionais, janelaDesde: dados.desde,
        })
      : null;
    const tendencia = censoSerie ? direcaoDaSerie(censoSerie.linhas) : null;

    // A meta de ocupação do hospital: a média das metas cadastradas por
    // setor. Sem meta cadastrada em nenhum setor, não há linha de meta — e
    // inventar uma régua seria pior que não ter régua.
    const metas = setores.map(s => s.meta_ocupacao).filter(v => v != null && v !== "");
    const metaOcupacao = metas.length
      ? Math.round(metas.reduce((t, v) => t + Number(v), 0) / metas.length)
      : null;

    // ── Cancelamento reincidente: as duas portas cruzadas por prontuário ──
    const cancelamentos = relatorioDeCancelamentos(
      dados.cirCanceladas.lista,
      [...dados.agCancelados.lista, ...dados.agRemarcados.lista],
      { lido: dados.cirCanceladas.lido && dados.agCancelados.lido && dados.agRemarcados.lido });

    const resumo = resumoDaTorre([censo, uti, perm, pa, cirurgias, ambulatorio, falta, altas, giro, gerint]);
    return {
      censo, uti, mapa, altas, perm, giro, pa, gerint, cirurgias, ambulatorio, falta, internados, resumo,
      mapa3d, censoSerie, tendencia, metaOcupacao, semInicio, cancelamentos, podeTendencia,
    };
  }, [dados]);

  if (!v) {
    return (
      <div style={{ padding: "1.5rem", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>
        {carregando ? "Lendo o hospital…" : "Não consegui montar o painel."}
      </div>
    );
  }

  const { censo, uti, mapa, altas, perm, giro, pa, gerint, cirurgias, ambulatorio, falta, internados, resumo,
          mapa3d, censoSerie, tendencia, metaOcupacao, semInicio, cancelamentos, podeTendencia } = v;
  const idade = lidoEm ? Date.now() - lidoEm : null;

  return (
    <div style={{ padding: "1.1rem 1.4rem 2.5rem", overflowY: "auto", height: "100%" }}>

      {/* ── faixa de comando ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 14, flexWrap: "wrap", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".18em", textTransform: "uppercase", color: "#22d3ee" }}>
            Valentrax · Torre de Comando
          </div>
          <div style={{ fontSize: 23, fontWeight: 800, letterSpacing: "-.01em", marginTop: 3 }}>
            {HOSPITAL_SIGLA} — o hospital agora
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
            {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
            {" · "}atualizado {haQuanto(idade)}
            {carregando && " · lendo…"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
          {resumo.criticos > 0 && (
            <span style={{ background: "#3d0f18", color: "#fb7185", borderRadius: 99, fontSize: 11.5, fontWeight: 800, padding: "4px 12px" }}>
              {resumo.criticos} crítico{resumo.criticos > 1 ? "s" : ""}
            </span>
          )}
          {resumo.atencao > 0 && (
            <span style={{ background: "#3d2e06", color: "#fbbf24", borderRadius: 99, fontSize: 11.5, fontWeight: 800, padding: "4px 12px" }}>
              {resumo.atencao} atenção
            </span>
          )}
          {/* 🔴 O selo que nenhum painel costuma ter, e que é o mais
              importante desta tela: quantos indicadores estão CEGOS. */}
          {resumo.naoLidas > 0 && (
            <span title={resumo.oQueFaltouLer.join(" · ")}
              style={{ border: `1px dashed ${CEGO}`, color: "var(--text-3)", borderRadius: 99, fontSize: 11.5, fontWeight: 800, padding: "3px 12px" }}>
              {resumo.naoLidas} sem leitura
            </span>
          )}
          {resumo.podeDizerTudoBem && (
            <span style={{ background: "#0a3d2a", color: "#34d399", borderRadius: 99, fontSize: 11.5, fontWeight: 800, padding: "4px 12px" }}>
              tudo dentro dos limites
            </span>
          )}
          <button onClick={recarregar} disabled={carregando} style={{
            background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8,
            padding: "6px 13px", color: "var(--text-2)", fontSize: 12, fontFamily: "inherit",
            cursor: carregando ? "wait" : "pointer" }}>
            ⟳ Atualizar
          </button>
        </div>
      </div>

      {resumo.naoLidas > 0 && (
        <div style={{ ...cx.card, borderStyle: "dashed", borderColor: "#fbbf2455", marginBottom: 16, fontSize: 12.5, color: "#fbbf24" }}>
          <b>{resumo.naoLidas} indicador{resumo.naoLidas > 1 ? "es" : ""} sem leitura:</b> {resumo.oQueFaltouLer.join(" · ")}.
          {" "}O painel está <b>incompleto</b> — o que não aparece aqui não é ausência de problema, é ausência de dado.
        </div>
      )}

      {/* ── o topo: ocupação geral ── */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(240px, 320px) 1fr", gap: 14, alignItems: "stretch" }}>
        <div style={{ ...cx.card, display: "flex", alignItems: "center", gap: 16, borderTop: `2px solid ${censo.lido ? COR[censo.nivel] : CEGO}` }}>
          <Anel pct={censo.valor} nivel={censo.nivel} />
          <div style={{ minWidth: 0 }}>
            <div style={cx.rotulo}>Ocupação geral</div>
            {censo.lido ? (
              <div style={{ fontSize: 12.5, color: "var(--text-3)", marginTop: 8, lineHeight: 1.9 }}>
                <div><b style={{ color: "var(--text)", fontFamily: MONO }}>{censo.ocupados}</b> ocupados</div>
                <div><b style={{ color: "var(--text)", fontFamily: MONO }}>{censo.livres}</b> livres</div>
                {censo.higienizacao > 0 && <div><b style={{ color: "#fbbf24", fontFamily: MONO }}>{censo.higienizacao}</b> em higienização</div>}
                {censo.interditados > 0 && <div><b style={{ color: CEGO, fontFamily: MONO }}>{censo.interditados}</b> interditados</div>}
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                  base: {censo.operacionais} leitos operacionais
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 12.5, color: "#fbbf24", marginTop: 8 }}>Não consegui ler os leitos.</div>
            )}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(158px, 1fr))", gap: 12 }}>
          <Kpi m={uti} acao={ir("uti")} sub={uti.lido ? (uti.semSetor ? "nenhum setor de UTI cadastrado" : `${uti.ocupados} de ${uti.operacionais} leitos`) : undefined} />
          <Kpi m={internados} acao={ir("internados")} />
          <Kpi m={altas} acao={ir("altas_hoje")} sub="saídas registradas hoje" />
          <Kpi m={perm} acao={ir("permanencia")} sub={perm.lido && perm.contadas ? `${perm.contadas} altas com permanência` : perm.lido ? "sem alta com permanência registrada" : undefined} />
          <Kpi m={giro} acao={ir("giro")} sub={giro.lido ? (giro.semLeitos ? "sem leito operacional" : `${giro.altas} altas na janela`) : undefined} />
          <Kpi m={pa} acao={ir("pa")} sub={pa.lido ? `${pa.aguardandoAtendimento} triados aguardando médico` : undefined} />
          <Kpi m={gerint} acao={ir("gerint")} sub={gerint.lido ? `${gerint.noPeriodo} aceites na janela` : undefined} />
          <Kpi m={falta} acao={ir("falta")} sub={falta.lido ? `almoxarifado ${falta.porOrigem.estoque} · farmácia ${falta.porOrigem.farmacia}` : undefined} />
        </div>
      </div>

      {/* ── o hospital como volume ──
          Vem logo abaixo do anel de propósito: é a leitura que a direção faz
          antes de qualquer número. Um cubo é um leito, então a contagem é
          exata — nenhuma perspectiva distorcendo magnitude. */}
      <Secao titulo="O hospital agora — um cubo, um leito"
        direita="passe o cursor por um leito">
        {!dados.leitos.lido ? <NaoLido oQue="os leitos" /> : <MapaIsometrico mapa={mapa3d} />}
      </Secao>

      {/* ── tendência ── */}
      <Secao titulo={`Tendência de ocupação — ${DIAS_DA_CURVA} dias`}
        direita={censoSerie?.diasCegos ? `${censoSerie.diasCegos} dia(s) fora da janela de leitura` : null}>
        {!podeTendencia ? <NaoLido oQue="as saídas de leito ou os leitos" /> : (
          <>
            <GraficoTendencia censo={censoSerie} direcao={tendencia} metaOcupacao={metaOcupacao} />
            {semInicio > 0 && (
              <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "7px 0 0" }}>
                {semInicio} internação(ões) sem data de entrada ficaram <b>fora</b> da curva — sem o começo
                não há intervalo, e inventar um começo inventaria leito-dia.
              </p>
            )}
          </>
        )}
      </Secao>

      {/* ── mapa de ocupação por setor ── */}
      <Secao titulo="Mapa de ocupação por setor"
        direita={mapa.lido && mapa.semSetor > 0 ? `${mapa.semSetor} leito(s) sem setor — fora do mapa` : null}>
        {!mapa.lido ? <NaoLido oQue="os leitos ou os setores" />
          : !mapa.linhas.length ? (
            <div style={{ ...cx.card, borderStyle: "dashed", fontSize: 12.5, color: "var(--text-muted)" }}>
              Nenhum setor cadastrado. Cadastre em <b>Giro de Leitos → Mapa de leitos → Setores</b> e marque o setor de cada leito.
            </div>
          ) : (
            <div style={{ ...cx.card, display: "flex", flexDirection: "column", gap: 11 }}>
              {mapa.linhas.map(s => (
                <div key={s.nome}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, fontSize: 12.5, marginBottom: 4 }}>
                    <span style={{ fontWeight: 700 }}>{s.nome}</span>
                    <span style={{ color: "var(--text-3)", fontFamily: MONO, fontSize: 12 }}>
                      {s.pct == null ? "sem leito" : `${s.pct}%`}
                      <span style={{ color: "var(--text-muted)" }}> · {s.ocupados}/{s.operacionais}</span>
                    </span>
                  </div>
                  <div style={{ height: 9, background: "var(--surface-3)", borderRadius: 99, overflow: "hidden", position: "relative" }}>
                    <div style={{ width: `${Math.min(s.pct ?? 0, 100)}%`, height: "100%", background: COR[s.nivel], borderRadius: 99, transition: "width .6s ease" }} />
                    {s.metaOcupacao != null && (
                      <div title={`meta ${s.metaOcupacao}%`} style={{
                        position: "absolute", top: -2, bottom: -2, left: `${Math.min(s.metaOcupacao, 100)}%`,
                        width: 2, background: "var(--text-muted)" }} />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
      </Secao>

      {/* ── fluxo cirúrgico ── */}
      <Secao titulo="Fluxo cirúrgico de hoje"
        direita={cirurgias.lido && cirurgias.taxaCancelamento != null ? `${cirurgias.taxaCancelamento}% do mapa cancelado` : null}>
        {!cirurgias.lido ? <NaoLido oQue="a agenda do bloco cirúrgico" /> : (
          <div style={{ ...cx.card }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12, marginBottom: cirurgias.cancelamentos.length ? 16 : 0 }}>
              {[
                { r: "Realizadas", n: cirurgias.realizadas, c: "#34d399" },
                { r: "Em andamento", n: cirurgias.emAndamento, c: "#22d3ee" },
                { r: "Ainda agendadas", n: cirurgias.agendadas, c: "var(--text-2)" },
                { r: "Canceladas", n: cirurgias.canceladas, c: cirurgias.canceladas > 0 ? "#fb7185" : "var(--text-3)" },
              ].map(b => (
                <div key={b.r}>
                  <div style={cx.rotulo}>{b.r}</div>
                  <div style={{ fontFamily: MONO, fontSize: 26, fontWeight: 700, color: b.c, lineHeight: 1.2 }}>{b.n}</div>
                </div>
              ))}
            </div>

            {cirurgias.previstas === 0 && (
              <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Nenhuma cirurgia no mapa de hoje.</div>
            )}

            {/* 🔴 O cancelamento sai com NOME e MOTIVO. Sem isso, a direção vê
                "3 canceladas" e não tem o que cobrar de ninguém. */}
            {cirurgias.cancelamentos.length > 0 && (
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                <div style={{ ...cx.rotulo, marginBottom: 8 }}>Cancelamentos de hoje</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {cirurgias.cancelamentos.map(c => (
                    <div key={c.id} style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap",
                      background: "var(--surface-2)", border: "1px solid var(--border)", borderLeft: "3px solid #fb7185",
                      borderRadius: 8, padding: "8px 11px", fontSize: 12.5 }}>
                      <b>{c.iniciais || "sem iniciais"}</b>
                      {c.prontuario && <span style={{ fontFamily: MONO, fontSize: 11.5, color: "var(--text-muted)" }}>{c.prontuario}</span>}
                      {c.procedimento && <span style={{ color: "var(--text-3)" }}>{c.procedimento}</span>}
                      <span style={{ marginLeft: "auto", color: c.semMotivo ? "#fbbf24" : "var(--text-3)", fontStyle: c.semMotivo ? "italic" : "normal" }}>
                        {c.motivo}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Secao>

      {/* ── ambulatório ── */}
      <Secao titulo="Ambulatório de hoje"
        direita={ambulatorio.lido && ambulatorio.ocupacaoDaAgenda != null ? `agenda ${ambulatorio.ocupacaoDaAgenda}% ocupada` : null}>
        {!ambulatorio.lido ? <NaoLido oQue="as grades ou os agendamentos" /> : (
          <div style={{ ...cx.card }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 12, marginBottom: 14 }}>
              {[
                { r: "Ofertadas", n: ambulatorio.ofertadas, c: "var(--text-2)" },
                { r: "Agendadas", n: ambulatorio.agendadas, c: "#22d3ee" },
                { r: "Realizadas", n: ambulatorio.realizadas, c: "#34d399" },
                { r: "Faltas", n: ambulatorio.faltas, c: ambulatorio.faltas > 0 ? "#fbbf24" : "var(--text-3)" },
                { r: "Canceladas", n: ambulatorio.cancelados, c: ambulatorio.cancelados > 0 ? "#fb7185" : "var(--text-3)" },
              ].map(b => (
                <div key={b.r}>
                  <div style={cx.rotulo}>{b.r}</div>
                  <div style={{ fontFamily: MONO, fontSize: 24, fontWeight: 700, color: b.c, lineHeight: 1.2 }}>{b.n}</div>
                </div>
              ))}
            </div>

            {ambulatorio.ofertadas === 0 && (
              <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 12 }}>
                Nenhuma grade vigente para hoje — sem oferta cadastrada, a taxa de ocupação da agenda não pode ser calculada.
              </div>
            )}

            {ambulatorio.porEspecialidade.length > 0 && (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 420 }}>
                  <thead>
                    <tr style={{ color: "var(--text-muted)", textAlign: "left" }}>
                      <th style={{ padding: "6px 8px", fontWeight: 700 }}>Especialidade</th>
                      <th style={{ padding: "6px 8px", fontWeight: 700, textAlign: "right" }}>Ofertadas</th>
                      <th style={{ padding: "6px 8px", fontWeight: 700, textAlign: "right" }}>Agendadas</th>
                      <th style={{ padding: "6px 8px", fontWeight: 700, textAlign: "right" }}>Realizadas</th>
                      <th style={{ padding: "6px 8px", fontWeight: 700, textAlign: "right" }}>Faltas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ambulatorio.porEspecialidade.map(e => (
                      <tr key={e.especialidade} style={{ borderTop: "1px solid var(--border)" }}>
                        <td style={{ padding: "7px 8px", fontWeight: 600 }}>{e.especialidade}</td>
                        <td style={{ padding: "7px 8px", textAlign: "right", fontFamily: MONO, color: "var(--text-3)" }}>{e.ofertadas}</td>
                        <td style={{ padding: "7px 8px", textAlign: "right", fontFamily: MONO }}>{e.agendadas}</td>
                        <td style={{ padding: "7px 8px", textAlign: "right", fontFamily: MONO, color: "#34d399" }}>{e.realizadas}</td>
                        <td style={{ padding: "7px 8px", textAlign: "right", fontFamily: MONO, color: e.faltas ? "#fbbf24" : "var(--text-muted)" }}>{e.faltas}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {ambulatorio.profissionais.length > 0 && (
              <div style={{ marginTop: 14, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                <div style={{ ...cx.rotulo, marginBottom: 8 }}>Atendendo hoje</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {ambulatorio.profissionais.map(p => (
                    <span key={p.profissional} style={{
                      display: "inline-flex", alignItems: "baseline", gap: 7, fontSize: 12,
                      background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: 99, padding: "5px 12px" }}>
                      <b>{p.profissional}</b>
                      <span style={{ color: "var(--text-muted)" }}>{p.especialidades.join(", ") || "—"}</span>
                      <span style={{ fontFamily: MONO, color: "#34d399" }}>{p.realizadas}/{p.vagas}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Secao>

      {/* ── abastecimento ── */}
      <Secao titulo="Materiais em falta"
        direita={falta.lido ? `${falta.porOrigem.estoque} no almoxarifado · ${falta.porOrigem.farmacia} na farmácia` : null}>
        {!falta.lido ? <NaoLido oQue={falta.detalhe?.replace("Não consegui ler ", "").replace(".", "") || "o estoque"} />
          : !falta.itens.length ? (
            <div style={{ ...cx.card, fontSize: 12.5, color: "#34d399" }}>
              Nenhum item abaixo do estoque mínimo — almoxarifado e farmácia conferidos.
            </div>
          ) : (
            <div style={{ ...cx.card, display: "flex", flexDirection: "column", gap: 7 }}>
              {falta.itens.slice(0, 12).map(i => {
                // Cada item leva à SUA casa: o que falta na farmácia abre a
                // Farmácia, o do almoxarifado abre o Estoque. Mandar os dois
                // para o mesmo lugar faria metade dos cliques cair na tela
                // errada — e quem tem só um dos dois módulos veria metade
                // da lista virar porta fechada.
                const abrirCasa = ir(destinoDoItem(i.origem));
                return (
                <div key={`${i.origem}-${i.id}`}
                  onClick={abrirCasa.onClick} title={abrirCasa.title}
                  role={abrirCasa.clicavel ? "button" : undefined}
                  tabIndex={abrirCasa.clicavel ? 0 : undefined}
                  onKeyDown={abrirCasa.clicavel ? (e => (e.key === "Enter" || e.key === " ") && abrirCasa.onClick()) : undefined}
                  style={{
                  display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", fontSize: 12.5,
                  cursor: abrirCasa.clicavel ? "pointer" : undefined,
                  background: "var(--surface-2)", border: "1px solid var(--border)",
                  borderLeft: `3px solid ${i.zerado ? "#fb7185" : "#fbbf24"}`, borderRadius: 8, padding: "8px 11px" }}>
                  <b>{i.nome}</b>
                  <span style={{ fontSize: 10.5, color: "var(--text-muted)", border: "1px solid var(--border-2)", borderRadius: 99, padding: "0 7px" }}>
                    {i.origem === "farmacia" ? "farmácia" : "almoxarifado"}
                  </span>
                  {abrirCasa.clicavel && <span aria-hidden="true" style={{ color: "var(--text-muted)" }}>↗</span>}
                  {i.zerado && <span style={{ fontSize: 10.5, fontWeight: 800, color: "#fb7185" }}>ZERADO</span>}
                  <span style={{ marginLeft: "auto", fontFamily: MONO, color: "var(--text-3)" }}>
                    {i.atual}{i.unidade ? ` ${i.unidade}` : ""} <span style={{ color: "var(--text-muted)" }}>/ mín. {i.minimo}</span>
                  </span>
                </div>
                );
              })}
              {falta.itens.length > 12 && (
                <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                  e mais {falta.itens.length - 12} item(ns) abaixo do mínimo.
                </div>
              )}
            </div>
          )}
      </Secao>

      {/* ── origem dos aceites ── */}
      {gerint.lido && gerint.porUnidade.length > 0 && (
        <Secao titulo="Aceites GERINT por unidade de origem" direita={`janela de ${dados.desde} até ${dados.dia}`}>
          <div style={{ ...cx.card, display: "flex", flexDirection: "column", gap: 9 }}>
            {gerint.porUnidade.slice(0, 10).map(u => {
              const maior = gerint.porUnidade[0].quantos || 1;
              return (
                <div key={u.unidade}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 3 }}>
                    <span>{u.unidade}</span>
                    <span style={{ fontFamily: MONO, color: "var(--text-3)" }}>{u.quantos}</span>
                  </div>
                  <div style={{ height: 7, background: "var(--surface-3)", borderRadius: 99, overflow: "hidden" }}>
                    <div style={{ width: `${(u.quantos / maior) * 100}%`, height: "100%", background: "#22d3ee", borderRadius: 99 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Secao>
      )}

      {/* ── quem está sendo cancelado de novo ──
          TABELA, e não gráfico: é uma lista de pessoas para agir. Um gráfico
          de barras com nomes no eixo seria mais bonito e menos útil. */}
      <Secao titulo="Pacientes cancelados mais de uma vez"
        direita={cancelamentos.lido
          ? `janela de ${dados.desde} até ${dados.dia}`
          : null}>
        {!cancelamentos.lido ? <NaoLido oQue="os cancelamentos do bloco ou da agenda" /> : (
          <div style={cx.card}>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: cancelamentos.reincidentes.length ? 14 : 0 }}>
              {[
                { r: "Reincidentes", n: cancelamentos.reincidentes.length, c: cancelamentos.reincidentes.length ? "#fb7185" : "#34d399" },
                { r: "Nas duas portas", n: cancelamentos.nasDuasPortas, c: cancelamentos.nasDuasPortas ? "#fbbf24" : "var(--text-3)" },
                { r: "Cancelamentos na janela", n: cancelamentos.total, c: "var(--text-2)" },
              ].map(b => (
                <div key={b.r}>
                  <div style={cx.rotulo}>{b.r}</div>
                  <div style={{ fontFamily: MONO, fontSize: 24, fontWeight: 700, color: b.c, lineHeight: 1.2 }}>{b.n}</div>
                </div>
              ))}
            </div>

            {cancelamentos.podeDizerNinguem ? (
              <div style={{ fontSize: 12.5, color: "#34d399" }}>
                Nenhum paciente foi cancelado mais de uma vez nesta janela.
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 520 }}>
                  <thead>
                    <tr style={{ color: "var(--text-muted)", textAlign: "left" }}>
                      <th style={{ padding: "6px 8px", fontWeight: 700 }}>Paciente</th>
                      <th style={{ padding: "6px 8px", fontWeight: 700, textAlign: "right" }}>Vezes</th>
                      <th style={{ padding: "6px 8px", fontWeight: 700 }}>Onde</th>
                      <th style={{ padding: "6px 8px", fontWeight: 700 }}>Último</th>
                      <th style={{ padding: "6px 8px", fontWeight: 700 }}>Motivos registrados</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cancelamentos.reincidentes.slice(0, 15).map(p => {
                      // 🔴 O DRILL-DOWN QUE MAIS VALE DA TORRE INTEIRA: a
                      // direção vê "cancelado 3 vezes" e abre o prontuário
                      // dessa pessoa num clique, em vez de anotar o número e
                      // procurar depois. Só quem alcança o Paciente 360 vê a
                      // linha como clicável.
                      const abrirPaciente = ir("paciente", p.prontuario);
                      return (
                      <tr key={p.prontuario} style={{ borderTop: "1px solid var(--border)" }}>
                        <td style={{ padding: "8px" }}>
                          {abrirPaciente.clicavel ? (
                            <button onClick={abrirPaciente.onClick} title={`Abrir o prontuário de ${p.iniciais || p.prontuario}`}
                              style={{
                                background: "none", border: "none", padding: 0, cursor: "pointer",
                                font: "inherit", color: "var(--text)", textAlign: "left",
                                textDecoration: "underline", textDecorationColor: "var(--border-2)",
                                textUnderlineOffset: 3,
                              }}>
                              <b>{p.iniciais || "—"}</b>
                              <span style={{ fontFamily: MONO, color: "var(--text-muted)", marginLeft: 7, fontSize: 11.5 }}>{p.prontuario}</span>
                              <span aria-hidden="true" style={{ color: "var(--text-muted)", marginLeft: 6 }}>↗</span>
                            </button>
                          ) : (
                            <>
                              <b>{p.iniciais || "—"}</b>
                              <span style={{ fontFamily: MONO, color: "var(--text-muted)", marginLeft: 7, fontSize: 11.5 }}>{p.prontuario}</span>
                            </>
                          )}
                        </td>
                        <td style={{ padding: "8px", textAlign: "right", fontFamily: MONO, fontWeight: 700, color: p.total >= 3 ? "#fb7185" : "#fbbf24" }}>
                          {p.total}
                        </td>
                        <td style={{ padding: "8px", color: "var(--text-3)" }}>
                          {p.cirurgia > 0 && `${p.cirurgia} ${ROTULO_ORIGEM.cirurgia.toLowerCase()}${p.cirurgia > 1 ? "s" : ""}`}
                          {p.cirurgia > 0 && p.ambulatorio > 0 && " · "}
                          {p.ambulatorio > 0 && `${p.ambulatorio} ${ROTULO_ORIGEM.ambulatorio.toLowerCase()}${p.ambulatorio > 1 ? "s" : ""}`}
                          {p.nasDuasPortas && (
                            <span title="cancelado no bloco E no ambulatório — nenhum relatório de módulo vê este paciente"
                              style={{ marginLeft: 7, fontSize: 10, fontWeight: 800, color: "#fbbf24", border: "1px solid #fbbf2455", borderRadius: 99, padding: "1px 7px" }}>
                              AS DUAS
                            </span>
                          )}
                        </td>
                        <td style={{ padding: "8px", fontFamily: MONO, color: "var(--text-3)", whiteSpace: "nowrap" }}>
                          {p.ultimoDia || "—"}
                        </td>
                        <td style={{ padding: "8px", color: p.semMotivoRegistrado ? "#fbbf24" : "var(--text-3)", fontStyle: p.semMotivoRegistrado ? "italic" : "normal" }}>
                          {p.semMotivoRegistrado ? "nenhum motivo registrado" : p.motivos.join(" · ")}
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
                {cancelamentos.reincidentes.length > 15 && (
                  <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 8 }}>
                    e mais {cancelamentos.reincidentes.length - 15} paciente(s) com cancelamento repetido.
                  </div>
                )}
              </div>
            )}

            <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "10px 0 0", lineHeight: 1.55 }}>
              {/* 🔴 A tela DIZ que soube distinguir remarcação de cancelamento.
                  Sem essa linha, quem conhece a agenda desconfiaria do número —
                  e com razão, porque remarcar deixa o original como cancelado. */}
              {cancelamentos.remarcacoes > 0 && (
                <>
                  <b>{cancelamentos.remarcacoes} remarcação(ões)</b> foram descontadas: remarcar deixa o agendamento
                  original como cancelado, e contar isso apontaria pacientes que só mudaram de data.{" "}
                </>
              )}
              {cancelamentos.naoAtribuidos > 0 && (
                <>
                  {cancelamentos.naoAtribuidos} cancelamento(s) sem prontuário não puderam ser ligados a ninguém.
                </>
              )}
            </p>
          </div>
        )}
      </Secao>

      <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 26, lineHeight: 1.6 }}>
        Apoio à gestão, nunca verdade absoluta — os limiares são ponto de partida e se ajustam por setor no cadastro.
        Reinternação em 30 dias e infecção hospitalar (SCIH) entram na próxima fatia.
      </p>
    </div>
  );
}
