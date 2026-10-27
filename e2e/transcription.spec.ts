import { test, expect, type Page } from '@playwright/test';
import { createProject } from '../src/model';
import { encodeWav } from '../src/wav';

async function loadRecording(page: Page, silence = false, broken = false) {
  const rate = 44100, samples = new Float32Array(rate * 2);
  if (!silence) for (const [pitch, begin, end] of [[48, .2, .7], [52, .9, 1.4]]) {
    const frequency = 440 * 2 ** ((pitch - 69) / 12);
    for (let i = Math.round(begin * rate); i < end * rate; i++) {
      const t = i / rate, phase = 2 * Math.PI * frequency * t;
      const envelope = Math.min(1, (t - begin) / .02, (end - t) / .02);
      samples[i] = envelope * (.15 * Math.sin(phase) + .1 * Math.sin(phase * 2));
    }
  }
  const p = createProject(); p.bpm = 120; p.title = '허밍 변환 테스트';
  p.notes = [{ id: crypto.randomUUID(), pitch: 67, step: 0, length: 4, velocity: .7 }];
  p.recording = { dataUrl: 'data:audio/wav;base64,' + (broken ? 'AAAA' : Buffer.from(encodeWav([samples], rate)).toString('base64')), duration: 2, offset: 16 };
  await page.locator('input[type=file]').setInputFiles({ name: 'humming.mumak.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(p)) });
  await expect(page.getByLabel('프로젝트 이름')).toHaveValue('허밍 변환 테스트');
}

test.beforeEach(async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', r => r.abort());
  await page.goto('/');
});

test('recording converts locally, previews, appends beyond eight bars and persists with undo', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await loadRecording(page);
  await page.getByRole('button', { name: '녹음을 음표로 변환', exact: true }).click();
  const modal = page.getByRole('dialog', { name: '녹음을 음표로 변환' });
  await expect(modal.getByRole('status')).toContainText('2개 음표');
  await expect(modal.getByRole('status')).toContainText('1마디 자동 추가');
  await expect(page.getByLabel('변환 옥타브')).toHaveValue('1');
  await expect(page.getByLabel('변환한 음표')).toContainText('C4');
  await modal.getByRole('button', { name: '변환 멜로디 듣기', exact: true }).click();
  await expect(modal.getByRole('button', { name: '미리 듣기 정지', exact: true })).toBeVisible();
  await modal.getByRole('button', { name: '미리 듣기 정지', exact: true }).click();
  await page.getByLabel('변환 옥타브').selectOption('0');
  await expect(modal.getByRole('button', { name: '오선지에 추가' })).toBeDisabled();
  await page.getByLabel('변환 옥타브').selectOption('1');
  await modal.getByRole('button', { name: '오선지에 추가' }).click();
  await expect(modal).toHaveCount(0);
  await expect(page.locator('.bar-overview button')).toHaveCount(9);
  await expect(page.locator('.staff-note')).toHaveCount(2);
  await expect(page.getByLabel('voice 음소거')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '실행 취소', exact: true }).click();
  await expect(page.locator('.bar-overview button')).toHaveCount(8);
  await expect(page.getByLabel('voice 음소거')).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: '다시 실행', exact: true }).click();
  await expect(page.locator('.bar-overview button')).toHaveCount(9);
  await expect(page.locator('.save-status')).toContainText('브라우저에 저장됨');
  await page.reload(); await page.locator('.bar-overview button').last().click();
  await expect(page.locator('.staff-note')).toHaveCount(2);
  await page.locator('.bar-overview button').first().click();
  await expect(page.locator('.staff-note')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('silent recording produces guidance without modifying the project', async ({ page }) => {
  await loadRecording(page, true);
  await page.getByRole('button', { name: '녹음을 음표로 변환', exact: true }).click();
  const modal = page.getByRole('dialog', { name: '녹음을 음표로 변환' });
  await expect(modal.getByRole('status')).toContainText('멜로디를 찾지 못했어요');
  await expect(modal.getByRole('button', { name: '오선지에 추가' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(modal).toHaveCount(0); await expect(page.locator('.bar-overview button')).toHaveCount(8);
});

test('cancel and decoding failure leave the recording and original notes intact', async ({ page }) => {
  await loadRecording(page);
  await page.getByRole('button', { name: '녹음을 음표로 변환', exact: true }).click();
  await page.getByRole('button', { name: '변환 닫기' }).click();
  await expect(page.locator('.staff-note')).toHaveCount(1);
  await expect(page.getByLabel('voice 음소거')).toHaveAttribute('aria-pressed', 'false');
  await loadRecording(page, false, true);
  await page.getByRole('button', { name: '녹음을 음표로 변환', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('녹음을 읽지 못했습니다');
  await page.getByRole('button', { name: '변환 닫기' }).click();
  await expect(page.locator('.staff-note')).toHaveCount(1);
});
