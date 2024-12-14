const supabase = require('../config/supabase');
const videoController = require('./videoController');
const Queue = require('bull');
const redis = require('redis');

class WebhookController {
    constructor() {
        this.processedEvents = new Set();
        this.initializeQueue();
    }

    async initializeQueue() {
        try {
            // Create Redis client with proper TLS configuration
            this.redisClient = redis.createClient({
                url: process.env.REDIS_URL,
                socket: {
                    tls: true,
                    rejectUnauthorized: false
                }
            });

            // Redis event handlers
            this.redisClient.on('connect', () => {
                console.log('Redis client connected');
            });

            this.redisClient.on('error', (err) => {
                console.error('Redis client error:', err);
            });

            // Connect to Redis
            await this.redisClient.connect();

            // Initialize Bull queue
            this.videoQueue = new Queue('video-generation', {
                createClient: () => this.redisClient,
                defaultJobOptions: {
                    attempts: 3,
                    backoff: {
                        type: 'exponential',
                        delay: 5000
                    },
                    removeOnComplete: true,
                    timeout: 45 * 60 * 1000 // 45 minutes
                }
            });

            // Queue event handlers
            this.videoQueue.on('error', error => {
                console.error('Queue error:', error);
            });

            this.videoQueue.on('failed', (job, error) => {
                console.error('Job failed:', {
                    jobId: job.id,
                    data: job.data,
                    error: error.message
                });
            });

            this.videoQueue.on('completed', job => {
                console.log('Job completed:', {
                    jobId: job.id,
                    data: job.data
                });
            });

            // Set up job processor
            this.videoQueue.process(async (job) => {
                return this.processVideoGeneration(job);
            });

            console.log('Video queue initialized successfully');
        } catch (error) {
            console.error('Failed to initialize queue:', error);
        }
    }

    async processVideoGeneration(job) {
        const { orderId } = job.data;
        let browser = null;

        try {
            const { data: order, error } = await supabase
                .from('orders_2025cool')
                .select('*')
                .eq('daimo_id', orderId)
                .single();

            if (error) throw new Error(`Failed to fetch order: ${error.message}`);

            const { browser: newBrowser, page } = await videoController.initializeBrowser();
            browser = newBrowser;

            const result = await videoController.generateVideo(page, {
                prompt: order.prompt,
                resolution: order.resolution,
                duration: order.duration,
                aspectRatio: order.aspect_ratio
            });

            await supabase
                .from('orders_2025cool')
                .update({
                    status: 'completed',
                    video_url: result.videoUrl,
                    completed_at: new Date().toISOString()
                })
                .eq('daimo_id', orderId);

            return { success: true, videoUrl: result.videoUrl };

        } catch (error) {
            console.error(`Video generation failed for order ${orderId}:`, error);
            
            await supabase
                .from('orders_2025cool')
                .update({
                    status: 'failed',
                    error: error.message,
                    updated_at: new Date().toISOString()
                })
                .eq('daimo_id', orderId);

            throw error;
        } finally {
            if (browser) {
                await browser.close();
            }
        }
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
            if (!this.verifyToken(authHeader)) {
                console.error('Invalid webhook token');
                return res.status(401).json({ error: 'Unauthorized' });
            }

            if (await this.isEventProcessed(idempotencyKey)) {
                console.log('Duplicate event, skipping:', idempotencyKey);
                return res.status(200).json({ status: 'already_processed' });
            }

            await this.processWebhookEvent(req.body, idempotencyKey);
            res.status(200).json({ received: true });

        } catch (error) {
            console.error('Webhook handling error:', error);
            res.status(200).json({ 
                received: true,
                warning: 'Processed with errors'
            });
        }
    }

    verifyToken(authHeader) {
        console.log('authorization', authHeader);
        if (!authHeader || !authHeader.startsWith('Basic ')) {
            return false;
        }

        const token = authHeader.split(' ')[1];
        console.log('verification passed', token === process.env.DAIMO_WEBHOOK_SECRET);
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
        console.log('Processing webhook event:', { event, idempotencyKey });
    
        try {
            const { type, paymentId, chainId, txHash } = event;
    
            await supabase
                .from('processed_webhooks')
                .insert([{
                    idempotency_key: idempotencyKey,
                    event_type: type,
                    payment_id: paymentId
                }]);
    
            const { data: currentOrder } = await supabase
                .from('orders_2025cool')
                .select('payment_status')
                .eq('daimo_id', paymentId)
                .single();
    
            switch (type) {
                case 'payment_started': {
                    if (currentOrder?.payment_status !== 'payment_completed') {
                        await supabase
                            .from('orders_2025cool')
                            .update({
                                payment_status: 'payment_started',
                                payment_chain_id: chainId,
                                payment_tx_hash: txHash,
                                updated_at: new Date().toISOString()
                            })
                            .eq('daimo_id', paymentId);
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
    
            console.log('Webhook processing completed successfully');
    
        } catch (error) {
            console.error('Error processing webhook event:', error);
            throw error;
        }
    }

    async cleanup() {
        try {
            await this.redisClient.quit();
            await this.videoQueue.close();
        } catch (error) {
            console.error('Error during cleanup:', error);
        }
    }
}

// Create instance
const webhookController = new WebhookController();

// Handle cleanup
process.on('SIGTERM', async () => {
    console.log('SIGTERM received. Cleaning up...');
    await webhookController.cleanup();
    process.exit(0);
});

module.exports = webhookController;