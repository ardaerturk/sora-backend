// src/utils/pathResolver.js
const path = require('path');
const fs = require('fs');

class PathResolver {
    constructor() {
        this.rootDir = this.findRootDir();
    }

    findRootDir() {
        // Start with the current directory
        let currentDir = __dirname;
        
        // Keep going up until we find the root (where package.json is)
        while (currentDir !== '/') {
            if (fs.existsSync(path.join(currentDir, 'package.json'))) {
                return currentDir;
            }
            currentDir = path.dirname(currentDir);
        }
        
        // Fallback to the current directory if we can't find the root
        return process.cwd();
    }

    resolve(relativePath) {
        const possiblePaths = [
            path.join(this.rootDir, 'src', relativePath),
            path.join(this.rootDir, relativePath),
            path.join('/app', 'src', relativePath),
            path.join('/app', relativePath)
        ];

        for (const pathToTry of possiblePaths) {
            if (fs.existsSync(pathToTry + '.js')) {
                return pathToTry;
            }
        }

        throw new Error(`Could not resolve path for: ${relativePath}`);
    }

    logPaths() {
        console.log({
            currentWorkingDirectory: process.cwd(),
            dirname: __dirname,
            rootDir: this.rootDir,
            nodeModulesExists: fs.existsSync(path.join(this.rootDir, 'node_modules')),
            srcExists: fs.existsSync(path.join(this.rootDir, 'src')),
            files: fs.readdirSync(this.rootDir)
        });
    }
}

module.exports = new PathResolver();