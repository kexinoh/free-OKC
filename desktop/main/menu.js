/**
 * Application Menu Configuration
 */

const { Menu, shell, app } = require('electron');

/**
 * 创建应用菜单
 */
function createMenu(mainWindow, backendManager) {
    const isMac = process.platform === 'darwin';

    const template = [
        // macOS 应用菜单
        ...(isMac ? [{
            label: app.name,
            submenu: [
                { role: 'about', label: '关于 OKCVM' },
                { type: 'separator' },
                {
                    label: '偏好设置...',
                    accelerator: 'Cmd+,',
                    click: () => {
                        mainWindow?.webContents.send('shortcut', 'open-preferences');
                    },
                },
                { type: 'separator' },
                { role: 'services', label: '服务' },
                { type: 'separator' },
                { role: 'hide', label: '隐藏 OKCVM' },
                { role: 'hideOthers', label: '隐藏其他' },
                { role: 'unhide', label: '显示全部' },
                { type: 'separator' },
                { role: 'quit', label: '退出 OKCVM' },
            ],
        }] : []),

        // 文件菜单
        {
            label: '文件',
            submenu: [
                {
                    label: '新建对话',
                    accelerator: 'CmdOrCtrl+N',
                    click: () => {
                        mainWindow?.webContents.send('shortcut', 'new-chat');
                    },
                },
                { type: 'separator' },
                ...(isMac ? [] : [
                    {
                        label: '设置',
                        accelerator: 'Ctrl+,',
                        click: () => {
                            mainWindow?.webContents.send('shortcut', 'open-preferences');
                        },
                    },
                    { type: 'separator' },
                ]),
                isMac ? { role: 'close', label: '关闭窗口' } : { role: 'quit', label: '退出' },
            ],
        },

        // 编辑菜单
        {
            label: '编辑',
            submenu: [
                { role: 'undo', label: '撤销' },
                { role: 'redo', label: '重做' },
                { type: 'separator' },
                { role: 'cut', label: '剪切' },
                { role: 'copy', label: '复制' },
                { role: 'paste', label: '粘贴' },
                ...(isMac ? [
                    { role: 'pasteAndMatchStyle', label: '粘贴并匹配样式' },
                    { role: 'delete', label: '删除' },
                    { role: 'selectAll', label: '全选' },
                ] : [
                    { role: 'delete', label: '删除' },
                    { type: 'separator' },
                    { role: 'selectAll', label: '全选' },
                ]),
            ],
        },

        // 视图菜单
        {
            label: '视图',
            submenu: [
                { role: 'reload', label: '重新加载' },
                { role: 'forceReload', label: '强制重新加载' },
                { role: 'toggleDevTools', label: '开发者工具' },
                { type: 'separator' },
                { role: 'resetZoom', label: '实际大小' },
                { role: 'zoomIn', label: '放大' },
                { role: 'zoomOut', label: '缩小' },
                { type: 'separator' },
                { role: 'togglefullscreen', label: '切换全屏' },
            ],
        },

        // 后端菜单
        {
            label: '后端',
            submenu: [
                {
                    label: '查看状态',
                    click: () => {
                        const status = backendManager?.getStatus();
                        mainWindow?.webContents.send('backend-status', status);
                    },
                },
                {
                    label: '重启服务',
                    click: async () => {
                        try {
                            await backendManager?.restart();
                            mainWindow?.webContents.send('notification', {
                                title: 'OKCVM',
                                body: '后端服务已重启',
                            });
                        } catch (error) {
                            mainWindow?.webContents.send('notification', {
                                title: '错误',
                                body: `重启失败: ${error.message}`,
                            });
                        }
                    },
                },
                { type: 'separator' },
                {
                    label: '打开数据目录',
                    click: () => {
                        shell.openPath(app.getPath('userData'));
                    },
                },
                {
                    label: '打开日志目录',
                    click: () => {
                        shell.openPath(app.getPath('logs'));
                    },
                },
            ],
        },

        // 窗口菜单
        {
            label: '窗口',
            submenu: [
                { role: 'minimize', label: '最小化' },
                { role: 'zoom', label: '缩放' },
                ...(isMac ? [
                    { type: 'separator' },
                    { role: 'front', label: '前置全部窗口' },
                    { type: 'separator' },
                    { role: 'window', label: '窗口' },
                ] : [
                    { role: 'close', label: '关闭' },
                ]),
            ],
        },

        // 帮助菜单
        {
            label: '帮助',
            submenu: [
                {
                    label: '文档',
                    click: () => {
                        shell.openExternal('https://github.com/kexinoh/free-OKC#readme');
                    },
                },
                {
                    label: '报告问题',
                    click: () => {
                        shell.openExternal('https://github.com/kexinoh/free-OKC/issues');
                    },
                },
                { type: 'separator' },
                {
                    label: '检查更新...',
                    click: () => {
                        mainWindow?.webContents.send('shortcut', 'check-update');
                    },
                },
                { type: 'separator' },
                ...(!isMac ? [{ role: 'about', label: '关于' }] : []),
            ],
        },
    ];

    return Menu.buildFromTemplate(template);
}

/**
 * 创建托盘菜单
 */
function createTrayMenu(mainWindow, backendManager, app) {
    const template = [
        {
            label: '显示窗口',
            click: () => {
                mainWindow?.show();
                mainWindow?.focus();
            },
        },
        {
            label: '新建对话',
            click: () => {
                mainWindow?.show();
                mainWindow?.focus();
                mainWindow?.webContents.send('shortcut', 'new-chat');
            },
        },
        { type: 'separator' },
        {
            label: '后端状态',
            submenu: [
                {
                    label: '运行中',
                    type: 'checkbox',
                    checked: backendManager?.getStatus().status === 'running',
                    enabled: false,
                },
                { type: 'separator' },
                {
                    label: '重启服务',
                    click: async () => {
                        await backendManager?.restart();
                    },
                },
            ],
        },
        { type: 'separator' },
        {
            label: '设置',
            click: () => {
                mainWindow?.show();
                mainWindow?.focus();
                mainWindow?.webContents.send('shortcut', 'open-preferences');
            },
        },
        { type: 'separator' },
        {
            label: '退出',
            click: () => {
                app.quit();
            },
        },
    ];

    return Menu.buildFromTemplate(template);
}

module.exports = {
    createMenu,
    createTrayMenu,
};
