// ═══════════════════════════════════════════════════════════
// ALMOXARIFADO — CATÁLOGO
//
// As listas do domínio: categorias, unidades, motivos de saída, status de
// pedido e de requisição, e os dois parâmetros que a curva ABC usa.
//
// 🔴 `SUP_INV_INTERVALO` é regra, não preferência: é de quantos em quantos
// dias cada classe da curva ABC precisa ser contada (A a cada 7 dias, B a
// cada 30, C a cada 90). Afrouxar aqui faz o inventário parecer em dia sem
// que ninguém tenha contado nada.
//
// ⚠️ `SUP_MOTIVOS_SAIDA` é contrato com o kardex: "Ajuste de inventário" é
// o motivo que o estorno usa, e é por esse texto exato que a conciliação
// separa ajuste de consumo.
// ═══════════════════════════════════════════════════════════

export const SUP_CATEGORIAS = [
  "Material médico-hospitalar",
  "Higiene e limpeza",
  "EPI",
  "Escritório e expediente",
  "Impressos e formulários",
  "Rouparia e enxoval",
  "Nutrição e copa",
  "Manutenção predial",
  "Informática",
  "Laboratório",
  "Outros",
];

export const SUP_UNIDADES = ["unidade", "caixa", "pacote", "par", "rolo", "frasco", "galão", "litro", "kg", "resma"];

export const SUP_MOTIVOS_SAIDA = ["Consumo do setor", "Perda / vencimento", "Devolução ao fornecedor", "Ajuste de inventário", "Transferência"];

// Fármacos de alto custo / alta vigilância monitorados no Painel Executivo
// (casam por nome ou princípio ativo; edite a lista conforme o hospital)
export const SUP_FARMACOS_MONITORADOS = ["morfina", "fentanil", "alteplase", "tenecteplase", "contraste", "albumina"];

// Pedido de compra — estados e cores
export const SUP_PED_STATUS = {
  aberto:               { label: "Em elaboração",         cor: "#8d99ab" },
  aguardando_aprovacao: { label: "Aguardando aprovação",  cor: "#d97706" },
  aprovado:             { label: "Aprovado",              cor: "#22d3ee" },
  negado:               { label: "Negado",                cor: "#f43f5e" },
  enviado:              { label: "Enviado ao fornecedor", cor: "#3b82f6" },
  parcial:              { label: "Recebido parcial",      cor: "#d97706" },
  recebido:             { label: "Recebido",              cor: "#34d399" },
  cancelado:            { label: "Cancelado",             cor: "#8d99ab" },
};

// Fluxo da requisição — estados e cores (mesma régua do preparo da Farmácia)
export const SUP_REQ_STATUS = {
  aguardando: { label: "Aguardando almoxarifado", cor: "#8d99ab" },
  separacao:  { label: "Em separação",            cor: "#d97706" },
  pronto:     { label: "Pronto p/ retirada",      cor: "#3b82f6" },
  entregue:   { label: "Entregue",                cor: "#34d399" },
  cancelado:  { label: "Cancelada",               cor: "#f43f5e" },
};

// Painel executivo — visão financeira do estoque (almoxarifado + Farmácia).
// Critérios transparentes: valores pelo custo unitário cadastrado; "economia" =
// variação vs mês anterior; "capital liberável" = excesso acima de 30d + mínimo.
export const SUP_EXEC_COBERTURA_ALVO = 30; // dias de cobertura considerados necessários

// Inventário cíclico — contagem cega rotativa (curva ABC) + acuracidade
export const SUP_INV_INTERVALO = { A: 7, B: 30, C: 90 };   // dias entre contagens por classe
