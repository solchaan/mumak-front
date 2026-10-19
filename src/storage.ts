import { parseProject, type Project, type Summary } from './model';
let database: Promise<IDBDatabase> | undefined;
function open() {
  return database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('mumak', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('projects', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { database = undefined; reject(request.error); };
  });
}
async function transact<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('projects', mode);
    const request = run(tx.objectStore('projects'));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error || request.error);
    tx.onabort = () => reject(tx.error || new Error('저장이 취소되었습니다.'));
  });
}
export const saveLocal = (p: Project) => transact('readwrite', store => store.put(p));
export const loadLocal = async (id: string) => parseProject(await transact('readonly', store => store.get(id)));
export const deleteLocal = (id: string) => transact('readwrite', store => store.delete(id));
export async function listLocal(): Promise<Summary[]> {
  const all = await transact<Project[]>('readonly', store => store.getAll());
  return all.map(({ id, title, bpm, updatedAt }) => ({ id, title, bpm, updatedAt })).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export async function apiRequest<T>(base: string, token: string, path: string, method = 'GET', body?: unknown): Promise<T> {
  const url = new URL(base);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('올바른 서버 주소를 입력하세요.');
  const response = await fetch(`${base.replace(/\/$/, '')}/api${path}`, {
    method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000), credentials: 'omit',
  });
  if (!response.ok) throw new Error(response.status === 401 ? 'API 토큰을 확인하세요.' : `서버 요청 실패 (${response.status})`);
  return response.status === 204 ? undefined as T : response.json();
}
export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
export const safeName = (title: string) => title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 80) || 'mumak';
