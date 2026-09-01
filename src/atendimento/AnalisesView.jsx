// ═══════════════════════════════════════════════════════════
// ANÁLISES DO FATURAMENTO — o BI da produção e da glosa
//
// 🔴 A REGRA DE DESENHO DESTA TELA: indicador sem base mostra "—" e a
// FRASE do porquê. Nunca "0%".
//
// Zero por cento de glosa é a melhor notícia que este módulo pode dar, e
// três coisas opostas produzem zero: não houve glosa (bom), a leitura
// falhou (não sabemos), não há faturado (não há o que glosar). Quem pinta
// as três de verde entrega um painel que mente sorrindo.
//
// As contas moram em `analises.js`, testadas por mutação. Aqui só se
// desenha o que elas devolveram, incluindo o motivo do branco.
// ═══════════════════════════════════════════════════════════

import { useState, useEffect, useMemo } from "react";
import { analiseDaCompetencia, seriePorCompetencia, MOTIVOS } from "./analises.js";
import { contasDaCompetencia, todasAsContas, itensDasContas, carregarGlosas } from "./dados.js";
import { reais, competenciaLabel } from "./faturamento.js";
import { listaLida, naoDeuParaLer } from "../util/leitura.js";

const cx = {
  card: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 13, padding: "16px 18px" },
  rotulo: { fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--text-muted)" },
};

// A frase que substitui o número. Ela é o produto: sem ela, "—" vira
// "provavelmente zero" na cabeça de quem lê.
const FRASE = {
  [MOTIVOS.SEM_LEITURA]: "não foi possível ler",
  [MOTIVOS.SEM_BASE]:    "sem base para calcular",
  [MOTIVOS.SEM_PRECO]:   "faltam preços cadastrados",
};

function Indicador({ label, ind, formata, cor, dica }) {
  const temValor = ind?.temValor;
  return (
    <div style={{ ...cx.card, borderLeft: `4px solid ${temValor ? (cor || "var(--border)") : "var(--border)"}`, minWidth: 170, flex: 1 }}>
      <div style={cx.rotulo}>{label}</div>
      <div style={{
        fontSize: 23, fontWeight: 800, marginTop: 5,
        color: temValor ? (cor || "var(--text)") : "var(--text-muted)",
        fontFamily: "JetBrains Mono, monospace",
      }}>
        {temValor ? formata(ind.valor) : "—"}
      </div>
      <div style={{ fontSize: 11, color: temValor ? "var(--text-muted)" : "#f59e0b", marginTop: 3, lineHeight: 1.35 }}>
        {temValor ? (dica || "") : (FRASE[ind?.motivo] || "sem dado")}
      </div>
    </div>
  );
}

const pct = v => `${v.toFixed(1)}%`;

