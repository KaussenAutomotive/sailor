const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');

const dev = process.argv.includes('--dev');
let mainWindow;

app.whenReady().then(() => {
  mainWindow = new BrowserWindow({
    width: 1540,
    height: 980,
    minWidth: 1080,
    minHeight: 720,
    backgroundColor: '#f4f6f8',
    title: 'Sailor Studio',
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  mainWindow.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  if (dev) mainWindow.loadURL('http://127.0.0.1:5173');
  else mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
});

ipcMain.handle('design:save', async (event, content) => {
  if (event.sender !== mainWindow?.webContents) throw new Error('Unbekanntes Fenster.');
  if (typeof content !== 'string' || Buffer.byteLength(content) > 65536) throw new Error('Ungültiger Entwurf.');
  JSON.parse(content);
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Bootsentwurf speichern',
    defaultPath: 'Mein Segelboot.sailor.json',
    filters: [{ name: 'Sailor Entwurf', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePath) return false;
  await fs.writeFile(result.filePath, content, 'utf8');
  return true;
});

ipcMain.handle('design:open', async (event) => {
  if (event.sender !== mainWindow?.webContents) throw new Error('Unbekanntes Fenster.');
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Bootsentwurf öffnen',
    properties: ['openFile'],
    filters: [{ name: 'Sailor Entwurf', extensions: ['json'] }],
  });
  if (result.canceled) return null;
  const stat = await fs.stat(result.filePaths[0]);
  if (stat.size > 65536) throw new Error('Die Entwurfsdatei ist zu groß (max. 64 KB).');
  return fs.readFile(result.filePaths[0], 'utf8');
});

ipcMain.handle('image:save', async (event, dataUrl) => {
  if (event.sender !== mainWindow?.webContents) throw new Error('Unbekanntes Fenster.');
  if (typeof dataUrl !== 'string' || dataUrl.length > 32 * 1024 * 1024 ||
      !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(dataUrl)) throw new Error('Ungültiges oder zu großes PNG-Bild.');
  const image = Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64');
  if (!image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('Keine gültige PNG-Datei.');
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '3D-Ansicht exportieren',
    defaultPath: 'Bootsentwurf.png',
    filters: [{ name: 'PNG-Bild', extensions: ['png'] }],
  });
  if (result.canceled || !result.filePath) return false;
  await fs.writeFile(result.filePath, image);
  return true;
});

ipcMain.handle('step:save', async (event, content) => {
  if (event.sender !== mainWindow?.webContents) throw new Error('Unbekanntes Fenster.');
  if (typeof content !== 'string' || Buffer.byteLength(content) > 64 * 1024 * 1024 ||
      !content.startsWith('ISO-10303-21;') || !content.trimEnd().endsWith('END-ISO-10303-21;')) {
    throw new Error('Ungueltige oder zu grosse STEP-Datei.');
  }
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Rumpfschale als STEP exportieren',
    defaultPath: 'Modellsegler.step',
    filters: [{ name: 'STEP CAD', extensions: ['step', 'stp'] }],
  });
  if (result.canceled || !result.filePath) return false;
  await fs.writeFile(result.filePath, content, 'utf8');
  return true;
});

app.on('window-all-closed', () => app.quit());
