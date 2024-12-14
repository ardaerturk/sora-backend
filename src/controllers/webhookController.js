const supabase = require('../config/supabase');
const videoQueue = require('../services/videoQueue');

class WebhookController {
    constructor() {
        this.processedEvents = new Set();
    }

    async handleWebhook(req, res) {
        console.log('Processing webhook:', {
            method: req.method,
            path: req.path,
            headers: req.headers,
            body: req.body
        });

        const authHeader = req.headers.authorization;
        const idempotencyKey = req.headers['idempotency-key'];

        try {
            // Quick response as required by Daimo
            res.status(200).json({ received: true });

            // Verify webhook token
            if (!this.verifyToken(authHeader)) {
                console.error('Invalid webhook token');
                return;
            }

            // Check idempotency
            if (await this.isEventProcessed(idempotencyKey)) {
                console.log('Duplicate event, skipping:', idempotencyKey);
                return;
            }

            // Process the webhook
            await this.processWebhookEvent(req.body, idempotencyKey);

        } catch (error) {
            console.error('Webhook handling error:', error);
            // Don't send error response as we've already responded
        }
    }

    verifyToken(authHeader) {
        console.log('Authorization header:', authHeader);
        if (!authHeader || !authHeader.startsWith('Basic ')) {
            return false;
        }

        const token = authHeader.split(' ')[1];
        const isValid = token === process.env.DAIMO_WEBHOOK_SECRET;
        console.log('Token verification:', isValid ? 'passed' : 'failed');
        return isValid;
    }

    async isEventProcessed(idempotencyKey) {
        try {
            const { data } = await supabase
                .from('processed_webhooks')
                .select('id')
                .eq('idempotency_key', idempotencyKey)
                .single();

            return !!data;
        } catch (error) {
            console.error('Error checking processed webhook:', error);
            return false;
        }
    }

    async processWebhookEvent(event, idempotencyKey) {
        console.log('Processing webhook event:', {
            event,
            idempotencyKey
        });

        try {
            const { type, paymentId, chainId, txHash } = event;

            // First, record the webhook to prevent duplicates
            console.log('Recording processed webhook');
            const { error: insertError } = await supabase
                .from('processed_webhooks')
                .insert([{
                    idempotency_key: idempotencyKey,
                    event_type: type,
                    payment_id: paymentId,
                    created_at: new Date().toISOString()
                }]);

            if (insertError) {
                console.error('Error recording processed webhook:', insertError);
                throw insertError;
            }

            // Check current order status
            const { data: currentOrder, error: fetchError } = await supabase
                .from('orders_2025cool')
                .select('payment_status, status')
                .eq('daimo_id', paymentId)
                .single();

            if (fetchError) {
                console.error('Error fetching current order status:', fetchError);
                throw fetchError;
            }

            // Process based on event type
            switch (type) {
                case 'payment_started': {
                    console.log('Processing payment_started event');
                    // Only update if not already completed
                    if (currentOrder.payment_status !== 'payment_completed') {
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
                            console.error('Error updating payment_started status:', error);
                            throw error;
                        }
                    } else {
                        console.log('Skipping payment_started update as order is already completed');
                    }
                    break;
                }

                case 'payment_completed': {
                    console.log('Processing payment_completed event');
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
                        console.error('Error updating payment_completed status:', error);
                        throw error;
                    }

                    if (order) {
                        console.log('Adding to video generation queue:', order.daimo_id);
                        await videoQueue.addJob(order.daimo_id);
                    }
                    break;
                }

                case 'payment_bounced': {
                    console.log('Processing payment_bounced event');
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
                        console.error('Error updating payment_bounced status:', error);
                        throw error;
                    }
                    break;
                }

                default: {
                    console.warn('Unknown event type:', type);
                }
            }

            console.log('Webhook processing completed successfully');

        } catch (error) {
            console.error('Error processing webhook event:', error);
            
            // Try to update order status on error
            try {
                await supabase
                    .from('orders_2025cool')
                    .update({
                        status: 'failed',
                        error: error.message,
                        updated_at: new Date().toISOString()
                    })
                    .eq('daimo_id', event.paymentId);
            } catch (updateError) {
                console.error('Error updating order status after failure:', updateError);
            }

            throw error;
        }
    }

    // Helper method to get webhook status
    async getWebhookStatus(idempotencyKey) {
        try {
            const { data, error } = await supabase
                .from('processed_webhooks')
                .select('*')
                .eq('idempotency_key', idempotencyKey)
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error getting webhook status:', error);
            return null;
        }
    }
}

module.exports = new WebhookController();