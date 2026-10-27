import { login } from './login-helper';
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.goto('/'); await login(page);
  await page.getByRole('button', { name: '새로운 스케치', exact: true }).click();
  await expect(page.locator('.save-status')).toHaveText('브라우저에 저장됨');
});

test('project shortcuts work on buttons, clear redo on edits, and isolate projects', async ({ page }) => {
  const kick = page.getByRole('button', { name: 'kick 1번째 칸', exact: true });
  await kick.click();
  await expect(kick).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Control+z');
  await expect(kick).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('Control+Shift+z');
  await expect(kick).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Meta+z');
  await expect(kick).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('Control+y');
  await expect(kick).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Control+z');
  await page.getByRole('button', { name: 'snare 1번째 칸', exact: true }).click();
  await expect(page.getByRole('button', { name: '다시 실행', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '새로운 스케치', exact: true }).click();
  await expect(page.getByRole('button', { name: '실행 취소', exact: true })).toBeDisabled();
});

test('recovery survives reload and can itself be undone', async ({ page }) => {
  const title = page.getByLabel('프로젝트 이름');
  await title.fill('복구할 제목');
  await expect(page.locator('.save-status')).toHaveText('브라우저에 저장됨');
  await title.fill('변경한 제목');
  await expect(page.locator('.save-status')).toHaveText('브라우저에 저장됨');
  await page.reload(); await login(page);
  await expect(title).toHaveValue('변경한 제목');
  await expect(page.locator('.save-status')).toHaveText('브라우저에 저장됨');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '이전 저장본 복구', exact: true }).click();
  await expect(title).toHaveValue('복구할 제목');
  await page.getByRole('button', { name: '실행 취소', exact: true }).click();
  await expect(title).toHaveValue('변경한 제목');
});

test('storage failure preserves the previous save and offers retry', async ({ page }) => {
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args: Parameters<typeof original>) {
      if (this.name === 'projects') {
        IDBObjectStore.prototype.put = original;
        this.transaction.abort();
        throw new DOMException('Storage full', 'QuotaExceededError');
      }
      return original.apply(this, args);
    };
  });
  await page.getByLabel('프로젝트 이름').fill('다시 저장할 제목');
  await expect(page.locator('.save-status')).toContainText('저장 실패');
  await page.getByRole('button', { name: '저장 다시 시도' }).click();
  await expect(page.locator('.save-status')).toHaveText('브라우저에 저장됨');
  await page.reload(); await login(page);
  await expect(page.getByLabel('프로젝트 이름')).toHaveValue('다시 저장할 제목');
});

test('text input undo does not undo unrelated project changes', async ({ page }) => {
  const kick = page.getByRole('button', { name: 'kick 1번째 칸', exact: true });
  await kick.click();
  await page.getByLabel('프로젝트 이름').focus();
  await page.keyboard.press('Control+z');
  await expect(kick).toHaveAttribute('aria-pressed', 'true');
});

test('a damaged current save falls back to its valid recovery copy', async ({ page }) => {
  await page.getByLabel('프로젝트 이름').fill('안전한 저장본');
  await expect(page.locator('.save-status')).toHaveText('브라우저에 저장됨');
  await page.getByLabel('프로젝트 이름').fill('손상될 저장본');
  await expect(page.locator('.save-status')).toHaveText('브라우저에 저장됨');
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('mumak', 2);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('projects', 'readwrite');
      const store = tx.objectStore('projects');
      const all = store.getAll();
      all.onsuccess = () => {
        const saved = all.result.find(p => p.title === '손상될 저장본');
        store.put({ ...saved, notes: 'damaged' });
      };
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    };
  }));
  await page.reload(); await login(page);
  await expect(page.getByLabel('프로젝트 이름')).toHaveValue('안전한 저장본');
  await expect(page.locator('.save-status')).toHaveText('브라우저에 저장됨');
});

test('upgrading the old browser database preserves projects', async ({ page }) => {
  await page.evaluate(async () => {
    const saved = await new Promise<unknown>((resolve, reject) => {
      const request = indexedDB.open('mumak');
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('projects', 'readonly');
        const read = tx.objectStore('projects').getAll();
        tx.oncomplete = () => { db.close(); resolve(read.result[0]); };
        tx.onabort = () => reject(tx.error);
      };
    });
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase('mumak');
      request.onsuccess = () => resolve(); request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('mumak', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('projects', { keyPath: 'id' });
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('projects', 'readwrite');
        tx.objectStore('projects').put({ ...saved as object, title: '이전 버전 스케치' });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onabort = () => reject(tx.error);
      };
    });
  });
  await page.reload(); await login(page);
  await expect(page.getByLabel('프로젝트 이름')).toHaveValue('이전 버전 스케치');
  await page.getByLabel('프로젝트 이름').fill('업데이트 후 편집');
  await expect(page.locator('.save-status')).toHaveText('브라우저에 저장됨');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '이전 저장본 복구', exact: true }).click();
  await expect(page.getByLabel('프로젝트 이름')).toHaveValue('이전 버전 스케치');
});
