/**
 * Posição de um ativo de renda variável (ações, FIIs, ETFs, cripto) e o efeito de uma compra
 * ou venda sobre ela. Estas contas espelham, passo a passo, a função register_investment_move
 * do banco (que é quem grava de verdade); aqui servem para mostrar a prévia na tela.
 *
 * Regras (padrão da corretagem brasileira):
 * - Compra: quantidade soma; investido soma o valor pago; preço médio é a média ponderada.
 * - Venda: preço médio NÃO muda; o custo baixado é (cotas vendidas × preço médio); o resultado
 *   da venda é (valor recebido − custo baixado).
 */
export interface Position {
  quantity: number;
  average_price: number;
  invested: number;
}

export interface BuyResult extends Position {
  total: number;
}

export interface SellResult extends Position {
  total: number;
  /** Custo das cotas vendidas (cotas × preço médio). */
  cost_basis: number;
  /** Lucro (+) ou prejuízo (−) realizado na venda. */
  realized: number;
  realized_pct: number;
}

function round(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round((n + Number.EPSILON) * f) / f;
}

/** Valor da operação: cotas × preço, em centavos. */
export function tradeTotal(quantity: number, unitPrice: number): number {
  return round(quantity * unitPrice, 2);
}

/** Posição a partir de uma linha da tabela investments (campos podem ser nulos). */
export function positionOf(row: {
  quantity: number | null;
  average_price: number | null;
  invested_amount: number;
}): Position {
  const quantity = Number(row.quantity ?? 0);
  const invested = Number(row.invested_amount ?? 0);
  const average = Number(row.average_price ?? 0);
  return {
    quantity,
    invested,
    // sem preço médio gravado, usa o custo por cota
    average_price: average > 0 ? average : quantity > 0 ? round(invested / quantity, 4) : 0,
  };
}

export function applyBuy(position: Position, quantity: number, unitPrice: number): BuyResult {
  if (!(quantity > 0) || !(unitPrice > 0)) {
    throw new Error("Informe a quantidade de cotas e o preço por cota.");
  }
  const total = tradeTotal(quantity, unitPrice);
  const newQuantity = round(position.quantity + quantity, 6);
  return {
    total,
    quantity: newQuantity,
    average_price: round((position.quantity * position.average_price + total) / newQuantity, 4),
    invested: round(position.invested + total, 2),
  };
}

export function applySell(position: Position, quantity: number, unitPrice: number): SellResult {
  if (!(quantity > 0) || !(unitPrice > 0)) {
    throw new Error("Informe a quantidade de cotas e o preço por cota.");
  }
  if (quantity > position.quantity) {
    throw new Error(
      `Você tem ${position.quantity.toLocaleString("pt-BR")} cotas; não é possível vender ` +
        `${quantity.toLocaleString("pt-BR")}.`,
    );
  }
  const total = tradeTotal(quantity, unitPrice);
  const cost_basis = round(quantity * position.average_price, 2);
  const newQuantity = round(position.quantity - quantity, 6);
  const realized = round(total - cost_basis, 2);
  return {
    total,
    cost_basis,
    realized,
    realized_pct: cost_basis > 0 ? (realized / cost_basis) * 100 : 0,
    quantity: newQuantity,
    average_price: position.average_price,
    invested: newQuantity === 0 ? 0 : Math.max(round(position.invested - cost_basis, 2), 0),
  };
}
