// ═══════════════════════════════════════════════════════════
// ABA DE EXAMES — AGORA SOBRE AS TABELAS DO SADT
//
// Substitui `src/ps/AbaExames.jsx`, que escrevia em `ps_registros` com
// `tipo='exame'`. O que havia lá foi MIGRADO pelo backfill da
// `migracao-sadt-exames.sql` — não existem duas fontes de exame.
//
// 🔴 O QUE ESTA ABA PASSA A FAZER E NÃO FAZIA:
//   · destacar VALOR CRÍTICO, com a faixa que o banco usou para decidir;
//   · mostrar o atraso contra o prazo PACTUADO de cada exame;
//   · marcar a coleta, que é de onde o laboratório conta o tempo dele;
//   · cancelar um exame COM motivo, em vez de deixá-lo pendente para sempre;
//   · mostrar a versão anterior de um laudo corrigido.
//
// ⚠️ ELA CARREGA OS PRÓPRIOS DADOS. A aba antiga recebia `exames` da lista de
// `registros` do modal, porque exame e evolução moravam na mesma tabela.
// Agora são cinco tabelas, e pedir ao modal que as carregasse faria a
// Prescrição e a Checagem recarregarem a cada resultado lançado.
//
// ⚠️ `naTela` guarda contra `setState` depois de desmontar — foi o que
// deixou a `main` vermelha com 4342 testes passando, no PR #277. O `ref` é
// de COMPONENTE, não de efeito: `recarregar` é chamado de vários lugares.
// ═══════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { registrarAuditoria } from "../auditoria/dados.js";
import { btnContorno } from "../ui/base.jsx";
import { fmtDur, horaFmt } from "../util/datas.js";
import { algumaFalhou, avisoDeFalha, naoDeuParaLer } from "../util/leitura.js";
import { PS_EXAME_CATEGORIAS } from "../ps/catalogo.js";
import { acaoDoExame, estadoDoExame } from "../ps/exames.js";
import {
  atrasoDoExame, conferirCancelamento, criticosPendentes, leituraDoResultado,
  linhaDoPedido, linhasDosItens, linhaDoResultado, resultadosVigentes,
  valorDoResultado, veioDoRegistroAntigo, versaoCorrigida, PRIORIDADES,
} from "./exames.js";
import {
  cancelarItem, criarSadtPedido, lancarSadtResultado, loadSadtAnalitos,
  loadSadtCatalogo, loadSadtItens, loadSadtPedidosDoAtendimento,
  loadSadtResultados, marcarColetado, marcarVisto,
} from "./dados.js";
import { LancarResultado } from "./LancarResultado.jsx";
import { PedirExames } from "./PedirExames.jsx";

