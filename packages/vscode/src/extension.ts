import * as vscode from 'vscode';
import * as http from 'http';

// Helper to call the REST proxy
async function callLokaFlowApi(prompt: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: 'localhost',
            port: 4141,
            path: '/v1/chat/completions',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode && res.statusCode >= 400) {
                    reject(new Error(`API Error ${res.statusCode}: ${data}`));
                    return;
                }
                try {
                    const parsed = JSON.parse(data);
                    resolve(parsed.choices[0]?.message?.content || '');
                } catch (e) {
                    reject(e);
                }
            });
        });

        req.on('error', reject);

        req.write(JSON.stringify({
            model: "auto", // Tell the router to decide local vs cloud
            messages: [{ role: "user", content: prompt }],
            stream: false
        }));
        req.end();
    });
}

export function activate(context: vscode.ExtensionContext) {
    console.log('LokaFlow extension is now active!');

    // Command: Chat
    let chatDisposable = vscode.commands.registerCommand('lokaflow.chat', async () => {
        const userInput = await vscode.window.showInputBox({
            prompt: 'Ask LokaFlow',
            placeHolder: 'E.g., How do I write a web server in Go?'
        });

        if (!userInput) return;

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "LokaFlow Routing...",
            cancellable: false
        }, async (_progress) => {
            try {
                const response = await callLokaFlowApi(userInput);

                // Show in a temporary text document
                const doc = await vscode.workspace.openTextDocument({
                    content: `## User\n${userInput}\n\n## LokaFlow\n${response}`,
                    language: 'markdown'
                });
                await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
            } catch (err: any) {
                vscode.window.showErrorMessage(`LokaFlow connection failed: ${err.message}. Is 'lokaflow serve' running on port 4141?`);
            }
        });
    });

    // Command: Explain Code
    let explainDisposable = vscode.commands.registerCommand('lokaflow.explainCode', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showInformationMessage('No active editor found.');
            return;
        }

        const selection = editor.selection;
        const text = editor.document.getText(selection);

        if (!text) {
            vscode.window.showInformationMessage('Please select some code to explain.');
            return;
        }

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "LokaFlow (Local/Cloud Engine)...",
            cancellable: false
        }, async (_progress) => {
            try {
                const prompt = `Please explain the following code snippet concisely:\n\n\`\`\`\n${text}\n\`\`\``;
                const response = await callLokaFlowApi(prompt);

                const doc = await vscode.workspace.openTextDocument({
                    content: `## Code Explanation\n\n${response}`,
                    language: 'markdown'
                });
                await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
            } catch (err: any) {
                vscode.window.showErrorMessage(`LokaFlow error: ${err.message}`);
            }
        });
    });

    context.subscriptions.push(chatDisposable, explainDisposable);
}

export function deactivate() { }
