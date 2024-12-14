const EventEmitter = require('events');
const puppeteerService = require('../utils/puppeteerUtils');
const emailService = require('./emailService');
const supabase = require('../config/supabase');

class VideoQueue extends EventEmitter {
    constructor() {
        super();
        this.queue = [];
        this.processing = false;
        this.activeJobs = new Map();

        // Set up event listeners
        this.on('job:added', () => this.processNext());
        this.on('job:completed', (jobId) => {
            console.log(`Job ${jobId} completed`);
            this.activeJobs.delete(jobId);
            this.processNext();
        });
        this.on('job:failed', (jobId, error) => {
            console.error(`Job ${jobId} failed:`, error);
            this.activeJobs.delete(jobId);
            this.processNext();
        });
    }

    async addJob(orderId) {
        console.log(`Adding job for order ${orderId} to queue`);
        
        // Check if job is already in queue or processing
        if (this.isJobActive(orderId)) {
            console.log(`Job for order ${orderId} is already in queue or processing`);
            return;
        }

        // Add to queue
        this.queue.push(orderId);
        this.activeJobs.set(orderId, {
            status: 'queued',
            addedAt: new Date(),
            attempts: 0
        });

        this.emit('job:added');
        return orderId;
    }

    isJobActive(orderId) {
        return this.activeJobs.has(orderId);
    }

    async processNext() {
        if (this.processing || this.queue.length === 0) {
            return;
        }

        this.processing = true;
        const orderId = this.queue.shift();
        
        try {
            console.log(`Processing job for order ${orderId}`);
            this.activeJobs.set(orderId, {
                status: 'processing',
                startedAt: new Date()
            });

            // Get order details
            const { data: order, error } = await supabase
                .from('orders_2025cool')
                .select('*')
                .eq('daimo_id', orderId)
                .single();

            if (error) throw new Error(`Failed to fetch order: ${error.message}`);

            // Initialize browser
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

                this.emit('job:completed', orderId);

            } catch (error) {
                console.error(`Error processing order ${orderId}:`, error);
                
                // Update order status to failed
                await supabase
                    .from('orders_2025cool')
                    .update({
                        status: 'failed',
                        error: error.message,
                        updated_at: new Date().toISOString()
                    })
                    .eq('daimo_id', orderId);

                this.emit('job:failed', orderId, error);
            } finally {
                // Always close browser
                if (browser) {
                    await browser.close();
                }
            }

        } catch (error) {
            console.error(`Job ${orderId} failed:`, error);
            this.emit('job:failed', orderId, error);
        } finally {
            this.processing = false;
            this.processNext();
        }
    }

    async getJobStatus(orderId) {
        const jobInfo = this.activeJobs.get(orderId);
        if (!jobInfo) {
            // Check database for completed/failed jobs
            const { data, error } = await supabase
                .from('orders_2025cool')
                .select('status,video_url,error')
                .eq('daimo_id', orderId)
                .single();

            if (error) {
                console.error(`Error fetching job status: ${error.message}`);
                return null;
            }

            return {
                status: data.status,
                videoUrl: data.video_url,
                error: data.error
            };
        }

        return jobInfo;
    }

    getQueueStatus() {
        return {
            queueLength: this.queue.length,
            processing: this.processing,
            activeJobs: Array.from(this.activeJobs.entries()).map(([id, info]) => ({
                id,
                ...info
            }))
        };
    }
}

// Create singleton instance
const videoQueue = new VideoQueue();

// Handle process termination gracefully
process.on('SIGTERM', async () => {
    console.log('SIGTERM received. Cleaning up...');
    // Add any cleanup logic here
    process.exit(0);
});

module.exports = videoQueue;