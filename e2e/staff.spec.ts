import { login } from './login-helper';
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', r => r.abort());
  await page.goto('/'); await login(page);
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

test('add, edit, persist and delete a chord symbol without touching melody notes', async ({ page }) => {
  await page.getByLabel('코드 이름', { exact: true }).fill('Bbmaj7');
  await page.getByLabel('오선지 음표 길이').selectOption('8');
  await page.getByRole('button', { name: '코드 추가', exact: true }).click();
  await expect(page.locator('.staff-chord')).toContainText('Bbmaj7');
  await expect(page.locator('.staff-note')).toHaveCount(0);
  await expect(page.locator('.staff-error')).toHaveCount(0);
  await page.getByLabel('프로젝트 이름').fill('오선지 저장 테스트');
  await page.getByRole('button', { name: '프로젝트 서버', exact: true }).click();
  await page.getByRole('button', { name: '현재 프로젝트 저장' }).click();
  await expect(page.locator('.server-state')).toContainText('서버에 저장했습니다');
  await page.locator('.remote-list button').filter({ hasText: '오선지 저장 테스트' }).first().click();
  await expect(page.locator('.staff-chord')).toContainText('Bbmaj7');
  await expect(page.locator('.save-status')).toContainText('브라우저에 저장됨');
  await page.reload(); await login(page);
  await page.getByRole('tab', { name: '오선지 · 코드' }).click();
  await expect(page.locator('.staff-chord')).toContainText('Bbmaj7');
  await page.locator('.staff-chord').click();
  await page.getByLabel('코드 이름', { exact: true }).fill('Am');
  await page.getByRole('button', { name: '코드 수정', exact: true }).click();
  await expect(page.locator('.staff-note')).toHaveCount(0);
  await expect(page.locator('.staff-chord')).toContainText('Am');
  await page.getByRole('button', { name: '코드 삭제', exact: true }).click();
  await expect(page.locator('.staff-chord')).toHaveCount(0);
  await page.getByRole('button', { name: '실행 취소', exact: true }).click();
  await expect(page.locator('.staff-chord')).toContainText('Am');
  // Clicking the chord line above bar 2 moves the cursor there and focuses the chord name; melody notes stay independent.
  await page.locator('.staff-overlay').click({ position: { x: 314, y: 245 } });
  await expect(page.getByLabel('코드 이름', { exact: true })).toBeFocused();
  await expect(page.getByLabel('오선지 입력 위치')).toHaveValue('20');
  await page.getByLabel('코드 이름', { exact: true }).fill('G7');
  await page.getByRole('button', { name: '코드 추가', exact: true }).click();
  await expect(page.locator('.staff-chord')).toHaveCount(2);
  await page.getByLabel('오선지 입력 음높이').selectOption('F4');
  await page.getByRole('button', { name: '음표 추가', exact: true }).click();
  await expect(page.locator('.staff-note')).toHaveCount(1);
  await expect(page.locator('.staff-chord')).toHaveCount(2);
  await page.locator('.staff-note').first().focus(); await page.keyboard.press('Delete');
  await expect(page.locator('.staff-note')).toHaveCount(0);
  await expect(page.locator('.staff-chord')).toHaveCount(2);
  await expect(page.locator('.staff-error')).toHaveCount(0);
});

test('server chord suggestions apply a single chord and a whole progression', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.getByLabel('오선지 음표 길이').selectOption('16');
  await page.getByRole('button', { name: '코드 추천', exact: true }).click();
  await expect(page.locator('.chord-suggestions-head strong')).toHaveText('C 장조');
  await expect(page.locator('.chord-chip').first()).toContainText('C');
  await page.locator('.chord-chip').first().click();
  await expect(page.locator('.staff-chord')).toContainText('C');
  await expect(page.locator('.staff-note')).toHaveCount(0);
  await expect(page.locator('.staff-error')).toHaveCount(0);
  // Suggesting again from bar 2 ranks a chord that follows C; applying it replaces nothing since bar 2 is empty.
  await page.getByLabel('오선지 입력 위치').selectOption('16');
  await page.getByRole('button', { name: '코드 추천', exact: true }).click();
  await expect(page.locator('.chord-suggestions-head')).toContainText('직전 C (I)');
  await page.locator('.chord-chip').first().click();
  await expect(page.locator('.staff-chord')).toHaveCount(2);
  await page.getByRole('button', { name: 'C – G – Am – F 적용', exact: true }).click();
  await expect(page.locator('.staff-chord')).toHaveCount(2);
  await expect(page.locator('.staff-chord').nth(1)).toContainText('G');
  await page.locator('.bar-overview button').nth(6).click();
  await expect(page.locator('.staff-chord').nth(0)).toContainText('Am');
  await expect(page.locator('.staff-chord').nth(1)).toContainText('F');
  // Asking again now analyses the whole progression: roman numerals plus study tips.
  await page.getByRole('button', { name: '코드 추천', exact: true }).click();
  await expect(page.locator('.chord-analysis em')).toHaveCount(8);
  await expect(page.locator('.chord-analysis em').first()).toHaveText('I');
  const tips = page.getByRole('list', { name: '코드 진행 팁' });
  await expect(tips.locator('li.tip-good', { hasText: 'I–V–vi–IV' })).toHaveCount(1);
  await expect(tips.locator('li')).toContainText(['마지막 코드 F']);
  await expect(page.locator('.staff-error')).toHaveCount(0);
  await expect(page.locator('.save-status')).toContainText('브라우저에 저장됨');
  expect(errors).toEqual([]);
});

