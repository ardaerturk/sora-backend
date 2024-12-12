const puppeteerService = require('../utils/puppeteerUtils');
const supabase = require('../config/supabase');
const emailService = require('../services/emailService');

async function processVideo(orderId) {
    console.log(`Starting video processing for order ${orderId}`);
    
    let browser;
    try {
        // Fetch order details
        const { data: order, error } = await supabase
            .from('orders_2025cool')
            .select('*')
            .eq('daimo_id', orderId)
            .single();

        if (error) throw new Error(`Failed to fetch order: ${error.message}`);
        if (!order) throw new Error('Order not found');

        // Update status to processing
        await supabase
            .from('orders_2025cool')
            .update({ status: 'processing' })
            .eq('daimo_id', orderId);

        // Initialize browser
        const { browser: newBrowser, page } = await puppeteerService.initializeBrowser();
        browser = newBrowser;

        // Generate video
        await puppeteerService.login(page, {
            email: process.env.SORA_EMAIL,
            password: process.env.SORA_PASSWORD
        });

        const result = await puppeteerService.generateVideo(page, {
            prompt: order.prompt,
            resolution: order.resolution,
            duration: order.duration,
            aspectRatio: order.aspect_ratio
        });

        // Update order with video URL
        await supabase
            .from('orders_2025cool')
            .update({
                status: 'completed',
                video_url: result.videoUrl,
                completed_at: new Date().toISOString()
            })
            .eq('daimo_id', orderId);

        // Send email notification
        await emailService.addToQueue(
            order.email,
            result.videoUrl,
            {
                prompt: order.prompt,
                resolution: order.resolution,
                duration: order.duration
            }
        );

        return result;

    } catch (error) {
        console.error(`Error processing video for order ${orderId}:`, error);
        
        // Update order status to failed
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

module.exports = { processVideo };