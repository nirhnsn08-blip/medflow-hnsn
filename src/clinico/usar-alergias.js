// ═══════════════════════════════════════════════════════════
// CARREGAR ALERGIAS DE UMA FILA INTEIRA
//
// A Farmácia mostra dezenas de atendimentos por tela — a fila de
// dispensação, a análise farmacêutica, o preparo, o painel. Cada uma delas
// precisa das alergias de todos os pacientes que está mostrando.
//
// ⚠️ UMA CONSULTA POR PACIENTE transformaria a abertura da tela em dezenas
// de requisições. Este gancho junta os prontuários e faz uma só.
//
// 🔴 ENQUANTO CARREGA, TODO PACIENTE CONTA COMO NÃO CONFERIDO. É o mesmo
// princípio do resto do módulo: antes da resposta a tela não sabe, e não
// saber não pode ser exibido como "sem alergia".
// ═══════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import { carregarAlergiasDeVarios } from "./alergias-dados.js";
import { alergiasPorProntuario } from "./contexto.js";

const VAZIO = { falhou: false, carregando: false, por: {} };

export function useAlergiasDosAtendimentos(sb, atendimentos) {
  const [indice, setIndice] = useState({ ...VAZIO, carregando: true });
  // A chave do efeito é o CONJUNTO de prontuários, ordenado: a lista de
  // atendimentos é recriada a cada render e dispararia a consulta sem parar.
  const chave = [...new Set((Array.isArray(atendimentos) ? atendimentos : [])
    .map(a => a?.prontuario).filter(Boolean))].sort().join("|");

  useEffect(() => {
    if (!sb) return;
    const chaves = chave ? chave.split("|") : [];
    if (!chaves.length) { setIndice(VAZIO); return; }
    let vivo = true;
    setIndice(i => ({ ...i, carregando: true }));
    carregarAlergiasDeVarios(sb, chaves).then(r => {
      if (vivo) setIndice({ ...alergiasPorProntuario(r), carregando: false });
    });
    return () => { vivo = false; };
  }, [sb, chave]);

  return indice;
}
