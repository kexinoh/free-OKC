/**
 * OKCVM Desktop - Electron Main Process
 */

const { app, BrowserWindow, Menu, Tray, globalShortcut, nativeTheme, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const Store = require('electron-store');
const BackendManager = require('./backend');
const { createMenu, createTrayMenu } = require('./menu');

// 配置存储
const store = new Store({
    defaults: {
        windowBounds: { width: 1400, height: 900 },
        theme: 'system',
        autoStart: false,
        minimizeToTray: true,
    },
});

// 全局变量
let mainWindow = null;
let tray = null;
let backendManager = null;
let isQuitting = false;

// 单实例锁
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        // 如果用户尝试打开第二个实例，聚焦主窗口
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
        }
    });
}

/**
 * 创建主窗口
 */
function createWindow() {
    const { width, height, x, y } = store.get('windowBounds');

    mainWindow = new BrowserWindow({
        width,
        height,
        x,
        y,
        minWidth: 900,
        minHeight: 600,
        title: 'OKCVM',
        icon: getIconPath(),
        show: false, // 先隐藏，准备好后再显示
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false,
        },
    });

    // 设置应用菜单
    Menu.setApplicationMenu(createMenu(mainWindow, backendManager));

    // 开发模式加载本地服务，生产模式等待后端就绪
    const isDev = process.argv.includes('--dev');
    
    if (isDev) {
        // 开发模式：等待后端启动后加载
        backendManager.once('ready', (port) => {
            mainWindow.loadURL(`http://localhost:${port}/ui/`);
            mainWindow.webContents.openDevTools();
        });
    } else {
        // 生产模式：等待后端启动后加载
        backendManager.once('ready', (port) => {
            mainWindow.loadURL(`http://127.0.0.1:${port}/ui/`);
        });
    }

    // 窗口准备好后显示
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    // 保存窗口位置和大小
    mainWindow.on('close', (event) => {
        if (!isQuitting && store.get('minimizeToTray')) {
            event.preventDefault();
            mainWindow.hide();
            return;
        }
        
        // 保存窗口状态
        const bounds = mainWindow.getBounds();
        store.set('windowBounds', bounds);
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    // 外部链接用系统浏览器打开
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    return mainWindow;
}

/**
 * 创建系统托盘
 */
function createTray() {
    const iconPath = getTrayIconPath();
    tray = new Tray(iconPath);
    
    tray.setToolTip('OKCVM');
    tray.setContextMenu(createTrayMenu(mainWindow, backendManager, app));

    // 点击托盘图标显示窗口
    tray.on('click', () => {
        if (mainWindow) {
            if (mainWindow.isVisible()) {
                mainWindow.hide();
            } else {
                mainWindow.show();
                mainWindow.focus();
            }
        }
    });

    return tray;
}

/**
 * 注册全局快捷键
 */
function registerShortcuts() {
    // Cmd/Ctrl + Shift + K: 显示/隐藏窗口
    globalShortcut.register('CommandOrControl+Shift+K', () => {
        if (mainWindow) {
            if (mainWindow.isVisible()) {
                mainWindow.hide();
            } else {
                mainWindow.show();
                mainWindow.focus();
            }
        }
    });

    // Cmd/Ctrl + Shift + N: 新建对话
    globalShortcut.register('CommandOrControl+Shift+N', () => {
        if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
            mainWindow.webContents.send('shortcut', 'new-chat');
        }
    });
}

/**
 * 获取图标路径
 */
function getIconPath() {
    const iconName = process.platform === 'win32' ? 'icon.ico' : 
                     process.platform === 'darwin' ? 'icon.icns' : 'icon.png';
    
    if (app.isPackaged) {
        return path.join(process.resourcesPath, iconName);
    }
    return path.join(__dirname, '..', 'resources', iconName);
}

/**
 * 获取托盘图标路径
 */
function getTrayIconPath() {
    const iconName = process.platform === 'darwin' ? 'trayTemplate.png' : 
                     process.platform === 'win32' ? 'tray.ico' : 'tray.png';
    
    if (app.isPackaged) {
        return path.join(process.resourcesPath, iconName);
    }
    return path.join(__dirname, '..', 'resources', iconName);
}

/**
 * 设置 IPC 处理器
 */
