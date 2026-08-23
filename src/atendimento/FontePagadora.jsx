// ═══════════════════════════════════════════════════════════
// FONTE PAGADORA — quem paga este atendimento
//
// POR QUE ESTE ARQUIVO EXISTE, E NÃO DUAS CÓPIAS DO FORMULÁRIO
// O bloco vivia só na Recepção. Quando a Agenda passou a precisar dele — a
// confirmação de presença abre um atendimento igual ao do balcão, e abria
// SEM convênio nenhum —, copiar era o caminho curto e o errado: as duas
// cópias divergiriam na primeira regra nova, e regra de convênio muda por
// contrato, não por release.
//
// O QUE O FORMULÁRIO SABE, E QUE UM `<select>` SOLTO NÃO SABERIA
// Carteira, validade, guia e senha só APARECEM quando o convênio escolhido
// exige (`exigenciasDoConvenio`). No SUS não existe carteirinha, e campo que
// não se aplica não é neutro: ensina a preencher qualquer coisa para o
// formulário parar de parecer incompleto — e aí o dado que importa perde o
// valor junto.
//
// Convênio e plano vão por ID (são chave estrangeira); os domínios da ficha
// vão por CÓDIGO. Trocar isso já fez o convênio escolhido chegar nulo no
// banco, sem erro nenhum na tela.
// ═══════════════════════════════════════════════════════════

import { exigenciasDoConvenio, tipoDoConvenio } from "./ficha.js";

const inp = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 11px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" };
const lbl = { fontSize: 10.5, color: "var(--text-muted)", display: "block", marginBottom: 3 };

/**
 * Um campo alimentado por catálogo.
 *
 * Catálogo VAZIO não vira `<select>` vazio: vira o aviso de que ninguém
 * cadastrou ainda. Um seletor sem opção parece defeito da tela, e manda a
 * recepcionista procurar o problema no lugar errado — o problema é cadastro,
 * e ele se resolve em Atendimento → Tabelas.
 */
export function CampoCatalogo({ label, dica, lista, valor, onChange, largura, campoValor = "codigo" }) {
  if (!lista?.length) {
    return (
      <div style={largura ? { width: largura } : undefined}>
        <label style={lbl}>{label}</label>
        <div style={{ ...inp, color: "var(--text-muted)", fontSize: 11.5, lineHeight: 1.35, paddingTop: 7, paddingBottom: 7 }}>
          Nenhum cadastrado ainda
        </div>
      </div>
    );
  }
  return (
    <div style={largura ? { width: largura } : undefined}>
      <label style={lbl}>{label}</label>
      <select value={valor ?? ""} onChange={e => onChange(e.target.value)} style={inp}>
        <option value="">—</option>
        {/* Convênio e plano são guardados no atendimento por ID (são chave
            estrangeira); os domínios, por CÓDIGO. Usar `codigo ?? id` para
            os dois fazia o seletor devolver o código do convênio enquanto a
            busca procurava pelo id — e o convênio escolhido nunca era
            encontrado, sem erro nenhum na tela. */}
        {lista.map(o => (
          <option key={o.id ?? o.codigo} value={o[campoValor] ?? o.id}>{o.nome}</option>
        ))}
      </select>
      {dica && <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 3, lineHeight: 1.35 }}>{dica}</div>}
    </div>
  );
}

/**
 * O bloco de fonte pagadora.
 *
 * `ficha` e `onChange` são controlados por quem chama — a Recepção guarda a
 * ficha inteira do atendimento, a Agenda guarda só o pedaço da presença, e o
 * componente não precisa saber a diferença.
 */
export default function FontePagadora({ catalogos = {}, ficha = {}, onChange, titulo = "Fonte pagadora" }) {
  const convenios = catalogos.convenios || [];
  const convenio = convenios.find(c => String(c.id) === String(ficha.convenio_id)) || null;
  const planosDoConvenio = (catalogos.planos || []).filter(p => convenio && p.convenio_id === convenio.id);
  const exig = exigenciasDoConvenio(convenio);
  const tipoConv = tipoDoConvenio(convenio);
  const set = (k, v) => onChange({ ...ficha, [k]: v });

  return (
    <>
      {titulo && <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginTop: 14, marginBottom: 8 }}>{titulo}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
        <CampoCatalogo label="Convênio" lista={convenios} campoValor="id"
          valor={ficha.convenio_id}
          // Trocar de convênio zera o plano: plano é FILHO do convênio, e
          // manter o antigo faria a conta sair com um plano que não pertence
          // a quem vai pagar.
          onChange={v => onChange({ ...ficha, convenio_id: v, plano_id: "" })} />

        {convenio && planosDoConvenio.length > 0 && (
          <CampoCatalogo label="Plano" lista={planosDoConvenio} campoValor="id"
            valor={ficha.plano_id} onChange={v => set("plano_id", v)} />
        )}

        {exig.carteira && (
          <>
            <div>
              <label style={lbl}>Carteira</label>
              <input value={ficha.carteira || ""} onChange={e => set("carteira", e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>Validade da carteira</label>
              <input type="date" value={ficha.carteira_validade || ""}
                onChange={e => set("carteira_validade", e.target.value)} style={inp} />
            </div>
          </>
        )}

        {exig.autorizacao && (
          <>
            <div>
              <label style={lbl}>Nº da guia</label>
              <input value={ficha.guia_numero || ""} onChange={e => set("guia_numero", e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>Senha de autorização</label>
              <input value={ficha.autorizacao_senha || ""} onChange={e => set("autorizacao_senha", e.target.value)} style={inp} />
            </div>
          </>
        )}
      </div>

      {tipoConv && (
        <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 7 }}>
          {tipoConv.label} · fatura por <strong>{tipoConv.faturamento}</strong>
          {tipoConv.cobraDoPaciente ? "" : " · o paciente não pode ser cobrado"}
        </div>
      )}
    </>
  );
}
