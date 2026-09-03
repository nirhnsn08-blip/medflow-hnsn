// ═══════════════════════════════════════════════════════════
// AS CORES DO NSP
//
// Moradia própria porque DOIS lados usam: a tela do módulo e o botão de
// notificar em 30s, que vive no casco e aparece em toda tela do sistema.
//
// ⚠️ Enquanto elas moravam dentro de `SegurancaPaciente.jsx`, o botão só
// podia ser importado de lá — e importar de lá arrastava o módulo NSP
// inteiro para o primeiro carregamento. Ver `NotificacaoRapida.jsx`.
// ═══════════════════════════════════════════════════════════

import { CLASSES as NSP_CLASSES, GRAUS_DANO as NSP_GRAUS } from "./nsp-catalogo.js";

export const NSP_COR = { verde: "#34d399", amarelo: "#f5b301", laranja: "#fb923c", vermelho: "#f43f5e", azul: "#38bdf8" };
export const nspCorClasse = c => NSP_COR[(NSP_CLASSES.find(x => x.v === c) || {}).nivel] || "#8891a5";
export const nspCorGrau   = g => NSP_COR[(NSP_GRAUS.find(x => x.v === g) || {}).nivel] || "#8891a5";
