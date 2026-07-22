import { TRANSACTION_SOURCES } from "./constants.js";
import { ValidationError, validateTransactionInput } from "./validation.js";

export function createManualTransaction(input, appData) {
  const normalizedInput = {
    type: input.type,
    date: input.date,
    amount: Number(input.amount),
    title: typeof input.title === "string" ? input.title.trim() : "",
    categoryId: input.categoryId,
    subcategoryId: input.subcategoryId,
    paymentMethodId: input.paymentMethodId,
  };

  const validation = validateTransactionInput(normalizedInput, appData);
  if (!validation.valid) {
    const firstError = validation.errors[0];
    throw new ValidationError(firstError.message, firstError.field);
  }

  const timestamp = new Date().toISOString();

  return {
    id: createId(),
    ...normalizedInput,
    source: TRANSACTION_SOURCES.MANUAL,
    subscriptionId: null,
    subscriptionOccurrenceDate: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function updateManualTransaction(transactionId, input, appData) {
  const existing = appData.transactions.find((transaction) => transaction.id === transactionId);
  if (!existing) throw new ValidationError("編集する取引が見つかりません。");
  if (existing.source !== TRANSACTION_SOURCES.MANUAL) {
    throw new ValidationError("この取引は手動登録ではないため、この画面では編集できません。");
  }

  const normalizedInput = {
    type: input.type,
    date: input.date,
    amount: Number(input.amount),
    title: typeof input.title === "string" ? input.title.trim() : "",
    categoryId: input.categoryId,
    subcategoryId: input.subcategoryId,
    paymentMethodId: input.paymentMethodId,
  };
  const validation = validateTransactionInput(normalizedInput, appData);
  if (!validation.valid) {
    const firstError = validation.errors[0];
    throw new ValidationError(firstError.message, firstError.field);
  }

  return {
    ...existing,
    ...normalizedInput,
    updatedAt: new Date().toISOString(),
  };
}

export function updateSubscriptionTransaction(transactionId, input, appData) {
  const existing = appData.transactions.find((transaction) => transaction.id === transactionId);
  if (!existing) throw new ValidationError("編集する取引が見つかりません。");
  if (existing.source !== TRANSACTION_SOURCES.SUBSCRIPTION) {
    throw new ValidationError("この取引はサブスク由来ではありません。");
  }

  const candidate = {
    ...existing,
    amount: Number(input.amount),
    categoryId: input.categoryId,
    subcategoryId: input.subcategoryId,
    paymentMethodId: input.paymentMethodId,
  };
  const validation = validateTransactionInput(candidate, appData);
  if (!validation.valid) {
    const firstError = validation.errors[0];
    throw new ValidationError(firstError.message, firstError.field);
  }

  return {
    ...candidate,
    updatedAt: new Date().toISOString(),
  };
}

export function removeManualTransaction(transactionId, appData) {
  const existing = appData.transactions.find((transaction) => transaction.id === transactionId);
  if (!existing) throw new ValidationError("削除する取引が見つかりません。");
  if (existing.source !== TRANSACTION_SOURCES.MANUAL) {
    throw new ValidationError("サブスク由来の取引は削除できません。");
  }

  return appData.transactions.filter((transaction) => transaction.id !== transactionId);
}

export function sortTransactionsNewestFirst(transactions) {
  return [...transactions].sort((left, right) => {
    const dateComparison = right.date.localeCompare(left.date);
    if (dateComparison !== 0) return dateComparison;
    return right.createdAt.localeCompare(left.createdAt);
  });
}

export function findTransactionLabels(transaction, appData) {
  const category = appData.categories.find((item) => item.id === transaction.categoryId);
  const subcategory = category?.subcategories.find((item) => item.id === transaction.subcategoryId);
  const paymentMethod = appData.paymentMethods.find((item) => item.id === transaction.paymentMethodId);

  return {
    categoryName: category?.name ?? "不明なカテゴリ",
    subcategoryName: transaction.subcategoryId === null || transaction.subcategoryId === ""
      ? ""
      : subcategory?.name ?? "不明な小カテゴリ",
    paymentMethodName: paymentMethod?.name ?? "不明な方法",
  };
}

function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();

  const randomPart = Math.random().toString(36).slice(2, 12);
  return `transaction-${Date.now().toString(36)}-${randomPart}`;
}
