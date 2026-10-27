import { login } from './login-helper';
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.goto('/'); await login(page);
  await page.getByRole('button', { name: '새로운 스케치', exact: true }).click();
  await page.getByRole('tab', { name: '오선지 · 코드' }).click();
  await page.getByLabel('조표', { exact: true }).selectOption('C|major');
  await page.getByLabel('오선지 음표 길이').selectOption('16');
  await page.getByLabel('코드 이름', { exact: true }).fill('C');
  await page.getByRole('button', { name: '코드 추가', exact: true }).click();
  await page.getByLabel('오선지 음표 길이').selectOption('8');
  await page.getByLabel('오선지 입력 음높이').selectOption('F4');
  await page.getByRole('button', { name: '음표 추가', exact: true }).click();
});

test('review locates tension, auditions without mutation, applies and undoes an alternative', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const panel = page.getByRole('region', { name: '코드·멜로디 평가' });
  const request = page.waitForRequest('**/api/harmony/review');
  await panel.getByRole('button', { name: '스케치 평가', exact: true }).click();
  const body = (await request).postDataJSON();
  expect(body.recording).toBeUndefined(); expect(body.title).toBeUndefined();
  await expect(panel.getByRole('list', { name: '확인해 볼 부분' })).toContainText('C와 F4');
  await panel.getByRole('button', { name: /F4 → E4 대안 듣기/ }).click();
  await expect(page.getByRole('button', { name: '재생 정지', exact: true })).toBeVisible();
  await expect(page.locator('.staff-note')).toHaveAttribute('data-pitch', '65');
  await panel.getByRole('button', { name: '비교 재생 정지' }).click();
  await panel.getByRole('button', { name: /F4 → E4 적용/ }).click();
  await expect(page.locator('.staff-note')).toHaveAttribute('data-pitch', '64');
  await expect(panel.getByText(/스케치가 변경되어/)).toBeVisible();
  await expect(panel.getByRole('button', { name: /대안 듣기/ })).toBeDisabled();
  await page.getByRole('button', { name: '실행 취소', exact: true }).click();
  await expect(page.locator('.staff-note')).toHaveAttribute('data-pitch', '65');
  await expect(panel.getByRole('button', { name: /대안 듣기/ })).toBeEnabled();
  await panel.getByRole('button', { name: '1마디 1박 보기', exact: true }).click();
  await expect(page.locator('.staff-note')).toHaveClass(/selected/);
  await panel.getByRole('button', { name: /F4 → E4 대안 듣기/ }).click();
  await page.getByLabel('조표', { exact: true }).selectOption('G|major');
  await expect(page.getByRole('button', { name: '재생', exact: true })).toBeVisible();
  await expect(panel.getByText(/듣는 중/)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('late results are rejected after edits and server errors stay visible', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/harmony/review', async route => { await gate; await route.continue(); });
  const request = page.waitForRequest('**/api/harmony/review');
  await page.getByRole('button', { name: '스케치 평가', exact: true }).click();
  await request;
  await page.getByLabel('조표', { exact: true }).selectOption('G|major');
  release();
  await expect(page.getByRole('alert')).toContainText('분석 중 스케치가 바뀌었습니다');
  await expect(page.locator('.review-result')).toHaveCount(0);
  await page.unroute('**/api/harmony/review');
  await page.route('**/api/harmony/review', route => route.abort());
  await page.getByRole('button', { name: '스케치 평가', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('평가를 불러오지 못했습니다');
});

test('review remains usable on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '스케치 평가', exact: true }).click();
  await expect(page.locator('.review-alternatives')).toContainText('F4 → E4');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
