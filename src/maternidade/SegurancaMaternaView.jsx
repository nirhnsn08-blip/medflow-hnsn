// ═══════════════════════════════════════════════════════════
// SEGURANÇA MATERNA — a tela (aba MEOWS)
//
// O painel que responde "de quem eu preciso cuidar agora?". Lê a medida de
// sinais vitais mais recente de cada episódio aberto, pontua pelo MEOWS e
// ordena por urgência.
//
// ── O QUE ESTA TELA SE RECUSA A FAZER ───────────────────────
// Pintar verde o que ela não sabe. Uma paciente sem vitais lançados aparece
// no TOPO, em cinza tracejado, escrito "sem medida" — não no fim da lista em
// letra tranquila. E o cabeçalho só diz "tudo dentro do prazo" quando TODAS
// têm medida recente e verde; basta uma sem medida para ele calar.
//
// O relógio corre sozinho (a idade da medida envelhece na tela) e a lista se
// recarrega a cada minuto — um painel de vigilância que só atualiza no F5
// mente com cara de atualizado.
// ═══════════════════════════════════════════════════════════

import { useState, useEffect, useMemo, useCallback } from "react";
import { montarVigilancia, FRESCOR } from "./vigilancia.js";
import { NIVEL } from "./meows.js";
import { carregarVigilanciaMaterna } from "./dados.js";

const TURQ = "#2dd4bf";
const cx = {
  card: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 13, padding: "16px 18px", marginBottom: 14 },
  rotulo: { fontSize: 10.5, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--text-muted)" },
};

// A paleta do painel. O "sem medida" NÃO é uma variação de verde de propósito:
// é cinza tracejado, para não ser lido de relance como "está tudo bem".
const ESTILO = {
  [NIVEL.VERMELHO]: { cor: "#f87171", borda: "#ef444466", fundo: "#7f1d1d22", texto: "Vermelho" },
  [NIVEL.AMARELO]:  { cor: "#fbbf24", borda: "#f59e0b55", fundo: "#78350f22", texto: "Amarelo" },
  [NIVEL.VERDE]:    { cor: "#4ade80", borda: "#22c55e44", fundo: "#14532d1a", texto: "Verde" },
};
const SEM_MEDIDA = { cor: "var(--text-3)", borda: "var(--border-2)", fundo: "transparent", texto: "Sem medida" };

function idade(min) {
  if (min == null) return "—";
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `há ${h} h ${m} min` : `há ${h} h`;
}

