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
            environment: process.env.NODE_ENV,
            exists: {
                src: fs.existsSync(this.srcDir),
                services: fs.existsSync(path.join(this.srcDir, 'services')),
                utils: fs.existsSync(path.join(this.srcDir, 'utils'))
            }
        });

        // List contents of src directory
        if (fs.existsSync(this.srcDir)) {
            console.log('Contents of src directory:', this.listDirectoryContents(this.srcDir));
        }
    }

    listDirectoryContents(dir) {
        try {
            const items = fs.readdirSync(dir);
            const contents = {};
            
            items.forEach(item => {
                const fullPath = path.join(dir, item);
                if (fs.statSync(fullPath).isDirectory()) {
                    contents[item] = this.listDirectoryContents(fullPath);
                } else {
                    contents[item] = 'file';
                }
            });
            
            return contents;
        } catch (error) {
            return `Error reading directory: ${error.message}`;
        }
    }

    resolve(relativePath) {
        console.log(`Resolving path for: ${relativePath}`);
        
        // Remove .js extension if present
        relativePath = relativePath.replace(/\.js$/, '');

        // Handle case sensitivity for services directory
        const servicesPath = relativePath.startsWith('services/') ? 
            relativePath.replace('services/', 'Services/') : relativePath;

        const possiblePaths = [
            // Try original path
            path.join(this.srcDir, relativePath),
            path.join(this.srcDir, `${relativePath}.js`),
            // Try with capital S in Services
            path.join(this.srcDir, servicesPath),
            path.join(this.srcDir, `${servicesPath}.js`),
            // Try lowercase
            path.join(this.srcDir, relativePath.toLowerCase()),
            path.join(this.srcDir, `${relativePath.toLowerCase()}.js`),
            // Try uppercase first letter
            path.join(this.srcDir, this.capitalizeFirstLetter(relativePath)),
            path.join(this.srcDir, `${this.capitalizeFirstLetter(relativePath)}.js`)
        ];

        console.log('Attempting paths:', possiblePaths);

        for (const pathToTry of possiblePaths) {
            console.log(`Checking path: ${pathToTry}`);
            if (fs.existsSync(pathToTry)) {
                console.log(`Found file at: ${pathToTry}`);
                return pathToTry;
            }
        }

        // If not found, log detailed debug information
        console.error('Path resolution failed for:', relativePath);
        console.error('Current directory structure:');
        this.logDirectoryStructure(this.srcDir);

        throw new Error(`Could not resolve path for: ${relativePath}. Attempted: ${possiblePaths.join(', ')}`);
    }

    capitalizeFirstLetter(string) {
        const parts = string.split('/');
        return parts.map(part => 
            part.charAt(0).toUpperCase() + part.slice(1)
        ).join('/');
    }

    logDirectoryStructure(dir, level = 0) {
        const indent = '  '.repeat(level);
        try {
            const items = fs.readdirSync(dir);
            items.forEach(item => {
                const fullPath = path.join(dir, item);
                try {
                    const stat = fs.statSync(fullPath);
                    if (stat.isDirectory()) {
                        console.log(`${indent}📁 ${item}`);
                        this.logDirectoryStructure(fullPath, level + 1);
                    } else {
                        console.log(`${indent}📄 ${item} (${stat.size} bytes)`);
                    }
                } catch (error) {
                    console.log(`${indent}❌ Error reading ${item}: ${error.message}`);
                }
            });
        } catch (error) {
            console.log(`${indent}❌ Error reading directory ${dir}: ${error.message}`);
        }
    }
}

module.exports = new PathResolver();