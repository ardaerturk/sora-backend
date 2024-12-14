const supabase = require('../config/supabase');

class MonitoringService {
    static async recordMetric(metric) {
        try {
            await supabase
                .from('metrics')
                .insert([{
                    ...metric,
                    created_at: new Date().toISOString()
                }]);
        } catch (error) {
            console.error('Failed to record metric:', error);
        }
    }

    static async checkHealth() {
        const checks = {
            database: await this.checkDatabase(),
            email: await this.checkEmailService(),
            queue: await this.checkQueueService()
        };

        const isHealthy = Object.values(checks).every(check => check.status === 'healthy');

        return {
            status: isHealthy ? 'healthy' : 'unhealthy',
            timestamp: new Date().toISOString(),
            checks
        };
    }

    static async checkDatabase() {
        try {
            const startTime = Date.now();
            const { data, error } = await supabase
                .from('health_check')
                .select('id')
                .limit(1);

            return {
                status: error ? 'unhealthy' : 'healthy',
                latency: Date.now() - startTime,
                error: error?.message
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message
            };
        }
    }

    static async checkEmailService() {
        const emailService = require('../../services/emailService');
        return {
            status: 'healthy',
            queueStatus: emailService.getQueueStatus()
        };
    }

    static async checkQueueService() {
        const queueManager = require('../services/QueueManager');
        return {
            status: 'healthy',
            queueStatus: queueManager.getQueueStatus()
        };
    }
}

module.exports = MonitoringService;