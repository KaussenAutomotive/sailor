const { test } = require('node:test');
const assert = require('node:assert/strict');
const { _electron } = require('playwright');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

test('desktop: offline rendering, parameters, native save/open, validation and PNG export', { timeout: 90000 }, async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'sailor-desktop-test-'));
  const profile = path.join(folder, 'profile');
  const designFile = path.join(folder, 'test.sailor.json');
  const imageFile = path.join(folder, 'preview.png');
  let desktop;
  try {
    desktop = await _electron.launch({
      args: [path.resolve(__dirname, '..'), `--user-data-dir=${profile}`],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined },
    });
    const userData = await desktop.evaluate(({ app }) => app.getPath('userData'));
    assert.equal(path.resolve(userData).toLowerCase(), path.resolve(profile).toLowerCase(), 'Tests must use an isolated profile');
    const page = await desktop.firstWindow();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.waitForSelector('canvas');
    await page.getByRole('textbox', { name: 'Entwurfsname' }).fill('Desktop Test');
    await page.getByRole('button', { name: 'Katamaran', exact: true }).click();
    await page.getByRole('button', { name: 'Segel', exact: true }).click();
    await page.getByRole('button', { name: 'Square Top Breiter Segelkopf' }).click();
    const jib = page.getByRole('slider', { name: 'Vorsegel / Fock' });
    await jib.press('Home');
    assert.equal(await jib.inputValue(), '0');
    await desktop.evaluate(({ dialog }, filename) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: filename });
    }, designFile);
    await page.getByRole('button', { name: 'Entwurf speichern', exact: true }).click();
    await page.getByRole('button', { name: 'Gespeichert', exact: true }).waitFor();
    const saved = JSON.parse(await fs.readFile(designFile, 'utf8'));
    assert.equal(saved.name, 'Desktop Test');
    assert.equal(saved.type, 'cat');
    assert.equal(saved.sailShape, 'square');
    assert.equal(saved.jibArea, 0);

    const malformedFile = path.join(folder, 'invalid.json');
    await fs.writeFile(malformedFile, JSON.stringify({ ...saved, mastHeight: 999 }));
    await desktop.evaluate(({ dialog }, filename) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filename] });
    }, malformedFile);
    await page.getByRole('button', { name: 'Entwurf öffnen', exact: true }).click();
    await page.getByRole('alert').waitFor();
    assert.match(await page.getByRole('alert').innerText(), /Ungültiger Wert/);
    assert.equal(await page.getByRole('textbox', { name: 'Entwurfsname' }).inputValue(), 'Desktop Test');
    await page.getByRole('button', { name: 'Meldung schließen' }).click();

    await page.getByRole('textbox', { name: 'Entwurfsname' }).fill('Changed');
    await desktop.evaluate(({ dialog }, filename) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filename] });
    }, designFile);
    await page.getByRole('button', { name: 'Entwurf öffnen', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[aria-label="Entwurfsname"]').value === 'Desktop Test');
    assert.equal(await jib.inputValue(), '0');
    await desktop.evaluate(({ dialog }, filename) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: filename });
    }, imageFile);
    await page.getByRole('button', { name: 'Bildexport', exact: true }).click();
    await page.getByRole('status').filter({ hasText: '3D-Ansicht als PNG exportiert' }).waitFor();
    const png = await fs.readFile(imageFile);
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert.ok(png.length > 10000, 'Rendered image should contain a real boat scene');
    assert.equal(await page.locator('.scene-error').count(), 0);
    assert.deepEqual(errors, []);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Desktop layout must fit the window');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('sailor-studio.design.v1')).name === 'Desktop Test');
    await desktop.close();
    desktop = await _electron.launch({
      args: [path.resolve(__dirname, '..'), `--user-data-dir=${profile}`],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined },
    });
    const restored = await desktop.firstWindow();
    await restored.waitForFunction(() => document.querySelector('[aria-label="Entwurfsname"]')?.value === 'Desktop Test');
    assert.match(await restored.locator('.design-title small').innerText(), /Katamaran/);
    await restored.getByRole('button', { name: 'Segel', exact: true }).click();
    assert.equal(await restored.getByRole('slider', { name: 'Vorsegel / Fock' }).inputValue(), '0');
  } finally {
    if (desktop) await desktop.close();
    await fs.rm(folder, { recursive: true, force: true });
  }
});
