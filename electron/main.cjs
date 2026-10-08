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

app.on('window-all-closed', () => app.quit());
