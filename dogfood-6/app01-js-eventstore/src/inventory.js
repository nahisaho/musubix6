export const initialState = Object.freeze({ onHand: 0, reserved: Object.freeze({}) });

export class DomainError extends Error {
  constructor(message) {
    super(message);
    this.name = new.target.name;
  }
}

export class InsufficientStockError extends DomainError {}

const sum = (reserved) => Object.values(reserved).reduce((a, b) => a + b, 0);
const posInt = (n) => Number.isInteger(n) && n > 0;

/** @id CODE-INV-001 @implements REQ-INV-001 */
export function evolve(state, event) {
  const { orderId, qty } = event.data;
  const { [orderId]: _gone, ...rest } = state.reserved;
  switch (event.type) {
    case 'StockReceived':
      return { onHand: state.onHand + qty, reserved: { ...state.reserved } };
    case 'StockReserved':
      return { onHand: state.onHand, reserved: { ...state.reserved, [orderId]: qty } };
    case 'ReservationReleased':
      return { onHand: state.onHand, reserved: rest };
    case 'StockShipped':
      return { onHand: state.onHand - qty, reserved: rest };
    default:
      return state;
  }
}

/** @id CODE-INV-002 @implements REQ-INV-002 REQ-INV-003 REQ-INV-004 REQ-INV-005 REQ-INV-006 REQ-INV-007 */
export function decide(state, cmd) {
  const { sku, orderId } = cmd;
  const held = state.reserved[orderId];
  switch (cmd.type) {
    case 'receive':
      if (!posInt(cmd.qty)) throw new RangeError('qty must be a positive integer');
      return [{ type: 'StockReceived', data: { sku, qty: cmd.qty } }];
    case 'reserve':
      if (!posInt(cmd.qty)) throw new RangeError('qty must be a positive integer');
      if (held !== undefined) throw new DomainError(`order ${orderId} already holds a reservation`);
      if (state.onHand - sum(state.reserved) < cmd.qty) throw new InsufficientStockError(`insufficient stock for ${sku}`);
      return [{ type: 'StockReserved', data: { sku, orderId, qty: cmd.qty } }];
    case 'release':
    case 'ship':
      if (held === undefined) throw new DomainError(`no reservation for order ${orderId}`);
      return [{ type: cmd.type === 'release' ? 'ReservationReleased' : 'StockShipped', data: { sku, orderId, qty: held } }];
    default:
      throw new DomainError(`unknown inventory command ${cmd.type}`);
  }
}
