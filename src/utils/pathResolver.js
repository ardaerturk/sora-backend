// src/utils/pathResolver.js
const path = require('path');
const fs = require('fs');

class PathResolver {
    constructor() {
        this.rootDir = this.findRootDir();
        this.srcDir = path.join(this.rootDir, 'src');
        this.debugFullStructure();
    }

    debugFullStructure() {
        console.log('\n=== Full Directory Structure ===');
        console.log('Root Directory:', this.rootDir);
        console.log('Src Directory:', this.srcDir);

        if (fs.existsSync(this.srcDir)) {
            console.log('\nContents of src directory:');
            this.printDirectoryStructure(this.srcDir);
        } else {
            console.log('src directory does not exist!');
        }
    }

    printDirectoryStructure(dirPath, indent = '') {
        try {
            const items = fs.readdirSync(dirPath);
            items.forEach(item => {
                const fullPath = path.join(dirPath, item);
                const stats = fs.statSync(fullPath);
                if (stats.isDirectory()) {
                    console.log(`${indent}📁 ${item}/`);
                    this.printDirectoryStructure(fullPath, indent + '  ');
                } else {
                    console.log(`${indent}📄 ${item} (${stats.size} bytes)`);
                }
            });
        } catch (error) {
            console.error(`Error reading directory ${dirPath}:`, error);
        }
    }

    resolve(relativePath) {
        console.log(`\nResolving path for: ${relativePath}`);
        
        // First, let's see what we have in the services directory
        const servicesDir = path.join(this.srcDir, 'services');
        if (fs.existsSync(servicesDir)) {
            console.log('\nContents of services directory:');
            fs.readdirSync(servicesDir).forEach(file => {
                console.log(`- ${file}`);
            });
        }

        // Try all possible case combinations
        const variations = this.getPathVariations(relativePath);
        console.log('\nTrying path variations:', variations);

        for (const variant of variations) {
            const fullPath = path.join(this.srcDir, variant);
            const withJs = `${fullPath}.js`;
            
            console.log(`Checking: ${fullPath}`);
            console.log(`Checking with .js: ${withJs}`);
            
            if (fs.existsSync(fullPath)) {
                console.log(`Found: ${fullPath}`);
                return fullPath;
            }
            if (fs.existsSync(withJs)) {
                console.log(`Found: ${withJs}`);
                return withJs;
            }
        }

        throw new Error(`Could not resolve path for: ${relativePath}\nTried variations: ${variations.join(', ')}`);
    }

    getPathVariations(relativePath) {
        const parts = relativePath.split('/');
        const lastPart = parts[parts.length - 1];
        const directory = parts.slice(0, -1).join('/');

        const variations = [
            // Original
            relativePath,
            // All lowercase
            relativePath.toLowerCase(),
            // First letter uppercase
            directory + '/' + lastPart.charAt(0).toUpperCase() + lastPart.slice(1),
            // All uppercase first letters
            parts.map(part => part.charAt(0).toUpperCase() + part.slice(1)).join('/'),
            // Try services with capital S
            relativePath.replace('services/', 'Services/'),
            // Try with different case combinations
            `services/${lastPart}`,
            `Services/${lastPart}`,
            `services/${lastPart.toLowerCase()}`,
            `Services/${lastPart.toLowerCase()}`,
            `services/${lastPart.charAt(0).toUpperCase() + lastPart.slice(1)}`,
            `Services/${lastPart.charAt(0).toUpperCase() + lastPart.slice(1)}`
        ];

        return [...new Set(variations)]; // Remove duplicates
    }
}

module.exports = new PathResolver();