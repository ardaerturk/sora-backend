// utils/puppeteer/BrowserManager.js
const puppeteer = require('puppeteer');


class BrowserManager {
    constructor() {
        this.activeBrowsers = new Map();
        this.userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
        ];
    }

    async createBrowser(sessionId) {
        const userAgent = this.userAgents[Math.floor(Math.random() * this.userAgents.length)];

        const PROXY_SERVER = '180.178.151.1' // e.g., '11.22.33.44'
        const PROXY_PORT = '50100';     // e.g., '8080'
        const PROXY_USER = 'gen24560jNAh'
        const PROXY_PASS = 'vBSmMBABjC'

           const browserOptions = {
            headless: false,
            defaultViewport: { width: 1700, height: 800 },
            args: [
                '--start-maximized',
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled', // Prevents detection
                `--user-agent=${userAgent}`,
                                // `--proxy-server=${PROXY_SERVER}:${PROXY_PORT}`
            ],
        }





        // const browserOptions = {
        //     headless: 'true',
        //     defaultViewport: { width: 1280, height: 720 },
        //     args: [
        //         '--no-sandbox',
        //         '--disable-setuid-sandbox',
        //         '--disable-dev-shm-usage',
        //         '--disable-gpu',
        //         '--disable-software-rasterizer',
        //         '--disable-extensions',
        //         // '--single-process',
        //         '--no-zygote',
        //         '--disable-background-networking',
        //         '--disable-default-apps',
        //         '--disable-sync',
        //         '--disable-translate',
        //         '--hide-scrollbars',
        //         '--metrics-recording-only',
        //         '--mute-audio',
        //         '--no-first-run',
        //         '--safebrowsing-disable-auto-update',
        //         '--window-size=1280,720',
        //         '--disable-blink-features=AutomationControlled',
        //         `--user-agent=${userAgent}`,
        //         '--remote-debugging-port=9222',
        //         `--proxy-server=${PROXY_SERVER}:${PROXY_PORT}`
        //     ],
        //     executablePath: '/app/.chrome-for-testing/chrome-linux64/chrome',
        //     ignoreHTTPSErrors: true,
        //     dumpio: true,
        //     env: {
        //         ...process.env,
        //         CHROME_PATH: '/app/.chrome-for-testing/chrome-linux64/chrome',
        //         CHROMEDRIVER_PATH: '/app/.chrome-for-testing/chromedriver-linux64/chromedriver'
        //     },
        //     timeout: 60000
        // };

        

        if (process.env.NODE_ENV === 'production') {
            browserOptions.executablePath = '/app/.chrome-for-testing/chrome-linux64/chrome';
        }



        const browser = await puppeteer.launch(browserOptions);
        const page = await browser.newPage();

        // Configure page
        await this.configureNewPage(page, userAgent);

        // Store browser instance
        this.activeBrowsers.set(sessionId, { browser, page });

        return { browser, page };
    }

    async configureNewPage(page, userAgent) {
        // Set up proxy authentication

        const PROXY_SERVER = '180.178.151.1' // e.g., '11.22.33.44'
        const PROXY_PORT = '50100';     // e.g., '8080'
        const PROXY_USER = 'gen24560jNAh'
        const PROXY_PASS = 'vBSmMBABjC'


        await page.authenticate({
            username: PROXY_USER,
            password: PROXY_PASS
        });

        // Configure headers and viewport
        await page.setUserAgent(userAgent);
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
            'Connection': 'keep-alive',
            'Cache-Control': 'max-age=0'
        });

        await page.setViewport({ width: 1280, height: 720 });
        await page.setDefaultNavigationTimeout(60000);
        await page.setDefaultTimeout(30000);

        // Set up error handling
        page.on('error', err => console.error('Page error:', err));
        page.on('pageerror', err => console.error('Page error:', err));
        page.on('dialog', async dialog => {
            console.log('Dialog appeared:', dialog.message());
            await dialog.dismiss();
        });

    //     // Enable request interception for optimization
    //     await page.setRequestInterception(true);
    //     page.on('request', request => {
    //         if (
    //             request.resourceType() === 'image' ||
    //             request.resourceType() === 'font' ||
    //             request.resourceType() === 'media'
    //         ) {
    //             request.abort();
    //         } else {
    //             request.continue();
    //         }
    //     });
    }

    async verifyProxyConnection(page) {
        try {
            console.log('Verifying proxy connection...');
            const testResponse = await page.goto('https://api.ipify.org?format=json', {
                waitUntil: 'networkidle0',
                timeout: 30000
            });
            
            if (testResponse.ok()) {
                const ipData = await testResponse.json();
                console.log('Connected through IP:', ipData.ip);
                return true;
            }
            console.warn('IP check failed with status:', testResponse.status());
            return false;
        } catch (error) {
            console.warn('Proxy verification failed:', error.message);
            return false;
        }
    }

    async closeBrowser(sessionId) {
        const instance = this.activeBrowsers.get(sessionId);
        if (instance) {
            const { browser } = instance;
            try {
                await browser.close();
            } catch (error) {
                console.error(`Error closing browser for session ${sessionId}:`, error);
            }
            this.activeBrowsers.delete(sessionId);
        }
    }

    async closeAllBrowsers() {
        const closingPromises = Array.from(this.activeBrowsers.entries()).map(
            async ([sessionId]) => await this.closeBrowser(sessionId)
        );
        await Promise.all(closingPromises);
    }

    getBrowserInstance(sessionId) {
        return this.activeBrowsers.get(sessionId);
    }
}

module.exports = new BrowserManager();