/**
 * Contrato vigente de um projeto: valor do contrato original mais os aditivos.
 * O banco mantém a soma dos aditivos em projects.addenda_amount (project_addenda).
 */
export interface ContractFields {
  contract_amount: number | null;
  addenda_amount?: number | null;
  received_amount?: number | null;
}

function cents(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Contrato original + aditivos. */
export function contractTotal(p: ContractFields): number {
  return cents(Number(p.contract_amount ?? 0) + Number(p.addenda_amount ?? 0));
}

/** Saldo a receber: contrato vigente menos o que já foi recebido. */
export function projectBalance(p: ContractFields): number {
  return cents(contractTotal(p) - Number(p.received_amount ?? 0));
}
