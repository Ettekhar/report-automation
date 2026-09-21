#!/usr/bin/env bash
set -e

PROJECT_NAME="$1"
if [ -z "$PROJECT_NAME" ]; then
  echo "Usage: $0 [project-folder-name] (e.g. job-automation or report-automation)"
  exit 1
fi

APP_DIR="$HOME/apps/$PROJECT_NAME"
if [ ! -d "$APP_DIR" ]; then
  echo "Error: Directory $APP_DIR does not exist!"
  exit 1
fi

echo "============================================="
echo "🚀 Deploying / Updating $PROJECT_NAME ..."
echo "============================================="
cd "$APP_DIR"

if [ -d ".git" ]; then
  echo "📥 Pulling latest git commits..."
  git pull || echo "Git pull warning: checking local status"
fi

if [ -f "docker-compose.yml" ] || [ -f "compose.yaml" ]; then
  echo "🐳 Rebuilding and restarting Docker container..."
  docker compose up -d --build
  echo "✅ Docker container successfully updated!"
elif [ -f "package.json" ]; then
  echo "📦 Installing dependencies and building..."
  npm ci || npm install
  npm run build --if-present
  if systemctl list-unit-files | grep -q "$PROJECT_NAME.service"; then
    echo "🔄 Restarting systemd service: $PROJECT_NAME.service..."
    sudo systemctl restart "$PROJECT_NAME.service"
  fi
fi

echo "============================================="
echo "🎉 $PROJECT_NAME is up-to-date and running!"
echo "============================================="
