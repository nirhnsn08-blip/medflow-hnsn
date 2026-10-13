// ═══════════════════════════════════════════════════════════
// LANÇAR RESULTADO
//
// 🔴 A TELA ANTIGA ERA UMA CAIXA DE TEXTO. O bioquímico colava
// "Hb 7,1 / Leuco 18.400 / Plaq 85.000" e pronto: nenhum daqueles números
// podia ser comparado com nada, somado, posto numa curva ou destacado.
//
// Aqui, quando o exame tem analitos cadastrados, cada um ganha seu campo COM
// A FAIXA DE REFERÊNCIA AO LADO — e a faixa crítica, quando existe. Exame
// sem analito (imagem, anatomopatológico) segue por laudo, que é o formato
// honesto para ele.
//
// ⚠️⚠️ A TELA NÃO DECIDE O QUE É ALTERADO NEM O QUE É CRÍTICO. Ela mostra a
// faixa para quem digita saber o que está digitando, e mostra o veredito
// DEPOIS, lido da linha que o banco devolveu. Se ela calculasse, haveria
// duas opiniões sobre o mesmo valor — e a faixa que ela leu pode já não ser
// a que o gatilho usou.
//
// ⚠️ O VALOR NUNCA SOBREVIVE A UM SALVAMENTO (`proximoFormulario`). Só quem
// liberou sobrevive, porque são vinte analitos do mesmo hemograma. A regra
// nasceu do OPME, onde o formulário guardava o fabricante entre registros e
// atribuía o errado a outro produto numa tabela de rastreabilidade.
// ═══════════════════════════════════════════════════════════

import { useMemo, useState } from "react";
import { btnContorno } from "../ui/base.jsx";
import { horaFmt } from "../util/datas.js";
import {
  conferirResultado, faixaTexto, faixaCriticaTexto, formularioVazio,
  proximoFormulario, leituraDoResultado, valorDoResultado, resultadosVigentes,
} from "./exames.js";

const inp = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none", boxSizing: "border-box" };

