const vscode = require('vscode');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

class GitIdentityProvider {
  constructor() {
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    this.identities = this.loadIdentities();
  }

  refresh() {
    this.identities = this.loadIdentities();
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element) {
    return element;
  }

  getChildren() {
    if (this.identities.length === 0) {
      return [new vscode.TreeItem('No identities configured', vscode.TreeItemCollapsibleState.None)];
    }
    
    return this.identities.map(identity => {
      const item = new vscode.TreeItem(
        `${identity.name}`,
        vscode.TreeItemCollapsibleState.None
      );
      item.description = `${identity.username} <${identity.email}>`;
      item.contextValue = 'identity';
      item.command = {
        command: 'gitIdentitySwitcher.switchIdentity',
        title: 'Switch to Identity',
        arguments: [identity]
      };
      item.iconPath = new vscode.ThemeIcon('person');
      
      // Store the original identity data in the TreeItem for context menu commands
      item.identity = identity;
      
      return item;
    });
  }

  loadIdentities() {
    const config = vscode.workspace.getConfiguration('gitIdentitySwitcher');
    return config.get('identities', []);
  }

  saveIdentities(identities) {
    const config = vscode.workspace.getConfiguration('gitIdentitySwitcher');
    return config.update('identities', identities, vscode.ConfigurationTarget.Global);
  }
}

class CurrentIdentityProvider {
  constructor(manager) {
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    this.manager = manager;
  }

  refresh() {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element) {
    return element;
  }

  async getChildren() {
    try {
      const current = await this.manager.getCurrentIdentity();
      const item = new vscode.TreeItem(
        `${current.username}`,
        vscode.TreeItemCollapsibleState.None
      );
      item.description = current.email;
      item.iconPath = new vscode.ThemeIcon('person');
      item.tooltip = `Current Git identity for this workspace`;
      return [item];
    } catch (error) {
      const item = new vscode.TreeItem(
        'No Git repository',
        vscode.TreeItemCollapsibleState.None
      );
      item.description = 'Open a Git repository to see current identity';
      item.iconPath = new vscode.ThemeIcon('info');
      return [item];
    }
  }
}

class SSHManager {
  constructor() {
    this.sshDir = path.join(os.homedir(), '.ssh');
  }

  async runSSHWizard() {
    const panel = vscode.window.createWebviewPanel(
      'sshWizard',
      'SSH Setup Wizard',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: []
      }
    );
    
    console.log('Webview panel created:', panel);
    console.log('Webview options:', panel.webview.options);

    panel.webview.html = this.getWizardHTML();
    console.log('Webview HTML set');
    
