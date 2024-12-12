class VideoGenerationError extends Error {
    constructor(message, orderId) {
        super(message);
        this.name = 'VideoGenerationError';
        this.orderId = orderId;
    }
}

module.exports = {
    VideoGenerationError
};