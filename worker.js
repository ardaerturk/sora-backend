const throng = require('throng');
const Queue = require('bull');
const { processVideo } = require('./services/videoProcessor');

// Configure concurrent workers
const WORKERS = process.env.WEB_CONCURRENCY || 2;
const maxJobsPerWorker = 1; // Each worker handles one video at a time

// Redis connection for Bull queue
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

// Create video processing queue
const videoQueue = new Queue('video-processing', REDIS_URL, {
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 5000
        },
        removeOnComplete: false,
        removeOnFail: false,
        timeout: 45 * 60 * 1000 // 45 minutes timeout
    }
});

// Worker function
function start() {
    console.log('Worker started');

    // Process videos
    videoQueue.process(maxJobsPerWorker, async (job) => {
        const { orderId } = job.data;
        console.log(`Processing order: ${orderId}`);

        try {
            await processVideo(orderId);
            return { success: true };
        } catch (error) {
            console.error(`Failed to process order ${orderId}:`, error);
            throw error;
        }
    });

    // Handle completed jobs
    videoQueue.on('completed', (job, result) => {
        console.log(`Job ${job.id} completed for order ${job.data.orderId}`);
    });

    // Handle failed jobs
    videoQueue.on('failed', (job, error) => {
        console.error(`Job ${job.id} failed for order ${job.data.orderId}:`, error);
    });
}

// Start workers
throng({ workers: WORKERS, start });