export interface Money { readonly amount: number; readonly currency: string }

/** @id CODE-DOMAIN-001 @implements REQ-DOMAIN-001 REQ-DOMAIN-002 */
export function money(amount: number, currency: string): Money {
  if (!Number.isSafeInteger(amount)) throw new RangeError('amount must be a safe integer');
  if (!/^[A-Z]{3}$/.test(currency)) throw new RangeError('currency must be 3 uppercase letters');
  return Object.freeze({ amount, currency });
}

/** @id CODE-DOMAIN-002 @implements REQ-DOMAIN-003 REQ-DOMAIN-004 */
export function addMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) throw new Error('currency mismatch');
  return money(a.amount + b.amount, a.currency);
}
