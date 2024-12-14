// utils/PuppeteerService.js
const BrowserManager = require('./puppeteer/BrowserManager');
const LoginHandler = require('./puppeteer/LoginHandler');
const VideoGenerator = require('./puppeteer/VideoGenerator');
const ErrorHandler = require('./ErrorHandler');

class PuppeteerService {
    constructor() {
        this.browserManager = BrowserManager;
    }

    async generateVideo(options) {
        const sessionId = Date.now().toString();
        let browser, page;

        try {
            // Initialize browser
            const instance = await this.browserManager.createBrowser(sessionId);
            browser = instance.browser;
            page = instance.page;

            // Verify proxy connection
            // const proxyWorking = await this.browserManager.verifyProxyConnection(page);
            // if (!proxyWorking) {
            //     throw new Error('Proxy connection failed');
            // }

            // Login
            await LoginHandler.login(page, {
                email: process.env.SORA_EMAIL,
                password: process.env.SORA_PASSWORD
            });

            // Generate video
            const result = await VideoGenerator.generate(page, options);

            return result;

        } catch (error) {
            await ErrorHandler.logError(error, {
                component: 'PuppeteerService',
                sessionId,
                options
            });
            throw error;

        } finally {
            // Cleanup
            await this.browserManager.closeBrowser(sessionId);
        }
    }

    async closeAllBrowsers() {
        await this.browserManager.closeAllBrowsers();
    }
}

module.exports = new PuppeteerService();