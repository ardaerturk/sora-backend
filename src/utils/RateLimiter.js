class RateLimiter {
    constructor(maxRequests, timeWindow) {
        this.maxRequests = maxRequests;
        this.timeWindow = timeWindow;
        this.requests = new Map();
    }

    async checkLimit(key) {
        const now = Date.now();
        const windowStart = now - this.timeWindow;

        // Clean up old requests
        this.requests.forEach((timestamps, userKey) => {
            this.requests.set(userKey, timestamps.filter(time => time > windowStart));
        });

        // Get user's requests
        const userRequests = this.requests.get(key) || [];
        
        // Remove expired timestamps
        const validRequests = userRequests.filter(time => time > windowStart);

        if (validRequests.length >= this.maxRequests) {
            return {
                allowed: false,
                resetTime: userRequests[0] + this.timeWindow,
                remaining: 0
            };
        }

        // Add new request
        validRequests.push(now);
        this.requests.set(key, validRequests);

        return {
            allowed: true,
            remaining: this.maxRequests - validRequests.length,
            resetTime: now + this.timeWindow
        };
    }
}

module.exports = new RateLimiter(100, 60000); // 100 requests per minute