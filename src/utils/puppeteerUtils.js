const puppeteer = require('puppeteer');

class PuppeteerService {
    // List of realistic user agents
    #userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
    ];

    async #retryOperation(operation, maxAttempts = 3, delayMs = 5000) {
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                console.log(`Attempt ${attempt} of ${maxAttempts}`);
                return await operation();
            } catch (error) {
                console.error(`Attempt ${attempt} failed:`, error);
                
                if (attempt === maxAttempts) {
                    throw new Error(`All ${maxAttempts} attempts failed: ${error.message}`);
                }
                
                console.log(`Waiting ${delayMs/1000} seconds before next attempt...`);
                await this.#humanDelay(delayMs, delayMs + 1000);
            }
        }
    }

    async loginWithRetry(page, credentials, maxAttempts = 3) {
        return this.#retryOperation(async () => {
            try {
                // Clear cookies and cache before each attempt
                await page.setCookie();
                
                console.log("Navigating to Sora...");
                
                // Enable request interception
                await page.setRequestInterception(true);
                page.on('request', request => {
                    console.log('Request:', request.url());
                    request.continue();
                });
                page.on('response', response => {
                    console.log('Response:', response.url(), response.status());
                });

                // Navigate with multiple wait conditions
                const response = await page.goto('https://sora.com', { 
                    waitUntil: ['networkidle0', 'domcontentloaded', 'load'],
                    timeout: 60000
                });

                if (!response.ok()) {
                    throw new Error(`Page load failed with status: ${response.status()}`);
                }

                await this.#humanDelay();
                
                console.log("Looking for login button...");
                
                // Wait for any content to load
                await page.waitForFunction(() => document.body.innerHTML.length > 0, {
                    timeout: 10000
                });

                // Log page state
                const pageContent = await page.content();
                console.log('Page content length:', pageContent.length);
                
                // Find login button with multiple strategies
                let loginButton;
                try {
                    // Strategy 1: Wait for button with text
                    await page.waitForFunction(() => {
                        const buttons = Array.from(document.querySelectorAll('button'));
                        return buttons.some(button => button.textContent.includes('Log in'));
                    }, { timeout: 10000 });

                    loginButton = await page.evaluateHandle(() => {
                        const buttons = Array.from(document.querySelectorAll('button'));
                        return buttons.find(button => button.textContent.includes('Log in'));
                    });
                } catch (error) {
                    console.log('First login button strategy failed, trying alternatives...');
                    
                    // Strategy 2: Try different selectors
                    const selectors = [
                        'button:has-text("Log in")',
                        '[role="button"]:has-text("Log in")',
                        'a:has-text("Log in")',
                        '.login-button',
                        '#login-button'
                    ];

                    for (const selector of selectors) {
                        try {
                            loginButton = await page.waitForSelector(selector, { timeout: 5000 });
                            if (loginButton) break;
                        } catch (e) {
                            continue;
                        }
                    }
                }

                if (!loginButton) {
                    throw new Error("Could not find login button");
                }

                // Move mouse and click
                await this.#humanMove(page, loginButton);
                await loginButton.click();
                await this.#humanDelay(1000, 2000);

                // Handle login form
                console.log("Entering email...");
                const emailSelector = 'input[placeholder="Email address"]';
                await page.waitForSelector(emailSelector, { timeout: 10000 });
                await this.#humanType(page, emailSelector, credentials.email);
                
                await this.#humanDelay(300, 800);
                await page.keyboard.press('Enter');

                console.log("Entering password...");
                const passwordSelector = 'input#password';
                await page.waitForSelector(passwordSelector, { timeout: 10000 });
                await this.#humanType(page, passwordSelector, credentials.password);
                
                await this.#humanDelay(300, 800);
                await page.keyboard.press('Enter');

                console.log("Waiting for navigation...");
                
                // Wait for navigation with multiple conditions
                await Promise.race([
                    page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 60000 }),
                    page.waitForSelector('.grid-cols-4', { timeout: 60000 }), // Add any selector that indicates successful login
                    page.waitForFunction(
                        () => window.location.href.includes('/dashboard'),
                        { timeout: 60000 }
                    )
                ]);

                // Verify login success
                const currentUrl = await page.url();
                console.log('Current URL after login:', currentUrl);

                if (currentUrl === 'https://sora.com') {
                    throw new Error('Login might have failed - still on login page');
                }

                console.log("Login successful");
                
            } catch (error) {
                console.error("Login attempt failed:", error);
                throw error; // Throw to trigger retry
            }
        }, maxAttempts);
    }
    

    async #logPageContent(page, context = '') {
        try {
            const content = await page.content();
            const title = await page.title();
            const url = page.url();
            
            console.log(`\n=== Page Debug Info (${context}) ===`);
            console.log('URL:', url);
            console.log('Title:', title);
            console.log('\n=== Full Page Content ===\n', content);
    
            // Detailed DOM Analysis
            const domAnalysis = await page.evaluate(() => {
                const analysis = {
                    allElements: document.getElementsByTagName('*').length,
                    buttons: [],
                    links: [],
                    iframes: [],
                    scripts: [],
                    bodyContent: document.body ? document.body.innerText : 'No body found'
                };
    
                // Analyze all buttons
                document.querySelectorAll('button').forEach(button => {
                    analysis.buttons.push({
                        text: button.textContent.trim(),
                        html: button.outerHTML,
                        visible: button.offsetParent !== null,
                        classes: Array.from(button.classList),
                        attributes: Array.from(button.attributes).map(attr => ({
                            name: attr.name,
                            value: attr.value
                        })),
                        dimensions: {
                            width: button.offsetWidth,
                            height: button.offsetHeight
                        },
                        position: button.getBoundingClientRect()
                    });
                });
    
                // Analyze scripts
                document.querySelectorAll('script').forEach(script => {
                    analysis.scripts.push({
                        src: script.src,
                        type: script.type,
                        async: script.async,
                        defer: script.defer
                    });
                });
    
                // Check for dynamic content
                analysis.hasReactRoot = !!document.querySelector('#__next') || !!document.querySelector('#root');
                analysis.hasAngular = !!document.querySelector('[ng-version]');
                analysis.hasVue = !!document.querySelector('[data-v-app]');
    
                return analysis;
            });
    
            console.log('\n=== DOM Analysis ===');
            console.log('Total Elements:', domAnalysis.allElements);
            console.log('Buttons Found:', domAnalysis.buttons.length);
            console.log('Button Details:', JSON.stringify(domAnalysis.buttons, null, 2));
            console.log('Scripts:', domAnalysis.scripts.length);
            console.log('Framework Detection:', {
                react: domAnalysis.hasReactRoot,
                angular: domAnalysis.hasAngular,
                vue: domAnalysis.hasVue
            });
    
            // Network Analysis
            const client = await page.target().createCDPSession();
            await client.send('Network.enable');
            const resources = await client.send('Network.getResponseBody');
            console.log('\n=== Network Analysis ===');
            console.log('Resources loaded:', resources);
    
            // Take both regular and full-page screenshots
            const timestamp = Date.now();
            await page.screenshot({ 
                path: `debug-viewport-${timestamp}.png`,
                fullPage: false 
            });
            await page.screenshot({ 
                path: `debug-fullpage-${timestamp}.png`,
                fullPage: true 
            });
    
            // Check for specific elements that might be loading
            const elementChecks = await page.evaluate(() => {
                const selectors = [
                    'button',
                    'button:contains("Log in")',
                    '[role="button"]',
                    '.login-button',
                    '#login-button',
                    'a:contains("Log in")',
                    'div:contains("Log in")'
                ];
    
                return selectors.map(selector => {
                    try {
                        const elements = document.querySelectorAll(selector);
                        return {
                            selector,
                            found: elements.length > 0,
                            count: elements.length,
                            texts: Array.from(elements).map(el => el.textContent.trim())
                        };
                    } catch (e) {
                        return { selector, error: e.message };
                    }
                });
            });
    
            console.log('\n=== Element Checks ===');
            console.log(JSON.stringify(elementChecks, null, 2));
    
            // Check if page is still loading
            const isLoading = await page.evaluate(() => document.readyState !== 'complete');
            console.log('\n=== Page State ===');
            console.log('Document Ready State:', await page.evaluate(() => document.readyState));
            console.log('Is Loading:', isLoading);
    
            // Log any console messages
            page.on('console', msg => {
                console.log('Browser Console:', msg.text());
            });
    
            return {
                isLoading,
                elementChecks,
                domAnalysis,
                hasContent: content.length > 0,
                hasButtons: domAnalysis.buttons.length > 0
            };
    
        } catch (error) {
            console.error('Error in detailed page logging:', error);
            return { error: error.message };
        }
    }


    async #simulateActivity(page) {
        try {
            await page.evaluate(() => {
                // Create a function to simulate mouse movement
                const moveMouseRandomly = () => {
                    const event = new MouseEvent('mousemove', {
                        view: window,
                        bubbles: true,
                        cancelable: true,
                        clientX: Math.random() * window.innerWidth,
                        clientY: Math.random() * window.innerHeight
                    });
                    document.dispatchEvent(event);
                };
    
                // Simulate scroll
                const simulateScroll = () => {
                    window.scrollBy({
                        top: Math.random() * 10 - 5, // Random value between -5 and 5
                        behavior: 'smooth'
                    });
                };
    
                // Set up intervals for continuous activity
                setInterval(moveMouseRandomly, 2000); // Every 2 seconds
                setInterval(simulateScroll, 3000);    // Every 3 seconds
            });
        } catch (error) {
            console.warn('Failed to set up activity simulation:', error);
        }
    }
    
    async #waitForVideoAndGetUrl(page, promptText) {
        console.log("Waiting for video to appear in library...");
        
        const TOTAL_WAIT_TIME = 40 * 60 * 1000; // 40 minutes in milliseconds
        const START_TIME = Date.now();
    
        try {
            // Set up continuous activity simulation
            await this.#simulateActivity(page);
    
            // First, wait for the library grid to appear
            await page.waitForSelector('.grid-cols-4', { 
                timeout: TOTAL_WAIT_TIME 
            });
    
            // Function to find video by prompt
            const findVideoUrl = async () => {
                const videoUrl = await page.evaluate((searchPrompt) => {
                    // Find the div containing the prompt text
                    const promptDivs = Array.from(document.querySelectorAll('.text-token-text-primary'));
                    const promptDiv = promptDivs.find(div => 
                        div.textContent.toLowerCase().includes(searchPrompt.toLowerCase())
                    );
                    
                    if (!promptDiv) return null;
    
                    // Navigate up to find the parent container
                    const videoContainer = promptDiv.closest('[data-index]');
                    if (!videoContainer) return null;
    
                    // Find the video element within this container
                    const video = videoContainer.querySelector('video');
                    if (!video) return null;
    
                    return {
                        url: video.src,
                        isLoading: !video.src || video.src.includes('generating') // Check if still generating
                    };
                }, promptText);
    
                return videoUrl;
            };
    
            // Polling with dynamic intervals
            let attempts = 0;
            const checkInterval = async () => {
                const elapsedTime = Date.now() - START_TIME;
                
                // Manually trigger some mouse movement every check
                await page.mouse.move(
                    200 + Math.random() * 100,
                    200 + Math.random() * 100,
                    { steps: 10 }
                );
                
                // Check if we've exceeded total wait time
                if (elapsedTime > TOTAL_WAIT_TIME) {
                    throw new Error("Video generation timeout after 40 minutes");
                }
    
                console.log(`Checking for video... (${Math.round(elapsedTime / 1000)}s elapsed)`);
                
                const result = await findVideoUrl();
                
                if (result && result.url && !result.isLoading) {
                    console.log("Found completed video URL:", result.url);
                    return result.url;
                }
    
                // Calculate next delay based on elapsed time
                // More frequent checks in the beginning, longer intervals later
          // Calculate next delay based on elapsed time
          let nextDelay;
          if (elapsedTime < 5 * 60 * 1000) {
              nextDelay = 10000;
          } else if (elapsedTime < 15 * 60 * 1000) {
              nextDelay = 30000;
          } else {
              nextDelay = 60000;
          }

    
            // Add some random mouse movement during the delay
            await page.mouse.move(
                300 + Math.random() * 200,
                300 + Math.random() * 200,
                { steps: 20 }
            );

            console.log(`Video not ready yet. Next check in ${Math.round(nextDelay/1000)}s...`);
            await this.#humanDelay(nextDelay, nextDelay + 1000);
            
            return checkInterval();
        };
    
            // Start polling
            const videoUrl = await checkInterval();
    
            // Verify the video is actually loaded and playable
            const isVideoLoaded = await page.evaluate(async (url) => {
                try {
                    const video = document.querySelector(`video[src="${url}"]`);
                    if (!video) return false;
    
                    // Check if video is playable
                    if (video.readyState >= 3) return true;
    
                    // Wait for video to be ready (with timeout)
                    await new Promise((resolve, reject) => {
                        const timeout = setTimeout(() => reject('Video load timeout'), 30000);
                        
                        video.addEventListener('canplay', () => {
                            clearTimeout(timeout);
                            resolve();
                        }, { once: true });
                        
                        video.addEventListener('error', () => {
                            clearTimeout(timeout);
                            reject('Video load error');
                        }, { once: true });
                    });
    
                    return true;
                } catch (error) {
                    console.error('Video verification error:', error);
                    return false;
                }
            }, videoUrl);
    
            if (!isVideoLoaded) {
                throw new Error("Video found but not playable");
            }
    
            return {
                success: true,
                videoUrl,
                generationTime: Date.now() - START_TIME
            };
    
        }     catch (error) {
            const elapsedTime = Math.round((Date.now() - START_TIME) / 1000);
            console.error(`Video generation failed after ${elapsedTime}s:`, error);
            throw new Error(`Video generation failed after ${elapsedTime}s: ${error.message}`);
        }
    }


    async #clickCreateVideoButton(page, button) {
        console.log("Attempting to click Create video button using multiple methods...");
    
        try {
            // Method 1: Direct click
            await button.click().catch(e => console.log("Direct click failed:", e));
            await this.#humanDelay(1000);
    
            // Check if we need to try alternative methods
            const needsRetry = await page.evaluate(() => {
                // Look for elements that would indicate the video generation hasn't started
                return !document.querySelector('.video-result');
            });
    
            if (needsRetry) {
                console.log("First click attempt didn't work, trying alternative methods...");
    
                // Method 2: Click using page.evaluate
                await page.evaluate(element => {
                    element.click();
                }, button).catch(e => console.log("Evaluate click failed:", e));
                await this.#humanDelay(1000);
    
                // Method 3: Click using mouse events
                const box = await button.boundingBox();
                if (box) {
                    await page.mouse.click(
                        box.x + box.width / 2,
                        box.y + box.height / 2
                    ).catch(e => console.log("Mouse click failed:", e));
                }
                await this.#humanDelay(1000);
    
                // Method 4: Dispatch click event
                await page.evaluate(element => {
                    element.dispatchEvent(new MouseEvent('click', {
                        view: window,
                        bubbles: true,
                        cancelable: true,
                        buttons: 1
                    }));
                }, button).catch(e => console.log("Event dispatch failed:", e));
            }
    
            console.log("Click attempts completed");
        } catch (error) {
            console.error("All click attempts failed:", error);
            throw error;
        }
    }


    async #findCreateVideoButton(page) {
        console.log("Searching for Create video button...");
        
        try {
            // Wait for any button with the specific classes and SVG
            const button = await page.waitForSelector(
                'button.inline-flex.bg-token-bg-inverse:has(svg)', 
                { timeout: 10000 }
            );
            
            if (button) {
                console.log("Found Create video button");
                return button;
            }
    
            // If the above fails, try alternative selectors
            const alternativeSelectors = [
                // By class combination
                'button.inline-flex.gap-1\\.5.bg-token-bg-inverse',
                // By data attribute
                'button[data-disabled="false"][data-state="delayed-open"]',
                // By SVG content
                'button:has(svg path[d*="M11.293"])',
                // By span content
                'button:has(span.sr-only:contains("Create video"))'
            ];
    
            for (const selector of alternativeSelectors) {
                const altButton = await page.$(selector);
                if (altButton) {
                    console.log(`Found button using selector: ${selector}`);
                    return altButton;
                }
            }
    
            // If still not found, try finding by evaluating in page context
            const buttonHandle = await page.evaluateHandle(() => {
                return Array.from(document.querySelectorAll('button')).find(button => {
                    const hasSvg = button.querySelector('svg') !== null;
                    const hasCreateVideoText = button.textContent.includes('Create video');
                    const hasCorrectClasses = button.classList.contains('bg-token-bg-inverse');
                    return hasSvg && (hasCreateVideoText || hasCorrectClasses);
                });
            });
    
            if (buttonHandle.asElement()) {
                console.log("Found button using page evaluation");
                return buttonHandle;
            }
    
            throw new Error("Create video button not found");
        } catch (error) {
            console.error("Error finding Create video button:", error);
            throw error;
        }
    }




    // Add these helper methods to the class

