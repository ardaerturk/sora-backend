const Queue = require('bull');
const redis = require('redis');
const puppeteerService = require('../utils/puppeteerUtils');
const emailService = require('./emailService');
const supabase = require('../config/supabase');

class VideoQueue {
    constructor() {
        this.initializeRedis();
    }

    async initializeRedis() {
        try {
            // Create Redis client with proper TLS configuration
            this.redisClient = redis.createClient({
                url: process.env.REDIS_URL,
                socket: {
                    tls: true,
                    rejectUnauthorized: false
                }
            });

            // Redis event handlers
            this.redisClient.on('connect', () => {
                console.log('Redis client connected');
            });

            this.redisClient.on('error', (err) => {
                console.error('Redis client error:', err);
            });

            // Connect to Redis
            await this.redisClient.connect();

            // Initialize Bull queue using the Redis client
            this.queue = new Queue('video-generation', {
                createClient: () => this.redisClient,
                defaultJobOptions: {
                    attempts: 3,
                    backoff: {
                        type: 'exponential',
                        delay: 5000
                    },
                    removeOnComplete: true,
                    timeout: 45 * 60 * 1000 // 45 minutes
                }
            });

            this.setupQueueHandlers();
            console.log('Video queue initialized successfully');

        } catch (error) {
            console.error('Failed to initialize Redis:', error);
            throw error;
        }
    }

    setupQueueHandlers() {
        this.queue.process(async (job) => {
            console.log(`Processing video generation job ${job.id}`);
            const { orderId } = job.data;
            let browser = null;

            try {
                // Get order details
                const { data: order, error } = await supabase
                    .from('orders_2025cool')
                    .select('*')
                    .eq('daimo_id', orderId)
                    .single();

                if (error) throw new Error(`Failed to fetch order: ${error.message}`);

                // Initialize browser for this job
                const { browser: newBrowser, page } = await puppeteerService.initializeBrowser();
                browser = newBrowser;

                // Generate video
                const result = await puppeteerService.generateVideo(page, {
                    prompt: order.prompt,
                    resolution: order.resolution,
                    duration: order.duration,
                    aspectRatio: order.aspect_ratio
                });

                // Update order with video URL
                await supabase
                    .from('orders_2025cool')
                    .update({
                        status: 'completed',
                        video_url: result.videoUrl,
                        completed_at: new Date().toISOString()
                    })
                    .eq('daimo_id', orderId);

                // Send email notification
                await emailService.sendVideoReadyEmail(
                    order.email,
                    result.videoUrl,
                    order
                );

                return { success: true, videoUrl: result.videoUrl };

            } catch (error) {
                console.error(`Job ${job.id} failed:`, error);
                
                // Update order status to failed
                await supabase
                    .from('orders_2025cool')
                    .update({
                        status: 'failed',
                        error: error.message,
                        updated_at: new Date().toISOString()
                    })
                    .eq('daimo_id', orderId);

                throw error;
            } finally {
                // Always close browser
                if (browser) {
                    await browser.close();
                }
            }
        });

        this.queue.on('completed', (job, result) => {
            console.log(`Job ${job.id} completed:`, result);
        });

        this.queue.on('failed', (job, error) => {
            console.error(`Job ${job.id} failed:`, error);
        });

        this.queue.on('error', (error) => {
            console.error('Queue error:', error);
        });
    }

    async addJob(orderId) {
        try {
            return await this.queue.add({ orderId }, {
                jobId: orderId, // Use orderId as jobId for deduplication
                removeOnComplete: true
            });
        } catch (error) {
            console.error('Failed to add job to queue:', error);
            throw error;
        }
    }

    async getJobStatus(orderId) {
        try {
            const job = await this.queue.getJob(orderId);
            if (!job) return null;

            const state = await job.getState();
            return {
                id: job.id,
                state,
                progress: job._progress,
                failedReason: job.failedReason,
                timestamp: job.timestamp
            };
        } catch (error) {
            console.error('Failed to get job status:', error);
            return { error: error.message };
        }
    }

    async cleanup() {
        try {
            await this.redisClient.quit();
            await this.queue.close();
        } catch (error) {
            console.error('Error during cleanup:', error);
        }
    }
}

// Create singleton instance
const videoQueue = new VideoQueue();

// Handle process termination
process.on('SIGTERM', async () => {
    console.log('SIGTERM received. Cleaning up...');
    await videoQueue.cleanup();
    process.exit(0);
});

module.exports = videoQueue;