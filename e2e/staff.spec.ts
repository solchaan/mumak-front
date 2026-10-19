import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', r => r.abort());
  await page.goto('/');
  await page.getByRole('button', { name: '새로운 스케치' }).click();
  await page.getByRole('tab', { name: '오선지 · 코드' }).click();
  await expect(page.locator('.staff-engraving svg')).toBeVisible();
  await expect(page.locator('.staff-error')).toHaveCount(0);
});

test('staff notes, accidentals, ties and piano roll share editable notes', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.getByLabel('오선지 입력 음높이').selectOption('F4');
  await page.getByRole('button', { name: '올림표', exact: true }).click();
  await page.getByLabel('오선지 음표 길이').selectOption('4');
  await page.getByRole('button', { name: '음표 추가', exact: true }).click();
  await expect(page.locator('.staff-note')).toHaveCount(1);
  await expect(page.locator('.staff-note')).toHaveAttribute('data-pitch', '66');
  await page.getByRole('tab', { name: '피아노 롤', exact: true }).click();
  await expect(page.locator('.note')).toHaveCount(1);
  await page.getByLabel('선택한 음표 길이').fill('20');
  await page.getByRole('tab', { name: '오선지 · 코드' }).click();
  await expect(page.locator('.staff-note')).toHaveCount(2);
  await expect(page.locator('.staff-error')).toHaveCount(0);
  await page.locator('.staff-note').first().focus();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('.staff-note').first()).toHaveAttribute('data-pitch', '67');
  await page.keyboard.press('Delete');
  await expect(page.locator('.staff-note')).toHaveCount(0);
  // Click the C5 space at step 4 directly on the staff.
  await page.getByRole('button', { name: '제자리표', exact: true }).click();
  await page.locator('.staff-overlay').click({ position: { x: 314, y: 100 } });
  await expect(page.locator('.staff-note')).toHaveAttribute('data-pitch', '72');
  expect(errors).toEqual([]);
});

test('add, edit, persist and delete a chord with its notes', async ({ page }) => {
  await page.getByLabel('코드 이름', { exact: true }).fill('Bbmaj7');
  await page.getByLabel('오선지 음표 길이').selectOption('8');
  await page.getByRole('button', { name: '코드 추가', exact: true }).click();
  await expect(page.locator('.staff-chord')).toContainText('Bbmaj7');
  await expect(page.locator('.staff-note')).toHaveCount(4);
  await expect(page.locator('.staff-error')).toHaveCount(0);
  await page.getByLabel('프로젝트 이름').fill('오선지 저장 테스트');
  await page.getByRole('button', { name: '프로젝트 서버', exact: true }).click();
  await page.getByRole('button', { name: '현재 프로젝트 저장' }).click();
  await expect(page.locator('.server-state')).toContainText('서버에 저장했습니다');
  await page.locator('.remote-list button').filter({ hasText: '오선지 저장 테스트' }).first().click();
  await expect(page.locator('.staff-chord')).toContainText('Bbmaj7');
  await expect(page.locator('.save-status')).toContainText('브라우저에 저장됨');
  await page.reload();
  await page.getByRole('tab', { name: '오선지 · 코드' }).click();
  await expect(page.locator('.staff-chord')).toContainText('Bbmaj7');
  await page.locator('.staff-chord').click();
  await page.getByLabel('코드 이름', { exact: true }).fill('Am');
  await page.getByRole('button', { name: '코드 수정', exact: true }).click();
  await expect(page.locator('.staff-note')).toHaveCount(3);
  await expect(page.locator('.staff-chord')).toContainText('Am');
  await page.getByRole('button', { name: '코드 삭제', exact: true }).click();
  await expect(page.locator('.staff-note')).toHaveCount(0);
  await page.getByRole('button', { name: '실행 취소', exact: true }).click();
  await expect(page.locator('.staff-chord')).toContainText('Am');
  await page.locator('.staff-note').first().focus(); await page.keyboard.press('ArrowUp');
  await expect(page.locator('.staff-chord')).toHaveCount(0);
  await expect(page.locator('.staff-note')).toHaveCount(3);
});

test('staff handles invalid chords and narrow screens', async ({ page }) => {
  await page.getByLabel('코드 이름', { exact: true }).fill('H7');
  await page.getByRole('button', { name: '코드 추가', exact: true }).click();
  await expect(page.locator('.staff-error')).toContainText('코드를 확인');
  await page.getByLabel('코드 이름', { exact: true }).fill('Cdim7');
  await page.getByRole('button', { name: '코드 추가', exact: true }).click();
  await expect(page.locator('.staff-error')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/staff-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/staff-mobile.png', fullPage: true });
});
