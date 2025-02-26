import * as vscode from 'vscode';
import config from './config';
import * as path from 'path';
import * as fs from 'fs';
import axios from 'axios';

// Configuration interface
interface OllamaConfig {
    endpoint: string;
    model: string;
    maxTokens: number;
    temperature: number;
    contextWindow: number;
}

export function activate(context: vscode.ExtensionContext) {
    console.log('Ollama AI Assistant is now active!');

    // Use configuration from config file with workspace settings as fallback
    const workspaceConfig = vscode.workspace.getConfiguration('ollamaAI');
    
    let ollamaConfig: OllamaConfig = {
        endpoint: workspaceConfig.get('endpoint') || config.endpoint,
        model: workspaceConfig.get('model') || config.model,
        maxTokens: workspaceConfig.get('maxTokens') || config.maxTokens,
        temperature: workspaceConfig.get('temperature') || config.temperature,
        contextWindow: workspaceConfig.get('contextWindow') || config.contextWindow
    };

    // Initialize code database for historical context
    const codeDatabase = new CodeDatabase(context);

    // Register commands
    let improveCodeCommand = vscode.commands.registerCommand('ollamaAI.improveCode', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No editor is active');
            return;
        }

        const selectedText = getSelectedOrCurrentFunction(editor);
        if (!selectedText) {
            vscode.window.showErrorMessage('No code selected or function detected');
            return;
        }

        try {
            vscode.window.showInformationMessage('Analyzing code with Ollama AI...');
            
            // Get file context
            const document = editor.document;
            const filePath = document.fileName;
            const fileExtension = path.extname(filePath);
            const codeContext = await codeDatabase.getRelevantContext(selectedText, fileExtension);
            
            // Prepare prompt
            const prompt = createImproveCodePrompt(selectedText, fileExtension, codeContext);
            
            // Send to Ollama
            const response = await queryOllama(prompt, ollamaConfig);
            
            // Display results
            showResults(response, 'Code Improvement Suggestions');
            
            // Update code database with this interaction
            codeDatabase.addToDatabase(selectedText, fileExtension);
        } catch (error) {
            console.error(error);
            vscode.window.showErrorMessage(`Error: ${error instanceof Error ? error.message : String(error)}`);
        }
    });

    let explainCodeCommand = vscode.commands.registerCommand('ollamaAI.explainCode', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No editor is active');
            return;
        }

        const selectedText = getSelectedOrCurrentFunction(editor);
        if (!selectedText) {
            vscode.window.showErrorMessage('No code selected or function detected');
            return;
        }

        try {
            vscode.window.showInformationMessage('Generating explanation with Ollama AI...');
            
            // Prepare prompt
            const prompt = createExplainCodePrompt(selectedText);
            
            // Send to Ollama
            const response = await queryOllama(prompt, ollamaConfig);
            
            // Display results
            showResults(response, 'Code Explanation');
        } catch (error) {
            console.error(error);
            vscode.window.showErrorMessage(`Error: ${error instanceof Error ? error.message : String(error)}`);
        }
    });

    let refactorCodeCommand = vscode.commands.registerCommand('ollamaAI.refactorCode', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No editor is active');
            return;
        }

        const selectedText = getSelectedOrCurrentFunction(editor);
        if (!selectedText) {
            vscode.window.showErrorMessage('No code selected or function detected');
            return;
        }

        try {
            vscode.window.showInformationMessage('Generating refactoring suggestions with Ollama AI...');
            
            // Get file context
            const document = editor.document;
            const filePath = document.fileName;
            const fileExtension = path.extname(filePath);
            const codeContext = await codeDatabase.getRelevantContext(selectedText, fileExtension);
            
            // Prepare prompt
            const prompt = createRefactorCodePrompt(selectedText, fileExtension, codeContext);
            
            // Send to Ollama
            const response = await queryOllama(prompt, ollamaConfig);
            
            // Display results
            showResults(response, 'Refactoring Suggestions');
        } catch (error) {
            console.error(error);
            vscode.window.showErrorMessage(`Error: ${error instanceof Error ? error.message : String(error)}`);
        }
    });

    // Setup status bar item
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'ollamaAI.showMenu';
    statusBarItem.text = '$(rocket) Ollama AI';
    statusBarItem.tooltip = 'Ollama AI Assistant';
    statusBarItem.show();

    let showMenuCommand = vscode.commands.registerCommand('ollamaAI.showMenu', async () => {
        const options = [
            'Improve Code',
            'Explain Code',
            'Refactor Code',
            'Configure Ollama AI'
        ];

        const selected = await vscode.window.showQuickPick(options, {
            placeHolder: 'Select an Ollama AI action'
        });

        if (selected === 'Improve Code') {
            vscode.commands.executeCommand('ollamaAI.improveCode');
        } else if (selected === 'Explain Code') {
            vscode.commands.executeCommand('ollamaAI.explainCode');
        } else if (selected === 'Refactor Code') {
            vscode.commands.executeCommand('ollamaAI.refactorCode');
        } else if (selected === 'Configure Ollama AI') {
            vscode.commands.executeCommand('workbench.action.openSettings', 'ollamaAI');
        }
    });

    // Register configuration watcher
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('ollamaAI')) {
                const newConfig = vscode.workspace.getConfiguration('ollamaAI');
                ollamaConfig = {
                    endpoint: newConfig.get('endpoint') || ollamaConfig.endpoint,
                    model: newConfig.get('model') || ollamaConfig.model,
                    maxTokens: newConfig.get('maxTokens') || ollamaConfig.maxTokens,
                    temperature: newConfig.get('temperature') || ollamaConfig.temperature,
                    contextWindow: newConfig.get('contextWindow') || ollamaConfig.contextWindow
                };
                vscode.window.showInformationMessage('Ollama AI configuration updated');
            }
        })
    );

    // Register all commands and UI elements
    context.subscriptions.push(
        improveCodeCommand,
        explainCodeCommand,
        refactorCodeCommand,
        showMenuCommand,
        statusBarItem
    );

    // Training function
    let trainOnWorkspaceCommand = vscode.commands.registerCommand('ollamaAI.trainOnWorkspace', async () => {
        try {
            vscode.window.showInformationMessage('Starting to train on workspace files...');
            await codeDatabase.indexWorkspace();
            vscode.window.showInformationMessage('Workspace indexing complete!');
        } catch (error) {
            console.error(error);
            vscode.window.showErrorMessage(`Training error: ${error instanceof Error ? error.message : String(error)}`);
        }
    });

    context.subscriptions.push(trainOnWorkspaceCommand);
}

