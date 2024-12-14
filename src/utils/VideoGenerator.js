// utils/puppeteer/VideoGenerator.js
const HumanBehavior = require('./HumanBehavior');
const LoginHandler = require('./LoginHandler');
const ErrorHandler = require('../utils/ErrorHandler');

class VideoGenerator {
    static async generate(page, options) {
        try {
            await this.prepareForGeneration(page);
            await this.setVideoOptions(page, options);
            await this.enterPrompt(page, options.prompt);
            await this.initiateGeneration(page);
            return await this.waitForVideo(page, options.prompt);
        } catch (error) {
            await this.handleGenerationError(page, error, options);
            throw error;
        }
    }

    static async prepareForGeneration(page) {
        await page.goto('https://sora.com', {
            waitUntil: ['networkidle0', 'domcontentloaded'],
            timeout: 60000
        });
        await HumanBehavior.delay(2000, 3000);
    }

    static async verifyOptionSet(page, value, optionType) {
        try {
            const isSet = await page.evaluate((searchValue) => {
                const buttons = Array.from(document.querySelectorAll('button'));
                const targetButton = buttons.find(button => 
                    button.textContent.trim().toLowerCase().includes(searchValue.toLowerCase())
                );
                
                if (!targetButton) return false;
                
                return targetButton.classList.contains('selected') ||
                       targetButton.getAttribute('aria-selected') === 'true' ||
                       targetButton.classList.contains('bg-white') ||
                       targetButton.closest('button')?.classList.contains('selected');
            }, value);
    
            if (!isSet) {
                console.warn(`Failed to verify ${optionType} setting: ${value}`);
                return false;
            }
    
            return true;
        } catch (error) {
            console.error(`Error verifying ${optionType} setting:`, error);
            return false;
        }
    }

    static async setVideoOptions(page, options) {
        const { aspectRatio, resolution, duration } = options;
        
        // Set options in sequence with natural delays
        await this.setOption(page, aspectRatio, 'aspect ratio');
        await HumanBehavior.delay(500, 1000);
        
        if (!await this.verifyOptionSet(page, aspectRatio, 'aspect ratio')) {
            console.warn('Aspect ratio setting may have failed');
        }
        
        await this.setOption(page, `${resolution}p`, 'resolution');
        await HumanBehavior.delay(500, 1000);
        
        if (!await this.verifyOptionSet(page, `${resolution}p`, 'resolution')) {
            console.warn('Resolution setting may have failed');
        }
        
        await this.setOption(page, duration, 'duration');
        await HumanBehavior.delay(500, 1000);
        
        if (!await this.verifyOptionSet(page, duration, 'duration')) {
            console.warn('Duration setting may have failed');
        }
    }

