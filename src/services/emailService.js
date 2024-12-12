const { Resend } = require('resend');
const createEmailTemplate = require('../utils/emailTemplate');

class EmailService {
    constructor() {
        this.resend = new Resend('re_GekThMeR_PeZqcqD9sGUjUHNuU6Ni5LMg');
        this.emailQueue = [];
        this.isProcessing = false;
    }

    async addToQueue(email, videoUrl, orderDetails) {
        this.emailQueue.push({ email, videoUrl, orderDetails });
        if (!this.isProcessing) {
            await this.processQueue();
        }
    }

    async processQueue() {
        if (this.emailQueue.length === 0) {
            this.isProcessing = false;
            return;
        }

        this.isProcessing = true;
        const { email, videoUrl, orderDetails } = this.emailQueue.shift();

        try {
            await this.resend.emails.send({
                from: 'Sora AI Video <sora@2025.email>',
                to: email,
                subject: 'Your AI Video is Ready! 🎬',
                html: createEmailTemplate(videoUrl, orderDetails)
            });

            console.log(`Email sent successfully to ${email}`);
        } catch (error) {
            console.error(`Failed to send email to ${email}:`, error);
            // Optionally retry failed emails
            if (!orderDetails.retryCount || orderDetails.retryCount < 3) {
                this.emailQueue.push({
                    email,
                    videoUrl,
                    orderDetails: { ...orderDetails, retryCount: (orderDetails.retryCount || 0) + 1 }
                });
            }
        }

        // Process next email in queue
        await this.processQueue();
    }
}

module.exports = new EmailService();