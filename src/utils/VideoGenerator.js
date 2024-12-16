// utils/puppeteer/VideoGenerator.js
const HumanBehavior = require('./HumanBehavior');
const LoginHandler = require('./LoginHandler');
const ErrorHandler = require('../utils/ErrorHandler');

class VideoGenerator {
    static async generate(page, options) {
        try {
            console.log("Starting video generation process...");
            await this.prepareForGeneration(page);
            await this.setVideoOptions(page, options);
            await this.enterPrompt(page, options.prompt);
            
            console.log("Initiating generation...");
            await this.initiateGeneration(page);
            
            console.log("Waiting for video completion...");
            const result = await this.waitForVideo(page, options.prompt);
            
            console.log(`Video generated successfully in ${Math.round(result.generationTime / 1000)}s`);
            return result;
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
    console.log("Attempting to click Create video button...");
    
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

    let generationStarted = false;
    for (const method of clickMethods) {
        try {
            await method();
            await HumanBehavior.delay(2000); // Increased delay
            
            // Check for multiple indicators of generation starting
            generationStarted = await page.evaluate(() => {
                // Check for various indicators that generation has started
                const indicators = [
                    '.video-result',
                    '.generating',
                    '.progress',
                    '[aria-label*="generating"]',
                    '[aria-label*="processing"]',
                    // Add any other relevant selectors
                ];
                
                return indicators.some(selector => 
                    document.querySelector(selector) !== null
                );
            });
            
            if (generationStarted) {
                console.log("Video generation initiated successfully");
                return;
            }
        } catch (error) {
            console.log('Click method failed:', error.message);
        }
    }

    // Don't throw error, just log warning and continue
    console.warn('Could not verify generation start, continuing anyway...');
}

static async waitForVideo(page, promptText) {
    console.log("Waiting for video to appear in library...");
    const START_TIME = Date.now();
    const CHECK_INTERVAL = 10000; // 10 seconds
    const MAX_ATTEMPTS = 240; // 40 minutes total
    let attempts = 0;

    // Set up continuous mouse movement
    const moveMouseInterval = setInterval(async () => {
        try {
            await this.simulateUserActivity(page);
        } catch (error) {
            console.warn('Mouse movement error:', error);
        }
    }, 2000);

    try {
        while (attempts < MAX_ATTEMPTS) {
            try {
                console.log(`Checking for video (attempt ${attempts + 1}/${MAX_ATTEMPTS})...`);
                
                // Perform various interactions to trigger content update
                await this.refreshContentView(page);
                
                const videoUrl = await page.evaluate((searchPrompt) => {
                    // Force re-render of the content
                    window.dispatchEvent(new Event('scroll'));
                    
                    // Look for various indicators of the video
                    const promptDivs = Array.from(document.querySelectorAll('.text-token-text-primary'));
                    console.log('Found prompt divs:', promptDivs.length);
                    
                    const promptDiv = promptDivs.find(div => 
                        div.textContent.toLowerCase().includes(searchPrompt.toLowerCase())
                    );
                    
                    if (!promptDiv) {
                        console.log('Prompt div not found');
                        return null;
                    }
                    
                    const container = promptDiv.closest('[data-index]');
                    if (!container) {
                        console.log('Container not found');
                        return null;
                    }
                    
                    // Try to force video load
                    const videos = container.querySelectorAll('video');
                    videos.forEach(video => {
                        video.load();
                        video.play().catch(() => {}); // Ignore autoplay errors
                    });
                    
                    const video = container.querySelector('video');
                    if (!video) {
                        console.log('Video element not found');
                        return null;
                    }
                    
                    return video.src || null;
                }, promptText);

                if (videoUrl) {
                    console.log("Found video URL:", videoUrl);
                    return {
                        success: true,
                        videoUrl,
                        generationTime: Date.now() - START_TIME
                    };
                }

                // Log progress and perform maintenance
                if (attempts % 5 === 0) {
                    console.log(`Still waiting for video... (${Math.round((Date.now() - START_TIME) / 1000)}s elapsed)`);
                    await this.cleanupResources(page);
                    await this.forceContentRefresh(page);
                }

            } catch (error) {
                console.warn(`Check attempt ${attempts + 1} failed:`, error);
            }

            attempts++;
            await HumanBehavior.delay(CHECK_INTERVAL, CHECK_INTERVAL + 1000);
        }

        throw new Error("Video generation timeout");
    } finally {
        clearInterval(moveMouseInterval);
    }
}

static async simulateUserActivity(page) {
    try {
        // Random mouse movement
        const viewportSize = await page.viewport();
        const x = Math.floor(Math.random() * viewportSize.width);
        const y = Math.floor(Math.random() * viewportSize.height);
        await page.mouse.move(x, y);

        // Occasional scrolling
        if (Math.random() < 0.3) {
            await page.evaluate(() => {
                window.scrollBy(0, (Math.random() * 100) - 50);
            });
        }

        // Occasional page interaction
        if (Math.random() < 0.2) {
            await page.evaluate(() => {
                document.body.click();
                window.dispatchEvent(new Event('mousemove'));
                window.dispatchEvent(new Event('scroll'));
            });
        }
    } catch (error) {
        console.warn('User activity simulation error:', error);
    }
}

static async refreshContentView(page) {
    try {
        await page.evaluate(() => {
            // Force re-render
            window.dispatchEvent(new Event('scroll'));
            window.dispatchEvent(new Event('resize'));
            
            // Force video elements to load
            document.querySelectorAll('video').forEach(video => {
                video.load();
                video.play().catch(() => {});
            });
            
            // Trigger any lazy loading
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        entry.target.dispatchEvent(new Event('mouseenter'));
                    }
                });
            });
            
            document.querySelectorAll('[data-index]').forEach(el => {
                observer.observe(el);
            });
        });
    } catch (error) {
        console.warn('Content refresh error:', error);
    }
}

static async forceContentRefresh(page) {
    try {
        await page.evaluate(() => {
            // Force garbage collection
            window.gc && window.gc();
            
            // Clear any cached content
            performance.clearResourceTimings();
            
            // Reload video elements
            document.querySelectorAll('video').forEach(video => {
                const src = video.src;
                video.src = '';
                video.load();
                video.src = src;
                video.play().catch(() => {});
            });
        });
    } catch (error) {
        console.warn('Force refresh error:', error);
    }
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