// Function to get selected text or try to detect the current function
function getSelectedOrCurrentFunction(editor: vscode.TextEditor): string | undefined {
    const selection = editor.selection;
    
    if (!selection.isEmpty) {
        return editor.document.getText(selection);
    } else {
        // Try to detect the current function or code block
        const document = editor.document;
        const position = editor.selection.active;
        const text = document.getText();
        const offset = document.offsetAt(position);
        
        // Simple heuristic to find function boundaries
        // This is a basic implementation - could be improved with language-specific parsers
        let startPos = text.lastIndexOf('{', offset);
        let startLine = -1;
        
        if (startPos !== -1) {
            // Look for function declaration before the opening brace
            let functionDeclarationPos = startPos;
            while (functionDeclarationPos > 0) {
                functionDeclarationPos--;
                if (text[functionDeclarationPos] === '\n' || text[functionDeclarationPos] === ';') {
                    break;
                }
            }
            
            startPos = functionDeclarationPos + 1;
            startLine = document.positionAt(startPos).line;
            
            // Find closing brace
            let braceCount = 1;
            let endPos = startPos;
            
            for (let i = startPos + 1; i < text.length; i++) {
                if (text[i] === '{') {
                    braceCount++;
                } else if (text[i] === '}') {
                    braceCount--;
                    if (braceCount === 0) {
                        endPos = i + 1;
                        break;
                    }
                }
            }
            
            if (endPos > startPos) {
                const startPosition = document.positionAt(startPos);
                const endPosition = document.positionAt(endPos);
                return document.getText(new vscode.Range(startPosition, endPosition));
            }
        }
    }
    
    return undefined;
}