async #findButtonByText(page, text) {
    const buttons = await page.$$('button');
    for (const button of buttons) {
        const buttonText = await button.evaluate(el => el.textContent.trim());
        if (buttonText.includes(text)) {
            return button;
        }
    }
    return null;
}

async #isButtonSelected(button) {
    return await button.evaluate(el => {
        return el.classList.contains('selected') || 
               el.getAttribute('aria-selected') === 'true' ||
               el.classList.contains('bg-white') ||  // Add any other selection indicators
               el.closest('button')?.classList.contains('selected');
    });
}

async #selectOptionSafely(page, optionValue, optionType) {
    console.log(`Attempting to set ${optionType} to ${optionValue}`);
    
    try {
        // First try direct selector
        const directSelector = `button:has-text("${optionValue}")`;
        const button = await page.$(directSelector);
        
        if (button) {
            const isSelected = await this.#isButtonSelected(button);
            if (!isSelected) {
                await this.#humanMove(page, button);
                await button.click();
                await this.#humanDelay(300, 600);
            }
            return true;
        }

        // Fallback to evaluation in page context
        const selected = await page.evaluate((value) => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const targetButton = buttons.find(b => b.textContent.trim().includes(value));
            if (targetButton && !targetButton.classList.contains('selected')) {
                targetButton.click();
                return true;
            }
            return false;
        }, optionValue);

        if (selected) {
            await this.#humanDelay(300, 600);
            return true;
        }

        console.warn(`Could not find or select option ${optionValue} for ${optionType}`);
        return false;
    } catch (error) {
        console.error(`Error selecting ${optionType} option:`, error);
        return false;
    }
}




    // Random delay function to mimic human behavior
    async #humanDelay(min = 200, max = 2000) {
        const delay = Math.floor(Math.random() * (max - min) + min);
        await new Promise(resolve => setTimeout(resolve, delay));
    }

    // Simulate human-like typing
    async #humanType(page, selector, text) {
        await page.focus(selector);
        
        for (let i = 0; i < text.length; i++) {
            await page.keyboard.type(text[i], {
                delay: Math.floor(Math.random() * (200 - 50) + 50) // Random delay between keystrokes
            });
            
            // Occasionally pause while typing (like a human)
            if (Math.random() < 0.1) {
                await this.#humanDelay(500, 1000);
            }
        }
    }

    // Simulate human-like mouse movement


    // Simulate human-like scrolling
    async #humanScroll(page) {
        await page.evaluate(async () => {
            const scroll = (distance, duration) => {
                return new Promise((resolve) => {
                    let start = null;
                    function step(timestamp) {
                        if (!start) start = timestamp;
                        const progress = timestamp - start;
                        const percentage = Math.min(progress / duration, 1);
                        
                        window.scrollBy(0, distance * percentage);
                        
                        if (progress < duration) {
                            window.requestAnimationFrame(step);
                        } else {
                            resolve();
                        }
                    }
                    window.requestAnimationFrame(step);
                });
            };

            // Scroll down smoothly
            await scroll(Math.random() * 100 + 100, 1000);
        });
        await this.#humanDelay(500, 1000);
    }

    async initializeBrowser() {
        console.log("Initializing browser...");


        const chromePath = '/app/.chrome-for-testing/chrome-linux64/chrome';
            console.log('Using Chrome path:', chromePath);
        
        
        // Random user agent
        const userAgent = this.#userAgents[Math.floor(Math.random() * this.#userAgents.length)];



        // const PROXY_SERVER = process.env.PROXY_SERVER; // e.g., '11.22.33.44'
        // const PROXY_PORT = process.env.PROXY_PORT;     // e.g., '8080'
        // const PROXY_USER = process.env.PROXY_USERNAME;
        // const PROXY_PASS = process.env.PROXY_PASSWORD;


        const PROXY_SERVER = '180.178.151.1' // e.g., '11.22.33.44'
        const PROXY_PORT = '50100';     // e.g., '8080'
        const PROXY_USER = 'gen24560jNAh'
        const PROXY_PASS = 'vBSmMBABjC'

        // const browser = await puppeteer.launch({
        //     headless: false,
        //     defaultViewport: { width: 1700, height: 800 },
        //     args: [
        //         '--start-maximized',
        //         '--no-sandbox',
        //         '--disable-setuid-sandbox',
        //         '--disable-blink-features=AutomationControlled', // Prevents detection
        //         `--user-agent=${userAgent}`,
        //                         `--proxy-server=${PROXY_SERVER}:${PROXY_PORT}`
        //     ],
        //     ignoreDefaultArgs: ['--enable-automation'],
        // });




        const browser = await puppeteer.launch({
            headless: 'true',
            defaultViewport: { width: 1280, height: 720 },
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-software-rasterizer',
                '--disable-extensions',
                // '--single-process',
                '--no-zygote',
                '--disable-background-networking',
                '--disable-default-apps',
                '--disable-sync',
                '--disable-translate',
                '--hide-scrollbars',
                '--metrics-recording-only',
                '--mute-audio',
                '--no-first-run',
                '--safebrowsing-disable-auto-update',
                '--window-size=1280,720',
                '--disable-blink-features=AutomationControlled',
                `--user-agent=${userAgent}`,
                '--remote-debugging-port=9222',
                `--proxy-server=${PROXY_SERVER}:${PROXY_PORT}`,
            ],
            executablePath: chromePath,
            ignoreHTTPSErrors: true,
            dumpio: true,
            env: {
                ...process.env,
                CHROME_PATH: chromePath,
                CHROMEDRIVER_PATH: '/app/.chrome-for-testing/chromedriver-linux64/chromedriver'
            }
        });

        const page = await browser.newPage();

        await page.authenticate({
            username: PROXY_USER,
            password: PROXY_PASS
        });

                // Set up additional headers and configurations
                await page.setExtraHTTPHeaders({
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                    'Connection': 'keep-alive',
                    'Cache-Control': 'max-age=0'
                });

                        // Set viewport and timeouts
        await page.setViewport({ width: 1280, height: 720 });
        await page.setDefaultNavigationTimeout(60000);
        await page.setDefaultTimeout(30000);




        await page.setViewport({ width: 1700, height: 800 });
        await page.setDefaultNavigationTimeout(60000);
        await page.setDefaultTimeout(30000);

        

