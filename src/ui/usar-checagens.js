// ═══════════════════════════════════════════════════════════
// CONTAR O QUE SUSTENTA O PAINEL
//
// Cada módulo se apoia num cadastro: o Faturamento em convênios, a Farmácia
// no catálogo de medicamentos, os Protocolos no catálogo e nos setores.
// Enquanto esse cadastro está vazio, os números do painel são zero por
// falta de configuração — e não por falta de movimento.
//
// Este gancho só pergunta UMA coisa por tabela: "existe pelo menos uma
// linha?". Não precisa do total, e pedir o total custaria mais.
//
// ⚠️ `select=*`, NÃO `select=id`. Nem toda tabela desta casa tem coluna
// `id` — `setores`, `leitos` e `pacientes` não têm, e `select=id` nelas
// devolve 400. Um 400 viraria `null`, que a faixa lê como "não deu para
// ler", e o aviso de falha de leitura apareceria para sempre num hospital
// que está perfeitamente configurado. Descoberto sondando o banco: a
// tabela inexistente devolve 404, a coluna inexistente devolve 400 — não
// são a mesma coisa e não se pode tratar as duas igual.
// ═══════════════════════════════════════════════════════════

import { useState, useEffect } from "react";
import { listaLida, naoDeuParaLer } from "../util/leitura.js";

/**
 * `defs`: `[{ o, tabela, onde, ir }]` — ver `primeiro-uso.js`.
 *
 * ⚠️ DECLARE `defs` FORA DO COMPONENTE (constante de módulo). Um array
 * criado no corpo do componente é novo a cada render; se ele entrasse nas
 * dependências do efeito, seria uma consulta por quadro. Aqui o efeito
 * depende dos NOMES das tabelas, não da identidade do array — mas um
 * `defs` instável ainda recriaria o estado inicial à toa.
 */
export function useChecagens(sb, defs) {
  const chave = (defs || []).map(d => `${d.tabela}?${d.filtro || ""}`).join(",");
  const [ch, setCh] = useState(() => (defs || []).map(d => ({ ...d, quantos: undefined })));

  useEffect(() => {
    let vivo = true;
    (async () => {
      if (!sb) return;
      const r = await Promise.all((defs || []).map(async d => {
        // ⚠️ `filtro` existe porque o módulo pode não usar TODAS as linhas da
        // tabela. O Faturamento lê `at_convenios?ativo=is.true`; contar aqui
        // sem o filtro faria a faixa calar num hospital que desativou todos
        // os convênios — o seletor apareceria vazio e nada explicaria.
        const q = `${d.tabela}?${d.filtro ? d.filtro + "&" : ""}select=*&limit=1`;
        const linhas = listaLida(await sb(q).catch(() => null));
        // `undefined` = não deu para ler. `0` = leu e não há nada.
        return { ...d, quantos: naoDeuParaLer(linhas) ? undefined : linhas.length };
      }));
      if (vivo) setCh(r);
    })();
    return () => { vivo = false; };
    // As dependências são `sb` e os NOMES das tabelas — não o array `defs`,
    // que é constante de módulo. (O plugin react-hooks não está ligado neste
    // projeto, então isto é contrato escrito, não verificado.)
  }, [sb, chave]);

  return ch;
}
