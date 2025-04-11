#!/bin/bash

# Script to create a GitHub repository and push existing code

# Repository details
REPO_NAME="project-rules-extension"
REPO_DESC="A VS Code extension for managing and enforcing project-specific rules and conventions"
GITHUB_USER="reconsumeralization"

# Ask for GitHub password or token
echo "Enter your GitHub password or personal access token:"
read -s GITHUB_TOKEN

# Create the repository
echo "Creating GitHub repository: $REPO_NAME..."
curl -u "$GITHUB_USER:$GITHUB_TOKEN" https://api.github.com/user/repos -d "{\"name\":\"$REPO_NAME\", \"description\":\"$REPO_DESC\"}"

# Setup remote
echo "Setting up remote..."
git remote set-url origin "https://github.com/$GITHUB_USER/$REPO_NAME.git"

# Push code
echo "Pushing code to GitHub..."
git push -u origin main

echo "Done! Repository created and code pushed to GitHub." 