// A barra do gráfico. Sem biblioteca: são poucas competências e o dado é
// simples — importar recharts para isto engordaria o bundle sem ganho.
function Barras({ serie }) {
  const maxF = Math.max(...serie.map(s => s.faturadoCentavos), 1);
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-end", minHeight: 130, overflowX: "auto", paddingTop: 8 }}>
      {serie.map(s => {
        const h = Math.max(4, Math.round((s.faturadoCentavos / maxF) * 100));
        const hG = s.glosadoCentavos > 0 ? Math.max(2, Math.round((s.glosadoCentavos / maxF) * 100)) : 0;
        return (
          <div key={s.competencia} style={{ textAlign: "center", minWidth: 62 }}>
            <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginBottom: 4, fontFamily: "JetBrains Mono, monospace" }}>
              {reais(s.faturadoCentavos)}
            </div>
            <div style={{ position: "relative", height: 100, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
              <div style={{ width: 30, height: h, background: "#2dd4bf55", border: "1px solid #2dd4bf", borderRadius: "3px 3px 0 0" }} />
              {hG > 0 && (
                <div title="glosado" style={{ position: "absolute", bottom: 0, width: 30, height: hG, background: "#f43f5e88", borderTop: "1px solid #f43f5e" }} />
              )}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 5 }}>{competenciaLabel(s.competencia) || s.competencia}</div>
            <div style={{ fontSize: 10, color: s.indice == null ? "var(--text-muted)" : s.indice > 5 ? "#f43f5e" : "var(--text-muted)" }}>
              {s.indice == null ? "—" : `${s.indice.toFixed(1)}%`}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function AnalisesView({ sb, competencia }) {
  const [contas, setContas] = useState([]);
  const [glosas, setGlosas] = useState([]);
  const [itens, setItens] = useState({ porConta: {}, falhou: false });
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let vivo = true;
    (async () => {
      if (!sb) { if (vivo) { setCarregando(false); } return; }
      setCarregando(true);
      // Sem competência, o painel olha TUDO — é o histórico que dá a série.
      // ⚠️ `contasDaCompetencia(sb, null)` devolveria [] (e devolve certo:
      // "contas de nenhuma competência" são nenhuma). Aqui a pergunta é
      // outra, e o [] dela viraria "o hospital não faturou nada".
      const cs = await (competencia
        ? contasDaCompetencia(sb, competencia, { limite: 1000 })
        : todasAsContas(sb, { limite: 1000 })).catch(() => listaLida(null));
      const gs = await carregarGlosas(sb, { limite: 1000 });
      const ids = listaLida(cs).map(c => c.id);
      const its = await itensDasContas(sb, ids);
      if (!vivo) return;
      setContas(cs); setGlosas(gs); setItens(its); setCarregando(false);
    })();
    return () => { vivo = false; };
  }, [sb, competencia]);

  const a = useMemo(
    () => analiseDaCompetencia({ contas, itensPorConta: itens.porConta, glosas }),
    [contas, itens, glosas]);
  const serie = useMemo(
    () => seriePorCompetencia({ contas, itensPorConta: itens.porConta, glosas }),
    [contas, itens, glosas]);

  // ⚠️ A falha dos ITENS é diferente da falha das contas, e some se não for
  // dita: as contas aparecem, e o dinheiro delas fica zero.
  const avisos = itens.falhou
    ? [...a.avisos, { tipo: "leitura", texto: "Não foi possível ler os itens das contas — o faturado abaixo está ZERADO por falha de leitura, não por falta de produção." }]
    : a.avisos;

  return (
    <div>
      <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 700 }}>Análises</h2>
      <p style={{ margin: "0 0 18px", color: "var(--text-muted)", fontSize: 13 }}>
        Produção, ticket médio, índice de glosa e rejeição.
        {competencia ? ` Competência ${competenciaLabel(competencia) || competencia}.` : " Todo o histórico."}
      </p>

      {avisos.map((av, i) => (
        <div key={i} role="alert" style={{
          background: av.tipo === "leitura" ? "#7f1d1d22" : "#78350f22",
          border: `1px solid ${av.tipo === "leitura" ? "#ef444455" : "#f59e0b55"}`,
          borderRadius: 8, padding: "10px 14px", marginBottom: 10,
          fontSize: 12.5, color: av.tipo === "leitura" ? "#fca5a5" : "#fcd34d", lineHeight: 1.45,
        }}>{av.texto}</div>
      ))}

      {carregando ? <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Carregando…</p> : (
        <>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "14px 0 20px" }}>
            <Indicador
              label="Faturado" ind={{ valor: a.faturado.centavos, temValor: !itens.falhou }}
              formata={reais} cor="#2dd4bf"
              dica={`${a.faturado.comItens} conta(s) com item`} />
            <Indicador
              label="Ticket médio" ind={a.ticketMedio} formata={reais}
              dica="por conta com item" />
            <Indicador
              label="Índice de glosa" ind={a.indiceDeGlosa} formata={pct}
              cor={a.indiceDeGlosa.temValor && a.indiceDeGlosa.valor > 5 ? "#f43f5e" : "#22c55e"}
              dica="do faturado, recusado" />
            <Indicador
              label="Rejeição" ind={a.taxaDeRejeicao} formata={pct}
              cor={a.taxaDeRejeicao.temValor && a.taxaDeRejeicao.valor > 10 ? "#f43f5e" : undefined}
              dica="contas glosadas / enviadas" />
            <Indicador
              label="Recuperação" ind={a.recuperacao} formata={pct}
              cor={a.recuperacao.temValor && a.recuperacao.valor >= 50 ? "#22c55e" : "#f59e0b"}
              dica="do que já foi encerrado" />
          </div>

          <section style={{ ...cx.card, marginBottom: 18 }}>
            <div style={{ ...cx.rotulo, marginBottom: 2 }}>Faturado por competência</div>
            {/* 🔴 Mês sem dado NÃO entra como zero: desenharia uma queda a
                pique onde o hospital nem usava o sistema. */}
            <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 6 }}>
              Barra cheia = faturado · faixa vermelha = glosado · abaixo, o índice.
              Mês sem lançamento não aparece — não é zero, é ausência.
            </div>
            {serie.length === 0
              ? <p style={{ color: "var(--text-muted)", fontSize: 13, margin: "10px 0 0" }}>
                  {naoDeuParaLer(contas) ? "Não foi possível ler." : "Nenhuma conta com competência."}
                </p>
              : <Barras serie={serie} />}
          </section>

          <section style={cx.card}>
            <div style={{ ...cx.rotulo, marginBottom: 10 }}>Contas por situação</div>
            <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 13 }}>
              {Object.entries(a.contagem.porSituacao).map(([s, n]) => (
                <div key={s}>
                  <span style={{ color: "var(--text-muted)" }}>{s}</span>{" "}
                  <strong style={{ fontFamily: "JetBrains Mono, monospace" }}>{n}</strong>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
