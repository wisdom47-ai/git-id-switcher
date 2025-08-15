const vscode = require('vscode');
const { exec } = require('child_process');
const path = require('path');

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
    const confirm = await vscode.window.showWarningMessage(
      `Delete identity "${identity.label}"?`,
      'Delete',
      'Cancel'
    );

    if (confirm === 'Delete') {
      const identities = this.provider.loadIdentities();
      const filtered = identities.filter(id => id.name !== identity.label);
      await this.provider.saveIdentities(filtered);
      this.provider.refresh();
      
      vscode.window.showInformationMessage(`Deleted identity: ${identity.label}`);
    }
  }
}

function activate(context) {
  const manager = new GitIdentityManager();
  
  // Register tree view
  vscode.window.createTreeView('gitIdentitySwitcher', {
    treeDataProvider: manager.provider
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
    } catch (error) {
      statusBarItem.hide();
    }
  };

  // Update status bar on activation and when active editor changes
  updateStatusBar();
  vscode.window.onDidChangeActiveTextEditor(updateStatusBar);

  context.subscriptions.push(
    switchCommand,
    addCommand,
    refreshCommand,
    deleteCommand,
    statusBarItem
  );
}

function deactivate() {}

module.exports = { activate, deactivate };