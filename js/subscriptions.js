import { TRANSACTION_SOURCES, TRANSACTION_TYPES } from "./constants.js";
import { ValidationError, isValidDateString } from "./validation.js";

export const SUBSCRIPTION_CYCLES = Object.freeze({
  MONTHLY: "monthly",
  YEARLY: "yearly",
});

export const MAX_AUTO_OCCURRENCES = 600;

export function createSubscription(input, appData, now = new Date()) {
  const normalized = normalizeSubscriptionInput(input);
  validateSubscriptionInput(normalized, appData);
  const timestamp = now.toISOString();
  const anchors = getBillingAnchors(normalized.cycle, normalized.nextBillingDate);

  return {
    id: createId("subscription"),
    name: normalized.name,
    amount: normalized.amount,
    categoryId: normalized.categoryId,
    subcategoryId: normalized.subcategoryId,
    paymentMethodId: normalized.paymentMethodId,
    cycle: normalized.cycle,
    billingDay: anchors.billingDay,
    billingMonth: anchors.billingMonth,
    nextBillingDate: normalized.nextBillingDate,
    active: true,
    stoppedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function updateSubscription(subscriptionId, input, appData, now = new Date()) {
  const existing = findSubscription(subscriptionId, appData);
  const normalized = normalizeSubscriptionInput({
    ...existing,
    ...input,
    cycle: existing.active ? input.cycle : existing.cycle,
    nextBillingDate: existing.active ? input.nextBillingDate : existing.nextBillingDate,
  });
  validateSubscriptionInput(normalized, appData);

  const anchors = existing.active
    ? getBillingAnchors(normalized.cycle, normalized.nextBillingDate)
    : { billingDay: existing.billingDay, billingMonth: existing.billingMonth };

  return {
    ...existing,
    name: normalized.name,
    amount: normalized.amount,
    categoryId: normalized.categoryId,
    subcategoryId: normalized.subcategoryId,
    paymentMethodId: normalized.paymentMethodId,
    cycle: normalized.cycle,
    billingDay: anchors.billingDay,
    billingMonth: anchors.billingMonth,
    nextBillingDate: normalized.nextBillingDate,
    updatedAt: now.toISOString(),
  };
}

export function stopSubscription(subscriptionId, appData, now = new Date()) {
  const existing = findSubscription(subscriptionId, appData);
  if (!existing.active) throw new ValidationError("このサブスクはすでに停止中です。");
  return { ...existing, active: false, stoppedAt: now.toISOString(), updatedAt: now.toISOString() };
}

export function resumeSubscription(subscriptionId, nextBillingDate, appData, today = getLocalDateString(), now = new Date()) {
  const existing = findSubscription(subscriptionId, appData);
  if (existing.active) throw new ValidationError("このサブスクはすでに利用中です。");
  if (!isValidDateString(nextBillingDate)) throw new ValidationError("有効な次回更新日を入力してください。", "resume-date");
  if (nextBillingDate < today) throw new ValidationError("再開後の次回更新日は今日以降を指定してください。", "resume-date");
  const anchors = getBillingAnchors(existing.cycle, nextBillingDate);

  return {
    ...existing,
    billingDay: anchors.billingDay,
    billingMonth: anchors.billingMonth,
    nextBillingDate,
    active: true,
    stoppedAt: null,
    updatedAt: now.toISOString(),
  };
}

export function processDueSubscriptions(appData, today = getLocalDateString(), now = new Date()) {
  if (!isValidDateString(today)) throw new ValidationError("自動計上の基準日が不正です。");
  const nextData = cloneData(appData);
  const occurrenceKeys = new Set(
    nextData.transactions
      .filter((transaction) => transaction.source === TRANSACTION_SOURCES.SUBSCRIPTION)
      .map((transaction) => `${transaction.subscriptionId}:${transaction.subscriptionOccurrenceDate}`),
  );
  const timestamp = now.toISOString();
  let processedOccurrenceCount = 0;
  let generatedCount = 0;

  nextData.subscriptions = nextData.subscriptions.map((subscription) => {
    if (!subscription.active) return subscription;
    const updated = { ...subscription };

    while (updated.nextBillingDate <= today) {
      processedOccurrenceCount += 1;
      if (processedOccurrenceCount > MAX_AUTO_OCCURRENCES) {
        throw new ValidationError(
          `未処理の更新が${MAX_AUTO_OCCURRENCES}件を超えたため、自動計上を中止しました。バックアップを取得してからデータを確認してください。`,
        );
      }

      const occurrenceDate = updated.nextBillingDate;
      const occurrenceKey = `${updated.id}:${occurrenceDate}`;
      if (!occurrenceKeys.has(occurrenceKey)) {
        nextData.transactions.push({
          id: createId("transaction"),
          type: TRANSACTION_TYPES.EXPENSE,
          date: occurrenceDate,
          amount: updated.amount,
          title: updated.name,
          categoryId: updated.categoryId,
          subcategoryId: updated.subcategoryId,
          paymentMethodId: updated.paymentMethodId,
          source: TRANSACTION_SOURCES.SUBSCRIPTION,
          subscriptionId: updated.id,
          subscriptionOccurrenceDate: occurrenceDate,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
        occurrenceKeys.add(occurrenceKey);
        generatedCount += 1;
      }

      updated.nextBillingDate = getNextBillingDate(updated, occurrenceDate);
      updated.updatedAt = timestamp;
    }

    return updated;
  });

  return { data: nextData, generatedCount, processedOccurrenceCount };
}

export function getNextBillingDate(subscription, occurrenceDate = subscription.nextBillingDate) {
  const { year, month } = parseDateParts(occurrenceDate);
  if (subscription.cycle === SUBSCRIPTION_CYCLES.MONTHLY) {
    const nextMonthIndex = month;
    const nextYear = year + Math.floor(nextMonthIndex / 12);
    const nextMonth = (nextMonthIndex % 12) + 1;
    return buildAdjustedDate(nextYear, nextMonth, subscription.billingDay);
  }
  if (subscription.cycle === SUBSCRIPTION_CYCLES.YEARLY) {
    return buildAdjustedDate(year + 1, subscription.billingMonth, subscription.billingDay);
  }
  throw new ValidationError("サブスクの更新周期が不正です。");
}

export function getBillingAnchors(cycle, nextBillingDate) {
  if (![SUBSCRIPTION_CYCLES.MONTHLY, SUBSCRIPTION_CYCLES.YEARLY].includes(cycle)) {
    throw new ValidationError("更新周期は毎月または毎年を選択してください。", "cycle");
  }
  if (!isValidDateString(nextBillingDate)) {
    throw new ValidationError("有効な次回更新日を入力してください。", "next-billing-date");
  }
  const { month, day } = parseDateParts(nextBillingDate);
  return {
    billingDay: day,
    billingMonth: cycle === SUBSCRIPTION_CYCLES.YEARLY ? month : null,
  };
}

export function getLastSubscriptionOccurrence(subscriptionId, transactions) {
  return transactions
    .filter(
      (transaction) =>
        transaction.source === TRANSACTION_SOURCES.SUBSCRIPTION && transaction.subscriptionId === subscriptionId,
    )
    .reduce(
      (latest, transaction) =>
        latest === null || transaction.subscriptionOccurrenceDate > latest
          ? transaction.subscriptionOccurrenceDate
          : latest,
      null,
    );
}

export function sortSubscriptionsForDisplay(subscriptions, active) {
  return [...subscriptions]
    .filter((subscription) => subscription.active === active)
    .sort((left, right) => {
      if (active) {
        const dateComparison = left.nextBillingDate.localeCompare(right.nextBillingDate);
        if (dateComparison !== 0) return dateComparison;
      } else {
        const stoppedComparison = (right.stoppedAt ?? "").localeCompare(left.stoppedAt ?? "");
        if (stoppedComparison !== 0) return stoppedComparison;
      }
      const nameComparison = left.name.localeCompare(right.name, "ja");
      if (nameComparison !== 0) return nameComparison;
      const createdAtComparison = left.createdAt.localeCompare(right.createdAt);
      return createdAtComparison !== 0 ? createdAtComparison : left.id.localeCompare(right.id);
    });
}

export function getUpcomingSubscriptions(subscriptions, limit = 3) {
  return sortSubscriptionsForDisplay(subscriptions, true).slice(0, limit);
}

function normalizeSubscriptionInput(input) {
  return {
    name: typeof input.name === "string" ? input.name.trim() : "",
    amount: Number(input.amount),
    categoryId: input.categoryId,
    subcategoryId: input.subcategoryId,
    paymentMethodId: input.paymentMethodId,
    cycle: input.cycle,
    nextBillingDate: input.nextBillingDate,
  };
}

function validateSubscriptionInput(input, appData) {
  if (!input.name) throw new ValidationError("サブスク名を入力してください。", "name");
  if (!Number.isSafeInteger(input.amount) || input.amount < 1) {
    throw new ValidationError("金額は1円以上の整数で入力してください。", "amount");
  }
  const category = appData.categories.find((item) => item.id === input.categoryId);
  if (!category || category.transactionType !== TRANSACTION_TYPES.EXPENSE) {
    throw new ValidationError("支出カテゴリを選択してください。", "category");
  }
  const hasValidSubcategory = category.subcategories.length === 0
    ? input.subcategoryId === null || input.subcategoryId === ""
    : category.subcategories.some((item) => item.id === input.subcategoryId);
  if (!hasValidSubcategory) {
    throw new ValidationError("有効な小カテゴリを選択してください。", "subcategory");
  }
  if (!appData.paymentMethods.some((item) => item.id === input.paymentMethodId)) {
    throw new ValidationError("有効な支払い方法を選択してください。", "payment-method");
  }
  getBillingAnchors(input.cycle, input.nextBillingDate);
}

function findSubscription(subscriptionId, appData) {
  const subscription = appData.subscriptions.find((item) => item.id === subscriptionId);
  if (!subscription) throw new ValidationError("対象のサブスクが見つかりません。");
  return subscription;
}

function parseDateParts(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return { year, month, day };
}

function buildAdjustedDate(year, month, billingDay) {
  const day = Math.min(billingDay, daysInMonth(year, month));
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function getLocalDateString(date = new Date()) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function createId(prefix) {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function cloneData(data) {
  return typeof structuredClone === "function" ? structuredClone(data) : JSON.parse(JSON.stringify(data));
}
