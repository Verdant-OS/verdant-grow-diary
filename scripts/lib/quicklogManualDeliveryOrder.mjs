/** Fail-closed ordering contract shared by manual migration delivery and its PG15 proof. */
export const MANUAL_DELIVERY_ORDER = Object.freeze([
  "20260927002000",
  "20260927160000",
  "20260928183000",
]);

export function validManualDeliveryOrder(value) {
  return (
    Array.isArray(value) &&
    value.length === MANUAL_DELIVERY_ORDER.length &&
    MANUAL_DELIVERY_ORDER.every((version, index) => value[index] === version)
  );
}

/** Only the next step after an exact completed prefix may start a database process. */
export function assertManualDeliveryStep({ order, completed, version } = {}) {
  if (
    !validManualDeliveryOrder(order) ||
    !Array.isArray(completed) ||
    completed.length >= order.length ||
    !completed.every((item, index) => item === order[index]) ||
    version !== order[completed.length]
  ) {
    throw new Error("delivery_order_rejected");
  }
  return Object.freeze([...completed, version]);
}
