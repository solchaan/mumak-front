import { expect, type Page } from '@playwright/test';
export async function login(page: Page) {
  const response = await page.request.post('http://127.0.0.1:3018/api/auth/register', {
    headers: { Authorization: 'Bearer mumak-e2e-login-token' },
    data: { username: 'e2e-user', password: 'e2e-password-12345' },
  });
  expect([201, 409]).toContain(response.status());
  await page.getByLabel('아이디', { exact: true }).fill('e2e-user');
  await page.getByLabel('비밀번호', { exact: true }).fill('e2e-password-12345');
  await page.getByRole('button', { name: '로그인 →' }).click();
  await expect(page.getByLabel('프로젝트 이름')).toBeVisible();
}