export function AbaExames({ sb, paciente, currentUser, busy, setBusy, onMudou, onContou }) {
  const [catalogo, setCatalogo] = useState([]);
  const [analitos, setAnalitos] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [itens, setItens] = useState([]);
  const [resultados, setResultados] = useState([]);
  const [pedindo, setPedindo] = useState(false);
  const [lancandoEm, setLancandoEm] = useState(null);   // id do item
  const [cancelando, setCancelando] = useState(null);   // { id, motivo }
  const [erroCancel, setErroCancel] = useState("");
  const [carregou, setCarregou] = useState(false);

  const naTela = useRef(true);
  useEffect(() => () => { naTela.current = false; }, []);

  const recarregar = useCallback(async () => {
    if (!sb) { setCarregou(true); return; }
    const peds = await loadSadtPedidosDoAtendimento(sb, paciente?.id);
    const ids = (Array.isArray(peds) ? peds : []).map(p => p.id);
    const its = await loadSadtItens(sb, ids);
    const itemIds = (Array.isArray(its) ? its : []).map(i => i.id);
    const res = await loadSadtResultados(sb, itemIds);
    if (!naTela.current) return;
    setPedidos(peds); setItens(its); setResultados(res); setCarregou(true);
  }, [sb, paciente?.id]);

  useEffect(() => {
    if (!sb) { setCarregou(true); return; }
    // O catálogo é cadastro: carrega uma vez, não muda durante o plantão.
    loadSadtCatalogo(sb).then(c => { if (naTela.current) setCatalogo(c); });
    loadSadtAnalitos(sb).then(a => { if (naTela.current) setAnalitos(a); });
  }, [sb]);

  useEffect(() => { recarregar(); }, [recarregar]);

  /**
   * 🔴 O CRACHÁ DA ABA É `null` ENQUANTO NÃO SE SABE, nunca zero.
   *
   * "Exames (0)" afirma que não há exame pedido. Enquanto a leitura não
   * voltou — ou se ela falhou — o número não existe, e a aba mostra só
   * "Exames". É a mesma regra de `contagemLida`: zero é uma afirmação.
   */
  useEffect(() => {
    if (!onContou) return;
    onContou(!carregou || naoDeuParaLer(itens) ? null : itens.length);
  }, [onContou, carregou, itens]);

  const porId = useMemo(() => new Map((Array.isArray(pedidos) ? pedidos : [])
    .map(p => [String(p.id), p])), [pedidos]);
  const porCatalogo = useMemo(() => new Map((Array.isArray(catalogo) ? catalogo : [])
    .map(c => [String(c.id), c])), [catalogo]);

  const criticos = criticosPendentes(resultados, itens);
  const falhou = algumaFalhou(pedidos, itens, resultados);

  // Os itens, do mais recente para o mais antigo (a ordem em que se olha).
  const lista = useMemo(() => (Array.isArray(itens) ? itens : [])
    .filter(Boolean)
    .map(i => ({ item: i, pedido: porId.get(String(i.pedido_id)) || null }))
    .sort((a, b) => new Date(b.pedido?.criado_em || 0) - new Date(a.pedido?.criado_em || 0) || b.item.id - a.item.id),
    [itens, porId]);

  async function pedir(form) {
    setBusy?.(true);
    const r = await criarSadtPedido(
      sb,
      linhaDoPedido(form, { prontuario: paciente?.prontuario, ps_atendimento_id: paciente?.id }),
      pedidoId => linhasDosItens(form, pedidoId),
      currentUser,
    );
    setBusy?.(false);
    if (!r.ok) return { erro: r.erro };
    registrarAuditoria(sb, currentUser, "Exames: pedido",
      `${paciente?.iniciais} · ${r.itens.length} exame(s)${form.prioridade === "urgente" ? " · URGENTE" : ""}`, {});
    await recarregar();
    if (naTela.current) setPedindo(false);
    onMudou?.();
    return {};
  }

  async function lancar(item, form) {
    const r = await lancarSadtResultado(sb, linhaDoResultado(form, item), currentUser);
    if (!r.ok) return { erro: r.erro };
    // 🔴 A LINHA DE VOLTA É QUE SABE se o valor é crítico — o gatilho
    // calculou. Avisar aqui a partir do que foi ENVIADO seria a tela dando
    // um veredito que ela não apurou.
    const l = leituraDoResultado(r.linha);
    registrarAuditoria(sb, currentUser,
      l?.nivel === "critico" ? "Exames: resultado CRÍTICO" : "Exames: resultado",
      `${paciente?.iniciais} · ${item.descricao} · ${r.linha.nome || ""} ${valorDoResultado(r.linha)}`.trim(), {});
    await recarregar();
    onMudou?.();
    return {};
  }

  async function agir(fn, item, oQue) {
    const r = await fn();
    if (!r.ok) { alert(r.erro); return false; }
    registrarAuditoria(sb, currentUser, `Exames: ${oQue}`, `${paciente?.iniciais} · ${item.descricao}`, {});
    await recarregar();
    onMudou?.();
    return true;
  }

  async function confirmarCancelamento() {
    const c = conferirCancelamento(cancelando?.motivo);
    if (c) { setErroCancel(c); return; }
    setErroCancel("");
    const item = lista.find(x => String(x.item.id) === String(cancelando.id))?.item;
    const ok = await agir(() => cancelarItem(sb, cancelando.id, cancelando.motivo), item, "cancelamento");
    if (ok && naTela.current) setCancelando(null);
  }

  if (!carregou) {
    return <div style={{ fontSize: 12.5, color: "var(--text-muted)", textAlign: "center", padding: "14px 0" }}>Carregando exames…</div>;
  }

  return (
    <>
      {falhou && (
        <div style={{ fontSize: 11.5, color: "#f43f5e", fontWeight: 600, marginBottom: 10, lineHeight: 1.5 }}>
          {avisoDeFalha("os exames deste atendimento")}
        </div>
      )}

      {/* 🔴 OS CRÍTICOS, NO ALTO. É a razão de a coluna existir. */}
      {criticos === null && !falhou && (
        <div style={{ fontSize: 11.5, color: "#d97706", fontWeight: 600, marginBottom: 10 }}>
          Não foi possível conferir se há valor crítico pendente nesta lista.
        </div>
      )}
      {criticos?.length > 0 && (
        <div style={{ background: "#f43f5e18", border: "1px solid #f43f5e", borderRadius: 8, padding: "9px 12px", marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#f43f5e", marginBottom: 4 }}>
            {criticos.length} VALOR{criticos.length === 1 ? "" : "ES"} CRÍTICO{criticos.length === 1 ? "" : "S"} sem registro de quem leu
          </div>
          {criticos.map(r => (
            <div key={r.id} style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.6 }}>
              <strong>{r.nome || "resultado"}</strong> {valorDoResultado(r)}
              {r.referencia ? <span style={{ color: "var(--text-muted)" }}> (ref. {r.referencia})</span> : null}
              <span style={{ color: "var(--text-muted)", fontSize: 10.5, fontFamily: "JetBrains Mono, monospace" }}> · {horaFmt(r.criado_em)}</span>
            </div>
          ))}
          <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 4 }}>
            Marcar o exame como visto registra que alguém leu.
          </div>
        </div>
      )}

      {pedindo ? (
        <PedirExames catalogo={catalogo} currentUser={currentUser} busy={busy}
          onPedir={pedir} onCancelar={() => setPedindo(false)} />
      ) : (
        <button onClick={() => setPedindo(true)}
          style={{ background: "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "8px 16px", fontWeight: 700, cursor: "pointer", fontSize: 13, marginBottom: 14 }}>
          + Pedir exames
        </button>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {lista.length === 0 && !falhou && (
          <div style={{ fontSize: 12.5, color: "var(--text-muted)", textAlign: "center", padding: "8px 0" }}>
            Nenhum exame solicitado.
          </div>
        )}

        {lista.map(({ item, pedido }) => {
          const st = estadoDoExame(item);
          const acao = acaoDoExame(item);
          const cat = item.catalogo_id != null ? porCatalogo.get(String(item.catalogo_id)) : null;
          const atraso = atrasoDoExame(item, pedido, cat);
          const prio = PRIORIDADES.find(p => p.chave === pedido?.prioridade);
          const meus = (resultadosVigentes(resultados) || [])
            .filter(r => String(r.item_id) === String(item.id));
          const pior = meus.map(leituraDoResultado).filter(Boolean)
            .sort((a, b) => b.peso - a.peso)[0] || null;

          return (
            <div key={item.id} style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderLeft: `4px solid ${pior?.nivel === "critico" ? "#f43f5e" : st.cor}`, borderRadius: 8, padding: "10px 13px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <strong style={{ fontSize: 13 }}>{item.descricao}</strong>
                {cat?.codigo && <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace" }}>{cat.codigo}</span>}
                <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>{PS_EXAME_CATEGORIAS[item.categoria] || item.categoria}</span>
                {prio?.chave === "urgente" && <span style={{ fontSize: 10, fontWeight: 800, color: prio.cor, border: `1px solid ${prio.cor}`, borderRadius: 99, padding: "0 7px" }}>URGENTE</span>}
                <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: st.cor }}>{st.label}</span>
              </div>

              {/* O tempo, e o atraso contra o prazo pactuado. */}
              <div style={{ fontSize: 10.5, color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace", marginTop: 2 }}>
                Pedido {horaFmt(pedido?.criado_em)}
                {item.coletado_em ? ` · coletado ${horaFmt(item.coletado_em)}` : ""}
                {item.resultado_em ? ` · resultado ${horaFmt(item.resultado_em)}` : ""}
                {item.visto_em ? ` · visto ${horaFmt(item.visto_em)}${item.visto_por ? ` por ${item.visto_por}` : ""}` : ""}
              </div>
              {atraso && atraso.atrasado === true && (
                <div style={{ fontSize: 11, color: "#f43f5e", fontWeight: 700, marginTop: 3 }}>
                  {fmtDur(atraso.excesso)} além do prazo de {fmtDur(atraso.prazo)} ({atraso.urgente ? "urgente" : "rotina"})
                </div>
              )}
              {atraso && atraso.atrasado === null && atraso.esperando != null && (
                <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 3 }}>
                  esperando {fmtDur(atraso.esperando)} · prazo não cadastrado para este exame
                </div>
              )}

              {/* A indicação clínica — ou a nota de que este pedido é antigo. */}
              {pedido?.indicacao_clinica && (
                <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 4, lineHeight: 1.5 }}>
                  <strong>Indicação:</strong> {pedido.indicacao_clinica}
                </div>
              )}
              {veioDoRegistroAntigo(pedido) && !pedido?.indicacao_clinica && (
                <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 3 }}>
                  pedido migrado do registro antigo — não havia campo de indicação clínica
                </div>
              )}

              {item.status === "cancelado" && item.cancelamento_motivo && (
                <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 4, lineHeight: 1.5 }}>
                  <strong>Cancelado:</strong> {item.cancelamento_motivo}
                </div>
              )}

              {/* OS RESULTADOS, com nível e faixa. */}
              {meus.length > 0 && (
                <div style={{ marginTop: 7, background: "var(--input-bg)", borderRadius: 6, padding: "7px 10px", display: "flex", flexDirection: "column", gap: 3 }}>
                  {meus.map(r => {
                    const l = leituraDoResultado(r);
                    const anterior = versaoCorrigida(r, resultados);
                    return (
                      <div key={r.id}>
                        <div style={{ display: "flex", gap: 7, alignItems: "baseline", flexWrap: "wrap", fontSize: 12.5 }}>
                          {r.nome && <span style={{ color: "var(--text-3)" }}>{r.nome}</span>}
                          <strong style={{ color: l.cor }}>{valorDoResultado(r)}</strong>
                          {l.label && <span style={{ fontSize: 10, fontWeight: 800, color: l.cor }}>{l.label}</span>}
                          {r.referencia && <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>ref. {r.referencia}</span>}
                          {r.versao > 1 && <span style={{ fontSize: 10, color: "#d97706", fontWeight: 700 }}>versão {r.versao}</span>}
                        </div>
                        {r.laudo && (
                          <div style={{ fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.55, whiteSpace: "pre-wrap", marginTop: 2 }}>{r.laudo}</div>
                        )}
                        {/* 🔴 A versão anterior continua visível: alguém pode ter
                            tratado o paciente com base nela. */}
                        {anterior && (
                          <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 2, lineHeight: 1.5 }}>
                            antes: {valorDoResultado(anterior)} ({horaFmt(anterior.criado_em)})
                            {r.motivo_correcao ? ` — ${r.motivo_correcao}` : ""}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {naoDeuParaLer(resultados) && (
                <div style={{ fontSize: 10.5, color: "#d97706", marginTop: 5 }}>
                  resultado não lido — pode haver valor aqui que a tela não mostrou
                </div>
              )}

              {/* AS AÇÕES. */}
              {String(cancelando?.id) === String(item.id) ? (
                <div style={{ marginTop: 8 }}>
                  <input value={cancelando.motivo} onChange={e => { setCancelando(p => ({ ...p, motivo: e.target.value })); setErroCancel(""); }}
                    placeholder="Por que este exame está sendo cancelado?"
                    style={{ background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", color: "var(--text)", fontSize: 13, width: "100%", boxSizing: "border-box", marginBottom: 6 }} />
                  {erroCancel && <div style={{ fontSize: 11.5, color: "#f43f5e", fontWeight: 600, marginBottom: 6, lineHeight: 1.5 }}>{erroCancel}</div>}
                  <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                    <button onClick={() => { setCancelando(null); setErroCancel(""); }} style={btnContorno("var(--text-muted)")}>Voltar</button>
                    <button onClick={confirmarCancelamento} style={btnContorno("#f43f5e")}>Cancelar o exame</button>
                  </div>
                </div>
              ) : String(lancandoEm) === String(item.id) ? (
                <LancarResultado item={item} analitos={analitos} resultados={resultados}
                  currentUser={currentUser}
                  onLancar={form => lancar(item, form)}
                  onFechar={() => setLancandoEm(null)} />
              ) : (
                <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                  {item.status === "solicitado" && (
                    <button onClick={() => agir(() => marcarColetado(sb, item.id), item, "coleta")} style={btnContorno("#f59e0b")}>
                      Marcar coleta
                    </button>
                  )}
                  {acao === "lancar_resultado" && (
                    <button onClick={() => setLancandoEm(item.id)} style={btnContorno("#3b82f6")}>Lançar resultado</button>
                  )}
                  {acao === "marcar_visto" && (
                    <>
                      <button onClick={() => agir(() => marcarVisto(sb, item.id, currentUser), item, "visto")} style={btnContorno("#34d399")}>
                        Marcar como visto
                      </button>
                      <button onClick={() => setLancandoEm(item.id)} style={btnContorno("var(--text-muted)")}>Corrigir / completar</button>
                    </>
                  )}
                  {(item.status === "solicitado" || item.status === "coletado") && (
                    <button onClick={() => { setCancelando({ id: item.id, motivo: "" }); setErroCancel(""); }}
                      style={{ ...btnContorno("var(--text-muted)"), marginLeft: "auto" }}>Cancelar</button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 10, lineHeight: 1.5 }}>
        Resultados são imutáveis: uma correção entra como versão nova, com motivo, e a
        anterior fica visível. “Alterado” e “crítico” são decididos pelo banco a partir da
        faixa cadastrada no analito — não por esta tela.
      </div>
    </>
  );
}
