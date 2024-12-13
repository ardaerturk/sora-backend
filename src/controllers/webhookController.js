const supabase = require('../config/supabase');
const videoController = require('./videoController');
const Queue = require('bull');
const Redis = require('ioredis');

// Parse Redis URL and configure SSL
const parseRedisUrl = (url) => {
    try {
        const parsedUrl = new URL(url);
        return {
            host: parsedUrl.hostname,
            port: parsedUrl.port,
            password: parsedUrl.password,
            username: parsedUrl.username,
            db: parsedUrl.pathname ? parsedUrl.pathname.substring(1) : 0,
            tls: {
                rejectUnauthorized: false,
                requestCert: true,
                agent: false,
                // For Heroku Redis
                sslProtocol: 'TLSv1_2_method'
            }
        };
    } catch (error) {
        console.error('Failed to parse Redis URL:', error);
        return null;
    }
};

// Initialize Redis and Queue
let webhookQueue;
const initializeQueue = () => {
    try {
        const redisConfig = parseRedisUrl(process.env.REDIS_URL);
        if (!redisConfig) {
            throw new Error('Invalid Redis URL');
        }

        console.log('Initializing Redis with config:', {
            host: redisConfig.host,
            port: redisConfig.port,
            tls: !!redisConfig.tls
        });

        // Create Redis client
        const client = new Redis({
            ...redisConfig,
            maxRetriesPerRequest: 1,
            enableReadyCheck: false,
            retryStrategy: (times) => {
                if (times > 3) {
                    console.log('Max Redis retries reached');
                    return null;
                }
                const delay = Math.min(times * 100, 3000);
                console.log(`Retrying Redis connection in ${delay}ms`);
                return delay;
            },
            reconnectOnError: (err) => {
                console.log('Redis reconnect on error:', err.message);
                return true;
            }
        });

        client.on('connect', () => {
            console.log('Redis client connected');
        });

        client.on('error', (error) => {
            console.error('Redis client error:', error);
        });

        client.on('ready', () => {
            console.log('Redis client ready');
        });

        // Create queue with the Redis client
        webhookQueue = new Queue('webhook-processing', {
            createClient: () => client,
            defaultJobOptions: {
                attempts: 3,
                backoff: {
                    type: 'exponential',
                    delay: 1000
                },
                removeOnComplete: true,
                removeOnFail: false
            }
        });

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
        return true;
    } catch (error) {
        console.error('Failed to initialize Redis queue:', error);
        return false;
    }
};


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

            // Always process synchronously for reliability
            await this.processWebhookEvent(req.body, idempotencyKey);
            
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
    
            // First, record the webhook to prevent duplicates
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
    
            // Check current order status before processing
            const { data: currentOrder, error: fetchError } = await supabase
                .from('orders_2025cool')
                .select('payment_status')
                .eq('daimo_id', paymentId)
                .single();
    
            if (fetchError) {
                console.error('Error fetching current order status:', fetchError);
                throw fetchError;
            }
    
            // Then process the event based on current status
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
    
                        if (error) throw error;
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
                            payment_completed_chain_id: chainId,
                            payment_completed_tx_hash: txHash,
                            updated_at: new Date().toISOString()
                        })
                        .eq('daimo_id', paymentId)
                        .select()
                        .single();
                
                    if (error) throw error;
                
                    if (order) {
                        console.log('Adding video generation job to queue:', order.id);
                        await videoQueue.addJob(order.daimo_id);
                    }
                    break;
                }
    
                case 'payment_bounced': {
                    console.log('Processing payment_bounced event');
                    // Always update bounced status as it's a terminal state
                    const { error } = await supabase
                        .from('orders_2025cool')
                        .update({
                            payment_status: 'payment_bounced',
                            error_chain_id: chainId,
                            error_tx_hash: txHash,
                            updated_at: new Date().toISOString()
                        })
                        .eq('daimo_id', paymentId);
    
                    if (error) throw error;
                    break;
                }
            }
    
            console.log('Webhook processing completed successfully');
    
        } catch (error) {
            console.error('Error processing webhook event:', error);
            throw error;
        }
    }
}

// Initialize queue (but don't depend on it)
initializeQueue();

module.exports = new WebhookController();