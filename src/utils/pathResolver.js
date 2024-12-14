// src/utils/pathResolver.js
const path = require('path');
const fs = require('fs');

class PathResolver {
    constructor() {
        this.rootDir = this.findRootDir();
        this.srcDir = path.join(this.rootDir, 'src');
        this.debugPaths();
    }

    findRootDir() {
        if (process.env.NODE_ENV === 'production') {
            return '/app';
        }
        
        let currentDir = __dirname;
        while (currentDir !== '/') {
            if (fs.existsSync(path.join(currentDir, 'package.json'))) {
                return currentDir;
            }
            currentDir = path.dirname(currentDir);
        }
        return process.cwd();
    }

    debugPaths() {
        console.log('Path Resolution Debug:', {
            rootDir: this.rootDir,
            srcDir: this.srcDir,
            exists: {
                src: fs.existsSync(this.srcDir),
                utils: fs.existsSync(path.join(this.srcDir, 'utils')),
                services: fs.existsSync(path.join(this.srcDir, 'services'))
            }
        });
    }

    resolve(relativePath) {
        // Remove .js extension if present
        relativePath = relativePath.replace(/\.js$/, '');

        // Map the old paths to new paths
        const pathMapping = {
            'utils/puppeteer/BrowserManager': 'utils/BrowserManager',
            'utils/puppeteer/LoginHandler': 'utils/LoginHandler',
            'utils/puppeteer/VideoGenerator': 'utils/VideoGenerator',
            'utils/puppeteer/HumanBehavior': 'utils/HumanBehavior'
        };

        // Use mapped path if it exists
        const mappedPath = pathMapping[relativePath] || relativePath;

        // Try different possible paths
        const possiblePaths = [
            path.join(this.srcDir, mappedPath),
            path.join(this.rootDir, 'src', mappedPath),
            path.join(this.rootDir, mappedPath)
        ];

        for (const pathToTry of possiblePaths) {
            // Try with and without .js extension
            if (fs.existsSync(`${pathToTry}.js`)) {
                return `${pathToTry}.js`;
            }
            if (fs.existsSync(pathToTry)) {
                return pathToTry;
            }
        }

        // If not found, log detailed debug information
        console.error('Path resolution failed for:', relativePath);
        console.error('Mapped to:', mappedPath);
        console.error('Attempted paths:', possiblePaths);
        console.error('Current directory structure:');
        this.logDirectoryStructure(this.srcDir);

        throw new Error(`Could not resolve path for: ${relativePath}. Attempted: ${possiblePaths.join(', ')}`);
    }

    logDirectoryStructure(dir, level = 0) {
        const indent = '  '.repeat(level);
        const items = fs.readdirSync(dir);
        
        items.forEach(item => {
            const fullPath = path.join(dir, item);
            if (fs.statSync(fullPath).isDirectory()) {
                console.log(`${indent}📁 ${item}`);
                if (level < 3) { // Limit recursion depth
                    this.logDirectoryStructure(fullPath, level + 1);
                }
            } else {
                console.log(`${indent}📄 ${item}`);
            }
        });
    }
}

module.exports = new PathResolver();