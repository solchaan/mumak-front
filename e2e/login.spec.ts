import { test, expect } from '@playwright/test';
import { login } from './login-helper';

test('login blocks direct entry, rejects invalid credentials and clears on reload and logout', async ({ page }) => {
  await page.goto('/workspace');
  await expect(page.getByRole('heading', { name: '내 작업실에 로그인' })).toBeVisible();
  await expect(page.getByLabel('프로젝트 이름')).toHaveCount(0);
  await page.getByLabel('아이디', { exact: true }).fill('unknown-user');
  await page.getByLabel('비밀번호', { exact: true }).fill('wrong-password');
  await page.getByRole('button', { name: '로그인 →' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByLabel('프로젝트 이름')).toHaveCount(0);
  await login(page);
  await page.reload();
  await expect(page.getByLabel('비밀번호', { exact: true })).toBeVisible();
  await expect(page.getByLabel('프로젝트 이름')).toHaveCount(0);
  await login(page);
  await page.getByRole('button', { name: '로그아웃' }).click();
  await expect(page.getByLabel('비밀번호', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('프로젝트 이름')).toHaveCount(0);
});
