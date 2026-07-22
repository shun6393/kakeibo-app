import { TRANSACTION_TYPES } from "./constants.js";
import { ValidationError, validateClassificationName } from "./validation.js";

export function createCategory(input, appData, now = new Date()) {
  const name = validateClassificationName(input.name, "カテゴリ名", "category-name");
  const transactionType = input.transactionType;
  if (![TRANSACTION_TYPES.INCOME, TRANSACTION_TYPES.EXPENSE].includes(transactionType)) {
    throw new ValidationError("収入用または支出用を選択してください。", "category-type");
  }
  if (appData.categories.some((category) =>
    category.transactionType === transactionType && isSameDisplayName(category.name, name)
  )) {
    throw new ValidationError("同じ種別に同名の大カテゴリがあります。", "category-name");
  }

  const timestamp = now.toISOString();
  return {
    id: createId(),
    name,
    transactionType,
    order: getNextOrder(appData.categories.filter((category) => category.transactionType === transactionType)),
    createdAt: timestamp,
    updatedAt: timestamp,
    subcategories: [],
  };
}

export function createSubcategory(input, appData, now = new Date()) {
  const category = appData.categories.find((item) => item.id === input.categoryId);
  if (!category) throw new ValidationError("追加先の大カテゴリを選択してください。", "parent-category");
  const name = validateClassificationName(input.name, "小カテゴリ名", "subcategory-name");
  if (category.subcategories.some((subcategory) => isSameDisplayName(subcategory.name, name))) {
    throw new ValidationError("この大カテゴリには同名の小カテゴリがあります。", "subcategory-name");
  }

  const timestamp = now.toISOString();
  return {
    id: createId(),
    name,
    order: getNextOrder(category.subcategories),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createPaymentMethod(input, appData, now = new Date()) {
  const name = validateClassificationName(input.name, "名称", "payment-method-name");
  if (appData.paymentMethods.some((method) => isSameDisplayName(method.name, name))) {
    throw new ValidationError("同名の支払い・受取方法があります。", "payment-method-name");
  }

  const timestamp = now.toISOString();
  return {
    id: createId(),
    name,
    order: getNextOrder(appData.paymentMethods),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function isSameDisplayName(left, right) {
  return normalizeDisplayName(left) === normalizeDisplayName(right);
}

function normalizeDisplayName(value) {
  return String(value).trim().normalize("NFKC").toLocaleLowerCase("ja-JP");
}

function getNextOrder(items) {
  return items.reduce((maximum, item) => Math.max(maximum, item.order), -1) + 1;
}

function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else bytes.forEach((_, index) => { bytes[index] = Math.floor(Math.random() * 256); });
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}
