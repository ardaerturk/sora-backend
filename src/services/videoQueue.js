const Queue = require('bull');
const Redis = require('ioredis');
const puppeteerService = require('../utils/puppeteerUtils');
const emailService = require('./emailService');
const supabase = require('../config/supabase');

class VideoQueue {
    constructor() {
        this.queue = new Queue('video-generation', {
            redis: {
                port: process.env.REDIS_PORT,
                host: process.env.REDIS_HOST,
                password: process.env.REDIS_PASSWORD,
                tls: {
                    rejectUnauthorized: false,
                    requestCert: true,
                    agent: false,
                    sslProtocol: 'TLSv1_2_method'
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

        this.setupQueueHandlers();
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
            jobId: orderId, // Use orderId as jobId for deduplication
            removeOnComplete: true
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
}

module.exports = new VideoQueue();