    // Add error handling for webview
    panel.webview.onDidReceiveMessage(async (message) => {
      console.log('Webview message received:', message);
      try {
        switch (message.command) {
          case 'generateKey':
            await this.generateSSHKey(message.data, panel.webview);
            break;
          case 'testConnection':
            await this.testSSHConnection(message.data, panel.webview);
            break;
          case 'updateSSHConfig':
            await this.updateSSHConfig(message.data, panel.webview);
            break;
          case 'copyPublicKey':
            await this.copyPublicKey(message.data, panel.webview);
            break;
          default:
            console.log('Unknown webview message command:', message.command);
        }
      } catch (error) {
        console.error('Error handling webview message:', error);
        panel.webview.postMessage({
          command: 'error',
          data: { error: error.message }
        });
      }
    });
  }

  async generateSSHKey(data, webview) {
    const { identityName, email, provider } = data;
    const keyName = `id_rsa_${identityName.toLowerCase().replace(/\s+/g, '_')}`;
    const keyPath = path.join(this.sshDir, keyName);

    try {
      // Ensure .ssh directory exists
      if (!fs.existsSync(this.sshDir)) {
        fs.mkdirSync(this.sshDir, { mode: 0o700 });
      }

      // Generate SSH key
      const command = `ssh-keygen -t rsa -b 4096 -C "${email}" -f "${keyPath}" -N ""`;
      
      await new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });

      // Read public key
      const publicKey = fs.readFileSync(`${keyPath}.pub`, 'utf8').trim();

      webview.postMessage({
        command: 'keyGenerated',
        data: {
          success: true,
          keyName,
          publicKey,
          provider
        }
      });

    } catch (error) {
      webview.postMessage({
        command: 'keyGenerated',
        data: {
          success: false,
          error: error.message
        }
      });
    }
  }

  async updateSSHConfig(data, webview) {
    const { identityName, provider, keyName, hostUrl } = data;
    const configPath = path.join(this.sshDir, 'config');
    
    try {
      let configContent = '';
      if (fs.existsSync(configPath)) {
        configContent = fs.readFileSync(configPath, 'utf8');
      }

      const hostAlias = `${provider}-${identityName.toLowerCase().replace(/\s+/g, '-')}`;
      const newConfig = `
# ${identityName} - ${provider}
Host ${hostAlias}
    HostName ${hostUrl}
    User git
    IdentityFile ~/.ssh/${keyName}
    IdentitiesOnly yes

`;

      // Check if this config already exists
      if (!configContent.includes(`Host ${hostAlias}`)) {
        fs.writeFileSync(configPath, configContent + newConfig, { mode: 0o600 });
      }

      webview.postMessage({
        command: 'configUpdated',
        data: {
          success: true,
          hostAlias,
          cloneExample: `git clone git@${hostAlias}:username/repo.git`
        }
      });

    } catch (error) {
      webview.postMessage({
        command: 'configUpdated',
        data: {
          success: false,
          error: error.message
        }
      });
    }
  }

  async testSSHConnection(data, webview) {
    const { hostAlias } = data;
    
    try {
      const command = `ssh -T git@${hostAlias}`;
      
      exec(command, { timeout: 10000 }, (error, stdout, stderr) => {
        // SSH test usually returns exit code 1 but with success message in stderr
        const output = stdout + stderr;
        const success = output.includes('successfully authenticated') || 
                       output.includes('You\'ve successfully authenticated');

        webview.postMessage({
          command: 'connectionTested',
          data: {
            success,
            output: output.trim()
          }
        });
      });

    } catch (error) {
      webview.postMessage({
        command: 'connectionTested',
        data: {
          success: false,
          error: error.message
        }
      });
    }
  }

  async copyPublicKey(data, webview) {
    try {
      await vscode.env.clipboard.writeText(data.publicKey);
      webview.postMessage({
        command: 'publicKeyCopied',
        data: { success: true }
      });
    } catch (error) {
      webview.postMessage({
        command: 'publicKeyCopied',
        data: { success: false, error: error.message }
      });
    }
  }

  getWizardHTML() {
    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SSH Setup Wizard</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); }
        .step { display: none; background: var(--vscode-editor-inactiveSelectionBackground); border-radius: 8px; padding: 20px; margin-bottom: 20px; }
        .step.active { display: block; }
        .step h2 { margin-top: 0; color: var(--vscode-textLink-foreground); }
        .form-group { margin-bottom: 15px; }
        label { display: block; margin-bottom: 5px; font-weight: 500; }
        input, select, textarea { width: 100%; padding: 8px 12px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: 4px; box-sizing: border-box; }
        button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; margin-right: 10px; }
        button:hover { background: var(--vscode-button-hoverBackground); }
        button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
        .success { color: var(--vscode-testing-iconPassed); background: var(--vscode-inputValidation-infoBackground); padding: 10px; border-radius: 4px; margin: 10px 0; }
        .error { color: var(--vscode-testing-iconFailed); background: var(--vscode-inputValidation-errorBackground); padding: 10px; border-radius: 4px; margin: 10px 0; }
        .code-block { background: var(--vscode-textCodeBlock-background); padding: 10px; border-radius: 4px; font-family: 'Courier New', monospace; margin: 10px 0; font-size: 12px; }
        .progress { display: flex; justify-content: space-between; margin-bottom: 30px; padding-bottom: 10px; border-bottom: 1px solid var(--vscode-input-border); }
        .progress-step { flex: 1; text-align: center; padding: 5px; background: var(--vscode-button-secondaryBackground); margin: 0 2px; border-radius: 4px; font-size: 12px; }
        .progress-step.active { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
        .progress-step.completed { background: var(--vscode-testing-iconPassed); color: white; }
    </style>
</head>
<body>
    <h1>SSH Setup Wizard</h1>
    <div class="progress">
        <div class="progress-step active" id="progress-1">1. Identity Info</div>
        <div class="progress-step" id="progress-2">2. Generate Key</div>
        <div class="progress-step" id="progress-3">3. Add to Provider</div>
        <div class="progress-step" id="progress-4">4. Configure & Test</div>
    </div>

    <div class="step active" id="step-1">
        <h2>Step 1: Identity Information</h2>
        <p>First, let's gather the basic information for this Git identity.</p>
        <div class="form-group">
            <label>Identity Name:</label>
            <input type="text" id="identityName" placeholder="e.g., Work, Personal" />
        </div>
        <div class="form-group">
            <label>Email Address:</label>
            <input type="email" id="email" placeholder="your.email@example.com" />
        </div>
        <div class="form-group">
            <label>Git Provider:</label>
            <select id="provider">
                <option value="github">GitHub (github.com)</option>
                <option value="gitlab">GitLab (gitlab.com)</option>
                <option value="bitbucket">Bitbucket (bitbucket.org)</option>
                <option value="other">Other</option>
            </select>
        </div>
        <button onclick="nextStep(2)">Next: Generate SSH Key</button>
    </div>

    <div class="step" id="step-2">
        <h2>Step 2: Generate SSH Key</h2>
        <p>We'll generate a unique SSH key for this identity.</p>
        <div id="key-generation-status"></div>
        <button onclick="generateKey()">Generate SSH Key</button>
        <button class="secondary" onclick="prevStep(1)">Back</button>
        <button onclick="nextStep(3)" id="next-step-2" style="display: none;">Next: Add Key to Provider</button>
    </div>

    <div class="step" id="step-3">
        <h2>Step 3: Add SSH Key to Your Git Provider</h2>
        <p>Copy your public key and add it to your Git provider account.</p>
        <div class="form-group">
            <label>Your SSH Public Key:</label>
            <textarea id="publicKeyDisplay" rows="4" readonly></textarea>
            <button onclick="copyPublicKey()">Copy to Clipboard</button>
        </div>
        <div id="provider-instructions"></div>
        <div id="copy-status"></div>
        <button class="secondary" onclick="prevStep(2)">Back</button>
        <button onclick="nextStep(4)">Next: Configure & Test</button>
    </div>

    <div class="step" id="step-4">
        <h2>Step 4: Configure SSH and Test Connection</h2>
        <p>We'll update your SSH config and test the connection.</p>
        <div id="config-status"></div>
        <button onclick="updateSSHConfig()">Update SSH Config</button>
        <button onclick="testConnection()" id="test-button" style="display: none;">Test SSH Connection</button>
        <div id="test-results"></div>
        <div id="completion-status"></div>
        <button class="secondary" onclick="prevStep(3)">Back</button>
        <button onclick="completeWizard()" id="complete-button" style="display: none;">Complete Setup</button>
    </div>

    <script>
        console.log('SSH Wizard script loading...');
        let vscode;
        let currentData = {};
        
        try {
            console.log('Attempting to acquire VS Code API...');
            vscode = acquireVsCodeApi();
            console.log('VS Code API acquired successfully');
            console.log('VS Code object:', vscode);
            console.log('postMessage function:', typeof vscode.postMessage);
            console.log('SSH Wizard script loaded successfully');
        } catch (error) {
            console.error('Error loading SSH Wizard script:', error);
            console.error('Error details:', error.message, error.stack);
            // Create a fallback vscode object for testing
            vscode = {
                postMessage: function(message) {
                    console.log('Fallback postMessage called with:', message);
                }
            };
        }

        function nextStep(stepNumber) {
            console.log('nextStep called with stepNumber:', stepNumber);
            if (stepNumber === 2) {
                const identityName = document.getElementById('identityName').value;
                const email = document.getElementById('email').value;
                if (!identityName || !email) {
                    alert('Please fill in all required fields');
                    return;
                }
                currentData = { identityName, email, provider: document.getElementById('provider').value };
                console.log('Current data set:', currentData);
            }
            document.querySelectorAll('.step').forEach(step => step.classList.remove('active'));
            const nextStepElement = document.getElementById('step-' + stepNumber);
            if (nextStepElement) {
                nextStepElement.classList.add('active');
                updateProgress(stepNumber);
            }
        }

        function prevStep(stepNumber) {
            document.querySelectorAll('.step').forEach(step => step.classList.remove('active'));
            document.getElementById('step-' + stepNumber).classList.add('active');
            updateProgress(stepNumber);
        }

        function updateProgress(activeStep) {
            document.querySelectorAll('.progress-step').forEach((step, index) => {
                step.classList.remove('active', 'completed');
                if (index + 1 < activeStep) step.classList.add('completed');
                else if (index + 1 === activeStep) step.classList.add('active');
            });
        }

        function generateKey() {
            if (!vscode) {
                console.error('VS Code API not available');
                return;
            }
            document.getElementById('key-generation-status').innerHTML = '<div>Generating SSH key...</div>';
            vscode.postMessage({ command: 'generateKey', data: currentData });
        }

        function copyPublicKey() {
            if (!vscode) {
                console.error('VS Code API not available');
                return;
            }
            vscode.postMessage({ command: 'copyPublicKey', data: { publicKey: currentData.publicKey } });
        }

        function updateSSHConfig() {
            if (!vscode) {
                console.error('VS Code API not available');
                return;
            }
            const hostUrls = { 'github': 'github.com', 'gitlab': 'gitlab.com', 'bitbucket': 'bitbucket.org' };
            vscode.postMessage({ command: 'updateSSHConfig', data: { ...currentData, hostUrl: hostUrls[currentData.provider] || 'github.com' } });
        }

        function testConnection() {
            if (!vscode) {
                console.error('VS Code API not available');
                return;
            }
            vscode.postMessage({ command: 'testConnection', data: { hostAlias: currentData.hostAlias } });
        }

        function completeWizard() {
            if (!vscode) {
                console.error('VS Code API not available');
                return;
            }
            alert('SSH setup complete! You can now use this identity for Git operations.');
            vscode.postMessage({ command: 'closeWizard' });
        }

        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'keyGenerated': handleKeyGenerated(message.data); break;
                case 'publicKeyCopied': handlePublicKeyCopied(message.data); break;
                case 'configUpdated': handleConfigUpdated(message.data); break;
                case 'connectionTested': handleConnectionTested(message.data); break;
            }
        });

        function handleKeyGenerated(data) {
            if (data.success) {
                currentData.keyName = data.keyName;
                currentData.publicKey = data.publicKey;
                document.getElementById('key-generation-status').innerHTML = '<div class="success">✓ SSH key generated successfully!</div>';
                document.getElementById('next-step-2').style.display = 'inline-block';
                document.getElementById('publicKeyDisplay').value = data.publicKey;
                updateProviderInstructions(data.provider);
            } else {
                document.getElementById('key-generation-status').innerHTML = '<div class="error">Error: ' + data.error + '</div>';
            }
        }

        function handlePublicKeyCopied(data) {
            if (data.success) {
                document.getElementById('copy-status').innerHTML = '<div class="success">✓ Public key copied to clipboard!</div>';
            }
        }

        function handleConfigUpdated(data) {
            if (data.success) {
                currentData.hostAlias = data.hostAlias;
                document.getElementById('config-status').innerHTML = '<div class="success">✓ SSH config updated!</div><div class="code-block">Clone example: ' + data.cloneExample + '</div>';
                document.getElementById('test-button').style.display = 'inline-block';
            } else {
                document.getElementById('config-status').innerHTML = '<div class="error">Error: ' + data.error + '</div>';
            }
        }

        function handleConnectionTested(data) {
            if (data.success) {
                document.getElementById('test-results').innerHTML = '<div class="success">✓ SSH connection successful!</div><div class="code-block">' + data.output + '</div>';
                document.getElementById('complete-button').style.display = 'inline-block';
            } else {
                document.getElementById('test-results').innerHTML = '<div class="error">Connection test failed:</div><div class="code-block">' + (data.output || data.error) + '</div>';
            }
        }

        function updateProviderInstructions(provider) {
            const instructions = {
                'github': '<h3>Add to GitHub:</h3><ol><li>Go to <a href="https://github.com/settings/keys">GitHub SSH Keys Settings</a></li><li>Click "New SSH key"</li><li>Give it a title (e.g., "' + currentData.identityName + '")</li><li>Paste the public key above</li><li>Click "Add SSH key"</li></ol>',
                'gitlab': '<h3>Add to GitLab:</h3><ol><li>Go to <a href="https://gitlab.com/-/profile/keys">GitLab SSH Keys Settings</a></li><li>Paste the public key above</li><li>Give it a title (e.g., "' + currentData.identityName + '")</li><li>Click "Add key"</li></ol>',
                'bitbucket': '<h3>Add to Bitbucket:</h3><ol><li>Go to Bitbucket Settings > SSH Keys</li><li>Click "Add key"</li><li>Paste the public key above</li><li>Give it a label (e.g., "' + currentData.identityName + '")</li><li>Click "Add key"</li></ol>'
            };
            document.getElementById('provider-instructions').innerHTML = instructions[provider] || '<p>Add the public key to your Git provider SSH settings.</p>';
        }
    </script>
