/**
 * Test-only, fully attributed included-plan-credit allocations for synthetic
 * historical paid periods. These never represent provider invoices or payments.
 * Keep this pure: the caller owns all Prisma writes inside one transaction.
 */
const HISTORY_LABELS = new Set(["past-1", "past-2", "past-3"]);
const INCLUDED_COUNTER = "INCLUDED_RECOVERY_CREDITS";

function quantity(value) {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error("Fixture paid usage requires positive integral quantities.");
  }
  return amount;
}

export function buildPaidAllowanceFixtures(shopId, period, label, events, idFor) {
  if (!HISTORY_LABELS.has(label) || period.shopId !== shopId ||
      period.status !== "CLOSED" || period.planKindSnapshot !== "PAID_METERED" ||
      events.length === 0) {
    throw new Error("Only synthetic CLOSED paid history can have fixture-owned allocations.");
  }
  const granted = events.reduce((sum, event) => {
    if (event.shopId !== shopId || event.billingPeriodId !== period.id ||
        event.metric !== "RECOVERY_CONVERSATION" || event.sourceType !== "CHECKOUT_RECOVERY" ||
        !event.id.startsWith(idFor(shopId, `usage-${label}-`))) {
      throw new Error("Historical usage does not match its paid fixture period.");
    }
    const total = sum + quantity(event.quantity);
    if (!Number.isSafeInteger(total)) throw new Error("Fixture allocation quantity overflow.");
    return total;
  }, 0);
  const counterId = idFor(shopId, `counter-paid-${label}`);
  return {
    counter: {
      id: counterId, shopId, billingPeriodId: period.id, counter: INCLUDED_COUNTER,
      grantedQuantity: granted, committedQuantity: granted, reservedQuantity: 0,
      forfeitedQuantity: 0, currentAllowanceQuantity: granted,
    },
    reservations: events.map((event, index) => {
      const ordinal = String(index + 1).padStart(3, "0");
      if (event.id !== idFor(shopId, `usage-${label}-${ordinal}`)) {
        throw new Error("Historical usage identifiers do not match fixture positions.");
      }
      return {
        id: idFor(shopId, `reservation-paid-${label}-${ordinal}`), shopId,
        // Unique deterministic fixture key. Event.sourceId separately retains
        // the verified CheckoutRecovery ID for merchant navigation.
        sourceKey: idFor(shopId, `paid-source-${label}-${ordinal}`),
        billingPeriodEntitlementCounterId: counterId,
        quantity: quantity(event.quantity), status: "COMMITTED",
        committedUsageEventId: event.id, createdAt: event.occurredAt,
      };
    }),
  };
}

/** Fail closed before deleting any fixture counter or linked usage record. */
export function verifyPaidFixtureCleanup(shopId, reservations, events, counters, periods, idFor) {
  const prefix = idFor(shopId, "reservation-paid-");
  const countersById = new Map(counters.map((counter) => [counter.id, counter]));
  const periodsById = new Map(periods.map((period) => [period.id, period]));
  const eventsById = new Map(events.map((event) => [event.id, event]));
  const usageTotals = new Map();
  const expectedCounterIds = new Set();
  for (const reservation of reservations) {
    const suffix = reservation.id.startsWith(prefix) ? reservation.id.slice(prefix.length) : "";
    const match = /^(past-[123])-(\d{3})$/.exec(suffix);
    if (!match || !HISTORY_LABELS.has(match[1])) throw new Error("Unexpected paid fixture reservation.");
    const [, label, ordinal] = match;
    const expectedCounterId = idFor(shopId, `counter-paid-${label}`);
    const expectedPeriodId = idFor(shopId, `billing-period-${label}`);
    const expectedEventId = idFor(shopId, `usage-${label}-${ordinal}`);
    const event = eventsById.get(expectedEventId);
    const counter = countersById.get(expectedCounterId);
    const period = periodsById.get(expectedPeriodId);
    if (reservation.shopId !== shopId || reservation.status !== "COMMITTED" ||
        reservation.counterId !== null || reservation.purchasedCreditPurchaseId !== null ||
        reservation.promotionalCreditGrantId !== null ||
        reservation.billingPeriodEntitlementCounterId !== expectedCounterId ||
        reservation.sourceKey !== idFor(shopId, `paid-source-${label}-${ordinal}`) ||
        reservation.compensationUsageEventId !== null ||
        reservation.committedUsageEventId !== expectedEventId ||
        !counter || !period || !event ||
        counter.shopId !== shopId || counter.billingPeriodId !== expectedPeriodId ||
        counter.counter !== INCLUDED_COUNTER ||
        period.shopId !== shopId || period.status !== "CLOSED" ||
        period.planKindSnapshot !== "PAID_METERED" ||
        event.shopId !== shopId || event.billingPeriodId !== expectedPeriodId ||
        event.metric !== "RECOVERY_CONVERSATION" || event.sourceType !== "CHECKOUT_RECOVERY" ||
        event.correctionOfUsageEventId !== null ||
        Number(event.quantity) !== reservation.quantity ||
        !Number.isSafeInteger(reservation.quantity) || reservation.quantity <= 0) {
      throw new Error("Fixture paid reservation has changed; refusing to rewrite billing history.");
    }
    expectedCounterIds.add(expectedCounterId);
    usageTotals.set(expectedCounterId, (usageTotals.get(expectedCounterId) ?? 0) + reservation.quantity);
  }
  if (expectedCounterIds.size !== counters.length ||
      counters.some((counter) => !expectedCounterIds.has(counter.id))) {
    throw new Error("Paid fixture counter/reservation mismatch; refusing cleanup.");
  }
  for (const counter of counters) {
    const total = usageTotals.get(counter.id);
    if (!Number.isSafeInteger(total) || total <= 0 ||
        counter.grantedQuantity !== total || counter.committedQuantity !== total ||
        counter.reservedQuantity !== 0 || counter.forfeitedQuantity !== 0 ||
        (counter.currentAllowanceQuantity !== null && counter.currentAllowanceQuantity !== total)) {
      throw new Error("Fixture paid entitlement counter changed; refusing cleanup.");
    }
  }
  return counters.map((counter) => counter.id);
}