function setupIPC() {
    // 获取后端 URL
    ipcMain.handle('get-backend-url', () => {
        return backendManager.getUrl();
    });

    // 获取后端状态
    ipcMain.handle('get-backend-status', () => {
        return backendManager.getStatus();
    });

    // 重启后端
    ipcMain.handle('restart-backend', async () => {
        await backendManager.restart();
        return backendManager.getStatus();
    });

    // 停止后端
    ipcMain.handle('stop-backend', async () => {
        await backendManager.stop();
        return true;
    });

    // 获取应用版本
    ipcMain.handle('get-app-version', () => {
        return app.getVersion();
    });

    // 获取数据目录
    ipcMain.handle('get-data-dir', () => {
        return app.getPath('userData');
    });

    // 获取应用配置
    ipcMain.handle('get-app-config', (event, key) => {
        return key ? store.get(key) : store.store;
    });

    // 设置应用配置
    ipcMain.handle('set-app-config', (event, key, value) => {
        store.set(key, value);
        return true;
    });

    // 获取系统主题
    ipcMain.handle('get-system-theme', () => {
        return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
    });

    // 打开文件对话框
    ipcMain.handle('show-open-dialog', async (event, options) => {
        const result = await dialog.showOpenDialog(mainWindow, options);
        return result;
    });

    // 保存文件对话框
    ipcMain.handle('show-save-dialog', async (event, options) => {
        const result = await dialog.showSaveDialog(mainWindow, options);
        return result;
    });

    // 显示消息对话框
    ipcMain.handle('show-message-box', async (event, options) => {
        const result = await dialog.showMessageBox(mainWindow, options);
        return result;
    });

    // 读取文件
    ipcMain.handle('read-file', async (event, filePath) => {
        const fs = require('fs').promises;
        const data = await fs.readFile(filePath);
        return Array.from(data);
    });

    // 写入文件
    ipcMain.handle('write-file', async (event, filePath, data) => {
        const fs = require('fs').promises;
        await fs.writeFile(filePath, Buffer.from(data));
        return true;
    });

    // 获取文件信息
    ipcMain.handle('get-file-info', async (event, filePath) => {
        const fs = require('fs').promises;
        const stats = await fs.stat(filePath);
        return {
            size: stats.size,
            isDirectory: stats.isDirectory(),
            isFile: stats.isFile(),
            created: stats.birthtime.toISOString(),
            modified: stats.mtime.toISOString(),
        };
    });

    // 检查更新
    ipcMain.handle('check-for-updates', async () => {
        try {
            const result = await autoUpdater.checkForUpdates();
            return {
                available: result.updateInfo.version !== app.getVersion(),
                version: result.updateInfo.version,
                notes: result.updateInfo.releaseNotes,
            };
        } catch (error) {
            console.error('Update check failed:', error);
            return { available: false, error: error.message };
        }
    });

    // 下载并安装更新
    ipcMain.handle('download-update', async () => {
        try {
            await autoUpdater.downloadUpdate();
            return true;
        } catch (error) {
            console.error('Update download failed:', error);
            return false;
        }
    });

    // 安装更新并重启
    ipcMain.handle('install-update', () => {
        isQuitting = true;
        autoUpdater.quitAndInstall();
    });

    // 在浏览器中打开链接
    ipcMain.handle('open-external', (event, url) => {
        shell.openExternal(url);
    });

    // 在文件管理器中显示文件
    ipcMain.handle('show-item-in-folder', (event, filePath) => {
        shell.showItemInFolder(filePath);
    });

    // 窗口控制
    ipcMain.handle('window-minimize', () => {
        mainWindow?.minimize();
    });

    ipcMain.handle('window-maximize', () => {
        if (mainWindow?.isMaximized()) {
            mainWindow.unmaximize();
        } else {
            mainWindow?.maximize();
        }
    });

    ipcMain.handle('window-close', () => {
        mainWindow?.close();
    });

    ipcMain.handle('window-hide', () => {
        mainWindow?.hide();
    });

    ipcMain.handle('window-show', () => {
        mainWindow?.show();
        mainWindow?.focus();
    });
}

/**
 * 设置自动更新
 */
function setupAutoUpdater() {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('update-available', (info) => {
        if (mainWindow) {
            mainWindow.webContents.send('update-available', info);
        }
    });

    autoUpdater.on('update-downloaded', (info) => {
        if (mainWindow) {
            mainWindow.webContents.send('update-downloaded', info);
        }
    });

    autoUpdater.on('error', (error) => {
        console.error('Auto updater error:', error);
    });
}

/**
 * 监听主题变化
 */
function setupThemeListener() {
    nativeTheme.on('updated', () => {
        const theme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
        if (mainWindow) {
            mainWindow.webContents.send('theme-changed', theme);
        }
    });
}

// 应用启动
app.whenReady().then(async () => {
    console.log('OKCVM Desktop starting...');

    // 创建后端管理器
    backendManager = new BackendManager({
        isDev: process.argv.includes('--dev'),
        dataDir: app.getPath('userData'),
    });

    // 设置 IPC 通信
    setupIPC();

    // 设置自动更新
    setupAutoUpdater();

    // 监听主题变化
    setupThemeListener();

    // 创建系统托盘
    createTray();

    // 注册全局快捷键
    registerShortcuts();

    // 创建主窗口
    createWindow();

    // 启动后端
    try {
        await backendManager.start();
        console.log('Backend started on port:', backendManager.getPort());
    } catch (error) {
        console.error('Failed to start backend:', error);
        dialog.showErrorBox('启动失败', `无法启动后端服务: ${error.message}`);
    }

    // macOS 点击 dock 图标时重新创建窗口
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        } else if (mainWindow) {
            mainWindow.show();
        }
    });
});

// 所有窗口关闭时退出应用（Windows/Linux）
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// 应用退出前清理
app.on('before-quit', async () => {
    isQuitting = true;
    
    // 取消注册快捷键
    globalShortcut.unregisterAll();
    
    // 停止后端
    if (backendManager) {
        await backendManager.stop();
    }
});

// 导出用于测试
module.exports = { createWindow, createTray };
