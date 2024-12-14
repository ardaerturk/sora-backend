// middleware/errorHandler.js
const ErrorHandler = require('../utils/ErrorHandler');

module.exports = async (err, req, res, next) => {
    await ErrorHandler.logError(err, {
        path: req.path,
        method: req.method,
        query: req.query,
        body: req.body
    });

    if (err.isOperational) {
        return res.status(err.statusCode || 400).json(ErrorHandler.handleOperationalError(err));
    }

    return res.status(500).json(ErrorHandler.handleProgrammerError(err));
};