    static async setOption(page, value, optionType) {
        console.log(`Setting ${optionType} to ${value}`);
        
        let button = null;
    
        // Try multiple strategies to find the button
        try {
            // Strategy 1: Direct text content match
            button = await page.evaluateHandle((searchValue) => {
                return Array.from(document.querySelectorAll('button'))
                    .find(button => 
                        button.textContent.trim().includes(searchValue) &&
                        !button.closest('button').classList.contains('selected')
                    );
            }, value);
    
            if (!await button.asElement()) {
                button = null;
            }
    
            // Strategy 2: Case-insensitive match
            if (!button) {
                button = await page.evaluateHandle((searchValue) => {
                    return Array.from(document.querySelectorAll('button'))
                        .find(button => 
                            button.textContent.trim().toLowerCase().includes(searchValue.toLowerCase())
                        );
                }, value);
    
                if (!await button.asElement()) {
                    button = null;
                }
            }
    
            // Strategy 3: Wait for selector
            if (!button) {
                try {
                    button = await page.waitForSelector(
                        `button:has-text("${value}")`,
                        { timeout: 5000 }
                    );
                } catch (error) {
                    console.log(`Selector strategy failed for ${value}`);
                }
            }
    
            // Strategy 4: Complex evaluation
            if (!button) {
                button = await page.evaluateHandle((searchValue, type) => {
                    const buttons = Array.from(document.querySelectorAll('button'));
                    return buttons.find(button => {
                        const text = button.textContent.trim();
                        const hasText = text.toLowerCase().includes(searchValue.toLowerCase());
                        const isCorrectType = type === 'resolution' ? 
                            text.includes('p') : 
                            true;
                        return hasText && isCorrectType;
                    });
                }, value, optionType);
    
                if (!await button.asElement()) {
                    button = null;
                }
            }
    
            if (button) {
                // Check if already selected
                const isSelected = await button.evaluate(el => {
                    return el.classList.contains('selected') ||
                           el.getAttribute('aria-selected') === 'true' ||
                           el.classList.contains('bg-white') ||
                           el.closest('button')?.classList.contains('selected');
                });
    
                if (!isSelected) {
                    await HumanBehavior.move(page, button);
                    await button.click();
                    await HumanBehavior.delay(300, 600);
    
                    // Verify selection
                    const verifySelected = await button.evaluate(el => {
                        return el.classList.contains('selected') ||
                               el.getAttribute('aria-selected') === 'true' ||
                               el.classList.contains('bg-white') ||
                               el.closest('button')?.classList.contains('selected');
                    });
    
                    if (!verifySelected) {
                        console.warn(`Selection verification failed for ${optionType}: ${value}`);
                    }
                } else {
                    console.log(`${optionType} ${value} is already selected`);
                }
            } else {
                console.warn(`${optionType} button not found for value: ${value}`);
                
                // Log current buttons for debugging
                await page.evaluate(() => {
                    console.log('Available buttons:', 
                        Array.from(document.querySelectorAll('button'))
                            .map(b => ({
                                text: b.textContent.trim(),
                                classes: Array.from(b.classList),
                                isVisible: b.offsetParent !== null
                            }))
                    );
                });
            }
    
        } catch (error) {
            console.error(`Error setting ${optionType} to ${value}:`, error);
            throw new Error(`Failed to set ${optionType} to ${value}: ${error.message}`);
        }
    }

// ... continuing utils/puppeteer/VideoGenerator.js

static async enterPrompt(page, prompt) {
    const promptSelector = 'textarea[placeholder="Describe your video..."]';
    await page.waitForSelector(promptSelector);
    await HumanBehavior.move(page, await page.$(promptSelector));
    await HumanBehavior.type(page, promptSelector, prompt);
    await HumanBehavior.delay(1000, 2000);
}

static async initiateGeneration(page) {
    const createButton = await this.findCreateButton(page);
    if (!createButton) {
        throw new Error('Create video button not found');
    }

    await HumanBehavior.move(page, createButton);
    await HumanBehavior.delay(300, 800);
    await this.clickCreateButton(page, createButton);
}

static async findCreateButton(page) {
    const selectors = [
        'button.inline-flex.bg-token-bg-inverse:has(svg)',
        'button.inline-flex.gap-1\\.5.bg-token-bg-inverse',
        'button[data-disabled="false"][data-state="delayed-open"]',
        'button:has(svg path[d*="M11.293"])',
        'button:has(span.sr-only:contains("Create video"))'
    ];

    for (const selector of selectors) {
        try {
            const button = await page.waitForSelector(selector, { timeout: 5000 });
            if (button) return button;
        } catch (error) {
            console.log(`Selector failed: ${selector}`);
        }
    }

    // Fallback to evaluation
    return await page.evaluateHandle(() => {
        return Array.from(document.querySelectorAll('button')).find(button => {
            const hasSvg = button.querySelector('svg') !== null;
            const hasCreateVideoText = button.textContent.includes('Create video');
            const hasCorrectClasses = button.classList.contains('bg-token-bg-inverse');
            return hasSvg && (hasCreateVideoText || hasCorrectClasses);
        });
    });
}

static async clickCreateButton(page, button) {
    const clickMethods = [
        // Method 1: Direct click
        async () => await button.click(),
        
        // Method 2: Evaluate click
        async () => await page.evaluate(el => el.click(), button),
        
        // Method 3: Mouse click
        async () => {
            const box = await button.boundingBox();
            if (box) {
                await page.mouse.click(
                    box.x + box.width / 2,
                    box.y + box.height / 2
                );
            }
        },
        
        // Method 4: Dispatch click event
        async () => await page.evaluate(el => {
            el.dispatchEvent(new MouseEvent('click', {
                view: window,
                bubbles: true,
                cancelable: true,
                buttons: 1
            }));
        }, button)
    ];

    for (const method of clickMethods) {
        try {
            await method();
            await HumanBehavior.delay(1000);
            
            // Verify if generation started
            const generationStarted = await page.evaluate(() => {
                return !!document.querySelector('.video-result');
            });
            
            if (generationStarted) return;
        } catch (error) {
            console.log('Click method failed:', error.message);
        }
    }

    throw new Error('Failed to initiate video generation');
}

static async waitForVideo(page, promptText) {
    console.log("Waiting for video generation...");
    const START_TIME = Date.now();
    const CHECK_INTERVAL = 10000; // 10 seconds
    const MAX_ATTEMPTS = 240; // 40 minutes total
    
    for (let attempts = 0; attempts < MAX_ATTEMPTS; attempts++) {
        try {
            const videoUrl = await this.checkForVideo(page, promptText);
            if (videoUrl) {
                return {
                    success: true,
                    videoUrl,
                    generationTime: Date.now() - START_TIME
                };
            }
        } catch (error) {
            console.warn(`Check attempt ${attempts + 1} failed:`, error);
        }

        await HumanBehavior.delay(CHECK_INTERVAL, CHECK_INTERVAL + 1000);
        
        if (attempts % 5 === 0) {
            await this.cleanupResources(page);
        }
    }

    throw new Error("Video generation timeout");
}

static async checkForVideo(page, promptText) {
    return await page.evaluate((searchPrompt) => {
        const promptDiv = Array.from(document.querySelectorAll('.text-token-text-primary'))
            .find(div => div.textContent.toLowerCase().includes(searchPrompt.toLowerCase()));
        
        if (!promptDiv) return null;
        
        const video = promptDiv.closest('[data-index]')?.querySelector('video');
        return video?.src || null;
    }, promptText);
}

static async cleanupResources(page) {
    try {
        await page.evaluate(() => {
            window.gc && window.gc();
            performance.clearResourceTimings();
        });

        const client = await page.target().createCDPSession();
        await client.send('Network.clearBrowserCache');
        await client.send('Network.clearBrowserCookies');
        await client.detach();
    } catch (error) {
        console.warn('Cleanup error:', error);
    }
}

static async handleGenerationError(page, error, options) {
    await ErrorHandler.logError(error, {
        component: 'VideoGenerator',
        options,
        url: await page.url(),
        timestamp: new Date().toISOString()
    });

    try {
        await page.screenshot({
            path: `generation-error-${Date.now()}.png`,
            fullPage: true
        });
    } catch (screenshotError) {
        console.error('Failed to take error screenshot:', screenshotError);
    }
}
}

module.exports = VideoGenerator;