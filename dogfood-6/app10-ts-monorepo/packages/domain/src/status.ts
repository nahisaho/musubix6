export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed';

export const TRANSITIONS: Record<BookingStatus, readonly BookingStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['cancelled', 'completed'],
  cancelled: [],
  completed: [],
};

export class IllegalTransitionError extends Error {
  constructor(public from: BookingStatus, public to: BookingStatus) {
    super(`illegal transition ${from} -> ${to}`);
  }
}

/** @id CODE-DOMAIN-003 @implements REQ-DOMAIN-005 */
export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return (TRANSITIONS[from] as readonly string[]).includes(to);
}

/** @id CODE-DOMAIN-004 @implements REQ-DOMAIN-006 */
export function transition(from: BookingStatus, to: BookingStatus): BookingStatus {
  if (!canTransition(from, to)) throw new IllegalTransitionError(from, to);
  return to;
}

/** @id CODE-DOMAIN-007 @implements REQ-DOMAIN-009 */
export function isTerminal(s: BookingStatus): boolean {
  return TRANSITIONS[s].length === 0;
}
