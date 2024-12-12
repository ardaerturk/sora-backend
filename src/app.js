const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const config = require('./config/config');
const videoController = require('./controllers/videoController');
const { validateVideoRequest } = require('./middleware/validator');

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Routes
app.post('/api/generate-video', 
    validateVideoRequest,
    videoController.generateVideo.bind(videoController)
);

// Error handling
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
app.listen(config.port, () => {
    console.log(`Server is running on port ${config.port}`);
});