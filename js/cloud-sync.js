import { SCHEMA_VERSION } from "./constants.js";
import { getFirestoreConnection } from "./firebase.js";
import { DataFormatError } from "./storage.js";
import { isPlainObject, isValidIsoTimestamp, validateAppData } from "./validation.js";

export const CLOUD_APP_ID = "kakeibo";
export const CLOUD_DOCUMENT_PATH_PATTERN = "users/{uid}/apps/kakeibo";

export class CloudSyncError extends Error {
  constructor(message, code = "cloud/unknown", cause = null) {
    super(message);
    this.name = "CloudSyncError";
    this.code = code;
    this.cause = cause;
  }
}

export function prepareAppDataForCloud(appData) {
  const validation = validateAppData(appData);
  if (!validation.valid) {
    throw new DataFormatError("端末データの形式が不正なためクラウドへ保存できません。", validation.errors);
  }
  assertFirestoreCompatible(appData);
  return cloneData(appData);
}

export async function fetchCloudAppData() {
  try {
    const connection = await getFirestoreConnection();
    const reference = connection.sdk.doc(connection.db, "users", connection.user.uid, "apps", CLOUD_APP_ID);
    const snapshot = await connection.sdk.getDocFromServer(reference);
    const fetchedAt = new Date().toISOString();

    if (!snapshot.exists()) {
      return {
        exists: false,
        fetchedAt,
        ownerUid: connection.user.uid,
        path: `users/${connection.user.uid}/apps/${CLOUD_APP_ID}`,
      };
    }

    return normalizeCloudDocument(snapshot.data(), connection.user.uid, fetchedAt);
  } catch (error) {
    throw normalizeCloudError(error, "クラウドデータを取得できませんでした。");
  }
}

export async function saveAppDataToCloud(appData) {
  const preparedData = prepareAppDataForCloud(appData);
  try {
    const connection = await getFirestoreConnection();
    const reference = connection.sdk.doc(connection.db, "users", connection.user.uid, "apps", CLOUD_APP_ID);
    await connection.sdk.setDoc(reference, {
      appData: preparedData,
      cloudRevision: preparedData.appMetadata.revision,
      cloudUpdatedAt: connection.sdk.serverTimestamp(),
      ownerUid: connection.user.uid,
      schemaVersion: preparedData.schemaVersion,
    });
    return fetchCloudAppData();
  } catch (error) {
    throw normalizeCloudError(error, "クラウドへ保存できませんでした。");
  }
}

export function normalizeCloudDocument(documentData, expectedUid, fetchedAt = new Date().toISOString()) {
  const errors = [];
  if (!isPlainObject(documentData)) {
    throw new CloudSyncError("クラウドドキュメントの形式が不正です。", "cloud/invalid-data");
  }
  if (documentData.ownerUid !== expectedUid) errors.push("ownerUidがログインユーザーと一致しません。");
  if (documentData.schemaVersion !== SCHEMA_VERSION) errors.push("対応していないschemaVersionです。");
  if (!Number.isSafeInteger(documentData.cloudRevision) || documentData.cloudRevision < 0) {
    errors.push("cloudRevisionが不正です。");
  }

  let cloudUpdatedAt = null;
  try {
    cloudUpdatedAt = timestampToIso(documentData.cloudUpdatedAt);
  } catch (error) {
    errors.push(error.message);
  }

  const appValidation = validateAppData(documentData.appData);
  if (!appValidation.valid) errors.push(...appValidation.errors);
  if (
    appValidation.valid &&
    documentData.cloudRevision !== documentData.appData.appMetadata.revision
  ) {
    errors.push("cloudRevisionとAppDataのrevisionが一致しません。");
  }
  if (errors.length) {
    throw new DataFormatError("クラウドデータの形式が不正です。端末データは変更していません。", errors);
  }

  return {
    exists: true,
    fetchedAt,
    path: `users/${expectedUid}/apps/${CLOUD_APP_ID}`,
    ownerUid: expectedUid,
    schemaVersion: documentData.schemaVersion,
    cloudRevision: documentData.cloudRevision,
    cloudUpdatedAt,
    appData: cloneData(documentData.appData),
    summary: createAppDataSummary(documentData.appData),
  };
}

export function createAppDataSummary(appData) {
  return {
    revision: appData.appMetadata.revision,
    updatedAt: appData.appMetadata.updatedAt,
    transactionCount: appData.transactions.length,
    subscriptionCount: appData.subscriptions.length,
    hasBalanceBaseline: appData.balanceBaseline !== null,
  };
}

export function compareLocalAndCloud(localData, cloudState) {
  if (!cloudState?.exists) return "cloud-missing";
  const localTime = Date.parse(localData.appMetadata.updatedAt);
  const cloudDataTime = Date.parse(cloudState.appData.appMetadata.updatedAt);
  if (localTime > cloudDataTime) return "local-newer";
  if (localTime < cloudDataTime) return "cloud-newer";
  if (localData.appMetadata.revision > cloudState.cloudRevision) return "local-newer";
  if (localData.appMetadata.revision < cloudState.cloudRevision) return "cloud-newer";
  return "same";
}

function assertFirestoreCompatible(value, path = "appData", seen = new WeakSet()) {
  if (value === undefined || typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") {
    throw new DataFormatError(`${path}にFirestoreへ保存できない値が含まれています。`);
  }
  if (value === null || typeof value !== "object") return;
  if (seen.has(value)) throw new DataFormatError(`${path}に循環参照が含まれています。`);
  if (!Array.isArray(value) && !isPlainObject(value)) {
    throw new DataFormatError(`${path}に対応していないオブジェクトが含まれています。`);
  }
  seen.add(value);
  Object.entries(value).forEach(([key, child]) => assertFirestoreCompatible(child, `${path}.${key}`, seen));
  seen.delete(value);
}

function timestampToIso(value) {
  const date = value instanceof Date
    ? value
    : typeof value?.toDate === "function"
      ? value.toDate()
      : typeof value === "string" && isValidIsoTimestamp(value)
        ? new Date(value)
        : null;
  if (!date || Number.isNaN(date.getTime())) throw new Error("cloudUpdatedAtが不正です。");
  return date.toISOString();
}

function normalizeCloudError(error, fallbackMessage) {
  if (error instanceof CloudSyncError || error instanceof DataFormatError) return error;
  const code = typeof error?.code === "string" ? error.code : "cloud/unknown";
  const messages = {
    "permission-denied": "クラウドへのアクセスが拒否されました。Firestore Security Rulesを確認してください。",
    "firestore/permission-denied": "クラウドへのアクセスが拒否されました。Firestore Security Rulesを確認してください。",
    unavailable: "クラウドへ接続できません。通信状態を確認してください。",
    "firestore/unavailable": "クラウドへ接続できません。通信状態を確認してください。",
    unauthenticated: "クラウド機能を利用するにはGoogleログインが必要です。",
    "firestore/unauthenticated": "クラウド機能を利用するにはGoogleログインが必要です。",
  };
  return new CloudSyncError(messages[code] || fallbackMessage, code, error);
}

function cloneData(data) {
  return typeof structuredClone === "function" ? structuredClone(data) : JSON.parse(JSON.stringify(data));
}
