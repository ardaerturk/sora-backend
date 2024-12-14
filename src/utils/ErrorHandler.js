class ErrorHandler {
    static async logError(error, context = {}) {
        const errorLog = {
            message: error.message,
            stack: error.stack,
            context,
            timestamp: new Date().toISOString()
        };

        console.error('Error occurred:', errorLog);

        try {
            const supabase = require('../config/supabase');
            await supabase
                .from('error_logs')
                .insert([errorLog]);
        } catch (logError) {
            console.error('Failed to log error:', logError);
        }
    }

    static handleOperationalError(error) {
        // Handle expected operational errors
        return {
            success: false,
            error: error.message,
            code: error.code || 'OPERATIONAL_ERROR'
        };
    }

    static handleProgrammerError(error) {
        // Handle unexpected programmer errors
        return {
            success: false,
            error: 'An unexpected error occurred',
            code: 'INTERNAL_ERROR'
        };
    }
}

module.exports = ErrorHandler;