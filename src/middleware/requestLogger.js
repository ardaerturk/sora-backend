// middleware/requestLogger.js
const logger = console; // Replace with your preferred logging solution

module.exports = (req, res, next) => {
    const start = Date.now();
    const requestId = req.headers['x-request-id'] || Math.random().toString(36).substring(7);

    // Log request
    logger.info({
        requestId,
        method: req.method,
        path: req.path,
        query: req.query,
        headers: req.headers,
        timestamp: new Date().toISOString()
    });

    // Log response
    res.on('finish', () => {
        const duration = Date.now() - start;
        logger.info({
            requestId,
            status: res.statusCode,
            duration,
            timestamp: new Date().toISOString()
        });
    });

    next();
};