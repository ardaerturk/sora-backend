// utils/puppeteer/HumanBehavior.js
class HumanBehavior {
    static async delay(min = 200, max = 2000) {
        const delay = Math.floor(Math.random() * (max - min) + min);
        await new Promise(resolve => setTimeout(resolve, delay));
    }

    static async type(page, selector, text) {
        await page.focus(selector);
        
        for (let i = 0; i < text.length; i++) {
            await page.keyboard.type(text[i], {
                delay: Math.floor(Math.random() * (200 - 50) + 50)
            });
            
            if (Math.random() < 0.1) {
                await this.delay(500, 1000);
            }
        }
    }

    static async move(page, element) {
        const box = await element.boundingBox();
        if (!box) return;

        // Calculate bezier curve control points
        const start = { x: Math.random() * page.viewport().width, y: Math.random() * page.viewport().height };
        const end = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        const control1 = {
            x: start.x + (end.x - start.x) * (0.3 + Math.random() * 0.2),
            y: start.y + (end.y - start.y) * (0.3 + Math.random() * 0.2)
        };
        const control2 = {
            x: start.x + (end.x - start.x) * (0.6 + Math.random() * 0.2),
            y: start.y + (end.y - start.y) * (0.6 + Math.random() * 0.2)
        };

        // Move mouse along bezier curve
        for (let i = 0; i <= 1; i += 0.1) {
            const point = this.bezierPoint(start, control1, control2, end, i);
            await page.mouse.move(point.x, point.y);
            await this.delay(10, 30);
        }
    }

    static bezierPoint(start, control1, control2, end, t) {
        return {
            x: Math.pow(1 - t, 3) * start.x +
               3 * Math.pow(1 - t, 2) * t * control1.x +
               3 * (1 - t) * Math.pow(t, 2) * control2.x +
               Math.pow(t, 3) * end.x,
            y: Math.pow(1 - t, 3) * start.y +
               3 * Math.pow(1 - t, 2) * t * control1.y +
               3 * (1 - t) * Math.pow(t, 2) * control2.y +
               Math.pow(t, 3) * end.y
        };
    }

    static async scroll(page) {
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

            await scroll(Math.random() * 100 + 100, 1000);
        });
        await this.delay(500, 1000);
    }
}

module.exports = HumanBehavior;