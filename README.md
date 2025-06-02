# Sora Video Generation Backend

A robust Node.js backend service that automates video generation using OpenAI's Sora through intelligent browser automation. This service provides a scalable API for processing video generation requests with queue management, error handling, and automated notifications.

## 🎯 Overview

This backend service acts as a bridge between your application and OpenAI's Sora video generation platform. It automates the entire video creation process through browser automation, manages multiple requests through a queue system, and provides real-time status updates.

### Key Features

- **🤖 Automated Video Generation**: Browser automation using Puppeteer to interact with Sora
- **⚡ Queue Management**: Redis-based job queue for handling multiple concurrent requests
- **📧 Email Notifications**: Automated email delivery when videos are complete
- **🔒 Security**: Rate limiting, CORS, helmet security headers, and input validation
- **📊 Monitoring**: Comprehensive logging and error tracking
- **🚀 Production Ready**: Dockerized deployment with Heroku support
- **🔄 Webhook Support**: Payment processing integration (Daimo)
- **🎛️ Flexible Configuration**: Customizable video parameters (resolution, duration, aspect ratio)

## 🏗️ Architecture

```mermaid
graph TB
    A[Client Request] --> B[Express API]
    B --> C[Request Validation]
    C --> D[Queue Manager]
    D --> E[Video Processor]
    E --> F[Browser Manager]
    F --> G[Puppeteer + Sora.com]
    G --> H[Video Generation]
    H --> I[Supabase Database]
    I --> J[Email Service]
    J --> K[User Notification]
    
    L[Webhook Handler] --> M[Payment Processing]
    M --> D
```

### Core Components

- **API Layer**: Express.js with security middleware and rate limiting
- **Queue System**: Bull + Redis for job management and processing
- **Browser Automation**: Puppeteer with human-behavior simulation
- **Database**: Supabase for order tracking and status management  
- **Email Service**: Resend for automated notifications
- **Monitoring**: Winston logging with error tracking

## 🛠️ Prerequisites

Before setting up this service, ensure you have accounts and access to:

- **OpenAI Sora Access**: Valid Sora account credentials
- **Supabase**: Database and API access
- **Redis**: For queue management (Redis Cloud recommended)
- **Resend**: For email notifications
- **Heroku**: For deployment (optional)
- **Proxy Service**: For browser automation (recommended)

## 📦 Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd sora-backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Start Redis server**
   ```bash
   # Local Redis
   redis-server
   
   # Or use Redis Cloud connection string
   ```

5. **Run the application**
   ```bash
   # Development
   npm start
   
   # Production
   NODE_ENV=production npm start
   ```

## ⚙️ Environment Variables

Create a `.env` file with the following configuration:

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Sora Credentials
SORA_EMAIL=your-sora-email@example.com
SORA_PASSWORD=your-sora-password

# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Redis Configuration
REDIS_URL=redis://localhost:6379
# Or for Redis Cloud: rediss://username:password@host:port

# Email Service (Resend)
RESEND_API_KEY=your-resend-api-key
FROM_EMAIL=noreply@yourdomain.com

# Security
ALLOWED_ORIGINS=http://localhost:3000,https://yourdomain.com

# Browser Automation (Optional)
PROXY_HOST=your-proxy-host
PROXY_PORT=your-proxy-port
PROXY_USERNAME=your-proxy-username
PROXY_PASSWORD=your-proxy-password

# Monitoring (Optional)
LOG_LEVEL=info
```

## 🔌 API Endpoints

### Generate Video

**POST** `/api/generate-video`

Generate a new video with specified parameters.

```json
{
  "orderId": "unique-order-id",
  "prompt": "A beautiful sunset over mountains",
  "resolution": "1080",
  "duration": "5s",
  "aspectRatio": "16:9"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Video generation queued successfully",
  "status": "queued",
  "queuePosition": 2,
  "estimatedWaitTime": {
    "minutes": 10,
    "formatted": "about 10 minutes"
  }
}
```

### Webhook Handler

**POST** `/daimo/webhook`

Handles payment webhooks and triggers video generation.

### Health Check

**GET** `/health`

Returns service health status.

```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## 🚀 Deployment

### Heroku Deployment

1. **Install Heroku CLI**
   ```bash
   npm install -g heroku
   ```

2. **Login and create app**
   ```bash
   heroku login
   heroku create your-app-name
   ```

3. **Set environment variables**
   ```bash
   heroku config:set SORA_EMAIL=your-email
   heroku config:set SORA_PASSWORD=your-password
   # ... set all other env vars
   ```

4. **Add Redis addon**
   ```bash
   heroku addons:create heroku-redis:hobby-dev
   ```

5. **Deploy**
   ```bash
   git push heroku main
   ```

### Docker Deployment

```bash
# Build image
docker build -t sora-backend .

# Run container
docker run -p 3000:3000 --env-file .env sora-backend
```

### Manual Deployment

Ensure your server has:
- Node.js 20.x
- Redis server
- PM2 for process management

```bash
# Install PM2
npm install -g pm2

# Start application
pm2 start src/app.js --name sora-backend

# Monitor
pm2 monitor
```

## 📊 Monitoring & Troubleshooting

### Logging

The application uses Winston for structured logging:

- **Error logs**: Detailed error information with context
- **Request logs**: API request/response logging
- **Process logs**: Video generation progress tracking

### Common Issues

1. **Browser automation failures**
   - Check proxy configuration
   - Verify Sora credentials
   - Monitor for rate limiting

2. **Queue processing delays**
   - Check Redis connection
   - Monitor queue length
   - Review worker processes

3. **Email delivery issues**
   - Verify Resend API key
   - Check email templates
   - Monitor bounce rates

### Health Monitoring

Monitor these endpoints and metrics:

- `/health` - Service health check
- Queue length and processing time
- Error rates and response times
- Database connection status

## 🔧 Development

### Project Structure

```
src/
├── app.js                 # Express application setup
├── config/               # Configuration files
│   ├── config.js         
│   └── supabase.js       
├── controllers/          # Route handlers
│   ├── videoController.js
│   └── webhookController.js
├── middleware/           # Express middleware
│   ├── authMiddleware.js
│   ├── errorHandler.js
│   ├── requestLogger.js
│   └── validator.js
├── services/             # Business logic
│   ├── EmailService.js
│   ├── QueueManager.js
│   └── VideoProcessor.js
└── utils/                # Utility functions
    ├── BrowserManager.js
    ├── VideoGenerator.js
    ├── HumanBehavior.js
    └── ...
```

### Testing

```bash
# Run test video generation
node src/test/test-video-generation.js
```

### Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📝 License

This project is licensed under the ISC License.

## 🆘 Support

If you encounter issues:

1. Check the logs for detailed error information
2. Verify all environment variables are set correctly
3. Ensure all external services are accessible
4. Review the troubleshooting section above

For additional support, please create an issue in the repository with:
- Error logs
- Environment details (without sensitive data)
- Steps to reproduce the issue

---

**Note**: This service requires valid OpenAI Sora access. Ensure you comply with OpenAI's terms of service and usage policies when using this automation tool.
