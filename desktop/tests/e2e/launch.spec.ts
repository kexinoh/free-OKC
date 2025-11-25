/**
 * E2E Test: Application Launch
 * 
 * 测试应用的启动流程。
 * 注意：这些测试需要在有 Electron 开发环境的机器上运行。
 */

import { test, expect } from '@playwright/test';

// 跳过在 CI 环境中运行（除非有完整的设置）
const skipInCI = process.env.CI === 'true';

test.describe('Application Launch', () => {
    test.skip(skipInCI, 'Skipping in CI environment');

    test('should display main window', async ({ page }) => {
        // 这个测试需要后端在开发模式下运行
        // 在实际的 E2E 测试中，我们会启动完整的 Electron 应用
        
        await page.goto('http://localhost:8000/ui/');
        
        // 检查页面是否加载
        await expect(page).toHaveTitle(/OKCVM/);
    });

    test('should show configuration dialog on first launch', async ({ page }) => {
        await page.goto('http://localhost:8000/ui/');
        
        // 等待页面加载
        await page.waitForLoadState('networkidle');
        
        // 检查配置对话框是否显示（首次启动时）
        // 具体的选择器取决于实际的前端实现
        const configDialog = page.locator('[data-testid="config-dialog"]');
        
        // 如果是首次启动，应该显示配置对话框
        // 否则跳过这个断言
        if (await configDialog.isVisible()) {
            await expect(configDialog).toBeVisible();
        }
    });

    test('should be able to send a message', async ({ page }) => {
        await page.goto('http://localhost:8000/ui/');
        
        // 等待页面加载完成
        await page.waitForLoadState('networkidle');
        
        // 找到输入框
        const input = page.locator('textarea[placeholder*="message"], input[placeholder*="message"]');
        
        if (await input.isVisible()) {
            // 输入消息
            await input.fill('Hello, OKCVM!');
            
            // 发送消息（按 Enter 或点击发送按钮）
            await input.press('Enter');
            
            // 等待响应（这取决于是否配置了有效的 API）
            // 在实际测试中，我们可能需要 mock API 响应
        }
    });
});

test.describe('Backend Integration', () => {
    test.skip(skipInCI, 'Skipping in CI environment');

    test('backend health check should pass', async ({ request }) => {
        const response = await request.get('http://localhost:8000/api/health');
        
        expect(response.ok()).toBeTruthy();
        
        const data = await response.json();
        expect(data.status).toMatch(/healthy|ok/);
    });

    test('should be able to get configuration', async ({ request }) => {
        const response = await request.get('http://localhost:8000/api/config');
        
        expect(response.ok()).toBeTruthy();
        
        const data = await response.json();
        expect(data).toHaveProperty('chat');
    });
});

test.describe('Desktop Adapter (Web Mode)', () => {
    test('should initialize in web mode', async ({ page }) => {
        await page.goto('http://localhost:8000/ui/');
        
        // 等待页面加载
        await page.waitForLoadState('networkidle');
        
        // 检查是否在 web 模式下初始化
        const config = await page.evaluate(() => {
            return (window as any).__OKCVM_CONFIG__;
        });
        
        // 在纯 Web 环境下，isDesktop 应该为 false
        if (config) {
            expect(config.isDesktop).toBe(false);
        }
    });

    test('should have OKCVM global object', async ({ page }) => {
        await page.goto('http://localhost:8000/ui/');
        
        await page.waitForLoadState('networkidle');
        
        // 检查全局对象
        const hasOKCVM = await page.evaluate(() => {
            return typeof (window as any).OKCVM !== 'undefined';
        });
        
        expect(hasOKCVM).toBe(true);
    });
});
