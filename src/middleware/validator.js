const { body, validationResult } = require('express-validator');

const validateVideoRequest = [
    body('orderId').notEmpty().withMessage('Order ID is required'),
    
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        next();
    }
];

module.exports = {
    validateVideoRequest
};