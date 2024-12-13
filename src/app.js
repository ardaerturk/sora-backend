const express = require('express');
const Queue = require('bull');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const helmet = require('helmet');
const webhookController = require('./controllers/webhookController');
const videoController = require('./controllers/videoController');
// const validateVideoRequest = require('./middlewares/validateVideoRequest');

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Rate limiting for webhook endpoint
const webhookLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});

// Routes
app.post('/api/generate-video', 
    // validateVideoRequest,
    videoController.generateVideo.bind(videoController)
);

// Make sure this route is registered correctly
app.post('/daimo/webhook', async (req, res) => {
    console.log('Webhook received:', {
        headers: req.headers,
        body: req.body
    });
    
    try {
        await webhookController.handleWebhook(req, res);
    } catch (error) {
        console.error('Webhook error:', error);
        // Don't send error response as handleWebhook already responded
    }
});

// Add catch-all route for debugging
app.use('*', (req, res) => {
    console.log('404 - Route not found:', req.originalUrl);
    res.status(404).json({ error: 'Route not found' });
});

// Error handling
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
app.listen(config.port, () => {
    console.log(`Server is running on port ${config.port}`);
});