const { Resend } = require('resend');
const createEmailTemplate = require('../utils/emailTemplate');
const ErrorHandler = require('../utils/ErrorHandler');

class EmailService {
    constructor() {
        this.resend = new Resend('re_GekThMeR_PeZqcqD9sGUjUHNuU6Ni5LMg');
        this.emailQueue = [];
        this.isProcessing = false;
        this.maxRetries = 3;
        this.retryDelay = 5000; // 5 seconds
        this.processInterval = null;
    }

    async initialize() {
        // Start processing queue periodically
        this.processInterval = setInterval(() => {
            if (!this.isProcessing && this.emailQueue.length > 0) {
                this.processQueue();
            }
        }, 1000);
    }

    async shutdown() {
        if (this.processInterval) {
            clearInterval(this.processInterval);
        }
        // Process remaining emails
        if (this.emailQueue.length > 0) {
            await this.processQueue();
        }
    }

    async addToQueue(email, videoUrl, orderDetails) {
        const emailJob = {
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            email,
            videoUrl,
            orderDetails,
            retryCount: 0,
            addedAt: new Date()
        };

        this.emailQueue.push(emailJob);
        console.log(`Email added to queue for ${email}. Queue length: ${this.emailQueue.length}`);

        if (!this.isProcessing) {
            await this.processQueue();
        }
    }

    async processQueue() {
        if (this.isProcessing || this.emailQueue.length === 0) {
            return;
        }

        this.isProcessing = true;

        try {
            while (this.emailQueue.length > 0) {
                const job = this.emailQueue[0]; // Peek at the next job
                
                try {
                    await this.sendEmail(job);
                    this.emailQueue.shift(); // Remove successfully processed job
                } catch (error) {
                    if (job.retryCount < this.maxRetries) {
                        // Move to end of queue for retry
                        const failedJob = this.emailQueue.shift();
                        failedJob.retryCount++;
                        failedJob.lastError = error.message;
                        failedJob.nextRetry = new Date(Date.now() + this.retryDelay);
                        this.emailQueue.push(failedJob);
                        
                        await new Promise(resolve => setTimeout(resolve, this.retryDelay));
                    } else {
                        // Log permanent failure
                        await this.handlePermanentFailure(this.emailQueue.shift(), error);
                    }
                }
            }
        } catch (error) {
            console.error('Queue processing error:', error);
            await ErrorHandler.logError(error, { component: 'EmailService' });
        } finally {
            this.isProcessing = false;
        }
    }

    async sendEmail(job) {
        try {
            const { email, videoUrl, orderDetails } = job;
            
            const response = await this.resend.emails.send({
                from: 'Sora AI Video <sora@2025.email>',
                to: email,
                subject: 'Your AI Video is Ready! 🎬',
                html: createEmailTemplate(videoUrl, orderDetails),
                tags: [
                    { name: 'category', value: 'video_delivery' },
                    { name: 'resolution', value: orderDetails.resolution },
                    { name: 'duration', value: orderDetails.duration }
                ]
            });

            await this.logEmailSuccess(job, response);
            return response;

        } catch (error) {
            await this.logEmailError(job, error);
            throw error;
        }
    }

    async handlePermanentFailure(job, error) {
        try {
            await supabase
                .from('email_failures')
                .insert([{
                    email: job.email,
                    order_details: job.orderDetails,
                    error_message: error.message,
                    retry_count: job.retryCount,
                    created_at: job.addedAt,
                    failed_at: new Date()
                }]);

        } catch (logError) {
            console.error('Failed to log email failure:', logError);
        }
    }

    async logEmailSuccess(job, response) {
        try {
            await supabase
                .from('email_logs')
                .insert([{
                    email: job.email,
                    status: 'sent',
                    message_id: response.id,
                    order_details: job.orderDetails,
                    created_at: new Date()
                }]);
        } catch (error) {
            console.warn('Failed to log email success:', error);
        }
    }

    async logEmailError(job, error) {
        try {
            await supabase
                .from('email_logs')
                .insert([{
                    email: job.email,
                    status: 'failed',
                    error_message: error.message,
                    retry_count: job.retryCount,
                    order_details: job.orderDetails,
                    created_at: new Date()
                }]);
        } catch (logError) {
            console.warn('Failed to log email error:', logError);
        }
    }

    getQueueStatus() {
        return {
            queueLength: this.emailQueue.length,
            isProcessing: this.isProcessing,
            oldestJob: this.emailQueue[0]?.addedAt,
            failedJobs: this.emailQueue.filter(job => job.retryCount > 0).length
        };
    }
}

// Create and initialize service
const emailService = new EmailService();
emailService.initialize();

// Handle graceful shutdown
process.on('SIGTERM', async () => {
    console.log('Shutting down email service...');
    await emailService.shutdown();
});

module.exports = emailService;