import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.goto('/');
  await expect(page.getByLabel('프로젝트 이름')).toHaveValue('늦은 오후의 스케치');
});

test('edit, undo, persist, and play a melody', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('button', { name: '새로운 스케치' }).click();
  await page.getByLabel('프로젝트 이름').fill('브라우저 테스트');
  const grid = page.locator('.piano-grid');
  await grid.click({ position: { x: 40, y: 200 } });
  await expect(page.locator('.note')).toHaveCount(1);
  await page.getByLabel('선택한 음표 길이').fill('4');
  await page.getByRole('button', { name: '실행 취소', exact: true }).click();
  await expect(page.getByLabel('선택한 음표 길이')).toHaveValue('2');
  await page.getByLabel('kick 1번째 칸', { exact: true }).click();
  await expect(page.getByLabel('kick 1번째 칸', { exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.save-status')).toContainText('브라우저에 저장됨');
  await page.reload();
  await expect(page.getByLabel('프로젝트 이름')).toHaveValue('브라우저 테스트');
  await expect(page.locator('.note')).toHaveCount(1);
  await page.getByRole('button', { name: '재생', exact: true }).click();
  await expect(page.getByRole('button', { name: '재생 정지', exact: true })).toBeVisible();
  await expect(page.locator('.position')).toContainText('02', { timeout: 5000 });
  await page.getByRole('button', { name: '재생 정지', exact: true }).click();
  expect(errors).toEqual([]);
});

test('export MIDI and rendered audio, save and reopen a server project', async ({ page }) => {
  await page.getByRole('button', { name: '내보내기', exact: true }).click();
  const midi = page.waitForEvent('download');
  await page.getByRole('button', { name: 'MIDI 패턴' }).click();
  expect((await midi).suggestedFilename()).toMatch(/\.mid$/);
  const wav = page.waitForEvent('download');
  await page.getByRole('button', { name: '전체 믹스' }).click();
  expect((await wav).suggestedFilename()).toMatch(/-mix\.wav$/);
  await page.getByRole('button', { name: '닫기', exact: true }).click();
  await page.getByRole('button', { name: '프로젝트 서버', exact: true }).click();
  await page.getByRole('button', { name: '현재 프로젝트 저장' }).click();
  await expect(page.locator('.server-state')).toContainText('서버에 저장했습니다');
  await page.locator('.remote-list button').first().click();
  await expect(page.locator('dialog')).toHaveCount(0);
  await expect(page.getByLabel('프로젝트 이름')).toHaveValue('늦은 오후의 스케치');
});

test('record fake microphone, stop, replay and export the voice stem', async ({ page }) => {
  await page.getByRole('button', { name: '녹음 시작', exact: true }).click();
  await expect(page.getByRole('button', { name: '녹음 정지', exact: true })).toBeVisible();
  await expect(page.locator('.position')).toContainText('03', { timeout: 5000 });
  await page.getByRole('button', { name: '녹음 정지', exact: true }).click();
  await expect(page.getByText('녹음한 오디오가 스케치에 담겼어요')).toBeVisible();
  await expect(page.locator('.save-status')).toContainText('브라우저에 저장됨');
  await page.reload();
  await expect(page.getByText('녹음한 오디오가 스케치에 담겼어요')).toBeVisible();
  await page.getByRole('button', { name: '재생', exact: true }).click();
  await expect(page.getByRole('button', { name: '재생 정지', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '재생 정지', exact: true }).click();
  await page.getByRole('button', { name: '내보내기', exact: true }).click();
  const wav = page.waitForEvent('download'); await page.getByRole('button', { name: '오디오 WAV' }).click();
  expect((await wav).suggestedFilename()).toMatch(/-voice\.wav$/);
});

test('desktop and mobile layout stay inside the viewport', async ({ page }) => {
  await expect(page.locator('.save-status')).toContainText('브라우저에 저장됨');
  await page.screenshot({ path: 'test-results/workspace-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: '재생', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/workspace-mobile.png', fullPage: true });
});

test('deletion cancels pending autosave and empty titles remain reloadable', async ({ page }) => {
  await page.getByLabel('프로젝트 이름').fill('삭제할 스케치');
  page.on('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '현재 스케치 삭제' }).click();
  await expect(page.getByLabel('프로젝트 이름')).toHaveValue('새로운 아이디어');
  await expect(page.locator('.save-status')).toContainText('브라우저에 저장됨');
  await page.reload();
  await expect(page.locator('.project-link')).toHaveCount(1);
  await page.getByLabel('프로젝트 이름').fill('');
  await expect(page.locator('.save-status')).toContainText('브라우저에 저장됨');
  await page.reload();
  await expect(page.getByLabel('프로젝트 이름')).toHaveValue('이름 없는 스케치');
});
