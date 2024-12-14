const supabase = require('../config/supabase');
const queueManager = require('../services/QueueManager');

class WebhookController {
    constructor() {
        this.processedEvents = new Set();
    }

    async handleWebhook(req, res) {
        const idempotencyKey = req.headers['idempotency-key'];
        
        // Quick response as required by Daimo
        res.status(200).json({ received: true });

        try {
            // Verify webhook authenticity
            if (!this.verifyWebhook(req)) {
                console.error('Invalid webhook request');
                return;
            }

            // Check for duplicate events
            if (await this.isDuplicateEvent(idempotencyKey)) {
                console.log('Duplicate event skipped:', idempotencyKey);
                return;
            }

            await this.processWebhookEvent(req.body, idempotencyKey);

        } catch (error) {
            console.error('Webhook processing error:', error);
            await this.logWebhookError(error, req.body);
        }
    }

    verifyWebhook(req) {
        const token = req.headers.authorization?.split(' ')[1];
        return token === process.env.DAIMO_WEBHOOK_SECRET;
    }

    async isDuplicateEvent(idempotencyKey) {
        const { data } = await supabase
            .from('processed_webhooks')
            .select('id')
            .eq('idempotency_key', idempotencyKey)
            .single();
        
        return !!data;
    }

    async processWebhookEvent(event, idempotencyKey) {
        const { type, paymentId, chainId, txHash } = event;

        // Record webhook to prevent duplicates
        await this.recordWebhook(idempotencyKey, event);

        // Get current order status
        const order = await this.getOrderStatus(paymentId);
        
        try {
            switch (type) {
                case 'payment_started':
                    await this.handlePaymentStarted(paymentId, chainId, txHash, order);
                    break;

                case 'payment_completed':
                    await this.handlePaymentCompleted(paymentId, txHash, order);
                    break;

                case 'payment_bounced':
                    await this.handlePaymentBounced(paymentId, txHash);
                    break;

                default:
                    console.warn('Unknown event type:', type);
            }
        } catch (error) {
            await this.handleProcessingError(paymentId, error);
            throw error;
        }
    }

    async recordWebhook(idempotencyKey, event) {
        const { error } = await supabase
            .from('processed_webhooks')
            .insert([{
                idempotency_key: idempotencyKey,
                event_type: event.type,
                payment_id: event.paymentId,
                created_at: new Date().toISOString()
            }]);

        if (error) {
            throw new Error(`Failed to record webhook: ${error.message}`);
        }
    }

    async getOrderStatus(paymentId) {
        const { data, error } = await supabase
            .from('orders_2025cool')
            .select('payment_status, status')
            .eq('daimo_id', paymentId)
            .single();

        if (error) {
            throw new Error(`Failed to fetch order status: ${error.message}`);
        }

        return data;
    }

    async handlePaymentStarted(paymentId, chainId, txHash, currentOrder) {
        if (currentOrder.payment_status === 'payment_completed') {
            console.log('Skipping payment_started for completed order');
            return;
        }

        const { error } = await supabase
            .from('orders_2025cool')
            .update({
                payment_status: 'payment_started',
                payment_chain_id: chainId,
                payment_tx_hash: txHash,
                updated_at: new Date().toISOString()
            })
            .eq('daimo_id', paymentId);

        if (error) {
            throw new Error(`Failed to update payment_started status: ${error.message}`);
        }
    }

    async handlePaymentCompleted(paymentId, txHash, currentOrder) {
        const { data: order, error } = await supabase
            .from('orders_2025cool')
            .update({
                payment_status: 'payment_completed',
                payment_completed_tx_hash: txHash,
                status: 'pending_generation',
                updated_at: new Date().toISOString()
            })
            .eq('daimo_id', paymentId)
            .select()
            .single();

        if (error) {
            throw new Error(`Failed to update payment_completed status: ${error.message}`);
        }

        // Add to video generation queue
        await queueManager.addJob(paymentId);
    }

    async handlePaymentBounced(paymentId, txHash) {
        const { error } = await supabase
            .from('orders_2025cool')
            .update({
                payment_status: 'payment_bounced',
                status: 'failed',
                error_tx_hash: txHash,
                error: 'Payment bounced',
                updated_at: new Date().toISOString()
            })
            .eq('daimo_id', paymentId);

        if (error) {
            throw new Error(`Failed to update payment_bounced status: ${error.message}`);
        }
    }

    async handleProcessingError(paymentId, error) {
        try {
            await supabase
                .from('orders_2025cool')
                .update({
                    status: 'failed',
                    error: error.message,
                    updated_at: new Date().toISOString()
                })
                .eq('daimo_id', paymentId);
        } catch (updateError) {
            console.error('Failed to update error status:', updateError);
        }
    }

    async logWebhookError(error, eventData) {
        try {
            await supabase
                .from('webhook_errors')
                .insert([{
                    error_message: error.message,
                    error_stack: error.stack,
                    event_data: eventData,
                    created_at: new Date().toISOString()
                }]);
        } catch (logError) {
            console.error('Failed to log webhook error:', logError);
        }
    }
}

module.exports = new WebhookController();