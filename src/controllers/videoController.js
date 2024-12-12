const puppeteerService = require('../utils/puppeteerUtils');
const config = require('../config/config');
const supabase = require('../config/supabase');
const emailService = require('../services/emailService');

class VideoController {
    constructor() {
        this.activeGenerations = new Map();
    }

    async generateVideo(req, res) {
        const { orderId } = req.body;

        try {
            // Check if generation is already in progress
            if (this.activeGenerations.has(orderId)) {
                return res.json({ 
                    success: true, 
                    message: 'Video generation already in progress' 
                });
            }

            // Fetch order details
            const { data: order, error } = await supabase
                .from('orders_2025cool')
                .select('*')
                .eq('daimo_id', orderId)
                .single();

            if (error) throw new Error(`Failed to fetch order: ${error.message}`);
            if (!order) throw new Error('Order not found');

            // Mark generation as active
            this.activeGenerations.set(orderId, true);

            // Start generation process
            const { browser, page } = await puppeteerService.initializeBrowser();
            try {
                await puppeteerService.login(page, config.soraCredentials);
    
                const result = await puppeteerService.generateVideo(page, {
                    prompt: order.prompt,
                    resolution: order.resolution,
                    duration: order.duration,
                    aspectRatio: order.aspect_ratio
                });
    
                console.log('Generation result:', result);
    
                // Update order with video URL
                const { data: updateData, error: updateError } = await supabase
                    .from('orders_2025cool')
                    .update({ 
                        status: 'completed',
                        video_url: result.videoUrl,
                        completed_at: new Date().toISOString()
                    })
                    .eq('daimo_id', orderId)
                    .select();
    
                if (updateError) {
                    console.error('Supabase update error:', updateError);
                    throw new Error(`Failed to update order: ${updateError.message}`);
                }
    
                console.log('Supabase update result:', updateData);
    
                // Verify the update
                const { data: verifyData, error: verifyError } = await supabase
                    .from('orders_2025cool')
                    .select('*')
                    .eq('daimo_id', orderId)
                    .single();
    
                if (verifyError) {
                    console.error('Verification error:', verifyError);
                } else {
                    console.log('Verified order data:', verifyData);
                }
    
                // Send email only if update was successful
                if (updateData) {
                    await emailService.addToQueue(
                        order.email,
                        result.videoUrl,
                        {
                            prompt: order.prompt,
                            resolution: order.resolution,
                            duration: order.duration
                        }
                    );
                }
    
                res.json({ 
                    success: true, 
                    message: 'Video generated successfully',
                    videoUrl: result.videoUrl
                });
    
            } catch (error) {
                console.error('Processing error:', error);
    
                // Update order status to failed with detailed error
                const { error: failureError } = await supabase
                    .from('orders_2025cool')
                    .update({ 
                        status: 'failed',
                        error: error.message,
                        updated_at: new Date().toISOString()
                    })
                    .eq('daimo_id', orderId);
    
                if (failureError) {
                    console.error('Failed to update failure status:', failureError);
                }
    
                throw error;
            } finally {
                await browser.close();
                this.activeGenerations.delete(orderId);
            }
    
        } catch (error) {
            console.error('Video generation error:', error);
            res.status(500).json({ 
                error: error.message,
                details: error.stack
            });
        }
    }
}
    
module.exports = new VideoController();