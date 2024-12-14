const supabase = require('../config/supabase');
const queueManager = require('../services/QueueManager');
const ErrorHandler = require('../utils/ErrorHandler');

class VideoController {
    async generateVideo(req, res) {
        const { orderId } = req.body;

        try {
            // Get current queue status
            const currentStatus = queueManager.getQueueStatus();
            
            // Check if order is already in queue or being processed
            if (currentStatus.activeJobs.includes(orderId) || 
                queueManager.queue.includes(orderId)) {
                return res.json({
                    success: true,
                    message: 'Video generation already in progress',
                    status: currentStatus.activeJobs.includes(orderId) ? 'processing' : 'queued',
                    queueStatus: currentStatus
                });
            }

            // Validate order
            const order = await this.validateOrder(orderId);
            if (!order) {
                return res.status(404).json({
                    success: false,
                    error: 'Order not found'
                });
            }

            // Validate order status
            if (!this.isValidOrderStatus(order.status)) {
                return res.status(400).json({
                    success: false,
                    error: `Invalid order status: ${order.status}`
                });
            }

            // Add to queue
            await queueManager.addJob(orderId);

            // Update order status to queued
            await this.updateOrderStatus(orderId, 'queued');

            // Get updated queue status
            const updatedStatus = queueManager.getQueueStatus();

            res.json({
                success: true,
                message: 'Video generation queued successfully',
                status: 'queued',
                queuePosition: updatedStatus.queueLength,
                estimatedWaitTime: this.calculateEstimatedWaitTime(updatedStatus.queueLength),
                queueStatus: updatedStatus
            });

        } catch (error) {
            await this.handleError(error, orderId, res);
        }
    }

    async validateOrder(orderId) {
        try {
            const { data: order, error } = await supabase
                .from('orders_2025cool')
                .select('*')
                .eq('daimo_id', orderId)
                .single();

            if (error) {
                throw new Error(`Failed to fetch order: ${error.message}`);
            }

            return order;
        } catch (error) {
            console.error(`Order validation error for ${orderId}:`, error);
            throw error;
        }
    }

    isValidOrderStatus(status) {
        const validStatuses = [
            'pending_generation',
            'payment_completed',
            'failed'  // Allow retrying failed generations
        ];
        return validStatuses.includes(status);
    }

    async updateOrderStatus(orderId, status, error = null) {
        try {
            const update = {
                status,
                updated_at: new Date().toISOString()
            };

            if (error) {
                update.error = error;
            }

            const { error: updateError } = await supabase
                .from('orders_2025cool')
                .update(update)
                .eq('daimo_id', orderId);

            if (updateError) {
                throw new Error(`Failed to update order status: ${updateError.message}`);
            }
        } catch (error) {
            console.error(`Status update error for ${orderId}:`, error);
            throw error;
        }
    }

    async getGenerationStatus(orderId) {
        try {
            const { data: order, error } = await supabase
                .from('orders_2025cool')
                .select('status, error, video_url, created_at, updated_at')
                .eq('daimo_id', orderId)
                .single();

            if (error) {
                throw new Error(`Failed to fetch generation status: ${error.message}`);
            }

            const queueStatus = queueManager.getQueueStatus();
            const isQueued = queueManager.queue.includes(orderId);
            const isProcessing = queueStatus.activeJobs.includes(orderId);

            return {
                success: true,
                status: order.status,
                error: order.error,
                videoUrl: order.video_url,
                createdAt: order.created_at,
                updatedAt: order.updated_at,
                isQueued,
                isProcessing,
                queuePosition: isQueued ? queueManager.queue.indexOf(orderId) + 1 : null,
                estimatedWaitTime: isQueued ? 
                    this.calculateEstimatedWaitTime(queueManager.queue.indexOf(orderId) + 1) : null,
                queueStatus
            };
        } catch (error) {
            await ErrorHandler.logError(error, { orderId, component: 'VideoController' });
            throw error;
        }
    }

    calculateEstimatedWaitTime(queuePosition) {
        // Assuming average processing time of 5 minutes per video
        const averageProcessingTime = 5;
        const estimatedMinutes = (queuePosition - 1) * averageProcessingTime;
        
        return {
            minutes: estimatedMinutes,
            formatted: this.formatWaitTime(estimatedMinutes)
        };
    }

    formatWaitTime(minutes) {
        if (minutes < 1) {
            return 'less than a minute';
        } else if (minutes < 60) {
            return `about ${minutes} minute${minutes === 1 ? '' : 's'}`;
        } else {
            const hours = Math.floor(minutes / 60);
            const remainingMinutes = minutes % 60;
            return `about ${hours} hour${hours === 1 ? '' : 's'}${
                remainingMinutes ? ` and ${remainingMinutes} minute${remainingMinutes === 1 ? '' : 's'}` : ''
            }`;
        }
    }

    async handleError(error, orderId, res) {
        await ErrorHandler.logError(error, { 
            orderId, 
            component: 'VideoController',
            timestamp: new Date().toISOString()
        });

        // Update order status if possible
        try {
            if (orderId) {
                await this.updateOrderStatus(orderId, 'failed', error.message);
            }
        } catch (updateError) {
            console.error('Failed to update order status:', updateError);
        }

        // Send error response
        res.status(500).json({
            success: false,
            error: error.message,
            code: error.code || 'GENERATION_ERROR'
        });
    }
}

module.exports = new VideoController();