import { SCHEMA_VERSION, TRANSACTION_SOURCES, TRANSACTION_TYPES } from "./constants.js";
import { findTransactionLabels } from "./transactions.js";
import { DataFormatError } from "./storage.js";
import { isPlainObject, isValidIsoTimestamp, validateAppData } from "./validation.js";

const APP_DATA_KEYS = [
  "schemaVersion",
  "appMetadata",
  "settings",
  "balanceBaseline",
  "categories",
  "paymentMethods",
  "transactions",
  "subscriptions",
];

export function createBackupDocument(appData, exportedAt = new Date().toISOString()) {
  const validation = validateAppData(appData);
  if (!validation.valid) {
    throw new DataFormatError("現在データが不正なため、バックアップを作成できません。", validation.errors);
  }
  if (!isValidIsoTimestamp(exportedAt)) {
    throw new DataFormatError("バックアップ作成日時が不正です。");
  }

  return {
    ...cloneData(appData),
    exportedAt,
  };
}

export function downloadJsonBackup(appData, filenamePrefix = "kakeibo-backup", exportedAt = new Date().toISOString()) {
  const document = createBackupDocument(appData, exportedAt);
  const filename = `${filenamePrefix}-${formatFilenameTimestamp(new Date(exportedAt))}.json`;
  downloadBlob(JSON.stringify(document, null, 2), "application/json;charset=utf-8", filename);
  return { exportedAt, filename };
}

export function parseAndValidateBackup(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new DataFormatError("JSONファイルを読み取れませんでした。正しいバックアップファイルを選択してください。", [error.message]);
  }

  if (!isPlainObject(parsed)) throw new DataFormatError("バックアップのルートデータが不正です。");
  if (!("schemaVersion" in parsed)) throw new DataFormatError("schemaVersionがないため復元できません。");
  if (!Number.isSafeInteger(parsed.schemaVersion)) throw new DataFormatError("schemaVersionが不正です。");
  if (parsed.schemaVersion > SCHEMA_VERSION) {
    throw new DataFormatError("このアプリより新しいデータ形式のため復元できません。アプリを更新してから再試行してください。");
  }
  if (parsed.schemaVersion !== SCHEMA_VERSION) {
    throw new DataFormatError("対応していない古いデータ形式です。移行機能が追加されるまで復元できません。");
  }
  if (!isValidIsoTimestamp(parsed.exportedAt)) {
    throw new DataFormatError("バックアップ作成日時 exportedAt が不正です。");
  }

  const data = Object.fromEntries(APP_DATA_KEYS.map((key) => [key, cloneData(parsed[key])]));
  const validation = validateAppData(data);
  if (!validation.valid) {
    throw new DataFormatError("バックアップの内容に問題があるため復元できません。現在データは変更していません。", validation.errors);
  }

  return {
    data,
    exportedAt: parsed.exportedAt,
    summary: createBackupSummary(data, parsed.exportedAt),
  };
}

export function createBackupSummary(appData, exportedAt) {
  return {
    exportedAt,
    schemaVersion: appData.schemaVersion,
    hasBalanceBaseline: appData.balanceBaseline !== null,
    transactionCount: appData.transactions.length,
    subscriptionCount: appData.subscriptions.length,
    categoryCount: appData.categories.length,
    paymentMethodCount: appData.paymentMethods.length,
  };
}

export function downloadTransactionsCsv(appData) {
  const result = createTransactionsCsv(appData);
  downloadBlob(result.content, "text/csv;charset=utf-8", result.filename);
  return result;
}

export function createTransactionsCsv(appData, now = new Date()) {
  const validation = validateAppData(appData);
  if (!validation.valid) {
    throw new DataFormatError("現在データが不正なため、CSVを作成できません。", validation.errors);
  }

  const header = [
    "日付",
    "種別",
    "金額",
    "内容",
    "大カテゴリ",
    "小カテゴリ",
    "支払い・受取方法",
    "登録元",
    "サブスクID",
    "サブスク更新日",
    "登録日時",
    "更新日時",
  ];

  const transactions = [...appData.transactions].sort((left, right) => {
    const dateComparison = left.date.localeCompare(right.date);
    if (dateComparison !== 0) return dateComparison;
    return left.createdAt.localeCompare(right.createdAt);
  });

  const rows = transactions.map((transaction) => {
    const labels = findTransactionLabels(transaction, appData);
    return [
      transaction.date,
      transaction.type === TRANSACTION_TYPES.INCOME ? "収入" : "支出",
      transaction.amount,
      transaction.title,
      labels.categoryName,
      labels.subcategoryName,
      labels.paymentMethodName,
      transaction.source === TRANSACTION_SOURCES.MANUAL ? "manual" : "subscription",
      transaction.subscriptionId ?? "",
      transaction.subscriptionOccurrenceDate ?? "",
      transaction.createdAt,
      transaction.updatedAt,
    ];
  });

  const csv = [header, ...rows]
    .map((row, rowIndex) => row.map((value, columnIndex) => escapeCsv(value, rowIndex > 0 && columnIndex !== 2)).join(","))
    .join("\r\n");
  const filename = `kakeibo-transactions-${formatDateForFilename(now)}.csv`;
  return {
    content: `\uFEFF${csv}`,
    filename,
    transactionCount: transactions.length,
    order: "oldest-first",
  };
}

function downloadBlob(content, mimeType, filename) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.append(link);

  try {
    link.click();
  } finally {
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

function escapeCsv(value, protectFormula) {
  let text = String(value ?? "");
  if (protectFormula && /^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function formatFilenameTimestamp(date) {
  return `${formatDateForFilename(date)}-${String(date.getHours()).padStart(2, "0")}${String(date.getMinutes()).padStart(2, "0")}${String(date.getSeconds()).padStart(2, "0")}`;
}

function formatDateForFilename(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function cloneData(data) {
  if (data === undefined) return undefined;
  return typeof structuredClone === "function" ? structuredClone(data) : JSON.parse(JSON.stringify(data));
}
