#!/bin/bash

# Configuration
EXTENSION_NAME="speed_tester"
MANIFEST_PATH="manifest.json"
HTML_PATH="./popup/popup.html"
CHANGELOG_PATH="CHANGELOG.md"

# Exit on error
set -e

# Function to increment version number
increment_version() {
  local version=$1
  local major=$(echo "$version" | cut -d. -f1)
  local minor=$(echo "$version" | cut -d. -f2)
  local patch=$(echo "$version" | cut -d. -f3)
  
  patch=$((patch + 1))
  
  if [ "$patch" -gt 9 ]; then
    patch=0
    minor=$((minor + 1))
  fi
  
  if [ "$minor" -gt 9 ]; then
    minor=0
    major=$((major + 1))
  fi
  
  echo "$major.$minor.$patch"
}

# Get current commit message (excluding [skip ci] if present)
COMMIT_MESSAGE=$(git log -1 --pretty=%B | sed 's/\[skip ci\]//g' | xargs)

# Update version in manifest
CURRENT_VERSION=$(jq -r '.version' "$MANIFEST_PATH")
NEW_VERSION=$(increment_version "$CURRENT_VERSION")

# Update manifest version
jq --arg new_version "$NEW_VERSION" '.version = $new_version' "$MANIFEST_PATH" > temp.json && mv temp.json "$MANIFEST_PATH"

# Update version in HTML file if it exists
if [ -f "$HTML_PATH" ]; then
  sed -i "s|<div class=\"version-info\">Version [0-9]\+\.[0-9]\+\.[0-9]\+</div>|<div class=\"version-info\">Version $NEW_VERSION</div>|g" "$HTML_PATH"
fi

# Update changelog
if [ ! -f "$CHANGELOG_PATH" ]; then
  echo "# Changelog" > "$CHANGELOG_PATH"
  echo "" >> "$CHANGELOG_PATH"
  echo "All notable changes to this project will be documented in this file." >> "$CHANGELOG_PATH"
  echo "" >> "$CHANGELOG_PATH"
fi

# Add new version entry to changelog
{
  echo "## [$NEW_VERSION] - $(date +%Y-%m-%d)"
  echo "- $COMMIT_MESSAGE"
  echo ""
  cat "$CHANGELOG_PATH"
} > temp_changelog.md && mv temp_changelog.md "$CHANGELOG_PATH"

# Remove old zip if exists
if [ -f "$EXTENSION_NAME.zip" ]; then
  rm -f "$EXTENSION_NAME.zip"
fi

# Create new zip file (excluding git and script files)
zip -r "$EXTENSION_NAME.zip" * \
    -x "*.git*" \
    -x ".github/*" \
    -x "*.sh" \
    -x "$EXTENSION_NAME.zip" \
    -x "README.md" \
    -x "CHANGELOG.md" \
    -x "PRIVACY_POLICY.md"

# Configure git
git config --global user.name "GitHub Actions"
git config --global user.email "actions@github.com"

# Stage and commit changes
git add -A
git commit -m "Auto-update: Version $NEW_VERSION [skip ci]" || echo "No changes to commit"