test('a key signature drives accidentals, pins suggestions and persists', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.getByLabel('조표', { exact: true }).selectOption('G|major');
  await expect(page.locator('.staff-range')).toContainText('G 장조 (♯1)');
  await expect(page.locator('.staff-engraving .vf-keysignature')).toHaveCount(2);
  // With the accidental mode left on "조표대로", an F line becomes F# automatically.
  await page.getByLabel('오선지 입력 음높이').selectOption('F4');
  await page.getByRole('button', { name: '음표 추가', exact: true }).click();
  await expect(page.locator('.staff-note')).toHaveAttribute('data-pitch', '66');
  await expect(page.locator('.staff-note')).toHaveAttribute('aria-label', /F#4/);
  await page.getByRole('button', { name: '제자리표', exact: true }).click();
  await page.getByLabel('오선지 입력 위치').selectOption('4');
  await page.getByRole('button', { name: '음표 추가', exact: true }).click();
  await expect(page.locator('.staff-note').nth(1)).toHaveAttribute('data-pitch', '65');
  await expect(page.locator('.staff-error')).toHaveCount(0);
  await page.getByRole('button', { name: '코드 추천', exact: true }).click();
  await expect(page.locator('.chord-suggestions-head strong')).toHaveText('G 장조');
  await expect(page.locator('.chord-suggestions-head')).toContainText('지정 조성');
  await expect(page.locator('.chord-chip').first()).toContainText('G');
  await expect(page.locator('.save-status')).toContainText('브라우저에 저장됨');
  await page.reload(); await login(page);
  await page.getByRole('tab', { name: '오선지 · 코드' }).click();
  await expect(page.getByLabel('조표', { exact: true })).toHaveValue('G|major');
  await expect(page.locator('.staff-note')).toHaveCount(2);
  await page.getByLabel('조표', { exact: true }).selectOption('Gb|major');
  await expect(page.locator('.staff-error')).toHaveCount(0);
  await expect(page.locator('.staff-engraving svg')).toBeVisible();
  expect(errors).toEqual([]);
});