export function LancarResultado({ item, analitos, resultados, currentUser, onLancar, onFechar }) {
  const [form, setForm] = useState(() => formularioVazio({ liberado_por: currentUser?.name || "" }));
  const [erro, setErro] = useState("");
  const [gravando, setGravando] = useState(false);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // Os analitos deste exame, na ordem em que o laudo imprime.
  const doExame = useMemo(() => (Array.isArray(analitos) ? analitos : [])
    .filter(a => a && item?.catalogo_id != null && String(a.catalogo_id) === String(item.catalogo_id))
    .filter(a => a.ativo !== false), [analitos, item]);

  const vigentes = resultadosVigentes(resultados);
  const jaLancados = new Map((vigentes || [])
    .filter(r => String(r.item_id) === String(item?.id) && r.analito_id != null)
    .map(r => [String(r.analito_id), r]));

  const ana = doExame.find(a => String(a.id) === String(form.analito_id)) || null;
  const corrigindo = form.corrige_id != null;

  async function enviar() {
    const r = conferirResultado(form, item);
    if (r) { setErro(r); return; }
    setErro("");
    setGravando(true);
    const res = await onLancar(form);
    setGravando(false);
    // 🔴 EM CASO DE FALHA O VALOR FICA NA TELA. Uma gravação recusada em
    // silêncio pela RLS levava junto o resultado que acabou de ser digitado,
    // sem mensagem nenhuma — foi um defeito real da aba antiga.
    if (res?.erro) { setErro(res.erro); return; }
    setForm(proximoFormulario(form));
  }

  function escolher(a) {
    const ja = jaLancados.get(String(a.id));
    setErro("");
    // Analito já lançado abre em modo CORREÇÃO, e não como lançamento novo:
    // o banco recusaria por bifurcação, e a pessoa descobriria depois de
    // digitar. Melhor dizer antes o que vai acontecer.
    setForm(p => ({
      ...formularioVazio({ liberado_por: p.liberado_por }),
      analito_id: a.id, nome: a.nome,
      corrige_id: ja ? ja.id : null,
    }));
  }

  return (
    <div style={{ background: "var(--surface-2)", border: "1px solid var(--border-2)", borderRadius: 8, padding: "11px 13px", marginTop: 8 }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>
        Lançar resultado — {item?.descricao}
      </div>

      {/* Os analitos, se o exame tiver. */}
      {doExame.length > 0 ? (
        <>
          <div style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 700, marginBottom: 5 }}>
            Analito ({jaLancados.size} de {doExame.length} lançado{jaLancados.size === 1 ? "" : "s"})
          </div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 9 }}>
            {doExame.map(a => {
              const ja = jaLancados.get(String(a.id));
              const l = ja ? leituraDoResultado(ja) : null;
              const ativo = String(form.analito_id ?? "") === String(a.id);
              return (
                <button key={a.id} onClick={() => escolher(a)}
                  title={ja ? `Já lançado: ${valorDoResultado(ja)} — clicar abre uma CORREÇÃO` : "Lançar"}
                  style={{
                    background: ativo ? "#3b82f6" : "transparent",
                    color: ativo ? "#fff" : (l ? l.cor : "var(--text-3)"),
                    border: `1px solid ${ativo ? "#3b82f6" : (l ? l.cor + "88" : "var(--border)")}`,
                    borderRadius: 99, padding: "3px 11px", fontSize: 11.5, fontWeight: 700, cursor: "pointer",
                  }}>
                  {a.nome}
                  {ja && <span style={{ marginLeft: 5, fontWeight: 600, opacity: .9 }}>{valorDoResultado(ja)}</span>}
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 9, lineHeight: 1.5 }}>
          {item?.catalogo_id == null
            ? "Exame fora do catálogo: não tem analito cadastrado, então o resultado entra como laudo."
            : "Este exame não tem analito cadastrado. O resultado entra como laudo — cadastre os analitos para que os valores entrem como número, com faixa e curva."}
        </div>
      )}

      {/* 🔴 A FAIXA, ao lado do campo. */}
      {ana && (
        <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 6, lineHeight: 1.5 }}>
          <strong>{ana.nome}</strong>
          {ana.unidade ? ` (${ana.unidade})` : ""}
          {faixaTexto(ana) ? <> · referência <strong style={{ color: "#34d399" }}>{faixaTexto(ana)}</strong></> : " · sem faixa de referência cadastrada"}
          {faixaCriticaTexto(ana) && <> · crítico <strong style={{ color: "#f43f5e" }}>{faixaCriticaTexto(ana)}</strong></>}
        </div>
      )}

      {corrigindo && (
        <div style={{ fontSize: 11.5, color: "#d97706", fontWeight: 600, marginBottom: 7, lineHeight: 1.5 }}>
          Este analito já tem resultado. O que você lançar entra como <strong>versão nova</strong> —
          a anterior não é apagada, porque alguém pode ter tratado o paciente com base nela.
        </div>
      )}

      <div style={{ display: "flex", gap: 7, marginBottom: 7, flexWrap: "wrap" }}>
        <input value={form.valor_num} onChange={e => { set("valor_num", e.target.value); setErro(""); }}
          placeholder={ana?.unidade ? `Valor em ${ana.unidade}` : "Valor numérico"}
          inputMode="decimal"
          style={{ ...inp, width: 150 }} />
        <input value={form.valor_texto} onChange={e => { set("valor_texto", e.target.value); setErro(""); }}
          placeholder="ou texto (negativo, ausente, flora normal…)"
          style={{ ...inp, flex: 1, minWidth: 180 }} />
      </div>
      <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 7 }}>
        Vírgula ou ponto, os dois servem: 7,2 e 7.2 são o mesmo valor, e 150.000 é cento e cinquenta mil.
      </div>

      <textarea value={form.laudo} onChange={e => { set("laudo", e.target.value); setErro(""); }} rows={doExame.length ? 2 : 4}
        placeholder={doExame.length ? "Observação do laudo (opcional)" : "Laudo do exame"}
        style={{ ...inp, width: "100%", resize: "vertical", lineHeight: 1.5, marginBottom: 7 }} />

      {corrigindo && (
        <textarea value={form.motivo_correcao} onChange={e => { set("motivo_correcao", e.target.value); setErro(""); }} rows={2}
          placeholder="Por que o resultado anterior está sendo corrigido? (ex.: contagem automática confundiu agregado plaquetário; revisto em lâmina)"
          style={{ ...inp, width: "100%", resize: "vertical", lineHeight: 1.5, marginBottom: 7 }} />
      )}

      <input value={form.liberado_por} onChange={e => set("liberado_por", e.target.value)}
        placeholder="Liberado por (quem assina o resultado)" style={{ ...inp, width: "100%", marginBottom: 8 }} />

      {erro && (
        <div style={{ fontSize: 11.5, color: "#f43f5e", fontWeight: 600, marginBottom: 7, lineHeight: 1.5 }}>
          {erro}
        </div>
      )}

      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", alignItems: "center" }}>
        {jaLancados.size > 0 && (
          <span style={{ fontSize: 10.5, color: "var(--text-muted)", marginRight: "auto" }}>
            último lançamento {horaFmt([...jaLancados.values()].map(r => r.criado_em).sort().pop())}
          </span>
        )}
        <button onClick={onFechar} style={btnContorno("var(--text-muted)")}>Fechar</button>
        <button onClick={enviar} disabled={gravando} style={btnContorno(corrigindo ? "#d97706" : "#3b82f6")}>
          {gravando ? "…" : corrigindo ? "Gravar correção" : "Gravar resultado"}
        </button>
      </div>
    </div>
  );
}
