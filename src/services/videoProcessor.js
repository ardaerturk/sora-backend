// src/services/VideoProcessor.js
const pathResolver = require('../utils/pathResolver');

const BrowserManager = require(pathResolver.resolve('utils/BrowserManager'));
const LoginHandler = require(pathResolver.resolve('utils/LoginHandler'));
const VideoGenerator = require(pathResolver.resolve('utils/VideoGenerator'));
const ErrorHandler = require(pathResolver.resolve('utils/ErrorHandler'));
const supabase = require(pathResolver.resolve('config/supabase'));
const emailService = require(pathResolver.resolve('services/EmailService'));

class VideoProcessor {
    constructor() {
        this.activeProcesses = new Map();
        this.browserManager = BrowserManager;
    }

    async processVideo(orderId) {
        console.log(`Starting video processing for order ${orderId}`);
        const sessionId = `${orderId}-${Date.now()}`;
        let browser = null;
        let page = null;

        try {
            // Check if already processing
            if (this.activeProcesses.has(orderId)) {
                console.log(`Order ${orderId} is already being processed`);
                return;
            }

            // Mark as processing
            this.activeProcesses.set(orderId, {
                startTime: Date.now(),
                sessionId
            });

            // Update status to processing
            await this.updateOrderStatus(orderId, 'processing');

            // Fetch order details
            const order = await this.getOrderDetails(orderId);
            if (!order) {
                throw new Error('Order not found');
            }

            // Initialize browser
            console.log(`Initializing browser for order ${orderId}`);
            const browserSetup = await this.browserManager.createBrowser(sessionId);
            browser = browserSetup.browser;
            page = browserSetup.page;

            // Verify proxy connection
            const proxyWorking = await this.browserManager.verifyProxyConnection(page);
            if (!proxyWorking) {
                throw new Error('Proxy connection failed');
            }

            // Login to Sora
            console.log(`Logging in for order ${orderId}`);
            await LoginHandler.login(page, {
                email: process.env.SORA_EMAIL,
                password: process.env.SORA_PASSWORD
            });

            // Generate video
            console.log(`Starting video generation for order ${orderId}`);
            const result = await VideoGenerator.generate(page, {
                prompt: order.prompt,
                resolution: order.resolution,
                duration: order.duration,
                aspectRatio: order.aspect_ratio
            });

            // Handle success
            await this.handleSuccess(orderId, result);

            // Send notification
            await this.sendNotification(order, result.videoUrl);

            return result;

        } catch (error) {
            console.error(`Error processing video for order ${orderId}:`, error);
            await this.handleError(orderId, error);
            throw error;

        } finally {
            // Cleanup
            await this.cleanup(sessionId, orderId, browser);
        }
    }

    async getOrderDetails(orderId) {
        try {
            const { data, error } = await supabase
                .from('orders_2025cool')
                .select('*')
                .eq('daimo_id', orderId)
                .single();

            if (error) {
                throw new Error(`Failed to fetch order details: ${error.message}`);
            }

            if (!data) {
                throw new Error('Order not found');
            }

            return data;

        } catch (error) {
            console.error(`Error fetching order ${orderId}:`, error);
            throw error;
        }
    }

    async handleSuccess(orderId, result) {
        try {
            const processTime = Date.now() - this.activeProcesses.get(orderId).startTime;
            
            const { error } = await supabase
                .from('orders_2025cool')
                .update({
                    status: 'completed',
                    video_url: result.videoUrl,
                    completed_at: new Date().toISOString(),
                    processing_time: processTime,
                    generation_time: result.generationTime,
                    updated_at: new Date().toISOString()
                })
                .eq('daimo_id', orderId);

            if (error) {
                throw new Error(`Failed to update order status: ${error.message}`);
            }

            console.log(`Successfully completed order ${orderId}`, {
                processingTime: processTime,
                generationTime: result.generationTime
            });

        } catch (error) {
            console.error(`Error handling success for order ${orderId}:`, error);
            throw error;
        }
    }

    async handleError(orderId, error) {
        try {
            await this.updateOrderStatus(orderId, 'failed', error.message);
            await ErrorHandler.logError(error, {
                orderId,
                component: 'VideoProcessor',
                processStartTime: this.activeProcesses.get(orderId)?.startTime,
                processDuration: Date.now() - (this.activeProcesses.get(orderId)?.startTime || 0)
            });
        } catch (updateError) {
            console.error(`Error updating failure status for order ${orderId}:`, updateError);
        }
    }

    async updateOrderStatus(orderId, status, errorMessage = null) {
        try {
            const update = {
                status,
                updated_at: new Date().toISOString()
            };

            if (errorMessage) {
                update.error = errorMessage;
            }

            const { error } = await supabase
                .from('orders_2025cool')
                .update(update)
                .eq('daimo_id', orderId);

            if (error) {
                throw new Error(`Failed to update order status: ${error.message}`);
            }

            console.log(`Updated status for order ${orderId} to ${status}`);

        } catch (error) {
            console.error(`Error updating status for order ${orderId}:`, error);
            throw error;
        }
    }

    async sendNotification(order, videoUrl) {
        try {
            await emailService.addToQueue(
                order.email,
                videoUrl,
                {
                    prompt: order.prompt,
                    resolution: order.resolution,
                    duration: order.duration
                }
            );
            console.log(`Notification queued for order ${order.daimo_id}`);
        } catch (error) {
            console.error(`Error sending notification for order ${order.daimo_id}:`, error);
            // Log but don't throw to prevent marking generation as failed
            await ErrorHandler.logError(error, {
                orderId: order.daimo_id,
                component: 'VideoProcessor.sendNotification'
            });
        }
    }

    async cleanup(sessionId, orderId, browser) {
        try {
            if (browser) {
                await this.browserManager.closeBrowser(sessionId);
            }
            this.activeProcesses.delete(orderId);
            console.log(`Cleaned up resources for order ${orderId}`);
        } catch (cleanupError) {
            console.error(`Cleanup error for order ${orderId}:`, cleanupError);
            await ErrorHandler.logError(cleanupError, {
                orderId,
                component: 'VideoProcessor.cleanup'
            });
        }
    }

    getActiveProcesses() {
        return Array.from(this.activeProcesses.entries()).map(([orderId, data]) => ({
            orderId,
            startTime: data.startTime,
            duration: Date.now() - data.startTime,
            sessionId: data.sessionId
        }));
    }

    async forceCleanup(orderId) {
        const processData = this.activeProcesses.get(orderId);
        if (processData) {
            await this.cleanup(processData.sessionId, orderId, null);
        }
    }
}
module.exports = new VideoProcessor();