test('chord name autocomplete filters by substring and picks with keyboard or mouse', async ({ page }) => {
  const input = page.getByLabel('코드 이름', { exact: true });
  await input.fill('m7b');
  const list = page.getByRole('listbox', { name: '코드 자동완성' });
  await expect(list).toBeVisible();
  await expect(list.getByRole('option').first()).toContainText('Cm7b5');
  await list.getByRole('option', { name: /^Dm7b5/ }).click();
  await expect(input).toHaveValue('Dm7b5');
  await expect(list).toHaveCount(0);
  // Hovering highlights an option, so park the mouse elsewhere before navigating with the keyboard.
  await page.mouse.move(5, 5);
  await input.fill('g');
  await expect(list.getByRole('option').first()).toContainText('G');
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown');
  await expect(list.getByRole('option').nth(1)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Enter');
  await expect(input).toHaveValue('Gm');
  await page.keyboard.press('Enter');
  await expect(page.locator('.staff-chord')).toContainText('Gm');
  await input.fill('zzz');
  await expect(list).toHaveCount(0);
  // With a key signature, that key's diatonic chords lead the list with roman numerals.
  await page.getByLabel('조표', { exact: true }).selectOption('F|major');
  await input.fill('');
  await input.focus();
  await expect(list.getByRole('option').first()).toContainText('F');
  await expect(list.getByRole('option').first()).toContainText('I');
  await expect(page.locator('.staff-error')).toHaveCount(0);
});

test('score view can add the generated accompaniment grand staff or show it alone', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const clefs = page.locator('.staff-engraving .vf-clef'), notes = page.locator('.staff-engraving .vf-stavenote');
  await expect(clefs).toHaveCount(2);
  await page.getByLabel('오선지 음표 길이').selectOption('16');
  await page.getByLabel('코드 이름', { exact: true }).fill('C');
  await page.getByRole('button', { name: '코드 추가', exact: true }).click();
  await expect(page.locator('.staff-chord')).toContainText('C');
  await expect(notes).toHaveCount(2, { timeout: 5000 }); // two whole-bar rests on the vocal stave
  await page.getByLabel('악보 표시').selectOption('both');
  await expect(clefs).toHaveCount(6);
  // Four-beat comping: four chord hits and four bass notes in bar 1, rests in bar 2, plus the two vocal rests.
  await expect(notes).toHaveCount(12);
  await page.getByLabel('반주 패턴').selectOption('whole');
  await expect(page.locator('.save-status')).toContainText('저장 중');
  await expect(notes).toHaveCount(6);
  await page.getByLabel('악보 표시').selectOption('accompaniment');
  await expect(clefs).toHaveCount(4);
  await expect(notes).toHaveCount(4);
  // The accompaniment staves are not editable: clicking them adds no melody note.
  await page.locator('.staff-overlay').click({ position: { x: 314, y: 100 } });
  await expect(page.locator('.staff-note')).toHaveCount(0);
  await page.getByLabel('악보 표시').selectOption('melody');
  await expect(clefs).toHaveCount(2);
  await expect(page.locator('.staff-chord')).toContainText('C');
  await expect(page.locator('.save-status')).toContainText('브라우저에 저장됨');
  await page.reload(); await login(page);
  await page.getByRole('tab', { name: '오선지 · 코드' }).click();
  await expect(page.getByLabel('반주 패턴')).toHaveValue('whole');
  await expect(page.locator('.staff-error')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('score PDF export opens a printable lead sheet and hands it to the print dialog', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.evaluate(() => { const w = window as unknown as { __prints: number; print: () => void }; w.__prints = 0; w.print = () => { w.__prints++; }; });
  await page.getByLabel('프로젝트 이름').fill('인쇄 테스트');
  await page.getByLabel('조표', { exact: true }).selectOption('F|major');
  await page.getByLabel('오선지 음표 길이').selectOption('16');
  await page.getByLabel('코드 이름', { exact: true }).fill('Bbmaj7');
  await page.getByRole('button', { name: '코드 추가', exact: true }).click();
  await page.getByLabel('오선지 음표 길이').selectOption('4');
  await page.getByLabel('오선지 입력 음높이').selectOption('A4');
  await page.getByRole('button', { name: '음표 추가', exact: true }).click();
  await page.getByRole('button', { name: '내보내기', exact: true }).click();
  await page.getByRole('button', { name: '악보 PDF' }).click();
  const sheet = page.getByRole('dialog', { name: '악보 인쇄' });
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('h1')).toHaveText('인쇄 테스트');
  await expect(sheet.locator('.print-system .vf-stave')).toHaveCount(8); // four systems of two bars, melody only
  await expect(sheet.locator('.print-system .vf-keysignature')).toHaveCount(4);
  await expect(sheet.locator('.print-system text', { hasText: 'Bbmaj7' })).toHaveCount(1);
  await expect(page).toHaveTitle(/인쇄 테스트 악보/);
  await sheet.getByLabel('인쇄 악보 표시').selectOption('both');
  await expect(sheet.locator('.print-system .vf-stave')).toHaveCount(24);
  await sheet.getByRole('button', { name: 'PDF로 저장' }).click();
  expect(await page.evaluate(() => (window as unknown as { __prints: number }).__prints)).toBe(1);
  // Print media must keep the sheet (and only the sheet) on the page; a blank print is only ~1 KB.
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.sidebar')).toBeHidden();
  await expect(sheet.locator('.print-system svg').first()).toBeVisible();
  const pdf = await page.pdf({ format: 'A4' });
  expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  expect(pdf.length).toBeGreaterThan(20_000);
  await page.emulateMedia({ media: 'screen' });
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(page).toHaveTitle(/Mumak/);
  expect(errors).toEqual([]);
});

test('chord suggestions report a missing server instead of failing silently', async ({ page }) => {
  await page.route('**/api/harmony/suggest', route => route.abort());
  await page.getByRole('button', { name: '코드 추천', exact: true }).click();
  await expect(page.locator('.staff-error')).toContainText('프로젝트 서버 연결이 필요');
  await expect(page.locator('.chord-suggestions')).toHaveCount(0);
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
