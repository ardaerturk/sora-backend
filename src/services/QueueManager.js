// src/services/QueueManager.js
const pathResolver = require('../utils/pathResolver');

let VideoProcessor;
try {
    // Try multiple possible paths
    const possiblePaths = [
        'services/VideoProcessor',
        'Services/VideoProcessor',
        'services/videoProcessor',
        'Services/videoProcessor'
    ];

    let loaded = false;
    for (const p of possiblePaths) {
        try {
            const resolvedPath = pathResolver.resolve(p);
            console.log(`Attempting to load VideoProcessor from: ${resolvedPath}`);
            VideoProcessor = require(resolvedPath);
            loaded = true;
            console.log(`Successfully loaded VideoProcessor from: ${resolvedPath}`);
            break;
        } catch (e) {
            console.log(`Failed to load from ${p}:`, e.message);
        }
    }

    if (!loaded) {
        throw new Error('Could not load VideoProcessor from any expected path');
    }

} catch (error) {
    console.error('Error loading VideoProcessor:', error);
    console.error('Current directory:', process.cwd());
    console.error('Directory contents:', fs.readdirSync(process.cwd()));
    throw error;
}

class QueueManager {
    constructor() {
        this.queue = [];
        this.isProcessing = false;
        this.maxConcurrent = 1;
        this.activeJobs = new Set();
        this.videoProcessor = VideoProcessor;
    }

    async addJob(orderId) {
        this.queue.push(orderId);
        console.log(`Job added to queue: ${orderId}. Queue length: ${this.queue.length}`);
        
        if (!this.isProcessing) {
            await this.processQueue();
        }
    }

    async processQueue() {
        if (this.isProcessing || this.queue.length === 0) {
            return;
        }

        this.isProcessing = true;

        try {
            while (this.queue.length > 0 && this.activeJobs.size < this.maxConcurrent) {
                const orderId = this.queue.shift();
                this.activeJobs.add(orderId);

                try {
                    console.log(`Processing job ${orderId}`);
                    await videoProcessor.processVideo(orderId);
                    console.log(`Completed processing job ${orderId}`);
                } catch (error) {
                    console.error(`Error processing job ${orderId}:`, error);
                    await ErrorHandler.logError(error, {
                        orderId,
                        component: 'QueueManager',
                        error: error.message,
                        stack: error.stack
                    });
                } finally {
                    this.activeJobs.delete(orderId);
                }
            }
        } catch (error) {
            console.error('Queue processing error:', error);
            await ErrorHandler.logError(error, {
                component: 'QueueManager',
                error: error.message,
                stack: error.stack
            });
        } finally {
            this.isProcessing = this.activeJobs.size > 0;
            
            // If there are more items in the queue, continue processing
            if (this.queue.length > 0 && !this.isProcessing) {
                await this.processQueue();
            }
        }
    }

    getQueueStatus() {
        return {
            queueLength: this.queue.length,
            activeJobs: Array.from(this.activeJobs),
            isProcessing: this.isProcessing,
            currentQueue: [...this.queue] // Make a copy of current queue
        };
    }

    clearQueue() {
        this.queue = [];
        this.activeJobs.clear();
        this.isProcessing = false;
    }
}

module.exports = new QueueManager();