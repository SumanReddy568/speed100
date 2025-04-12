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
 sed -i "s|<span id=\"app-version\">[0-9]\+\.[0-9]\+\.[0-9]\+</span>|<span id=\"app-version\">$NEW_VERSION</span>|g" "$HTML_PATH"
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

# Create extensions directory if it doesn't exist
EXTENSIONS_DIR="extensions"
mkdir -p "$EXTENSIONS_DIR"

# Remove old zip if exists in extensions directory
if [ -f "$EXTENSIONS_DIR/$EXTENSION_NAME-$NEW_VERSION.zip" ]; then
  rm -f "$EXTENSIONS_DIR/$EXTENSION_NAME-$NEW_VERSION.zip"
fi

# Create new zip file (excluding git and script files)
zip -r "$EXTENSIONS_DIR/$EXTENSION_NAME-$NEW_VERSION.zip" * \
    -x "*.git*" \
    -x ".github/*" \
    -x "*.sh" \
    -x "$EXTENSIONS_DIR/*" \
    -x "README.md" \
    -x "CHANGELOG.md" \
    -x "PRIVACY_POLICY.md"

# Configure git
git config --global user.name "GitHub Actions"
git config --global user.email "actions@github.com"

# Stage and commit changes
git add -A
git commit -m "Auto-update: Version $NEW_VERSION [skip ci]" || echo "No changes to commit"
