// ═══════════════════════════════════════════════════════════
// APOIO DO PRONTO-SOCORRO — o que a página e os modais compartilham
//
// Cinco ajudantes que moravam dentro de `PsPage.jsx` e passaram a ser
// usados também pelos modais, quando eles saíram para `modais.jsx` em
// 04/09/2026. Deixá-los na página obrigaria a TELA a exportar ajudante —
// que foi exatamente como `SuprimentosPage.jsx` acabou sendo importado
// pela Farmácia.
//
// ⚠️ `psDosesDadas` só conta o que foi EFETIVAMENTE administrado. Dose
// prescrita e dose dada são coisas diferentes, e somar as duas faria a
// tela dizer que o paciente recebeu o que ainda está na bandeja.
// ═══════════════════════════════════════════════════════════

import { PS_FREQUENCIAS } from "./catalogo.js";
import { nowISO } from "../util/datas.js";

// Rótulos dos tipos de alerta (para filtrar prescrições)
export const freqDia = label => { const f = PS_FREQUENCIAS.find(x => x.label === label); return f ? f.dia : null; };

// PS_VIAS_TRANSF, PS_ORIGENS, PS_ORIGEM_UNIDADES e psPedeDetalhe passaram
// para `src/atendimento/recepcao.js` e são importados no topo. A chegada do
// paciente é registrada em DUAS telas agora (Recepção e este formulário do
// PS); manter duas cópias da mesma lista faria uma ganhar uma origem nova e
// a outra não, sem ninguém perceber — e o indicador de procedência sairia
// diferente conforme a porta usada.
// Mapa de vagas do PS — ordem fixa das áreas (igual ao padrão do Giro de Leitos)
// Retaguarda provisória: alta rotatividade, NÃO entra no censo dos leitos do
// hospital — conta só no panorama do PS. A fonte da verdade é ps_salas.conta_censo.
export const psContaCenso = s => s.conta_censo !== false;

// O PS só enxerga atendimento de EMERGÊNCIA.
//
// Desde a agenda do ambulatório, `ps_atendimentos` guarda os dois tipos —
// a tabela é herança do pronto-socorro. Sem este filtro, uma consulta
// ambulatorial com presença confirmada aparece na fila de triagem do
// plantão: polui o painel, suja os indicadores de Manchester e o paciente
// fica "aguardando triagem" para sempre, porque ninguém vai triar uma
// consulta agendada.
//
// Atendimentos do PS de um mês civil (para o relatório mensal). SOMENTE LEITURA.
// As bordas são meia-noite LOCAL convertidas para instante UTC — mesmo idioma das
// outras faixas de mês do app. Não usar toISOString() sobre string de data crua.
// Exames do PS de um mês civil (para o BI do relatório mensal). SOMENTE LEITURA.
// Mesmas bordas de mês local -> UTC dos atendimentos. A categoria (laboratorial/
// imagem/outro) já vem gravada em ps_registros; aqui só se lê para agrupar.
// PATCH com captura de erro (o sb engole !ok) — usado no contexto clínico
// Registros do atendimento (evolução médica, prescrição, exames)
// Quem registrou a evolução no PS. Usa ps_registros.categoria (coluna já existente).
// Antes tudo era rotulado "Evolução médica", mesmo escrito por enfermeiro/técnico.
// Vias de administração da prescrição
// Itens estruturados da prescrição (Farmácia Fase B)
// ===== Checagem de medicação administrada (append-only) =====
// A dispensação diz que o remédio SAIU DA FARMÁCIA; só a checagem diz que ele
// ENTROU NO PACIENTE, com hora e quem administrou.
// Por que a dose prescrita e dispensada não foi dada — vira indicador de segurança
// Quem administra à beira do leito
// Doses já dadas de um item (só as efetivamente administradas contam)
export const psDosesDadas = (itemId, adms) => adms.filter(a => String(a.prescricao_item_id) === String(itemId) && a.status !== "nao_administrado").length;

export async function saveFaixaObstetrica(sb, regra, user) {
  await sb("ps_faixas_obstetricas?on_conflict=chave", {
    method: "POST", headers: { "Prefer": "resolution=merge-duplicates" },
    body: JSON.stringify({ ...regra, usuario: user?.name || null, updated_at: nowISO() }),
  });
}

export async function saveFaixaPediatrica(sb, faixa, user) {
  await sb("ps_faixas_pediatricas?on_conflict=faixa", {
    method: "POST", headers: { "Prefer": "resolution=merge-duplicates" },
    body: JSON.stringify({ ...faixa, usuario: user?.name || null, updated_at: nowISO() }),
  });
}