// Function to create a prompt for improving code
function createImproveCodePrompt(code: string, fileExtension: string, codeContext: string): string {
    return `You are a code improvement assistant. Analyze the following code and suggest improvements 
based on best practices for ${fileExtension} files.

Focus on:
1. Code quality and readability
2. Performance optimizations
3. Security concerns
4. Modern language features
5. Potential bugs or edge cases

Historical context from similar code in this project:
${codeContext}

CODE TO IMPROVE:
\`\`\`${fileExtension}
${code}
\`\`\`

Provide specific, actionable improvements with code examples where appropriate. Explain the reasoning behind each suggestion.`;
}

// Function to create a prompt for explaining code
function createExplainCodePrompt(code: string): string {
    return `Explain the following code in clear, concise language. Identify the purpose of the code,
key components, and how they work together.

CODE TO EXPLAIN:
\`\`\`
${code}
\`\`\`

Provide:
1. A high-level summary of what this code does
2. Explanation of key functions/components
3. Any important patterns or techniques used
4. Potential edge cases or assumptions made`;
}

// Function to create a prompt for refactoring code
function createRefactorCodePrompt(code: string, fileExtension: string, codeContext: string): string {
    return `You are a code refactoring assistant. Analyze the following code and suggest refactoring 
approaches to improve its structure, maintainability, and adherence to design principles.

Focus on:
1. Applying appropriate design patterns
2. Reducing complexity and improving readability
3. Improving testability
4. Enhancing modularity and separation of concerns
5. Modernizing the code structure

Historical context from similar code in this project:
${codeContext}

CODE TO REFACTOR:
\`\`\`${fileExtension}
${code}
\`\`\`

Provide specific, actionable refactoring suggestions with before/after code examples. Explain the benefits of each suggestion.`;
}

