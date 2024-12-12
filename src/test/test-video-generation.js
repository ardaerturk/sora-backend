const axios = require('axios');

const API_URL = 'http://localhost:3000/api/generate-video';
const API_KEY = 'gB6plUiBVvoDncoaGfLH427XTcSzy6tr';

async function testVideoGeneration(orderId) {
    try {
        console.log('Testing video generation...');
        console.log('Order ID:', orderId);

        const response = await axios.post(API_URL, 
            { orderId },
            {
                headers: {
                    'Authorization': `Bearer ${API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log('Response:', response.data);
    } catch (error) {
        console.error('Error:', error.response?.data || error.message);
    }
}

// Get orderId from command line argument
const orderId = process.argv[2];
if (!orderId) {
    console.error('Please provide an order ID');
    process.exit(1);
}

testVideoGeneration(orderId);