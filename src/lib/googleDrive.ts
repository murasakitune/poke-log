import { BattleLogFileV1 } from "./migrations";

const FILE_NAME = "battle-log.json";
const SCOPE = "https://www.googleapis.com/auth/drive.appdata";
const GIS_URL = "https://accounts.google.com/gsi/client";
const DRIVE_API = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3/files";

type TokenResponse = { access_token?: string; expires_in?: number; error?: string; error_description?: string };
type TokenClient = { requestAccessToken: (options?: { prompt?: string }) => void };

declare global {
  interface Window {
    google?: { accounts: { oauth2: { initTokenClient(config: {
      client_id: string;
      scope: string;
      callback: (response: TokenResponse) => void;
      error_callback?: (error: { type?: string }) => void;
    }): TokenClient } } };
  }
}

let accessToken: string | null = null;
let expiresAt = 0;
let scriptPromise: Promise<void> | null = null;
let authorizationPromise: Promise<string> | null = null;

export type DriveAccessOptions = { interactive?: boolean };

export class GoogleAuthorizationRequiredError extends Error {
  constructor() {
    super("Google Driveの認証が必要です。同期ボタンを押して認証してください。");
    this.name = "GoogleAuthorizationRequiredError";
  }
}

export type DriveFile = { id: string; name: string };

export async function readBattleLogFile(options: DriveAccessOptions = {}): Promise<{ file: DriveFile | null; data: unknown | null }> {
  const token = await authorize(options.interactive ?? true);
  const response = await driveFetch(
    `${DRIVE_API}?spaces=appDataFolder&q=${encodeURIComponent(`name = '${FILE_NAME}' and trashed = false`)}&fields=files(id,name)&pageSize=10`,
    token,
  );
  const result = await response.json() as { files?: DriveFile[] };
  const file = result.files?.[0] ?? null;
  if (!file) return { file: null, data: null };
  const content = await driveFetch(`${DRIVE_API}/${encodeURIComponent(file.id)}?alt=media`, token);
  return { file, data: await content.json() as unknown };
}

export async function writeBattleLogFile(data: BattleLogFileV1, fileId?: string, options: DriveAccessOptions = {}): Promise<void> {
  const token = await authorize(options.interactive ?? true);
  const body = JSON.stringify(data, null, 2);
  if (fileId) {
    await driveFetch(`${DRIVE_UPLOAD_API}/${encodeURIComponent(fileId)}?uploadType=media`, token, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body,
    });
    return;
  }

  const boundary = `pokemon-battle-log-${crypto.randomUUID()}`;
  const multipartBody = [
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: FILE_NAME, parents: ["appDataFolder"] })}`,
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}`,
    `--${boundary}--`,
  ].join("\r\n");
  await driveFetch(`${DRIVE_UPLOAD_API}?uploadType=multipart`, token, {
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body: multipartBody,
  });
}

async function authorize(interactive: boolean): Promise<string> {
  if (accessToken && Date.now() < expiresAt - 60_000) return accessToken;
  if (authorizationPromise) return authorizationPromise;
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error("Google Drive同期が設定されていません。");
  await loadGoogleIdentityServices();

  authorizationPromise = requestToken(clientId, false).catch((error: unknown) => {
    if (!interactive) throw error;
    return requestToken(clientId, true);
  });
  try {
    return await authorizationPromise;
  } finally {
    authorizationPromise = null;
  }
}

function requestToken(clientId: string, interactive: boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (response) => {
        if (!response.access_token) {
          reject(interactive
            ? new Error(response.error_description ?? response.error ?? "Google認証に失敗しました。")
            : new GoogleAuthorizationRequiredError());
          return;
        }
        accessToken = response.access_token;
        expiresAt = Date.now() + (response.expires_in ?? 3600) * 1000;
        resolve(response.access_token);
      },
      error_callback: () => reject(interactive
        ? new Error("Google認証がキャンセルされました。")
        : new GoogleAuthorizationRequiredError()),
    });
    client.requestAccessToken(interactive ? undefined : { prompt: "" });
  });
}

function loadGoogleIdentityServices(): Promise<void> {
  if (window.google?.accounts.oauth2) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_URL}"]`);
    const script = existing ?? document.createElement("script");
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error("Google認証ライブラリを読み込めませんでした。")), { once: true });
    if (!existing) {
      script.src = GIS_URL;
      script.async = true;
      document.head.appendChild(script);
    }
  });
  return scriptPromise;
}

async function driveFetch(url: string, token: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(url, { ...init, headers });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Google Drive APIエラー (${response.status}): ${detail.slice(0, 200)}`);
  }
  return response;
}