// Verify proxy connection
        try {
            console.log('Verifying proxy connection...');
            const testResponse = await page.goto('https://api.ipify.org?format=json', {
                waitUntil: 'networkidle0',
                timeout: 30000
            });
            
            if (testResponse.ok()) {
                const ipData = await testResponse.json();
                console.log('Connected through IP:', ipData.ip);
            } else {
                console.warn('IP check failed with status:', testResponse.status());
            }
        } catch (error) {
            console.warn('Proxy verification failed:', error.message);
            // Continue anyway as the main functionality might still work
        }



        // Set up error handling
        page.on('error', err => {
            console.error('Page error:', err);
        });

        page.on('pageerror', err => {
            console.error('Page error:', err);
        });

        // Handle any authentication dialogs
        page.on('dialog', async dialog => {
            console.log('Dialog appeared:', dialog.message());
            await dialog.dismiss();
        });

        return { browser, page };
    }

    async #humanMove(page, selectorOrElement) {
        try {
            let element;
            if (typeof selectorOrElement === 'string') {
                // If it's a selector string
                element = await page.$(selectorOrElement);
            } else {
                // If it's already an element handle
                element = selectorOrElement;
            }
    
            if (!element) {
                throw new Error('Element not found for mouse movement');
            }
    
            const box = await element.boundingBox();
            if (!box) {
                throw new Error('Could not get element boundaries');
            }
    
            // Move mouse in a natural arc
            const controlPoints = [
                { x: box.x + box.width / 2, y: box.y + box.height / 2 },
                { x: box.x + box.width * Math.random(), y: box.y + box.height * Math.random() },
                { x: box.x + box.width / 2, y: box.y + box.height / 2 }
            ];
    
            await page.mouse.move(controlPoints[0].x, controlPoints[0].y, { steps: 25 });
            await this.#humanDelay(100, 200);
        } catch (error) {
            console.error('Error in humanMove:', error);
            throw error;
        }
    }
    
    async login(page, credentials) {
        try {
            console.log("Navigating to Sora...");
    
            // Set up request interception with proper handling
            const requestHandled = new Set();
            await page.setRequestInterception(true);
            
            page.on('request', request => {
                const url = request.url();
                if (requestHandled.has(url)) {
                    // Skip if already handled
                    return;
                }
                requestHandled.add(url);
    
                console.log('Request:', url);
                try {
                    request.continue();
                } catch (error) {
                    console.warn('Request continue failed:', error.message);
                }
            });
    
            page.on('response', response => {
                console.log('Response:', response.url(), response.status());
            });
    
            // Clear request handlers on navigation
            page.on('framenavigated', () => {
                requestHandled.clear();
            });
    
            // Navigate with proper error handling
            try {
                await page.goto('https://sora.com', { 
                    waitUntil: ['networkidle0', 'domcontentloaded', 'load'],
                    timeout: 60000
                });
            } catch (error) {
                console.error('Navigation failed:', error);
                // Disable request interception if navigation fails
                await page.setRequestInterception(false);
                throw error;
            }
    
            await this.#humanDelay();
            
            console.log("Looking for login button...");
        
        // Log DOM structure around where login button should be
        const buttonDebug = await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            return buttons.map(button => ({
                text: button.textContent,
                classes: button.className,
                isVisible: button.offsetParent !== null,
                html: button.outerHTML
            }));
        });
        console.log('Available buttons:', buttonDebug);

            
            // Wait for the button to be rendered
            await page.waitForFunction(() => {
                const buttons = Array.from(document.querySelectorAll('button'));
                return buttons.some(button => button.textContent.includes('Log in'));
            }, { timeout: 10000 });
    
            // Find the login button
            const loginButton = await page.evaluateHandle(() => {
                const buttons = Array.from(document.querySelectorAll('button'));
                return buttons.find(button => button.textContent.includes('Log in'));
            });
    
            if (!loginButton) {
                throw new Error("Could not find login button");
            }
    
            // Move mouse and click
            await this.#humanMove(page, loginButton);
            await loginButton.click();
            await this.#humanDelay(1000, 2000);
    
            // Rest of the login process
            console.log("Entering email...");
            const emailSelector = 'input[placeholder="Email address"]';
            await page.waitForSelector(emailSelector);
            await this.#humanType(page, emailSelector, credentials.email);
            
            await this.#humanDelay(300, 800);
            await page.keyboard.press('Enter');
    
            console.log("Entering password...");
            const passwordSelector = 'input#password';
            await page.waitForSelector(passwordSelector);
            await this.#humanType(page, passwordSelector, credentials.password);
            
            await this.#humanDelay(300, 800);
            await page.keyboard.press('Enter');
    
            console.log("Waiting for navigation...");
            await page.waitForNavigation({ waitUntil: 'networkidle0' });
 
            
        } catch (error) {
            // Ensure request interception is disabled on error
            try {
                await page.setRequestInterception(false);
            } catch (e) {
                console.warn('Failed to disable request interception:', e);
            }
            
            console.error("Login failed:", error);
            throw error;
        } finally {
            // Clean up
            try {
                await page.setRequestInterception(false);
            } catch (e) {
                console.warn('Failed to disable request interception in cleanup:', e);
            }
        }
    }


    async #isElementVisible(page, selector) {
        try {
            const element = await page.$(selector);
            if (!element) return false;
    
            const isVisible = await element.evaluate(el => {
                const style = window.getComputedStyle(el);
                return style.display !== 'none' && 
                       style.visibility !== 'hidden' && 
                       style.opacity !== '0' &&
                       el.offsetWidth > 0 &&
                       el.offsetHeight > 0;
            });
    
            return isVisible;
        } catch (error) {
            return false;
        }
    }



    async #getElementByText(page, text) {
        const elements = await page.evaluateHandle((searchText) => {
            const elements = [...document.querySelectorAll('*')];
            return elements.find(element => 
                element.textContent.trim() === searchText &&
                (element.tagName === 'BUTTON' || 
                 element.closest('button'))
            );
        }, text);
        
        return elements.asElement();
    }



    async generateVideo(page, { prompt, resolution, duration, aspectRatio }) {

        console.log(prompt, resolution, duration, aspectRatio);
        try {

             // First ensure we're logged in
             await this.loginWithRetry(page, {
                email: process.env.SORA_EMAIL,
                password: process.env.SORA_PASSWORD
            });

            
            console.log("Preparing to generate video...");
            await this.#selectOptionSafely(page, aspectRatio, 'aspect ratio');


await this.#selectOptionSafely(page, `${resolution}p`, 'resolution');
await this.#humanDelay();

await this.#selectOptionSafely(page, duration, 'duration');
await this.#humanDelay();
    
            // Input prompt
            const promptSelector = 'textarea[placeholder="Describe your video..."]';
            await page.waitForSelector(promptSelector);
            await this.#humanMove(page, promptSelector);
            await this.#humanType(page, promptSelector, prompt);
    
            // Simulate thinking time
            await this.#humanDelay(1000, 2000);
    
            console.log("Setting video parameters...");
    
            // Helper function to find and click the correct option
            const selectOption = async (options, targetValue) => {
                for (const option of options) {
                    const text = await option.evaluate(el => el.textContent.trim());
                    if (text.includes(targetValue)) {
                        if (!(await option.evaluate(el => el.classList.contains('selected') || el.getAttribute('aria-selected') === 'true'))) {
                            await this.#humanMove(page, option);
                            await option.click();
                        }
                        return true;
                    }
                }
                return false;
            };
    
            // Set aspect ratio
            console.log("Setting aspect ratio:", aspectRatio);
            const aspectRatioButtons = await page.$$('button');
            if (!await selectOption(aspectRatioButtons, aspectRatio)) {
                console.warn(`Aspect ratio ${aspectRatio} not found`);
            }
            await this.#humanDelay();
    
            // Set resolution
            console.log("Setting resolution:", resolution);
            const resolutionButtons = await page.$$('button');
            if (!await selectOption(resolutionButtons, `${resolution}p`)) {
                console.warn(`Resolution ${resolution} not found`);
            }
            await this.#humanDelay();
    
            // Set duration
            console.log("Setting duration:", duration);
            const durationButtons = await page.$$('button');
            if (!await selectOption(durationButtons, duration)) {
                console.warn(`Duration ${duration} not found`);
            }
            await this.#humanDelay();
    
            // Alternative approach using evaluation in page context
            const setOption = async (optionType, value) => {
                await page.evaluate(
                    ({ optionType, value }) => {
                        const buttons = Array.from(document.querySelectorAll('button'));
                        const button = buttons.find(b => {
                            const text = b.textContent.trim();
                            return text.includes(value) && 
                                   !b.closest('button').classList.contains('selected');
                        });
                        if (button) button.click();
                    },
                    { optionType, value }
                );
            };
    
            // Try both approaches
            try {
                await setOption('aspectRatio', aspectRatio);
                await setOption('resolution', `${resolution}p`);
                await setOption('duration', duration);
            } catch (error) {
                console.warn('Fallback option setting failed:', error);
            }
    
 // Find and click the Create video button
        console.log("Attempting to click Create video button...");
        const createButton = await this.#findCreateVideoButton(page);
        
        
        // Add a small delay before clicking
        await this.#humanDelay(500, 1000);
        
        // Move mouse and attempt click
        await this.#humanMove(page, createButton);
        await this.#humanDelay(300, 800);
        
        // Try multiple click methods
        await this.#clickCreateVideoButton(page, createButton);

        console.log("Starting video generation process...");
        const result = await this.#waitForVideoAndGetUrl(page, prompt);

        console.log(`Video generated successfully in ${Math.round(result.generationTime / 1000)}s`);

        console.log('result.videoUrl', result.videoUrl)
        return {
            success: true,
            message: 'Video generated successfully',
            videoUrl: result.videoUrl,
            generationTime: result.generationTime
        };







    } catch (error) {
        console.error("Video generation failed:", error);
        throw error;
    }

}
}

module.exports = new PuppeteerService();