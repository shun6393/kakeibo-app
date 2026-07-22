import {
  RESTORE_SAFETY_KEY,
  SCHEMA_VERSION,
  STORAGE_KEY,
  createInitialCategories,
  createInitialPaymentMethods,
} from "./constants.js";
import { validateAppData } from "./validation.js";

export class StorageError extends Error {
  constructor(message, cause = null) {
    super(message);
    this.name = "StorageError";
    this.cause = cause;
  }
}

export class DataFormatError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = "DataFormatError";
    this.details = details;
  }
}

export function createInitialAppData() {
  const timestamp = new Date().toISOString();

  return {
    schemaVersion: SCHEMA_VERSION,
    appMetadata: {
      appName: "わたしの家計簿",
      createdAt: timestamp,
      updatedAt: timestamp,
      revision: 0,
    },
    settings: {
      lastBackupAt: null,
    },
    balanceBaseline: null,
    categories: createInitialCategories(timestamp),
    paymentMethods: createInitialPaymentMethods(timestamp),
    transactions: [],
    subscriptions: [],
  };
}

export function loadAppData() {
  let serialized;

  try {
    serialized = window.localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    throw new StorageError("保存データを読み込めませんでした。ブラウザの保存設定を確認してください。", error);
  }

  if (serialized === null) {
    const initialData = createInitialAppData();
    const savedData = saveAppData(initialData);
    return { data: savedData, isFirstRun: true };
  }

  let data;
  try {
    data = JSON.parse(serialized);
  } catch (error) {
    throw new DataFormatError("保存データをJSONとして読み込めませんでした。", [error.message]);
  }

  const result = validateAppData(data);
  if (!result.valid) {
    throw new DataFormatError("保存データの形式が不正です。自動的な上書きは行っていません。", result.errors);
  }

  return { data, isFirstRun: false };
}

export function saveAppData(data) {
  const nextData = cloneData(data);
  const currentRevision = Number.isSafeInteger(nextData.appMetadata?.revision)
    ? nextData.appMetadata.revision
    : 0;

  nextData.appMetadata.updatedAt = new Date().toISOString();
  nextData.appMetadata.revision = currentRevision + 1;

  const result = validateAppData(nextData);
  if (!result.valid) {
    throw new DataFormatError("不正なデータは保存できません。", result.errors);
  }

  let serialized;
  try {
    serialized = JSON.stringify(nextData);
  } catch (error) {
    throw new StorageError("保存データを変換できませんでした。", error);
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, serialized);
  } catch (error) {
    throw new StorageError("データを保存できませんでした。ブラウザの空き容量や保存設定を確認してください。", error);
  }

  return nextData;
}

export function saveRestoreSafetySnapshot(data) {
  const validation = validateAppData(data);
  if (!validation.valid) {
    throw new DataFormatError("現在データが不正なため、復元前の安全退避を作成できません。", validation.errors);
  }

  const safetySnapshot = {
    savedAt: new Date().toISOString(),
    data: cloneData(data),
  };

  try {
    window.localStorage.setItem(RESTORE_SAFETY_KEY, JSON.stringify(safetySnapshot));
  } catch (error) {
    throw new StorageError("復元前の安全退避を保存できませんでした。空き容量や保存設定を確認してください。", error);
  }

  return safetySnapshot.savedAt;
}

export function resetAllAppData() {
  let previousMainData;
  let previousSafetyData;

  try {
    previousMainData = window.localStorage.getItem(STORAGE_KEY);
    previousSafetyData = window.localStorage.getItem(RESTORE_SAFETY_KEY);
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(RESTORE_SAFETY_KEY);
    return saveAppData(createInitialAppData());
  } catch (error) {
    try {
      if (previousMainData !== null && previousMainData !== undefined) {
        window.localStorage.setItem(STORAGE_KEY, previousMainData);
      }
      if (previousSafetyData !== null && previousSafetyData !== undefined) {
        window.localStorage.setItem(RESTORE_SAFETY_KEY, previousSafetyData);
      }
    } catch (rollbackError) {
      console.error("全データ削除失敗後の復旧にも失敗しました。", rollbackError);
    }

    if (error instanceof StorageError || error instanceof DataFormatError) throw error;
    throw new StorageError("全データを初期化できませんでした。現在データは可能な限り復旧しています。", error);
  }
}

function cloneData(data) {
  if (typeof structuredClone === "function") return structuredClone(data);
  return JSON.parse(JSON.stringify(data));
}
