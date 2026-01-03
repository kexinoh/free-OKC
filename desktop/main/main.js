/**
 * OKCVM Desktop - Electron Main Process
 */

const { app, BrowserWindow, Menu, Tray, globalShortcut, nativeTheme, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const Store = require('electron-store');
const BackendManager = require('./backend');
const { createMenu, createTrayMenu } = require('./menu');
const logger = require('./logger');

// 配置存储
const store = new Store({
    defaults: {
        windowBounds: { width: 1400, height: 900 },
        theme: 'system',
        autoStart: false,
        minimizeToTray: true,
        askBeforeClose: true,  // 关闭窗口前是否询问
        closeToTray: false,     // 默认关闭行为（false=退出，true=最小化到托盘）
    },
});

// 全局变量
let mainWindow = null;
let tray = null;
let backendManager = null;
let isQuitting = false;

// 托盘退出确认状态
let trayExitClickCount = 0;
let trayExitTimer = null;

// 单实例锁
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    // 立即退出，不再执行后续代码
    app.quit();
    // 注意：app.quit() 是异步的，使用 process.exit() 确保立即退出
    // 但这会跳过清理，所以我们用一个标志来阻止后续初始化
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

// 如果没有获得锁，立即退出进程（不能在模块顶层使用 return）
if (!gotTheLock) {
    process.exit(0);
}

/**
 * 创建主窗口
 */
function createWindow() {
    const { width, height, x, y } = store.get('windowBounds');

    logger.info('Creating main window...');

    // 🔥 验证 preload 脚本路径
    const preloadPath = path.join(__dirname, 'preload.js');
    logger.info(`Preload script path: ${preloadPath}`);

    const fs = require('fs');
    if (fs.existsSync(preloadPath)) {
        logger.info('✅ Preload script exists');
    } else {
        logger.error('❌ Preload script NOT FOUND!');
    }

    mainWindow = new BrowserWindow({
        width,
        height,
        x,
        y,
        minWidth: 900,
        minHeight: 600,
        title: 'OKCVM',
        icon: getIconPath(),
        autoHideMenuBar: true,  // 隐藏菜单栏
        show: false, // 先隐藏，准备好后再显示
        webPreferences: {
            preload: preloadPath,
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false,
            webviewTag: true,  // 允许使用 webview 标签
        },
    });

    logger.info('BrowserWindow created with preload script');

    // 移除应用菜单栏
    Menu.setApplicationMenu(null);

    // 立即显示加载界面
    const loadingHtml = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>OKCVM</title>
            <style>
                body {
                    margin: 0;
                    padding: 0;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                    color: #fff;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                }
                .loader {
                    width: 50px;
                    height: 50px;
                    border: 3px solid rgba(255,255,255,0.1);
                    border-top-color: #4a9eff;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                }
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
                h1 { margin-top: 20px; font-weight: 300; }
                p { color: rgba(255,255,255,0.6); margin-top: 10px; }
            </style>
        </head>
        <body>
            <div class="loader"></div>
            <h1>OKCVM</h1>
            <p>正在启动后端服务...</p>
        </body>
        </html>
    `;

    mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(loadingHtml)}`);

    // 窗口准备好后立即显示
    mainWindow.once('ready-to-show', () => {
        logger.info('Window ready to show');
        mainWindow.show();
    });

    // 开发模式加载本地服务，生产模式等待后端就绪
    const isDev = process.argv.includes('--dev');
    logger.info(`🔍 Window creation mode - isDev: ${isDev}, isPackaged: ${app.isPackaged}`);

    // 监听后端就绪事件
    backendManager.once('ready', (port) => {
        logger.info('🎉 ===== BACKEND READY EVENT RECEIVED =====');
        logger.info(`📡 Backend port: ${port}`);
        logger.info(`🔧 Development mode: ${isDev}`);
        logger.info(`📦 App packaged: ${app.isPackaged}`);

        const url = isDev ? `http://localhost:${port}/ui/` : `http://127.0.0.1:${port}/ui/`;
        logger.info(`🌐 Loading UI from URL: ${url}`);
        logger.info(`🔗 Backend URL will be: http://127.0.0.1:${port}`);

        // 禁用缓存，强制每次加载最新文件
        mainWindow.webContents.session.clearCache().then(() => {
            logger.info('🧹 Cache cleared before loading UI');
            mainWindow.loadURL(url).then(() => {
                logger.info('✅ UI loaded successfully');
            }).catch((error) => {
                logger.error(`❌ Failed to load UI: ${error.message}`);
            });
        }).catch((error) => {
            logger.warn(`⚠️ Failed to clear cache: ${error.message}`);
            mainWindow.loadURL(url).then(() => {
                logger.info('✅ UI loaded successfully');
            }).catch((error) => {
                logger.error(`❌ Failed to load UI: ${error.message}`);
            });
        });

        // 仅在开发模式下打开开发者工具
        if (isDev) {
            logger.info('🔧 Opening DevTools (dev mode)...');
            mainWindow.webContents.openDevTools();
        }

        // 发送后端就绪事件到渲染进程
        mainWindow.webContents.once('did-finish-load', () => {
            logger.info('📤 Sending backend-ready event to renderer process...');
            mainWindow.webContents.send('backend-ready', port);
            logger.info(`📤 Backend ready event sent with port: ${port}`);
        });
    });

    // 监听后端错误事件
    backendManager.once('error', (error) => {
        logger.error(`Backend error: ${error.message}`);
        showErrorInWindow(error.message);
    });

    // 保存窗口位置和大小
    mainWindow.on('close', async (event) => {
        // 如果正在退出，保存窗口状态后直接关闭
        if (isQuitting) {
            const bounds = mainWindow.getBounds();
            store.set('windowBounds', bounds);
            return;
        }

        // 阻止默认关闭行为
        event.preventDefault();

        // 检查是否需要询问用户
        const askBeforeClose = store.get('askBeforeClose');

        if (!askBeforeClose) {
            // 不再询问，按照上次选择执行
            const closeToTray = store.get('closeToTray');
            if (closeToTray) {
                mainWindow.hide();
            } else {
                isQuitting = true;
                app.quit();
            }
            return;
        }

        // 显示对话框让用户选择
        const { response, checkboxChecked } = await dialog.showMessageBox(mainWindow, {
            type: 'question',
            title: '关闭窗口',
            message: '您想要如何关闭窗口？',
            detail: '选择"最小化到托盘"可以让程序在后台继续运行',
            buttons: ['最小化到托盘', '退出程序'],
            defaultId: 0,
            cancelId: 0,
            checkboxLabel: '下次不再提醒',
            checkboxChecked: false,
        });

        // 保存用户选择
        if (checkboxChecked) {
            store.set('askBeforeClose', false);
            store.set('closeToTray', response === 0);
        }

        // 执行用户选择的操作
        if (response === 0) {
            // 最小化到托盘
            mainWindow.hide();
        } else {
            // 退出程序
            isQuitting = true;
            app.quit();
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    // 外部链接在应用内打开为新标签页
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        logger.info(`[WindowOpen] Intercepted window.open request for URL: ${url}`);
        // 发送消息到渲染进程，在应用内打开新标签页
        mainWindow.webContents.send('open-browser-tab', url);
        logger.info(`[WindowOpen] Sent 'open-browser-tab' event to renderer process`);
        return { action: 'deny' };
    });

    return mainWindow;
}

/**
 * 在窗口中显示错误信息
 */
function showErrorInWindow(errorMessage) {
    if (!mainWindow) return;

    const logFile = logger.getLogFile() || '未知';
    const errorHtml = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>OKCVM - 启动失败</title>
            <style>
                body {
                    margin: 0;
                    padding: 40px;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    align-items: center;
                    height: calc(100vh - 80px);
                    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                    color: #fff;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                }
                .icon { font-size: 64px; margin-bottom: 20px; }
                h1 { margin: 0; font-weight: 400; color: #ff6b6b; }
                p { color: rgba(255,255,255,0.7); max-width: 500px; text-align: center; line-height: 1.6; }
                .error-box {
                    background: rgba(255,107,107,0.1);
                    border: 1px solid rgba(255,107,107,0.3);
                    border-radius: 8px;
                    padding: 16px 24px;
                    margin: 20px 0;
                    max-width: 600px;
                    word-break: break-word;
                }
                .log-path {
                    font-size: 12px;
                    color: rgba(255,255,255,0.5);
                    margin-top: 30px;
                }
                button {
                    margin-top: 20px;
                    padding: 12px 24px;
                    background: #4a9eff;
                    color: white;
                    border: none;
                    border-radius: 6px;
                    font-size: 14px;
                    cursor: pointer;
                }
                button:hover { background: #3a8eef; }
            </style>
        </head>
        <body>
            <div class="icon">⚠️</div>
            <h1>启动失败</h1>
            <p>OKCVM 后端服务启动失败，请检查以下错误信息：</p>
            <div class="error-box">${errorMessage}</div>
            <button onclick="location.reload()">重试</button>
            <p class="log-path">日志文件: ${logFile}</p>
        </body>
        </html>
    `;

    mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(errorHtml)}`);
}


/**
 * 处理托盘退出确认
 */
function handleTrayExit() {
    trayExitClickCount++;

    if (trayExitClickCount === 1) {
        // 第一次点击，显示提示并启动定时器
        logger.info('Tray exit clicked once, waiting for confirmation...');

        // 更新托盘菜单，显示确认提示
        if (tray) {
            tray.setContextMenu(createTrayMenu(mainWindow, backendManager, app, true, handleTrayExit));
        }

        // 5秒后重置
        trayExitTimer = setTimeout(() => {
            logger.info('Tray exit confirmation timeout, resetting...');
            trayExitClickCount = 0;
            if (tray) {
                tray.setContextMenu(createTrayMenu(mainWindow, backendManager, app, false, handleTrayExit));
            }
        }, 5000);
    } else if (trayExitClickCount === 2) {
        // 第二次点击，真正退出
        logger.info('Tray exit confirmed, quitting...');
        clearTimeout(trayExitTimer);
        trayExitClickCount = 0;
        isQuitting = true;
        app.quit();
    }
}

/**
 * 创建系统托盘
 */
function createTray() {
    const iconPath = getTrayIconPath();
    tray = new Tray(iconPath);

    tray.setToolTip('OKCVM');
    tray.setContextMenu(createTrayMenu(mainWindow, backendManager, app, false, handleTrayExit));

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
    const fs = require('fs');
    const iconName = process.platform === 'darwin' ? 'trayTemplate.png' :
        process.platform === 'win32' ? 'tray.ico' : 'tray.png';

    let iconPath;
    if (app.isPackaged) {
        iconPath = path.join(process.resourcesPath, iconName);
    } else {
        iconPath = path.join(__dirname, '..', 'resources', iconName);
    }

    // 调试日志
    logger.info(`[Tray] Platform: ${process.platform}`);
    logger.info(`[Tray] Icon path: ${iconPath}`);
    logger.info(`[Tray] Icon exists: ${fs.existsSync(iconPath)}`);

    return iconPath;
}

/**
 * 设置 IPC 处理器
 */
function setupIPC() {
    // 获取后端 URL
    ipcMain.handle('get-backend-url', () => {
        const url = backendManager.getUrl();
        logger.info(`🔍 IPC: get-backend-url called, returning: ${url}`);
        logger.info(`🔍 Backend status: ${JSON.stringify(backendManager.getStatus())}`);
        return url;
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

    // 🔥 处理创建新窗口请求（用于浏览器标签页功能）
    ipcMain.on('create-new-window', (event, url) => {
        logger.info(`[NewWindow] Creating new window for URL: ${url}`);
        try {
            const { BrowserWindow } = require('electron');
            const newWindow = new BrowserWindow({
                width: 1200,
                height: 800,
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                    sandbox: true,
                },
            });

            newWindow.loadURL(url);
            logger.info(`[NewWindow] New window created and loaded URL`);

            // 可选：在窗口关闭时清理
            newWindow.on('closed', () => {
                logger.info(`[NewWindow] Window closed for URL: ${url}`);
            });
        } catch (error) {
            logger.error(`[NewWindow] Failed to create window:`, error);
        }
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
    // 初始化日志系统
    logger.init();
    logger.info('OKCVM Desktop starting...');

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
    try {
        createTray();
    } catch (error) {
        logger.error(`Failed to create tray: ${error.message}`);
    }

    // 注册全局快捷键
    registerShortcuts();

    // 创建主窗口
    createWindow();

    // 启动后端
    try {
        await backendManager.start();
        logger.info(`Backend started on port: ${backendManager.getPort()}`);
    } catch (error) {
        logger.error(`Failed to start backend: ${error.message}`);
        logger.error(error.stack || 'No stack trace');
        // 在窗口中显示错误，而不是使用 dialog.showErrorBox
        showErrorInWindow(error.message);
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

// 标记即将退出
app.on('before-quit', () => {
    isQuitting = true;
});

// 应用退出时清理（使用 will-quit 确保在退出前完成清理）
let cleanupDone = false;
app.on('will-quit', async (event) => {
    // 取消注册快捷键
    globalShortcut.unregisterAll();

    // 如果已经完成清理，直接退出
    if (cleanupDone) {
        return;
    }

    // 停止后端（如果还在运行）
    if (backendManager && backendManager.getStatus().status !== 'stopped') {
        // 阻止退出，等待后端停止
        event.preventDefault();
        cleanupDone = true;  // 标记清理已开始，防止重复

        try {
            await backendManager.stop();
        } catch (error) {
            console.error('Failed to stop backend:', error);
        }

        // 后端已停止，再次退出
        app.quit();
    } else {
        cleanupDone = true;
    }
});

// 导出用于测试
module.exports = { createWindow, createTray };
