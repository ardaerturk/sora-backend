const supabase = require('../config/supabase');
const videoController = require('./videoController');
const Queue = require('bull');

// Create a queue for webhook processing


const webhookQueue = new Queue('webhook-processing', process.env.REDIS_URL);

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

            // Add to processing queue
            await webhookQueue.add('process-webhook', {
                event: req.body,
                idempotencyKey
            });

        } catch (error) {
            console.error('Webhook handling error:', error);
            // Don't send error response as we've already responded
        }
    }

    verifyToken(authHeader) {
        console.log('authorization', authHeader)
        if (!authHeader || !authHeader.startsWith('Basic ')) {
            return false;
        }

        const token = authHeader.split(' ')[1];

        console.log('verification passed', token === process.env.DAIMO_WEBHOOK_SECRET)

        return token === process.env.DAIMO_WEBHOOK_SECRET;
    }   

    

    async isEventProcessed(idempotencyKey) {
        const { data } = await supabase
            .from('processed_webhooks')
            .select('payment_id')
            .eq('idempotency_key', idempotencyKey)
            .single();

        return !!data;
    }

    async processWebhookEvent(event, idempotencyKey) {
        try {
            const { type, paymentId, chainId, txHash } = event;

            // Update order based on event type
            switch (type) {
                case 'payment_started': {
                    await supabase
                        .from('orders_2025cool')
                        .update({
                            payment_status: 'payment_started',
                            payment_chain_id: chainId,
                            payment_tx_hash: txHash,
                            updated_at: new Date().toISOString()
                        })
                        .eq('daimo_id', paymentId);
                    break;
                }

                case 'payment_completed': {
                    const { data: order } = await supabase
                        .from('orders_2025cool')
                        .update({
                            payment_status: 'payment_completed',
                            payment_completed_chain_id: chainId,
                            payment_completed_tx_hash: txHash,
                            updated_at: new Date().toISOString()
                        })
                        .eq('daimo_id', paymentId)
                        .select()
                        .single();

                    if (order) {
                        // Trigger video generation
                        await videoController.generateVideo({
                            body: { orderId: order.id }
                        }, {
                            json: () => ({ success: true })
                        });
                    }
                    break;
                }

                case 'payment_bounced': {
                    await supabase
                        .from('orders_2025cool')
                        .update({
                            payment_status: 'payment_bounced',
                            error_chain_id: chainId,
                            error_tx_hash: txHash,
                            updated_at: new Date().toISOString()
                        })
                        .eq('daimo_id', paymentId);
                    break;
                }
            }

            // Record processed webhook
            await supabase
                .from('processed_webhooks')
                .insert([{
                    idempotency_key: idempotencyKey,
                    event_type: type,
                    payment_id: paymentId
                }]);

        } catch (error) {
            console.error('Error processing webhook event:', error);
            throw error;
        }
    }
}

// Set up webhook queue processor
webhookQueue.process('process-webhook', async (job) => {
    const controller = new WebhookController();
    await controller.processWebhookEvent(job.data.event, job.data.idempotencyKey);
});

module.exports = new WebhookController();