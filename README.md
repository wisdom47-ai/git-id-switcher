# Git Identity Switcher

Easily switch between Git user identities for different repositories without remembering command line syntax.

## Features

- **Simple Identity Management**: Add and manage multiple Git identities (name, username, email)
- **Quick Switching**: Switch Git identity for current workspace with one click
- **Status Bar Integration**: See current Git identity at a glance
- **Sidebar Panel**: Manage identities directly from Explorer sidebar
- **Command Palette**: Access via `Git: Switch Identity` command

## Usage

1. **Add Identity**: Click the `+` button in the Git Identity panel or use Command Palette
2. **Switch Identity**: Click on any identity in the panel or use the status bar
3. **Current Status**: Check status bar to see current Git identity

## Commands

- `Git Identity Switcher: Switch Identity` - Switch between configured identities
- `Git Identity Switcher: Add Identity` - Add a new identity
- `Git Identity Switcher: Refresh` - Refresh the identity list

The extension automatically detects your current Git configuration and shows it in the status bar.

## Requirements

- Git must be installed and accessible from command line
- VS Code 1.74.0 or higher

## Installation

1. Save the files in a folder
2. Open terminal in that folder
3. Run `npm install` (if needed)
4. Press F5 to launch Extension Development Host
5. Or package with `vsce package` and install the .vsix file