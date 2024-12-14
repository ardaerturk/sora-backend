// app.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const config = require('./config/config');
const videoController = require('./controllers/videoController');
const webhookController = require('./controllers/webhookController');
const { validateVideoRequest } = require('./middleware/validator');
const errorHandler = require('./middleware/errorHandler');
const requestLogger = require('./middleware/requestLogger');

const app = express();

// Security Middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "https://api.ipify.org"]
        }
    }
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.'
});

// Middleware
app.use(compression()); // Compress responses
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '1mb' }));
app.use(requestLogger);

// Apply rate limiting to all routes
app.use(limiter);

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.post('/api/generate-video',
    validateVideoRequest,
    videoController.generateVideo.bind(videoController)
);

app.post('/daimo/webhook',
    webhookController.handleWebhook.bind(webhookController)
);

// Error handling
app.use(errorHandler);

// Graceful shutdown
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

async function gracefulShutdown() {
    console.log('Received shutdown signal');
    
    // Close any active browser instances
    try {
        const puppeteerService = require('./utils/puppeteerUtils');
        await puppeteerService.closeAllBrowsers();
    } catch (error) {
        console.error('Error closing browser instances:', error);
    }

    // Close database connections
    try {
        const supabase = require('./config/supabase');
        await supabase.close();
    } catch (error) {
        console.error('Error closing database connection:', error);
    }

    // Exit process
    process.exit(0);
}

// Start server
const server = app.listen(config.port, () => {
    console.log(`Server is running on port ${config.port}`);
});

// Set timeout for long-running requests
server.timeout = 300000; // 5 minutes

module.exports = app;