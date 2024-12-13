const Queue = require('bull');
const redis = require('redis');
const puppeteerService = require('../utils/puppeteerUtils');
const emailService = require('./emailService');
const supabase = require('../config/supabase');

class VideoQueue {
    constructor() {
        // Initialize Redis client
        this.redisClient = redis.createClient({
            url: process.env.REDIS_URL,
            socket: {
                tls: process.env.REDIS_URL.includes('rediss:'),
                rejectUnauthorized: false,
            }
        });

        // Handle Redis connection events
        this.redisClient.on('connect', () => {
            console.log('Redis client connected');
        });

        this.redisClient.on('error', (err) => {
            console.error('Redis client error:', err);
        });

        // Initialize Bull queue with Redis client
        this.queue = new Queue('video-generation', {
            createClient: (type) => {
                switch (type) {
                    case 'client':
                        return this.redisClient;
                    case 'subscriber':
                        return this.redisClient.duplicate();
                    case 'bclient':
                        return this.redisClient.duplicate();
                    default:
                        return this.redisClient;
                }
            },
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

        // Connect to Redis
        this.connect();
        this.setupQueueHandlers();
    }

    async connect() {
        try {
            await this.redisClient.connect();
            console.log('Connected to Redis successfully');
        } catch (error) {
            console.error('Failed to connect to Redis:', error);
            // Implement retry logic if needed
            setTimeout(() => this.connect(), 5000);
        }
    }

    setupQueueHandlers() {
        this.queue.process(async (job) => {
            console.log(`Processing video generation job ${job.id}`);
            const { orderId } = job.data;

            try {
                // Get order details
                const { data: order, error } = await supabase
                    .from('orders_2025cool')
                    .select('*')
                    .eq('daimo_id', orderId)
                    .single();

                if (error) throw new Error(`Failed to fetch order: ${error.message}`);

                // Initialize browser for this job
                const { browser, page } = await puppeteerService.initializeBrowser();

                try {
                    // Update order status to processing
                    await supabase
                        .from('orders_2025cool')
                        .update({
                            status: 'processing',
                            updated_at: new Date().toISOString()
                        })
                        .eq('daimo_id', orderId);

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

                } finally {
                    // Always close browser
                    if (browser) {
                        await browser.close();
                    }
                }
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
        return this.queue.add({ orderId }, {
            jobId: orderId,
            removeOnComplete: true,
            attempts: 3
        });
    }

    async getJobStatus(orderId) {
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