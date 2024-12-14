// src/utils/verifyDeployment.js
const fs = require('fs');
const path = require('path');

function verifyDeployment() {
    console.log('\n=== Verifying Deployment ===');
    
    const requiredFiles = [
        'src/services/VideoProcessor.js',
        'src/services/QueueManager.js',
        'src/utils/pathResolver.js'
    ];

    const missingFiles = [];
    
    requiredFiles.forEach(file => {
        const fullPath = path.join(process.cwd(), file);
        if (!fs.existsSync(fullPath)) {
            missingFiles.push(file);
        }
    });

    if (missingFiles.length > 0) {
        console.error('\nMissing required files:', missingFiles);
        process.exit(1);
    }

    console.log('All required files present');
}

if (require.main === module) {
    verifyDeployment();
}

module.exports = verifyDeployment;