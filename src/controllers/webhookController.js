const supabase = require('../config/supabase');
const videoController = require('./videoController');
const Queue = require('bull');

// Create a queue for webhook processing


let webhookQueue;
try {
    webhookQueue = new Queue('webhook-processing', process.env.REDIS_URL, {
        redis: {
            tls: {
                rejectUnauthorized: false
            },
            maxRetriesPerRequest: 1,
            enableReadyCheck: false
        }
    });

    // Add queue event listeners
    webhookQueue.on('error', error => {
        console.error('Queue error:', error);
    });

    webhookQueue.on('failed', (job, error) => {
        console.error('Job failed:', {
            jobId: job.id,
            data: job.data,
            error: error.message
        });
    });

    webhookQueue.on('completed', job => {
        console.log('Job completed:', {
            jobId: job.id,
            data: job.data
        });
    });

    console.log('Redis queue initialized successfully');
} catch (error) {
    console.error('Failed to initialize Redis queue:', error);
}

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
            // Verify webhook token
            if (!this.verifyToken(authHeader)) {
                console.error('Invalid webhook token');
                return res.status(401).json({ error: 'Unauthorized' });
            }
    
            // Check idempotency
            if (await this.isEventProcessed(idempotencyKey)) {
                console.log('Duplicate event, skipping:', idempotencyKey);
                return res.status(200).json({ status: 'already_processed' });
            }
    
            // Process the webhook
            if (webhookQueue) {
                console.log('Adding job to queue:', {
                    event: req.body,
                    idempotencyKey
                });
    
                // Add to processing queue
                const job = await webhookQueue.add('process-webhook', {
                    event: req.body,
                    idempotencyKey
                });
    
                console.log('Job added to queue:', job.id);
            } else {
                console.log('Queue not available, processing synchronously');
                // Process synchronously if queue is not available
                await this.processWebhookEvent(req.body, idempotencyKey);
            }
    
            res.status(200).json({ received: true });
    
        } catch (error) {
            console.error('Webhook handling error:', error);
            // Still return 200 to prevent retries
            res.status(200).json({ 
                received: true,
                warning: 'Processed with errors'
            });
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
        console.log('Processing webhook event:', {
            event,
            idempotencyKey
        });
    
        try {
            const { type, paymentId, chainId, txHash } = event;
    
            // Update order based on event type
            switch (type) {
                case 'payment_started': {
                    console.log('Processing payment_started event');
                    const { data, error } = await supabase
                        .from('orders_2025cool')
                        .update({
                            payment_status: 'payment_started',
                            payment_chain_id: chainId,
                            payment_tx_hash: txHash,
                            updated_at: new Date().toISOString()
                        })
                        .eq('daimo_id', paymentId)
                        .select();
    
                    if (error) {
                        console.error('Supabase update error:', error);
                        throw error;
                    }
                    console.log('Payment started update successful:', data);
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

  console.log('Recording processed webhook');
  const { error: insertError } = await supabase
      .from('processed_webhooks')
      .insert([{
          idempotency_key: idempotencyKey,
          event_type: type,
          payment_id: paymentId
      }]);

  if (insertError) {
      console.error('Error recording processed webhook:', insertError);
      throw insertError;
  }

  console.log('Webhook processing completed successfully');

} catch (error) {
  console.error('Error processing webhook event:', error);
  throw error;
}


// Set up webhook queue processor
webhookQueue.process('process-webhook', async (job) => {
    const controller = new WebhookController();
    await controller.processWebhookEvent(job.data.event, job.data.idempotencyKey);
});

module.exports = new WebhookController();