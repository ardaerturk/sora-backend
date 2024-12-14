const { createClient } = require('redis');
const Bull = require('bull');
const puppeteerService = require('../utils/puppeteerUtils');
const emailService = require('./emailService');
const supabase = require('../config/supabase');
const Redis = require('ioredis'); // Add this for Bull

class VideoQueue {
    constructor() {
        // Redis configuration
        const redisConfig = {
            username: process.env.REDIS_USERNAME || 'default',
            password: process.env.REDIS_PASSWORD,
            host: process.env.REDIS_HOST,
            port: parseInt(process.env.REDIS_PORT),
            tls: {
                rejectUnauthorized: false
            }
        };

        // Create Redis client for general use
        this.redisClient = createClient({
            username: redisConfig.username,
            password: redisConfig.password,
            socket: {
                host: redisConfig.host,
                port: redisConfig.port,
                tls: redisConfig.tls
            }
        });

        // Create IoRedis client for Bull
        const bullRedisClient = new Redis({
            port: redisConfig.port,
            host: redisConfig.host,
            username: redisConfig.username,
            password: redisConfig.password,
            tls: redisConfig.tls,
            maxRetriesPerRequest: null,
            enableReadyCheck: false
        });

        // Initialize Bull queue with IoRedis client
        this.queue = new Bull('video-generation', {
            createClient: (type) => {
                switch (type) {
                    case 'client':
                        return bullRedisClient;
                    case 'subscriber':
                        return bullRedisClient.duplicate();
                    case 'bclient':
                        return bullRedisClient.duplicate();
                    default:
                        return bullRedisClient;
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

        // Set up Redis client event handlers
        this.redisClient.on('error', err => {
            console.error('Redis Client Error:', err);
        });

        this.redisClient.on('connect', () => {
            console.log('Redis Client Connected');
        });

        this.redisClient.on('ready', () => {
            console.log('Redis Client Ready');
        });

        // Initialize Redis connection
        this.init();
    }

    async init() {
        try {
            await this.redisClient.connect();
            console.log('Redis connection established');
            this.setupQueueHandlers();
        } catch (error) {
            console.error('Failed to connect to Redis:', error);
        }
    }

    setupQueueHandlers() {
        this.queue.process(async (job) => {
            console.log(`Processing video generation job ${job.id}`);
            const { orderId } = job.data;

            try {
                // Update job progress
                await job.progress(0);
                
                // Get order details
                const { data: order, error } = await supabase
                    .from('orders_2025cool')
                    .select('*')
                    .eq('daimo_id', orderId)
                    .single();

                if (error) throw new Error(`Failed to fetch order: ${error.message}`);

                await job.progress(10);

                // Initialize browser for this job
                const { browser, page } = await puppeteerService.initializeBrowser();

                try {
                    await job.progress(20);

                    // Generate video
                    const result = await puppeteerService.generateVideo(page, {
                        prompt: order.prompt,
                        resolution: order.resolution,
                        duration: order.duration,
                        aspectRatio: order.aspect_ratio
                    });

                    await job.progress(80);

                    // Update order with video URL
                    await supabase
                        .from('orders_2025cool')
                        .update({
                            status: 'completed',
                            video_url: result.videoUrl,
                            completed_at: new Date().toISOString()
                        })
                        .eq('daimo_id', orderId);

                    await job.progress(90);

                    // Send email notification
                    await emailService.addToQueue(
                        order.email,
                        result.videoUrl,
                        {
                            prompt: order.prompt,
                            resolution: order.resolution,
                            duration: order.duration
                        }
                    );
                



                    await job.progress(100);

                    // Store result in Redis for quick access
                    await this.redisClient.set(
                        `video:${orderId}:result`,
                        JSON.stringify(result),
                        {
                            EX: 24 * 60 * 60 // Expire after 24 hours
                        }
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

                // Store error in Redis
                await this.redisClient.set(
                    `video:${orderId}:error`,
                    JSON.stringify({ error: error.message }),
                    {
                        EX: 24 * 60 * 60 // Expire after 24 hours
                    }
                );

                throw error;
            }
        });

        this.queue.on('completed', async (job, result) => {
            console.log(`Job ${job.id} completed:`, result);
            await this.redisClient.set(
                `job:${job.id}:status`,
                'completed',
                {
                    EX: 24 * 60 * 60
                }
            );
        });

        this.queue.on('failed', async (job, error) => {
            console.error(`Job ${job.id} failed:`, error);
            await this.redisClient.set(
                `job:${job.id}:status`,
                'failed',
                {
                    EX: 24 * 60 * 60
                }
            );
        });

        this.queue.on('error', (error) => {
            console.error('Queue error:', error);
        });
    }

    async addJob(orderId) {
        // Check if job already exists
        const existingJob = await this.queue.getJob(orderId);
        if (existingJob) {
            console.log(`Job already exists for order ${orderId}`);
            return existingJob;
        }

        return this.queue.add(
            { orderId },
            {
                jobId: orderId,
                removeOnComplete: true,
                attempts: 3
            }
        );
    }

    async getJobStatus(orderId) {
        try {
            // Try to get status from Redis first
            const cachedStatus = await this.redisClient.get(`job:${orderId}:status`);
            if (cachedStatus) {
                return { status: cachedStatus };
            }

            // If not in Redis, check Bull queue
            const job = await this.queue.getJob(orderId);
            if (!job) return null;

            const state = await job.getState();
            const status = {
                id: job.id,
                state,
                progress: job._progress,
                failedReason: job.failedReason,
                timestamp: job.timestamp
            };

            // Cache the status
            await this.redisClient.set(
                `job:${orderId}:status`,
                JSON.stringify(status),
                {
                    EX: 300 // Cache for 5 minutes
                }
            );

            return status;
        } catch (error) {
            console.error('Error getting job status:', error);
            return { error: 'Failed to get job status' };
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