</body>
</html>`;
  }
}

class GitIdentityManager {
  constructor() {
    this.provider = new GitIdentityProvider();
  }

  async getCurrentIdentity() {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      throw new Error('No workspace folder open');
    }

    return new Promise((resolve, reject) => {
      const cwd = workspaceFolder.uri.fsPath;
      
      exec('git config user.name && git config user.email', { cwd }, (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        
        const lines = stdout.trim().split('\n');
        resolve({
          username: lines[0] || 'Not set',
          email: lines[1] || 'Not set'
        });
      });
    });
  }

  async switchIdentity(identity) {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('No workspace folder open');
      return;
    }

    const cwd = workspaceFolder.uri.fsPath;
    const commands = [
      `git config user.name "${identity.username}"`,
      `git config user.email "${identity.email}"`
    ];

    return new Promise((resolve, reject) => {
      exec(commands.join(' && '), { cwd }, (error) => {
        if (error) {
          vscode.window.showErrorMessage(`Failed to switch identity: ${error.message}`);
          reject(error);
          return;
        }
        
        const folderName = path.basename(workspaceFolder.uri.fsPath);
        vscode.window.showInformationMessage(
          `Switched to "${identity.name}" for ${folderName}`
        );
        
        resolve();
      });
    });
  }

  async addIdentity() {
    const name = await vscode.window.showInputBox({
      prompt: 'Enter identity name (e.g., "Work", "Personal")',
      placeHolder: 'Work'
    });

    if (!name) return;

    const username = await vscode.window.showInputBox({
      prompt: 'Enter Git username',
      placeHolder: 'john.doe'
    });

    if (!username) return;

    const email = await vscode.window.showInputBox({
      prompt: 'Enter Git email',
      placeHolder: 'john.doe@company.com'
    });

    if (!email) return;

    const identities = this.provider.loadIdentities();
    
    // Check for duplicates
    if (identities.find(id => id.name === name)) {
      vscode.window.showErrorMessage('Identity with this name already exists');
      return;
    }

    identities.push({ name, username, email, id: Date.now() });
    await this.provider.saveIdentities(identities);
    this.provider.refresh();
    
    vscode.window.showInformationMessage(`Added identity: ${name}`);
  }

  async deleteIdentity(identity) {
    // Handle both TreeItem (from context menu) and identity data (from command palette)
    let identityData = identity;
    if (identity.identity) {
      // This is a TreeItem from context menu, extract the identity data
      identityData = identity.identity;
    }
    
    if (!identityData || !identityData.name) {
      vscode.window.showErrorMessage('Invalid identity object for deletion');
      return;
    }
    
    const confirm = await vscode.window.showWarningMessage(
      `Delete identity "${identityData.name}"?`,
      'Delete',
      'Cancel'
    );

    if (confirm === 'Delete') {
      try {
        const identities = this.provider.loadIdentities();
        const filtered = identities.filter(id => id.name !== identityData.name);
        
        await this.provider.saveIdentities(filtered);
        this.provider.refresh();
        
        vscode.window.showInformationMessage(`Deleted identity: ${identityData.name}`);
      } catch (error) {
        console.error('Error deleting identity:', error);
        vscode.window.showErrorMessage(`Failed to delete identity: ${error.message}`);
      }
    }
  }

  async copyPublicKey(identity) {
    // Handle both TreeItem (from context menu) and identity data (from command palette)
    let identityData = identity;
    if (identity.identity) {
      // This is a TreeItem from context menu, extract the identity data
      identityData = identity.identity;
    }
    
    if (!identityData || !identityData.name) {
      vscode.window.showErrorMessage('Invalid identity object for copying SSH key');
      return;
    }
    
    const sshDir = path.join(os.homedir(), '.ssh');
    const keyName = `id_rsa_${identityData.name.toLowerCase().replace(/\s+/g, '_')}`;
    const publicKeyPath = path.join(sshDir, `${keyName}.pub`);
    
    try {
      if (fs.existsSync(publicKeyPath)) {
        const publicKey = fs.readFileSync(publicKeyPath, 'utf8').trim();
        await vscode.env.clipboard.writeText(publicKey);
        vscode.window.showInformationMessage(`SSH public key copied to clipboard for ${identityData.name}`);
      } else {
        vscode.window.showErrorMessage(`SSH key not found for ${identityData.name}. Run SSH wizard first.`);
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to copy SSH key: ${error.message}`);
    }
  }
}

