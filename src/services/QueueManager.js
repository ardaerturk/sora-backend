// services/QueueManager.js
const videoProcessor = require('./VideoProcessor.js');
const ErrorHandler = require('../utils/ErrorHandler');

class QueueManager {
    constructor() {
        this.queue = [];
        this.isProcessing = false;
        this.maxConcurrent = 1;
        this.activeJobs = new Set();
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