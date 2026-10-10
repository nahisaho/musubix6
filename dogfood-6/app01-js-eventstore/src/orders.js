/** @id CODE-ORD-001 @implements REQ-ORD-001 */
export const TRANSITIONS = Object.freeze({
  none: { place: 'placed' },
  placed: { pay: 'paid', cancel: 'cancelled' },
  paid: { ship: 'shipped', cancel: 'cancelled' },
  shipped: {},
  cancelled: {},
});

const EVENT_FOR = { place: 'OrderPlaced', pay: 'OrderPaid', ship: 'OrderShipped', cancel: 'OrderCancelled' };
const ACTION_FOR = Object.fromEntries(Object.entries(EVENT_FOR).map(([a, e]) => [e, a]));

export const initialState = Object.freeze({ status: 'none', items: Object.freeze([]) });

export class IllegalTransitionError extends Error {
  constructor(state, action) {
    super(`illegal transition: ${action} in state ${state}`);
    this.name = 'IllegalTransitionError';
  }
}

const validItems = (items) =>
  Array.isArray(items) && items.length > 0 &&
  items.every((i) => i && typeof i.sku === 'string' && Number.isInteger(i.qty) && i.qty > 0);

/** @id CODE-ORD-002 @implements REQ-ORD-002 REQ-ORD-003 REQ-ORD-004 REQ-ORD-005 REQ-ORD-006 REQ-ORD-007 */
export function decide(state, cmd) {
  if (!TRANSITIONS[state.status]?.[cmd.type]) throw new IllegalTransitionError(state.status, cmd.type);
  const data = { orderId: cmd.orderId };
  if (cmd.type === 'place') {
    if (!validItems(cmd.items)) throw new RangeError('items must be a non-empty list of {sku, qty>0}');
    data.items = cmd.items.map((i) => ({ sku: i.sku, qty: i.qty }));
  }
  return [{ type: EVENT_FOR[cmd.type], data }];
}

/** @id CODE-ORD-003 @implements REQ-ORD-008 */
export function evolve(state, event) {
  const action = ACTION_FOR[event.type];
  const next = action && TRANSITIONS[state.status][action];
  if (!next) return state;
  return { status: next, items: event.data.items ?? state.items };
}
