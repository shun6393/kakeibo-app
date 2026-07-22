import { SCHEMA_VERSION, TRANSACTION_SOURCES, TRANSACTION_TYPES } from "./constants.js";

export class ValidationError extends Error {
  constructor(message, field = null) {
    super(message);
    this.name = "ValidationError";
    this.field = field;
  }
}

export function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isValidDateString(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function isValidIsoTimestamp(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function validateClassificationName(value, label = "名称", field = null) {
  const rawName = typeof value === "string" ? value : "";
  if (/[\u0000-\u001f\u007f-\u009f]/u.test(rawName)) {
    throw new ValidationError(`${label}に制御文字は使用できません。`, field);
  }
  const name = rawName.trim();
  if (!name) throw new ValidationError(`${label}を入力してください。`, field);
  if ([...name].length >= 50) throw new ValidationError(`${label}は49文字以内で入力してください。`, field);
  return name;
}

export function validateAppData(data) {
  const errors = [];

  if (!isPlainObject(data)) return { valid: false, errors: ["ルートデータがオブジェクトではありません。"] };
  if (data.schemaVersion !== SCHEMA_VERSION) errors.push("対応していないschemaVersionです。");

  if (!isPlainObject(data.appMetadata)) {
    errors.push("appMetadataがありません。");
  } else {
    if (typeof data.appMetadata.appName !== "string" || !data.appMetadata.appName.trim()) {
      errors.push("appMetadata.appNameが不正です。");
    }
    if (!Number.isSafeInteger(data.appMetadata.revision) || data.appMetadata.revision < 0) {
      errors.push("revisionが不正です。");
    }
    if (!isValidIsoTimestamp(data.appMetadata.createdAt)) errors.push("appMetadata.createdAtが不正です。");
    if (!isValidIsoTimestamp(data.appMetadata.updatedAt)) errors.push("appMetadata.updatedAtが不正です。");
  }

  if (!isPlainObject(data.settings)) {
    errors.push("settingsがありません。");
  } else if (data.settings.lastBackupAt !== null && !isValidIsoTimestamp(data.settings.lastBackupAt)) {
    errors.push("settings.lastBackupAtが不正です。");
  }
  if (data.balanceBaseline !== null) {
    if (!isPlainObject(data.balanceBaseline)) {
      errors.push("balanceBaselineが不正です。");
    } else {
      if (!Number.isSafeInteger(data.balanceBaseline.amount) || data.balanceBaseline.amount < 1) {
        errors.push("初期残高が不正です。");
      }
      if (!isValidDateString(data.balanceBaseline.date)) errors.push("残高基準日が不正です。");
      if (!isValidIsoTimestamp(data.balanceBaseline.createdAt)) errors.push("残高設定日時が不正です。");
    }
  }

  if (!Array.isArray(data.categories)) errors.push("categoriesが配列ではありません。");
  if (!Array.isArray(data.paymentMethods)) errors.push("paymentMethodsが配列ではありません。");
  if (!Array.isArray(data.transactions)) errors.push("transactionsが配列ではありません。");
  if (!Array.isArray(data.subscriptions)) errors.push("subscriptionsが配列ではありません。");

  const allRecordIds = new Set();
  if (Array.isArray(data.categories)) validateCategories(data.categories, errors, allRecordIds);
  if (Array.isArray(data.paymentMethods)) validatePaymentMethods(data.paymentMethods, errors, allRecordIds);
  if (Array.isArray(data.subscriptions) && Array.isArray(data.categories) && Array.isArray(data.paymentMethods)) {
    validateSubscriptions(data.subscriptions, data.categories, data.paymentMethods, errors, allRecordIds);
  }
  if (
    Array.isArray(data.transactions) &&
    Array.isArray(data.categories) &&
    Array.isArray(data.paymentMethods) &&
    Array.isArray(data.subscriptions)
  ) {
    validateTransactions(data.transactions, data.categories, data.paymentMethods, data.subscriptions, errors, allRecordIds);
  }

  return { valid: errors.length === 0, errors };
}

function validateCategories(categories, errors, allRecordIds) {
  categories.forEach((category) => {
    if (!isPlainObject(category) || typeof category.id !== "string" || !category.id) {
      errors.push("不正なカテゴリがあります。");
      return;
    }
    registerId(category.id, "カテゴリ", allRecordIds, errors);
    if (!isValidClassificationName(category.name)) errors.push(`カテゴリ名が不正です: ${category.id}`);
    if (![TRANSACTION_TYPES.INCOME, TRANSACTION_TYPES.EXPENSE].includes(category.transactionType)) {
      errors.push(`カテゴリ種別が不正です: ${category.id}`);
    }
    if (!Number.isSafeInteger(category.order) || category.order < 0) errors.push(`カテゴリ順序が不正です: ${category.id}`);
    if (!isValidIsoTimestamp(category.createdAt)) errors.push(`カテゴリ作成日時が不正です: ${category.id}`);
    if (category.updatedAt !== undefined && !isValidIsoTimestamp(category.updatedAt)) {
      errors.push(`カテゴリ更新日時が不正です: ${category.id}`);
    }
    if (!Array.isArray(category.subcategories)) {
      errors.push(`小カテゴリ配列がありません: ${category.id}`);
      return;
    }
    category.subcategories.forEach((subcategory) => {
      if (!isPlainObject(subcategory) || typeof subcategory.id !== "string" || !subcategory.id) {
        errors.push(`不正な小カテゴリがあります: ${category.id}`);
        return;
      }
      registerId(subcategory.id, "小カテゴリ", allRecordIds, errors);
      if (!isValidClassificationName(subcategory.name)) {
        errors.push(`小カテゴリ名が不正です: ${subcategory.id}`);
      }
      if (!Number.isSafeInteger(subcategory.order) || subcategory.order < 0) {
        errors.push(`小カテゴリ順序が不正です: ${subcategory.id}`);
      }
      if (!isValidIsoTimestamp(subcategory.createdAt)) errors.push(`小カテゴリ作成日時が不正です: ${subcategory.id}`);
      if (subcategory.updatedAt !== undefined && !isValidIsoTimestamp(subcategory.updatedAt)) {
        errors.push(`小カテゴリ更新日時が不正です: ${subcategory.id}`);
      }
    });
  });
}

function validatePaymentMethods(paymentMethods, errors, allRecordIds) {
  paymentMethods.forEach((method) => {
    if (!isPlainObject(method) || typeof method.id !== "string" || !method.id) {
      errors.push("不正な支払い方法があります。");
      return;
    }
    registerId(method.id, "支払い方法", allRecordIds, errors);
    if (!isValidClassificationName(method.name)) {
      errors.push(`支払い方法名が不正です: ${method.id}`);
    }
    if (!Number.isSafeInteger(method.order) || method.order < 0) errors.push(`支払い方法順序が不正です: ${method.id}`);
    if (!isValidIsoTimestamp(method.createdAt)) errors.push(`支払い方法作成日時が不正です: ${method.id}`);
    if (method.updatedAt !== undefined && !isValidIsoTimestamp(method.updatedAt)) {
      errors.push(`支払い方法更新日時が不正です: ${method.id}`);
    }
  });
}

function validateSubscriptions(subscriptions, categories, paymentMethods, errors, allRecordIds) {
  subscriptions.forEach((subscription) => {
    if (!isPlainObject(subscription) || typeof subscription.id !== "string" || !subscription.id) {
      errors.push("不正なサブスクリプションがあります。");
      return;
    }
    registerId(subscription.id, "サブスクリプション", allRecordIds, errors);

    if (typeof subscription.name !== "string" || !subscription.name.trim()) {
      errors.push(`サブスクリプション名が不正です: ${subscription.id}`);
    }
    if (!Number.isSafeInteger(subscription.amount) || subscription.amount < 1) {
      errors.push(`サブスクリプション金額が不正です: ${subscription.id}`);
    }

    const category = categories.find((item) => item.id === subscription.categoryId);
    if (!category || category.transactionType !== TRANSACTION_TYPES.EXPENSE) {
      errors.push(`サブスクリプションのカテゴリが不正です: ${subscription.id}`);
    }
    if (category && !isValidSubcategoryReference(category, subscription.subcategoryId)) {
      errors.push(`サブスクリプションの小カテゴリが不正です: ${subscription.id}`);
    }
    if (!paymentMethods.some((item) => item.id === subscription.paymentMethodId)) {
      errors.push(`サブスクリプションの支払い方法が不正です: ${subscription.id}`);
    }
    if (!["monthly", "yearly"].includes(subscription.cycle)) {
      errors.push(`サブスクリプションの更新周期が不正です: ${subscription.id}`);
    }
    if (!isValidDateString(subscription.nextBillingDate)) {
      errors.push(`サブスクリプションの次回更新日が不正です: ${subscription.id}`);
    }
    if (typeof subscription.active !== "boolean") {
      errors.push(`サブスクリプションのactiveが不正です: ${subscription.id}`);
    }
    if (!Number.isSafeInteger(subscription.billingDay) || subscription.billingDay < 1 || subscription.billingDay > 31) {
      errors.push(`サブスクリプションの基準日が不正です: ${subscription.id}`);
    }
    if (
      subscription.cycle === "yearly" &&
      (!Number.isSafeInteger(subscription.billingMonth) || subscription.billingMonth < 1 || subscription.billingMonth > 12)
    ) {
      errors.push(`年額サブスクリプションの基準月が不正です: ${subscription.id}`);
    }
    if (subscription.cycle === "monthly" && subscription.billingMonth !== null) {
      errors.push(`月額サブスクリプションのbillingMonthはnullである必要があります: ${subscription.id}`);
    }
    if (isValidDateString(subscription.nextBillingDate) && Number.isSafeInteger(subscription.billingDay)) {
      const [year, month, day] = subscription.nextBillingDate.split("-").map(Number);
      const expectedMonth = subscription.cycle === "yearly" ? subscription.billingMonth : month;
      const expectedDay = Math.min(subscription.billingDay, new Date(year, expectedMonth, 0).getDate());
      if (subscription.cycle === "yearly" && month !== subscription.billingMonth) {
        errors.push(`年額サブスクリプションの次回更新月が基準月と一致しません: ${subscription.id}`);
      }
      if (day !== expectedDay) {
        errors.push(`サブスクリプションの次回更新日が基準日と一致しません: ${subscription.id}`);
      }
    }
    if (!isValidIsoTimestamp(subscription.createdAt) || !isValidIsoTimestamp(subscription.updatedAt)) {
      errors.push(`サブスクリプションの日時が不正です: ${subscription.id}`);
    }
    if (subscription.active === true && subscription.stoppedAt !== null) {
      errors.push(`利用中サブスクリプションのstoppedAtはnullである必要があります: ${subscription.id}`);
    }
    if (subscription.active === false && !isValidIsoTimestamp(subscription.stoppedAt)) {
      errors.push(`停止中サブスクリプションの停止日時が不正です: ${subscription.id}`);
    }
  });
}

function validateTransactions(transactions, categories, paymentMethods, subscriptions, errors, allRecordIds) {
  const subscriptionOccurrences = new Set();

  transactions.forEach((transaction) => {
    if (!isPlainObject(transaction) || typeof transaction.id !== "string" || !transaction.id) {
      errors.push("不正な取引があります。");
      return;
    }
    registerId(transaction.id, "取引", allRecordIds, errors);

    const validation = validateTransactionInput(transaction, { categories, paymentMethods });
    if (!validation.valid) errors.push(`取引 ${transaction.id}: ${validation.errors[0].message}`);

    if (![TRANSACTION_SOURCES.MANUAL, TRANSACTION_SOURCES.SUBSCRIPTION].includes(transaction.source)) {
      errors.push(`取引元が不正です: ${transaction.id}`);
    }
    if (
      transaction.source === TRANSACTION_SOURCES.MANUAL &&
      (transaction.subscriptionId !== null || transaction.subscriptionOccurrenceDate !== null)
    ) {
      errors.push(`手動取引にサブスクリプション情報が設定されています: ${transaction.id}`);
    }
    if (transaction.source === TRANSACTION_SOURCES.SUBSCRIPTION) {
      if (transaction.type !== TRANSACTION_TYPES.EXPENSE) {
        errors.push(`サブスク由来取引は支出である必要があります: ${transaction.id}`);
      }
      if (typeof transaction.subscriptionId !== "string" || !transaction.subscriptionId) {
        errors.push(`サブスク由来取引のsubscriptionIdが不正です: ${transaction.id}`);
      } else if (!subscriptions.some((subscription) => subscription.id === transaction.subscriptionId)) {
        errors.push(`サブスク由来取引の参照先がありません: ${transaction.id}`);
      }
      if (!isValidDateString(transaction.subscriptionOccurrenceDate)) {
        errors.push(`サブスク由来取引の更新分識別日が不正です: ${transaction.id}`);
      } else {
        const occurrenceKey = `${transaction.subscriptionId}:${transaction.subscriptionOccurrenceDate}`;
        if (subscriptionOccurrences.has(occurrenceKey)) {
          errors.push(`サブスク更新分が重複しています: ${occurrenceKey}`);
        }
        subscriptionOccurrences.add(occurrenceKey);
      }
      if (transaction.date !== transaction.subscriptionOccurrenceDate) {
        errors.push(`サブスク由来取引の計上日と更新分識別日が一致しません: ${transaction.id}`);
      }
    }
    if (!isValidIsoTimestamp(transaction.createdAt) || !isValidIsoTimestamp(transaction.updatedAt)) {
      errors.push(`取引日時が不正です: ${transaction.id}`);
    }
  });
}

function registerId(id, label, allRecordIds, errors) {
  if (allRecordIds.has(id)) errors.push(`${label}IDが重複しています: ${id}`);
  allRecordIds.add(id);
}

export function validateTransactionInput(input, appData) {
  const errors = [];

  if (![TRANSACTION_TYPES.INCOME, TRANSACTION_TYPES.EXPENSE].includes(input.type)) {
    errors.push({ field: "transaction-type", message: "収入または支出を選択してください。" });
  }

  if (!isValidDateString(input.date)) errors.push({ field: "date", message: "有効な日付を入力してください。" });
  if (!Number.isSafeInteger(input.amount) || input.amount < 1) {
    errors.push({ field: "amount", message: "金額は1円以上の整数で入力してください。" });
  }
  if (typeof input.title !== "string") errors.push({ field: "title", message: "内容の形式が不正です。" });

  const category = appData.categories.find((item) => item.id === input.categoryId);
  if (!category || category.transactionType !== input.type) {
    errors.push({ field: "category", message: "種別に合ったカテゴリを選択してください。" });
  }

  if (category && !isValidSubcategoryReference(category, input.subcategoryId)) {
    errors.push({ field: "subcategory", message: "有効な小カテゴリを選択してください。" });
  }

  const paymentMethod = appData.paymentMethods.find((item) => item.id === input.paymentMethodId);
  if (!paymentMethod) {
    errors.push({ field: "payment-method", message: "有効な支払い・受取方法を選択してください。" });
  }

  return { valid: errors.length === 0, errors };
}

function isValidClassificationName(value) {
  try {
    validateClassificationName(value);
    return true;
  } catch {
    return false;
  }
}

function isValidSubcategoryReference(category, subcategoryId) {
  if (category.subcategories.length === 0) return subcategoryId === null || subcategoryId === "";
  return category.subcategories.some((item) => item.id === subcategoryId);
}
