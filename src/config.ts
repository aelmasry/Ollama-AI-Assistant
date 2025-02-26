import * as fs from 'fs';
import * as path from 'path';

interface OllamaConfig {
    endpoint: string;
    model: string;
    maxTokens: number;
    temperature: number;
    contextWindow: number;
}

const defaultConfig: OllamaConfig = {
    endpoint: 'http://localhost:11434/api/generate',
    model: 'deepseek-coder:6.7b',
    maxTokens: 2048,
    temperature: 0.2,
    contextWindow: 20000
};

function loadConfig(): OllamaConfig {
    try {
        const configPath = path.resolve(__dirname, '../config.json');
        if (fs.existsSync(configPath)) {
            const configFile = fs.readFileSync(configPath, 'utf-8');
            const userConfig = JSON.parse(configFile).ollamaAI;
            return { ...defaultConfig, ...userConfig };
        }
    } catch (error) {
        console.warn('Failed to load config.json, using default configuration:', error);
    }
    return defaultConfig;
}

const config = loadConfig();
export default config;