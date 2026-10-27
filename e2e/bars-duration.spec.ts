import { login } from './login-helper';
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', r => r.abort());
  await page.goto('/'); await login(page);
  await page.getByRole('button', { name: '새로운 스케치' }).click();
  await page.getByRole('tab', { name: '오선지 · 코드' }).click();
});

test('append odd and even bars, undo, edit and persist the ninth bar', async ({ page }) => {
  await page.getByRole('button', { name: '+ 마디 추가', exact: true }).click();
  await expect(page.locator('.bar-overview button')).toHaveCount(9);
  await expect(page.getByLabel('오선지 입력 위치').locator('option')).toHaveCount(16);
  await page.getByRole('button', { name: '+ 마디 추가', exact: true }).click();
  await expect(page.getByLabel('오선지 입력 위치').locator('option')).toHaveCount(32);
  await page.getByRole('button', { name: '실행 취소', exact: true }).click();
  await expect(page.locator('.bar-overview button')).toHaveCount(9);
  await page.getByRole('button', { name: '음표 추가', exact: true }).click();
  await expect(page.locator('.staff-note')).toHaveAttribute('data-step', '128');
  await page.getByRole('button', { name: '코드 추가', exact: true }).click();
  await page.getByRole('button', { name: '프로젝트 서버', exact: true }).click();
  await page.getByRole('button', { name: '현재 프로젝트 저장' }).click();
  await expect(page.locator('.server-state')).toContainText('서버에 저장했습니다');
  await expect(page.locator('.save-status')).toContainText('브라우저에 저장됨');
  await page.reload(); await login(page);
  await expect(page.locator('.bar-overview button')).toHaveCount(9);
  await page.locator('.bar-overview button').last().click();
  await page.getByRole('tab', { name: '오선지 · 코드' }).click();
  await expect(page.locator('.staff-note')).toHaveAttribute('data-step', '128');
  await expect(page.locator('.staff-error')).toHaveCount(0);
});

test('hold notes to change duration, undo, cancel, and keep short clicks unchanged', async ({ page }) => {
  await page.getByRole('button', { name: '음표 추가', exact: true }).click();
  await page.locator('.staff-note').click();
  await expect(page.getByRole('dialog', { name: '음표 길이 변경' })).toHaveCount(0);
  await page.locator('.staff-note').click({ delay: 650 });
  const menu = page.getByRole('dialog', { name: '음표 길이 변경' });
  await expect(menu).toBeVisible();
  await menu.getByRole('button', { name: '2분음표', exact: true }).click();
  await expect(page.getByLabel('선택한 음표 길이', { exact: true })).toHaveValue('8');
  await page.getByRole('button', { name: '실행 취소', exact: true }).click();
  await expect(page.getByLabel('선택한 음표 길이', { exact: true })).toHaveValue('4');
  await page.getByRole('tab', { name: '피아노 롤', exact: true }).click();
  await page.locator('.note').click({ delay: 650 });
  await expect(menu).toBeVisible();
  await menu.getByRole('button', { name: '온음표', exact: true }).click();
  await expect(page.getByLabel('선택한 음표 길이', { exact: true })).toHaveValue('16');
  await page.locator('.note').focus(); await page.keyboard.press('Enter');
  await expect(menu).toBeVisible(); await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
});

test('long press cancels on movement, bounds lengths and prints an odd final bar', async ({ page }) => {
  await page.getByRole('button', { name: '+ 마디 추가', exact: true }).click();
  await page.getByLabel('오선지 입력 위치').selectOption('15');
  await page.getByLabel('오선지 음표 길이').selectOption('1');
  await page.getByRole('button', { name: '음표 추가', exact: true }).click();
  await page.locator('.staff-note').click({ delay: 650 });
  const menu = page.getByRole('dialog', { name: '음표 길이 변경' });
  await expect(menu.getByRole('button', { name: '온음표', exact: true })).toBeDisabled();
  await expect(menu.getByRole('button', { name: '16분음표', exact: true })).toBeEnabled();
  await page.keyboard.press('Escape');
  await page.getByRole('tab', { name: '피아노 롤', exact: true }).click();
  const box = (await page.locator('.note').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down(); await page.mouse.move(box.x - 30, box.y + box.height / 2);
  await page.waitForTimeout(600); await page.mouse.up();
  await expect(menu).toHaveCount(0);
  await page.getByRole('button', { name: '내보내기', exact: true }).click();
  await page.getByRole('button', { name: /악보 PDF/ }).click();
  await expect(page.locator('.print-system svg')).toHaveCount(5);
  await expect(page.locator('.staff-error')).toHaveCount(0);
});

test('playback, loop and WAV export use the extended timeline', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const audioPath = '/src/audio.ts', modelPath = '/src/model.ts';
    const { AudioEngine } = await import(audioPath);
    const { createProject } = await import(modelPath);
    const p = { ...createProject(), bars: 9, bpm: 240 };
    const engine = new AudioEngine();
    let step = -1, ended = false;
    engine.onStep = (s: number) => { step = s; };
    engine.onEnd = () => { ended = true; };
    await engine.play(p, false, false);
    engine.startAt = engine.context.currentTime - 8.2; engine.tick();
    const ninthBar = step >= 128 && !ended;
    engine.startAt = engine.context.currentTime - 9.2; engine.tick();
    const stopped = ended;
    await engine.play(p, true, false);
    engine.startAt = engine.context.currentTime - 9.2; engine.tick();
    const loopStep = step; engine.stop();
    const wav = await engine.exportWav(p);
    const data = new DataView(await wav.arrayBuffer());
    const seconds = data.getUint32(40, true) / data.getUint32(28, true);
    engine.dispose();
    return { ninthBar, stopped, loopStep, seconds };
  });
  expect(result.ninthBar).toBe(true); expect(result.stopped).toBe(true);
  expect(result.loopStep).toBeGreaterThanOrEqual(0); expect(result.loopStep).toBeLessThan(16);
  expect(result.seconds).toBe(10);
});
