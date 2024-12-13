const Queue = require('bull');
const redis = require('redis');
const puppeteerService = require('../utils/puppeteerUtils');
const emailService = require('./emailService');
const supabase = require('../config/supabase');

class VideoQueue {
    constructor() {
        this.initializeQueue();
    }

    async initializeQueue() {
        try {
            // Initialize Redis client
            const redisClient = redis.createClient({
                url: process.env.REDIS_URL,
                socket: {
                    tls: process.env.REDIS_URL.includes('rediss:'),
                    rejectUnauthorized: false
                }
            });

            // Handle Redis connection events
            redisClient.on('connect', () => {
                console.log('Redis client connected');
            });

            redisClient.on('error', (err) => {
                console.error('Redis client error:', err);
            });

            // Connect to Redis
            await redisClient.connect();

            // Initialize Bull queue with Redis client
            this.queue = new Queue('video-generation', {
                createClient: () => redisClient,
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
            console.error('Failed to initialize video queue:', error);
            throw error;
        }
    }

    setupQueueHandlers() {
        // Process one job at a time
        this.queue.process(1, async (job) => {
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

                // Update status to processing
                await supabase
                    .from('orders_2025cool')
                    .update({
                        status: 'processing',
                        updated_at: new Date().toISOString()
                    })
                    .eq('daimo_id', orderId);

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
                    try {
                        await browser.close();
                    } catch (error) {
                        console.error('Error closing browser:', error);
                    }
                }
            }
        });

        // Queue event handlers
        this.queue.on('completed', (job, result) => {
            console.log(`Job ${job.id} completed:`, result);
        });

        this.queue.on('failed', (job, error) => {
            console.error(`Job ${job.id} failed:`, error);
        });

        this.queue.on('error', (error) => {
            console.error('Queue error:', error);
        });

        // Clean old jobs
        this.queue.on('cleaned', (jobs, type) => {
            console.log('Cleaned %s %s jobs', jobs.length, type);
        });
    }

    async addJob(orderId) {
        // Check if job already exists
        const existingJob = await this.queue.getJob(orderId);
        if (existingJob) {
            const state = await existingJob.getState();
            console.log(`Job ${orderId} already exists with state:`, state);
            return existingJob;
        }

        // Add new job
        return this.queue.add(
            { orderId },
            {
                jobId: orderId,
                removeOnComplete: true,
                removeOnFail: false
            }
        );
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
            timestamp: job.timestamp,
            attemptsMade: job.attemptsMade
        };
    }

    async cleanOldJobs() {
        // Clean completed jobs older than 1 hour
        await this.queue.clean(3600000, 'completed');
        // Clean failed jobs older than 24 hours
        await this.queue.clean(24 * 3600000, 'failed');
    }
}

// Export singleton instance
module.exports = new VideoQueue();