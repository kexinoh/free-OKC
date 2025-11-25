import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './tests/e2e',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: 'html',
    
    use: {
        baseURL: 'http://localhost:8000',
        trace: 'on-first-retry',
    },

    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],

    // 在运行测试前启动后端服务
    webServer: {
        command: 'cd .. && python -m okcvm.server --port 8000',
        url: 'http://localhost:8000/api/health',
        reuseExistingServer: !process.env.CI,
        timeout: 60000,
    },
});
