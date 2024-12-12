require('dotenv').config();

module.exports = {
    port: process.env.PORT || 3000,
    soraCredentials: {
        email: process.env.SORA_EMAIL,
        password: process.env.SORA_PASSWORD
    },
    databaseUrl: process.env.DATABASE_URL,
    apiKey: process.env.API_KEY // Add this for securing the endpoint
};