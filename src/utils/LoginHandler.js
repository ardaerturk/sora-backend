// utils/puppeteer/LoginHandler.js
const HumanBehavior = require('../utils/HumanBehavior');
const ErrorHandler = require('../utils/ErrorHandler');

class LoginHandler {
    static async login(page, credentials) {
        try {
            console.log("Starting login process...");
            await this.navigateToLoginPage(page);
            await this.clickLoginButton(page);
            await this.enterCredentials(page, credentials);
            await this.verifyLogin(page);
        } catch (error) {
            await this.handleLoginError(page, error);
        }
    }

    static async navigateToLoginPage(page) {
        const response = await page.goto('https://sora.com', {
            waitUntil: ['networkidle0', 'domcontentloaded', 'load'],
            timeout: 60000
        });

        if (!response.ok()) {
            throw new Error(`Navigation failed: ${response.status()}`);
        }

        await HumanBehavior.delay(2000, 3000);
    }

    static async clickLoginButton(page) {
        const loginButton = await this.findLoginButton(page);
        if (!loginButton) {
            throw new Error('Login button not found');
        }

        await this.verifyButtonClickable(loginButton);
        await this.performButtonClick(page, loginButton);
    }

    static async findLoginButton(page) {
        const strategies = [
            // Strategy 1: Direct evaluation
            async () => {
                return await page.evaluateHandle(() => {
                    return Array.from(document.querySelectorAll('button'))
                        .find(button => 
                            button.textContent?.trim() === 'Log in' &&
                            button.closest('div.pointer-events-auto')
                        );
                });
            },
            // Strategy 2: Selector
            async () => {
                return await page.waitForSelector(
                    'div.pointer-events-auto button:has-text("Log in")',
                    { timeout: 5000 }
                );
            },
            // Strategy 3: XPath
            async () => {
                const [button] = await page.$x("//button[contains(text(), 'Log in')]");
                return button;
            }
        ];

        for (const strategy of strategies) {
            try {
                const button = await strategy();
                if (button && await button.asElement()) {
                    return button;
                }
            } catch (error) {
                console.log('Login button strategy failed:', error.message);
            }
        }

        return null;
    }

    static async verifyButtonClickable(button) {
        const isClickable = await button.evaluate(el => {
            const style = window.getComputedStyle(el);
            return style.display !== 'none' &&
                   style.visibility !== 'hidden' &&
                   style.opacity !== '0' &&
                   el.offsetWidth > 0 &&
                   el.offsetHeight > 0;
        });

        if (!isClickable) {
            throw new Error('Login button is not clickable');
        }
    }

    static async performButtonClick(page, button, maxAttempts = 3) {
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
                await HumanBehavior.move(page, button);
                await HumanBehavior.delay(300, 500);
                await button.click();
                return;
            } catch (error) {
                console.log(`Click attempt ${attempt + 1} failed:`, error.message);
                if (attempt === maxAttempts - 1) throw error;
                await HumanBehavior.delay(1000);
            }
        }
    }

    static async enterCredentials(page, credentials) {
        // Enter email
        const emailSelector = 'input[placeholder="Email address"]';
        await page.waitForSelector(emailSelector, { timeout: 10000 });
        await HumanBehavior.type(page, emailSelector, credentials.email);
        await HumanBehavior.delay(500);
        await page.keyboard.press('Enter');

        // Enter password
        const passwordSelector = 'input#password';
        await page.waitForSelector(passwordSelector, { timeout: 10000 });
        await HumanBehavior.type(page, passwordSelector, credentials.password);
        await HumanBehavior.delay(500);
        await page.keyboard.press('Enter');
    }

    static async verifyLogin(page) {
        try {
            await Promise.race([
                page.waitForNavigation({ timeout: 30000 }),
                page.waitForSelector('.grid-cols-4', { timeout: 30000 }),
                page.waitForFunction(
                    () => !window.location.href.includes('/login'),
                    { timeout: 30000 }
                )
            ]);

            const currentUrl = await page.url();
            if (currentUrl.includes('login') || currentUrl === 'https://sora.com') {
                throw new Error('Login verification failed');
            }
        } catch (error) {
            throw new Error(`Login verification failed: ${error.message}`);
        }
    }

    static async handleLoginError(page, error) {
        // try {
        //     await page.screenshot({
        //         path: `login-error-${Date.now()}.png`,
        //         fullPage: true
        //     });
        // } catch (screenshotError) {
        //     console.error('Failed to take error screenshot:', screenshotError);
        // }

        await ErrorHandler.logError(error, {
            component: 'LoginHandler',
            url: await page.url(),
            timestamp: new Date().toISOString()
        });

        throw error;
    }
}

module.exports = LoginHandler;