function activate(context) {
  const manager = new GitIdentityManager();
  const sshManager = new SSHManager();
  
  // Register tree views
  const identitiesView = vscode.window.createTreeView('gitIdentitySwitcher', {
    treeDataProvider: manager.provider
  });
  
  const currentIdentityView = vscode.window.createTreeView('currentIdentityView', {
    treeDataProvider: new CurrentIdentityProvider(manager)
  });
  


  // Register commands
  const switchCommand = vscode.commands.registerCommand(
    'gitIdentitySwitcher.switchIdentity',
    async (identity) => {
      if (identity && identity.username) {
        await manager.switchIdentity(identity);
      } else {
        // Show quick pick if called from command palette
        const identities = manager.provider.loadIdentities();
        if (identities.length === 0) {
          vscode.window.showInformationMessage('No identities configured. Add one first.');
          return;
        }

        const selected = await vscode.window.showQuickPick(
          identities.map(id => ({
            label: id.name,
            description: `${id.username} <${id.email}>`,
            identity: id
          })),
          { placeHolder: 'Select identity to switch to' }
        );

        if (selected) {
          await manager.switchIdentity(selected.identity);
        }
      }
    }
  );

  const addCommand = vscode.commands.registerCommand(
    'gitIdentitySwitcher.addIdentity',
    () => manager.addIdentity()
  );

  const refreshCommand = vscode.commands.registerCommand(
    'gitIdentitySwitcher.refreshView',
    () => manager.provider.refresh()
  );

  const deleteCommand = vscode.commands.registerCommand(
    'gitIdentitySwitcher.deleteIdentity',
    (identity) => manager.deleteIdentity(identity)
  );

  const deleteIdentityFromPalette = vscode.commands.registerCommand(
    'gitIdentitySwitcher.deleteIdentityFromPalette',
    async () => {
      const identities = manager.provider.loadIdentities();
      if (identities.length === 0) {
        vscode.window.showInformationMessage('No identities configured to delete.');
        return;
      }
      
      const selected = await vscode.window.showQuickPick(
        identities.map(id => ({
          label: id.name,
          description: `${id.username} <${id.email}>`,
          identity: id
        })),
        { placeHolder: 'Select identity to delete' }
      );
      
      if (selected) {
        await manager.deleteIdentity(selected.identity);
      }
    }
  );

  const sshWizardCommand = vscode.commands.registerCommand(
    'gitIdentitySwitcher.sshWizard',
    () => sshManager.runSSHWizard()
  );

  const copyPublicKeyCommand = vscode.commands.registerCommand(
    'gitIdentitySwitcher.copyPublicKey',
    (identity) => manager.copyPublicKey(identity)
  );

  // Show current identity in status bar
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  statusBarItem.command = 'gitIdentitySwitcher.switchIdentity';
  
  const updateStatusBar = async () => {
    try {
      const current = await manager.getCurrentIdentity();
      statusBarItem.text = `$(person) ${current.username}`;
      statusBarItem.tooltip = `Git: ${current.username} <${current.email}>\nClick to switch identity`;
      statusBarItem.show();
      
      // Refresh current identity view when status bar updates
      try {
        if (currentIdentityView && currentIdentityView.treeDataProvider) {
          currentIdentityView.treeDataProvider.refresh();
        }
      } catch (refreshError) {
        console.error('Error refreshing current identity view from status bar:', refreshError);
      }
    } catch (error) {
      statusBarItem.hide();
      
      // Refresh current identity view even on error
      try {
        if (currentIdentityView && currentIdentityView.treeDataProvider) {
          currentIdentityView.treeDataProvider.refresh();
        }
      } catch (refreshError) {
        console.error('Error refreshing current identity view from status bar error handler:', refreshError);
      }
    }
  };

  // Refresh current identity view when identities change
  manager.provider.onDidChangeTreeData(() => {
    try {
      if (currentIdentityView && currentIdentityView.treeDataProvider) {
        currentIdentityView.treeDataProvider.refresh();
      }
    } catch (error) {
      console.error('Error refreshing current identity view:', error);
    }
  });

  // Update status bar on activation and when active editor changes
  updateStatusBar();
  vscode.window.onDidChangeActiveTextEditor(updateStatusBar);

  context.subscriptions.push(
    switchCommand,
    addCommand,
    refreshCommand,
    deleteCommand,
    deleteIdentityFromPalette,
    sshWizardCommand,
    copyPublicKeyCommand,
    statusBarItem,
    identitiesView,
    currentIdentityView
  );
}

function deactivate() {}

module.exports = { activate, deactivate };