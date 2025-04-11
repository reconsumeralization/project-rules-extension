import * as vscode from 'vscode';
import * as https from 'https';
import * as http from 'http';

// NOTE: This file should ONLY contain the AiService class definition below.
// ALL PREVIOUS top-level functions (analyzeRuleApplicability, suggestRuleImprovements, etc.) MUST be removed.

/**
 * Service for making generic AI requests (e.g., to OpenAI compatible APIs).
 * Handles configuration reading (API Key, Model Name) and basic HTTP requests.
 */
export class AiService {

  constructor(
    private readonly _extensionContext: vscode.ExtensionContext
  ) {}

  private _getConfig(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration('ProjectRules.ai');
  }

  private _getModelName(): string {
      const config = this._getConfig();
      return config.get<string>('modelName') || 'gemini-1.5-pro-latest'; // Default model
  }

  private async _getApiKey(): Promise<string | undefined> {
      const config = this._getConfig();
      let apiKey = config.get<string>('apiKey');
      if (!apiKey) {
          console.log("AI Service: API Key not found in settings, prompting user.");
          apiKey = await this._promptForApiKey();
      }
      return apiKey;
  }

  public async analyzeWithAI<T>(prompt: string): Promise<T> {
    return vscode.window.withProgress<T>(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Processing with AI...',
        cancellable: false
      },
      async (progress) => {
        progress.report({ increment: 0, message: 'Preparing request...' });
        const apiKey = await this._getApiKey();
        if (!apiKey) {throw new Error('AI API key is required and was not provided.');}
        const modelName = this._getModelName();
        progress.report({ message: `Getting API Key & Model (${modelName})...` });
        try {
          progress.report({ increment: 30, message: `Sending request to AI (${modelName})...` });
          const requestData = this._prepareOpenAIRequest(prompt, modelName, apiKey);
          const jsonResponse = await this._makeHttpRequest(requestData);
          progress.report({ increment: 50, message: 'Processing response...' });
          const result = this._extractContentFromResponse(jsonResponse);
          progress.report({ increment: 20, message: 'Parsing JSON...' });
          let parsedResult: T;
          try {
             if (typeof result === 'string') {
                 const cleanedResult = result.replace(/^```json\s*/, '').replace(/\s*```$/, '');
                 parsedResult = JSON.parse(cleanedResult);
             } else if (typeof result === 'object' && result !== null) {
                 console.warn("AI Service: AI response was already an object.");
                 parsedResult = result as T;
             } else {
                  throw new Error(`Unexpected content extracted: ${result === null ? 'null' : typeof result}`);
             }
          } catch (parseError) {
            console.error('Error parsing AI JSON:', parseError);
            console.log('Raw content:', result);
            throw new Error(`AI response couldn't be parsed as JSON. Check logs.`);
          }
          return parsedResult;
        } catch (error) {
          console.error('Error in AI analysis:', error);
          if (error instanceof Error && error.message.includes('status code: 401')) {throw new Error(`AI request failed (401 Unauthorized). Check API Key.`);}
          if (error instanceof Error && error.message.includes('status code: 404')) {throw new Error(`AI request failed (404 Not Found). Check Model Name/Endpoint.`);}
          if (error instanceof Error && error.message.includes('status code:')) {throw new Error(`AI request failed: ${error.message}. Check Key, Model, Network.`);}
          if (error instanceof Error) {throw new Error(`AI analysis error: ${error.message}`);}
          throw new Error(`Unknown AI analysis error.`);
        }
      }
    );
  }

  private _prepareOpenAIRequest( prompt: string, modelName: string, apiKey: string ): { url: string; method: string; headers: Record<string, string>; body: string; } {
      const endpoint = 'https://api.openai.com/v1/chat/completions';
      return {
        url: endpoint,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: modelName,
          messages: [
            { role: 'system', content: 'You are a helpful assistant designed to output JSON. Provide ONLY a single, valid JSON object based on the instructions, without any surrounding text or formatting.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.3,
        })
      };
  }

  private async _makeHttpRequest(request: { url: string; method: string; headers: Record<string, string>; body: string; }): Promise<any> {
        const { url, method, headers, body } = request;
        const protocol = url.startsWith('https:') ? https : http;
        const options = { method, headers };
        return new Promise((resolve, reject) => {
            const req = protocol.request(url, options, (res) => {
                let data = '';
                res.setEncoding('utf8');
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                        try { resolve(JSON.parse(data)); }
                        catch (e) { 
                            const message = e instanceof Error ? e.message : String(e);
                            reject(new Error(`Failed to parse JSON response. Data: ${data}. Error: ${message}`)); 
                        }
                    } else { reject(new Error(`Request failed: ${res.statusCode}. Response: ${data}`)); }
                });
            });
            req.on('error', (e) => { 
                const message = e instanceof Error ? e.message : String(e);
                reject(new Error(`Request error: ${message}`)); 
            });
            if (body) { req.write(body); }
            req.end();
        });
  }

  private _extractContentFromResponse(response: any): string | object | null {
    if (response?.choices?.[0]?.message?.content) {return response.choices[0].message.content.trim();}
    console.warn("AiService: Could not extract expected content.", JSON.stringify(response));
    return null;
  }

  private async _promptForApiKey(): Promise<string | undefined> {
    const apiKey = await vscode.window.showInputBox({ prompt: 'Enter your AI API Key', placeHolder: 'sk-... or AIza...', ignoreFocusOut: true, password: true });
    console.log(`AI Service: ${apiKey ? 'API Key entered.' : 'User did not enter API Key.'}`);
    return apiKey;
  }
}