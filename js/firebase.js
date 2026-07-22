const FIREBASE_SDK_VERSION = "12.16.0";
const FIREBASE_CDN_BASE = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}`;

// Firebase ConsoleでWebアプリを登録した後、この値だけを置き換えます。
// FirebaseのWeb設定値は公開クライアント用の識別情報であり、秘密鍵ではありません。
export const firebaseConfig = Object.freeze({
  apiKey: "AIzaSyAbJQpe_IRRPBv6QioNn7LZncDDn1ZLLEU",
  authDomain: "kakeibo-app-1a42d.firebaseapp.com",
  projectId: "kakeibo-app-1a42d",
  storageBucket: "kakeibo-app-1a42d.firebasestorage.app",
  messagingSenderId: "196553452004",
  appId: "1:196553452004:web:fa09e21da0d4f8a4ddfff1",
});

const REQUIRED_CONFIG_KEYS = ["apiKey", "authDomain", "projectId", "appId"];

let auth = null;
let authSdk = null;
let firebaseApp = null;
let firestore = null;
let firestoreSdk = null;
let firestoreInitializationPromise = null;
let initializationPromise = null;

export class FirebaseAuthError extends Error {
  constructor(message, code = "firebase/unknown") {
    super(message);
    this.name = "FirebaseAuthError";
    this.code = code;
  }
}

export function getFirebaseConfigurationState() {
  const missingKeys = REQUIRED_CONFIG_KEYS.filter((key) => {
    const value = firebaseConfig[key];
    return typeof value !== "string" || value.trim() === "";
  });
  return {
    configured: missingKeys.length === 0,
    missingKeys,
    sdkVersion: FIREBASE_SDK_VERSION,
  };
}

async function loadFirebaseSdk() {
  const [appModule, authModule] = await Promise.all([
    import(`${FIREBASE_CDN_BASE}/firebase-app.js`),
    import(`${FIREBASE_CDN_BASE}/firebase-auth.js`),
  ]);
  return { appModule, authModule };
}

function normalizeUser(user) {
  if (!user) return null;
  return Object.freeze({
    uid: user.uid,
    displayName: user.displayName || "",
    email: user.email || "",
    photoURL: user.photoURL || "",
  });
}

function toFirebaseAuthError(error) {
  const code = typeof error?.code === "string" ? error.code : "firebase/unknown";
  const messages = {
    "auth/popup-closed-by-user": "Googleログインをキャンセルしました。",
    "auth/cancelled-popup-request": "別のログイン操作が進行中です。少し待ってからお試しください。",
    "auth/popup-blocked": "ログイン画面がブロックされました。ブラウザのポップアップ設定を確認してください。",
    "auth/network-request-failed": "ネットワークに接続できません。通信状態を確認して再度お試しください。",
    "auth/unauthorized-domain": "この公開先がFirebaseの承認済みドメインに登録されていません。Firebase Consoleの設定を確認してください。",
    "auth/operation-not-allowed": "Firebase ConsoleでGoogleログインが有効になっていません。",
  };
  return new FirebaseAuthError(messages[code] || "Firebase認証でエラーが発生しました。設定と通信状態を確認してください。", code);
}

export function initializeFirebaseAuth(handleAuthState) {
  if (initializationPromise) return initializationPromise;

  const configuration = getFirebaseConfigurationState();
  if (!configuration.configured) {
    return Promise.resolve({ status: "unconfigured", configuration });
  }

  initializationPromise = (async () => {
    try {
      const { appModule, authModule } = await loadFirebaseSdk();
      firebaseApp = appModule.getApps().length
        ? appModule.getApp()
        : appModule.initializeApp(firebaseConfig);
      auth = authModule.getAuth(firebaseApp);
      auth.languageCode = "ja";
      await authModule.setPersistence(auth, authModule.browserLocalPersistence);
      authSdk = authModule;

      authModule.onAuthStateChanged(
        auth,
        (user) => handleAuthState(normalizeUser(user), null),
        (error) => handleAuthState(null, toFirebaseAuthError(error)),
      );

      return { status: "ready", configuration };
    } catch (error) {
      initializationPromise = null;
      throw toFirebaseAuthError(error);
    }
  })();

  return initializationPromise;
}

export async function getFirestoreConnection() {
  if (!firebaseApp || !auth || !authSdk) {
    throw new FirebaseAuthError("Firebase認証の初期化が完了していません。", "firebase/not-initialized");
  }
  if (!auth.currentUser) {
    throw new FirebaseAuthError("クラウド機能を利用するにはGoogleログインが必要です。", "auth/requires-recent-login");
  }

  if (!firestoreInitializationPromise) {
    firestoreInitializationPromise = (async () => {
      try {
        firestoreSdk = await import(`${FIREBASE_CDN_BASE}/firebase-firestore.js`);
        firestore = firestoreSdk.getFirestore(firebaseApp);
      } catch (error) {
        firestoreInitializationPromise = null;
        throw toFirebaseAuthError(error);
      }
    })();
  }

  await firestoreInitializationPromise;
  return {
    db: firestore,
    sdk: firestoreSdk,
    user: normalizeUser(auth.currentUser),
  };
}

export async function signInWithGoogle() {
  if (!auth || !authSdk) {
    throw new FirebaseAuthError("Firebase認証の初期化が完了していません。", "firebase/not-initialized");
  }

  try {
    const provider = new authSdk.GoogleAuthProvider();
    const credential = await authSdk.signInWithPopup(auth, provider);
    return normalizeUser(credential.user);
  } catch (error) {
    throw toFirebaseAuthError(error);
  }
}

export async function signOutFromFirebase() {
  if (!auth || !authSdk) {
    throw new FirebaseAuthError("Firebase認証の初期化が完了していません。", "firebase/not-initialized");
  }

  try {
    await authSdk.signOut(auth);
  } catch (error) {
    throw toFirebaseAuthError(error);
  }
}
