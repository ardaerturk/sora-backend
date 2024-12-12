const API_KEYS = {
    'gB6plUiBVvoDncoaGfLH427XTcSzy6tr': {
      name: 'Webhook Service',
      permissions: ['generate-video']
    }
    // You can add more API keys with different permissions
  };
  
  const validateApiKey = (req, res, next) => {
    const authHeader = req.headers.authorization;
  
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        error: 'Unauthorized: Missing or invalid Authorization header' 
      });
    }
  
    const apiKey = authHeader.split(' ')[1];
  
    if (!API_KEYS[apiKey]) {
      return res.status(401).json({ 
        error: 'Unauthorized: Invalid API key' 
      });
    }
  
    // Attach API key info to request for later use if needed
    req.apiKeyInfo = API_KEYS[apiKey];
    
    next();
  };
  
  module.exports = {
    validateApiKey
  };