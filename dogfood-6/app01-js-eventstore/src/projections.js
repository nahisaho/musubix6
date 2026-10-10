/** @id CODE-PROJ-001 @implements REQ-PROJ-001 REQ-PROJ-002 REQ-PROJ-003 REQ-PROJ-004 REQ-PROJ-007 */
export class Projector {
  #store;
  #reducer;
  #initial;
  model;
  checkpoint = 0;

  constructor({ store, reducer, initial }) {
    this.#store = store;
    this.#reducer = reducer;
    this.#initial = initial;
    this.model = structuredClone(initial);
  }

  catchUp() {
    let applied = 0;
    for (const e of this.#store.readAll(this.checkpoint)) {
      this.model = this.#reducer(this.model, e);
      this.checkpoint = e.globalSeq;
      applied++;
    }
    return applied;
  }

  rebuild() {
    this.model = structuredClone(this.#initial);
    this.checkpoint = 0;
    return this.catchUp();
  }
}

const stockReducer = (model, e) => {
  const { sku, qty } = e.data;
  const cur = model[sku] ?? { onHand: 0, reserved: 0, available: 0 };
  const delta = {
    StockReceived: { onHand: qty },
    StockReserved: { reserved: qty },
    ReservationReleased: { reserved: -qty },
    StockShipped: { onHand: -qty, reserved: -qty },
  }[e.type];
  if (!delta) return model;
  const onHand = cur.onHand + (delta.onHand ?? 0);
  const reserved = cur.reserved + (delta.reserved ?? 0);
  return { ...model, [sku]: { onHand, reserved, available: onHand - reserved } };
};

/** @id CODE-PROJ-002 @implements REQ-PROJ-005 */
export function stockLevels(store) {
  return new Projector({ store, reducer: stockReducer, initial: {} });
}

const orderReducer = (model, e) => {
  const { orderId } = e.data;
  const status = { OrderPlaced: 'placed', OrderPaid: 'paid', OrderShipped: 'shipped', OrderCancelled: 'cancelled' }[e.type];
  if (!status) return model;
  const itemCount = e.data.items?.length ?? model[orderId]?.itemCount ?? 0;
  return { ...model, [orderId]: { status, itemCount } };
};

/** @id CODE-PROJ-003 @implements REQ-PROJ-006 */
export function orderSummaries(store) {
  return new Projector({ store, reducer: orderReducer, initial: {} });
}