// Function to query the Ollama API
async function queryOllama(prompt: string, config: OllamaConfig): Promise<string> {
    try {
        const response = await axios.post(config.endpoint, {
            model: config.model,
            prompt: prompt,
            stream: false,
            max_tokens: config.maxTokens,
            temperature: config.temperature
        });
        
        if (response.data && response.data.response) {
            return response.data.response;
        } else {
            throw new Error('Invalid response from Ollama API');
        }
    } catch (error) {
        console.error('Error calling Ollama API:', error);
        if (axios.isAxiosError(error) && error.response) {
            throw new Error(`Ollama API error (${error.response.status}): ${error.response.data}`);
        } else {
            throw new Error(`Failed to connect to Ollama API: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}

// Function to display results in a webview panel
function showResults(content: string, title: string) {
    const panel = vscode.window.createWebviewPanel(
        'ollamaAIResults',
        title,
        vscode.ViewColumn.Beside,
        {
            enableScripts: true
        }
    );
    
    // Process markdown in the response for better display
    panel.webview.html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title}</title>
        <style>
            body {
                font-family: var(--vscode-font-family);
                padding: 20px;
                line-height: 1.6;
            }
            pre {
                background-color: var(--vscode-editor-background);
                padding: 10px;
                border-radius: 5px;
                overflow: auto;
            }
            code {
                font-family: var(--vscode-editor-font-family);
            }
            button {
                background-color: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border: none;
                padding: 8px 12px;
                border-radius: 4px;
                cursor: pointer;
                margin-top: 20px;
            }
            button:hover {
                background-color: var(--vscode-button-hoverBackground);
            }
            .copy-btn {
                position: absolute;
                top: 10px;
                right: 10px;
                padding: 4px 8px;
                font-size: 12px;
            }
            .code-container {
                position: relative;
            }
        </style>
    </head>
    <body>
        <h1>${title}</h1>
        <div id="content">
            ${processMarkdown(content)}
        </div>
        <script>
            const vscode = acquireVsCodeApi();
            document.querySelectorAll('.copy-code-btn').forEach(button => {
                button.addEventListener('click', event => {
                    const codeBlock = event.target.parentElement.querySelector('pre');
                    const code = codeBlock.textContent;
                    navigator.clipboard.writeText(code);
                    event.target.textContent = 'Copied!';
                    setTimeout(() => {
                        event.target.textContent = 'Copy Code';
                    }, 2000);
                });
            });
            
            document.querySelectorAll('.apply-code-btn').forEach(button => {
                button.addEventListener('click', event => {
                    const codeBlock = event.target.parentElement.querySelector('pre');
                    const code = codeBlock.textContent;
                    vscode.postMessage({
                        command: 'applyCode',
                        code: code
                    });
                });
            });
        </script>
    </body>
    </html>
    `;
    
    // Handle messages from the webview
    panel.webview.onDidReceiveMessage(
        message => {
            if (message.command === 'applyCode') {
                const editor = vscode.window.activeTextEditor;
                if (editor) {
                    editor.edit(editBuilder => {
                        const selection = editor.selection;
                        editBuilder.replace(selection, message.code);
                    });
                }
            }
        },
        undefined,
        []
    );
}

// Function to process markdown into HTML with code highlighting
function processMarkdown(content: string): string {
    // Simple markdown processing - could be improved with a proper markdown library
    // Process code blocks
    content = content.replace(/```(.+?)\n([\s\S]+?)```/g, (match, language, code) => {
        return `<div class="code-container">
                    <button class="copy-code-btn">Copy Code</button>
                    <button class="apply-code-btn">Apply to Editor</button>
                    <pre><code class="language-${language}">${escapeHtml(code)}</code></pre>
                </div>`;
    });
    
    // Process headings
    content = content.replace(/^# (.*$)/gm, '<h1>$1</h1>');
    content = content.replace(/^## (.*$)/gm, '<h2>$1</h2>');
    content = content.replace(/^### (.*$)/gm, '<h3>$1</h3>');
    
    // Process lists
    content = content.replace(/^\* (.*$)/gm, '<li>$1</li>');
    content = content.replace(/^- (.*$)/gm, '<li>$1</li>');
    content = content.replace(/^(\d+)\. (.*$)/gm, '<li>$2</li>');
    content = content.replace(/<\/li>\n<li>/g, '</li><li>');
    content = content.replace(/<li>(.+?)<\/li>/g, '<ul><li>$1</li></ul>');
    content = content.replace(/<\/ul>\n<ul>/g, '');
    
    // Process paragraphs
    content = content.replace(/\n\n/g, '</p><p>');
    content = content.replace(/^(.+?)(?=<\/p>|$)/s, '<p>$1');
    if (!content.startsWith('<')) {
        content = '<p>' + content + '</p>';
    }
    
    return content;
}

// Function to escape HTML
function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Code Database class for maintaining historical code context
class CodeDatabase {
    private storageUri: vscode.Uri;
    private maxEntries: number = 1000;
    private database: Array<{code: string, extension: string, timestamp: number}> = [];
    
    constructor(context: vscode.ExtensionContext) {
        this.storageUri = vscode.Uri.joinPath(context.globalStorageUri, 'codeDatabase.json');
        this.loadDatabase();
    }
    
    private async loadDatabase() {
        try {
            if (await this.fileExists(this.storageUri)) {
                const content = await fs.promises.readFile(this.storageUri.fsPath, 'utf8');
                this.database = JSON.parse(content);
            }
        } catch (error) {
            console.error('Error loading code database:', error);
            this.database = [];
        }
    }
    
    private async saveDatabase() {
        try {
            await fs.promises.mkdir(path.dirname(this.storageUri.fsPath), { recursive: true });
            await fs.promises.writeFile(this.storageUri.fsPath, JSON.stringify(this.database), 'utf8');
        } catch (error) {
            console.error('Error saving code database:', error);
        }
    }
    
    private async fileExists(uri: vscode.Uri): Promise<boolean> {
        try {
            await fs.promises.access(uri.fsPath);
            return true;
        } catch {
            return false;
        }
    }
    
    public async addToDatabase(code: string, extension: string) {
        // Don't add duplicates
        if (this.database.some(entry => entry.code === code)) {
            return;
        }
        
        this.database.push({
            code,
            extension,
            timestamp: Date.now()
        });
        
        // Limit database size
        if (this.database.length > this.maxEntries) {
            this.database.sort((a, b) => b.timestamp - a.timestamp);
            this.database = this.database.slice(0, this.maxEntries);
        }
        
        await this.saveDatabase();
    }
    
    public async getRelevantContext(code: string, extension: string): Promise<string> {
        // Filter by extension
        const sameExtension = this.database.filter(entry => entry.extension === extension);
        
        // Simple context retrieval - could be improved with better semantic matching
        if (sameExtension.length === 0) {
            return "No historical context available for this file type.";
        }
        
        // Get the 3 most recent entries
        const recent = sameExtension
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, 3);
        
        return recent.map(entry => {
            return `--- Historical Code (${new Date(entry.timestamp).toLocaleDateString()}) ---\n${entry.code}\n`;
        }).join('\n');
    }
    
    public async indexWorkspace() {
        // Find files in the workspace
        const files = await vscode.workspace.findFiles('**/*.{js,ts,jsx,tsx,py,java,c,cpp,cs,php,rb,go}', '**/node_modules/**');
        
        let count = 0;
        const total = files.length;
        
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Indexing workspace files",
            cancellable: true
        }, async (progress, token) => {
            for (const file of files) {
                if (token.isCancellationRequested) {
                    break;
                }
                
                try {
                    const content = await fs.promises.readFile(file.fsPath, 'utf8');
                    const extension = path.extname(file.fsPath);
                    
                    // Simple chunking of the file content by functions or sections
                    // This is a basic implementation - could be improved with language-specific parsers
                    const chunks = this.chunkFileContent(content, extension);
                    
                    for (const chunk of chunks) {
                        await this.addToDatabase(chunk, extension);
                    }
                    
                    count++;
                    progress.report({ increment: (100 / total), message: `${count}/${total} files processed` });
                } catch (error) {
                    console.error(`Error processing file ${file.fsPath}:`, error);
                }
            }
            
            return `Indexed ${count} files`;
        });
    }
    
    private chunkFileContent(content: string, extension: string): string[] {
        const chunks: string[] = [];
        
        // Split by common code block indicators
        // This is a simple implementation that works across languages
        const lines = content.split('\n');
        let currentChunk: string[] = [];
        let braceCount = 0;
        
        for (const line of lines) {
            currentChunk.push(line);
            
            // Count braces for code block detection
            if (line.includes('{')) {
                braceCount += (line.match(/{/g) || []).length;
            }
            if (line.includes('}')) {
                braceCount -= (line.match(/}/g) || []).length;
            }
            
            // Detect end of function or code block
            if ((braceCount === 0 && currentChunk.length > 5) || currentChunk.length > 100) {
                chunks.push(currentChunk.join('\n'));
                currentChunk = [];
            }
        }
        
        // Add any remaining lines
        if (currentChunk.length > 0) {
            chunks.push(currentChunk.join('\n'));
        }
        
        return chunks;
    }
}

export function deactivate() {
    console.log('Ollama AI Assistant extension deactivated');
}