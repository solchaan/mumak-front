import { parseProject, type Project, type Summary } from './model';
let database: Promise<IDBDatabase> | undefined;
function open() {
  return database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('mumak', 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('recovery')) db.createObjectStore('recovery', { keyPath: 'id' });
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => { request.result.close(); database = undefined; };
      resolve(request.result);
    };
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
// Keep the previous valid save atomically with the new version. Reopening a
// project without editing it must not rotate away its recovery copy.
export async function saveLocal(p: Project): Promise<void> {
  p = parseProject(p);
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['projects', 'recovery'], 'readwrite');
    const projects = tx.objectStore('projects');
    const read = projects.get(p.id);
    read.onsuccess = () => {
      let previous: Project | undefined;
      if (read.result) {
        try { previous = parseProject(read.result); }
        catch { /* Retain the last valid recovery copy if the current save is damaged. */ }
      }
      if (previous) {
        const content = ({ updatedAt: _date, ...rest }: Project) => JSON.stringify(rest);
        if (content(previous) === content(p)) return;
        tx.objectStore('recovery').put(previous);
      }
      projects.put(p);
    };
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(tx.error || new Error('저장이 취소되었습니다.'));
  });
}
export async function loadRecovery(id: string): Promise<Project> {
  const db = await open();
  const value = await new Promise<unknown>((resolve, reject) => {
    const tx = db.transaction('recovery', 'readonly');
    const request = tx.objectStore('recovery').get(id);
    tx.oncomplete = () => resolve(request.result);
    tx.onabort = tx.onerror = () => reject(tx.error);
  });
  if (!value) throw new Error('아직 이전 저장본이 없습니다. 편집 내용이 자동 저장되면 복구본이 만들어집니다.');
  return parseProject(value);
}
export async function loadLocal(id: string): Promise<Project> {
  const value = await transact('readonly', store => store.get(id));
  try { return parseProject(value); }
  catch (error) {
    try { return await loadRecovery(id); }
    catch { throw error; }
  }
}
export async function deleteLocal(id: string): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['projects', 'recovery'], 'readwrite');
    tx.objectStore('projects').delete(id);
    tx.objectStore('recovery').delete(id);
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(tx.error);
  });
}
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
