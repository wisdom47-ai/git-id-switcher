# Git Identity Switcher

Easily switch between Git user identities for different repositories without remembering command line syntax. Now with SSH key management!

## Features

- **Simple Identity Management**: Add and manage multiple Git identities (name, username, email)
- **Quick Switching**: Switch Git identity for current workspace with one click
- **SSH Setup Wizard**: Step-by-step SSH key generation and configuration
- **SSH Key Management**: Generate unique SSH keys for each identity
- **Auto SSH Config**: Automatically updates ~/.ssh/config with proper host aliases
- **Connection Testing**: Test SSH connections to ensure everything works
- **Status Bar Integration**: See current Git identity at a glance
- **Sidebar Panel**: Manage identities directly from dedicated sidebar
- **Command Palette**: Access via `Git: Switch Identity` command

## Installation

### For Development/Testing
1. Clone or download this repository
2. Open the folder in VS Code
3. Press `F5` to launch Extension Development Host
4. The extension will be loaded in the new VS Code window

### For Production Use
1. Install the extension from the VS Code marketplace (when published)
2. Or package with `vsce package` and install the .vsix file

## Getting Started

### 1. Open the Git Identity Panel
- Look for the "Git Identity" icon in the left sidebar (Activity Bar)
- Click on it to open the Git Identity panel
- You'll see a list of configured identities (empty at first)

### 2. Add Your First Identity
- Click the `+` button in the Git Identity panel
- Or use Command Palette: `Ctrl+Shift+P` → "Git Identity Switcher: Add Identity"
- Enter:
  - **Identity Name**: A descriptive name (e.g., "Work", "Personal", "Client A")
  - **Git Username**: Your Git username for this identity
  - **Git Email**: Your Git email for this identity

### 3. Switch Between Identities
- **From Panel**: Click on any identity in the Git Identity panel
- **From Status Bar**: Click the identity shown in the bottom status bar
- **From Command Palette**: `Ctrl+Shift+P` → "Git Identity Switcher: Switch Identity"

## SSH Setup (Recommended)

### Why SSH Setup?
- Use different SSH keys for different accounts
- Avoid authentication conflicts between work/personal accounts
- Secure and convenient authentication

### Step-by-Step SSH Setup

#### 1. Launch SSH Wizard
- Click the key icon (🔑) in the Git Identity panel
- Or use Command Palette: "Git Identity Switcher: SSH Setup Wizard"

#### 2. Step 1: Identity Information
- Enter the identity name and email
- Select your Git provider (GitHub, GitLab, Bitbucket, or Other)
- Click "Next: Generate SSH Key"

#### 3. Step 2: Generate SSH Key
- Click "Generate SSH Key"
- The wizard will create a unique SSH key for this identity
- Wait for the success message, then click "Next: Add Key to Provider"

#### 4. Step 3: Add to Git Provider
- Copy the generated public key (click "Copy to Clipboard")
- Follow the provider-specific instructions shown
- Add the key to your Git provider account
- Click "Next: Configure & Test"

#### 5. Step 4: Configure & Test
- Click "Update SSH Config" to update your SSH configuration
- Click "Test SSH Connection" to verify everything works
- Click "Complete Setup" when finished

### What the SSH Wizard Creates

#### SSH Keys
- **File Names**: `id_rsa_[identity_name]` and `id_rsa_[identity_name].pub`
- **Location**: `~/.ssh/` directory
- **Example**: `id_rsa_work`, `id_rsa_personal`

#### SSH Config Entries
The wizard automatically adds entries to `~/.ssh/config`:

```
# Work - github
Host github-work
    HostName github.com
    User git
    IdentityFile ~/.ssh/id_rsa_work
    IdentitiesOnly yes
```

#### Host Aliases
- **Format**: `[provider]-[identity_name]`
- **Examples**: `github-work`, `gitlab-personal`, `bitbucket-client`

### Using SSH Host Aliases

#### Cloning Repositories
```bash
# Instead of: git clone git@github.com:company/repo.git
git clone git@github-work:company/repo.git

# Instead of: git clone git@gitlab.com:username/project.git
git clone git@gitlab-personal:username/project.git
```

#### Adding Remote Origins
```bash
# Add remote with host alias
git remote add origin git@github-work:company/repo.git

# Or change existing remote
git remote set-url origin git@github-work:company/repo.git
```

## Daily Usage

### Quick Identity Switch
1. Open the Git Identity panel
2. Click on the identity you want to use
3. VS Code will automatically update the Git config for the current workspace
4. Check the status bar to confirm the switch

### Check Current Identity
- **Status Bar**: Look at the bottom-left status bar
- **Command**: `git config user.name && git config user.email`
- **Panel**: The current identity will be highlighted

### Managing Identities
- **Add New**: Click `+` button or use Command Palette
- **Delete**: Right-click on an identity → "Delete Identity"
- **Refresh**: Click refresh button to reload the list

## Commands Reference

| Command | Description | Shortcut |
|---------|-------------|----------|
| `Git Identity Switcher: Switch Identity` | Switch between configured identities | - |
| `Git Identity Switcher: Add Identity` | Add a new identity | - |
| `Git Identity Switcher: SSH Setup Wizard` | Launch the SSH setup wizard | - |
| `Git Identity Switcher: Copy SSH Public Key` | Copy public key for an identity | - |
| `Git Identity Switcher: Refresh` | Refresh the identity list | - |

## Troubleshooting

### Extension Won't Activate
- Ensure you have a workspace folder open
- Check VS Code version (requires 1.74.0+)
- Verify Git is installed and accessible

### SSH Connection Issues
- **Permission Denied**: Check that the SSH key was added to your Git provider
- **Host Key Verification**: Accept the host key when prompted
- **Config Issues**: Verify `~/.ssh/config` has the correct entries

### Identity Not Switching
- Ensure you're in a Git repository
- Check that the repository has Git initialized
- Verify the identity was saved correctly

### SSH Key Generation Fails
- Check that the `.ssh` directory exists and has correct permissions (700)
- Ensure you have write permissions to the home directory
- Try running the SSH wizard as administrator if on Windows

## Advanced Configuration

### Custom SSH Config
You can manually edit `~/.ssh/config` to add custom configurations:

```
# Custom configuration for specific repositories
Host github-custom
    HostName github.com
    User git
    IdentityFile ~/.ssh/id_rsa_custom
    IdentitiesOnly yes
    # Add custom options like:
    # ServerAliveInterval 60
    # ServerAliveCountMax 3
```

### Multiple Identities for Same Provider
You can have multiple identities for the same Git provider:

```
# Work GitHub account
Host github-work
    HostName github.com
    User git
    IdentityFile ~/.ssh/id_rsa_work
    IdentitiesOnly yes

# Personal GitHub account
Host github-personal
    HostName github.com
    User git
    IdentityFile ~/.ssh/id_rsa_personal
    IdentitiesOnly yes
```

## Requirements

- **VS Code**: Version 1.74.0 or higher
- **Git**: Must be installed and accessible from command line
- **SSH Client**: Standard on macOS/Linux, available on Windows
- **Operating System**: Windows, macOS, or Linux

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This extension is provided as-is for educational and development purposes.

## Support

If you encounter issues:
1. Check the troubleshooting section above
2. Verify your Git and SSH setup
3. Check VS Code's Developer Console for error messages
4. Ensure all requirements are met

---

**Happy coding with multiple Git identities! 🚀**