function Metrica({ label, valor, cor, sub }) {
  return (
    <div style={{ ...cx.card, marginBottom: 0, flex: "1 1 130px", minWidth: 120 }}>
      <div style={cx.rotulo}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6, color: cor || "var(--text)" }}>{valor}</div>
      {sub && <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Linha({ l, onRegistrar }) {
  const e = l.meows.avaliado ? ESTILO[l.meows.nivel] : SEM_MEDIDA;
  const semMedida = l.frescor === FRESCOR.SEM_MEDIDA;
  const alterados = l.meows.itens.filter(i => i.pontos > 0);

  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 14, flexWrap: "wrap",
      border: `1px solid ${e.borda}`, borderStyle: semMedida ? "dashed" : "solid",
      background: e.fundo, borderRadius: 11, padding: "12px 14px", marginBottom: 8,
    }}>
      {/* faixa do nível */}
      <div style={{ minWidth: 96 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", color: e.cor }}>{e.texto}</div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2, fontFamily: "JetBrains Mono, monospace" }}>
          {l.meows.avaliado ? `MEOWS ${l.meows.total}` : "—"}
        </div>
      </div>

      {/* quem */}
      <div style={{ flex: "1 1 220px", minWidth: 180 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>
          {l.nome || l.iniciais || "Sem identificação"}
          {l.leito && <span style={{ color: "var(--text-muted)", fontWeight: 500, fontSize: 12.5 }}> · leito {l.leito}</span>}
        </div>
        <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 3 }}>
          {semMedida
            ? "Nenhum sinal vital lançado neste episódio."
            : <>Medido {idade(l.minutos)} · {l.origem === "partograma" ? "partograma" : "admissão"} · prazo {l.prazoMin} min</>}
          {l.emTrabalhoDeParto && !semMedida && " · em trabalho de parto"}
        </div>
        {alterados.length > 0 && (
          <div style={{ fontSize: 11.5, marginTop: 5, color: "var(--text-2)" }}>
            {alterados.map(i => (
              <span key={i.chave} style={{ marginRight: 10 }}>
                <b style={{ color: i.pontos >= 2 ? ESTILO[NIVEL.VERMELHO].cor : ESTILO[NIVEL.AMARELO].cor }}>{i.rotulo}</b> {i.valor}
              </span>
            ))}
          </div>
        )}
        {l.meows.avaliado && l.meows.faltando.length > 0 && (
          <div style={{ fontSize: 11, marginTop: 4, color: "var(--text-muted)" }}>
            Não medido: {l.meows.faltando.join(", ")} — o escore vale só sobre o que foi aferido.
          </div>
        )}
      </div>

      {/* o que fazer */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
        {l.precisaReavaliar && (
          <span style={{
            fontSize: 10.5, fontWeight: 800, letterSpacing: ".05em", textTransform: "uppercase",
            color: l.frescor === FRESCOR.VENCIDO || semMedida ? ESTILO[NIVEL.VERMELHO].cor : ESTILO[NIVEL.AMARELO].cor,
            border: `1px solid ${l.frescor === FRESCOR.VENCIDO || semMedida ? ESTILO[NIVEL.VERMELHO].borda : ESTILO[NIVEL.AMARELO].borda}`,
            borderRadius: 99, padding: "3px 9px", whiteSpace: "nowrap",
          }}>
            {semMedida ? "Medir" : l.frescor === FRESCOR.VENCIDO ? "Vencido" : "Reavaliar"}
          </span>
        )}
        {onRegistrar && l.prontuario && (
          <button onClick={() => onRegistrar(l)} style={{
            background: "transparent", color: TURQ, border: `1px solid ${TURQ}55`, borderRadius: 8,
            padding: "7px 12px", cursor: "pointer", fontSize: 12, fontFamily: "inherit", whiteSpace: "nowrap",
          }}>Registrar vitais</button>
        )}
      </div>
    </div>
  );
}

export default function SegurancaMaternaView({ sb, onRegistrar }) {
  const [dados, setDados] = useState({ casos: [], incompleto: false });
  const [carregando, setCarregando] = useState(true);
  const [agora, setAgora] = useState(() => new Date());

  const carregar = useCallback(async () => {
    setCarregando(true);
    const r = await carregarVigilanciaMaterna(sb).catch(() => ({ casos: [], incompleto: true }));
    setDados(r);
    setAgora(new Date());
    setCarregando(false);
  }, [sb]);

  useEffect(() => { carregar(); }, [carregar]);

  // O relógio anda sozinho: sem isto, "há 10 min" continuaria dizendo 10 min
  // uma hora depois — um painel de vigilância parado é pior que nenhum.
  useEffect(() => {
    const tique = setInterval(() => setAgora(new Date()), 30000);
    const recarga = setInterval(() => { carregar(); }, 60000);
    return () => { clearInterval(tique); clearInterval(recarga); };
  }, [carregar]);

  const { linhas, resumo } = useMemo(
    () => montarVigilancia(dados.casos, { agora }), [dados.casos, agora]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0, maxWidth: "58ch" }}>
          MEOWS de cada gestante internada, pela medida mais recente do dossiê. Quem está sem medida vem primeiro — o painel não chama de verde o que não sabe.
        </p>
        <button onClick={carregar} disabled={carregando} style={{ background: "transparent", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontSize: 12, marginLeft: "auto" }}>
          {carregando ? "Atualizando…" : "Atualizar"}
        </button>
      </div>

      {dados.incompleto && (
        <div role="alert" style={{ ...cx.card, background: "#7f1d1d22", border: "1px solid #ef444455", color: "#fca5a5", fontSize: 12.5 }}>
          Não consegui ler tudo (episódios, vitais ou leitos). Este painel pode estar <b>incompleto</b> — pode haver paciente alterada fora da lista. Atualize antes de confiar nele.
        </div>
      )}

      {carregando && !linhas.length && <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Carregando a vigilância…</p>}

      {!carregando && !dados.incompleto && !linhas.length && (
        <div style={{ ...cx.card, color: "var(--text-muted)", fontSize: 13.5, textAlign: "center", padding: 28 }}>
          Nenhum episódio obstétrico em andamento. Quando houver gestante internada, ela aparece aqui com o MEOWS da última medida.
        </div>
      )}

      {linhas.length > 0 && (
        <>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 14 }}>
            <Metrica label="Vermelhas" valor={resumo.vermelhos} cor={resumo.vermelhos ? ESTILO[NIVEL.VERMELHO].cor : undefined} sub="chamar agora" />
            <Metrica label="Amarelas" valor={resumo.amarelos} cor={resumo.amarelos ? ESTILO[NIVEL.AMARELO].cor : undefined} sub="reavaliar" />
            <Metrica label="Verdes" valor={resumo.verdes} cor={resumo.verdes ? ESTILO[NIVEL.VERDE].cor : undefined} />
            <Metrica label="Sem medida" valor={resumo.semMedida} cor={resumo.semMedida ? ESTILO[NIVEL.VERMELHO].cor : undefined} sub="não é verde" />
            <Metrica label="Fora do prazo" valor={resumo.atrasados + resumo.vencidos} cor={(resumo.atrasados + resumo.vencidos) ? ESTILO[NIVEL.AMARELO].cor : undefined} sub={`${resumo.vencidos} vencido(s)`} />
          </div>

          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>
            {resumo.podeDizerTudoBem
              ? <span style={{ color: ESTILO[NIVEL.VERDE].cor }}>Todas com medida recente e dentro da faixa.</span>
              : <>{resumo.aReavaliar} de {resumo.total} pedem ação: medir ou reavaliar.</>}
            {" "}Prazo de reavaliação pelo nível da última medida — 30 min no vermelho, 1 h no amarelo, 4 h no verde.
          </div>

          {linhas.map(l => <Linha key={l.episodioId} l={l} onRegistrar={onRegistrar} />)}

          <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 12 }}>
            O MEOWS é apoio à decisão, não diagnóstico: ele chama atenção, a conduta é da equipe. Os limiares são de referência e serão configuráveis por instituição.
          </p>
        </>
      )}
    </div>
  );
}
