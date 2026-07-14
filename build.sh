#!/bin/bash

# Colorful output helper
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0;37m' # No Color

echo -e "${BLUE}===================================================${NC}"
echo -e "${BLUE}            Image Express Builder Script            ${NC}"
echo -e "${BLUE}===================================================${NC}"
echo

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}[INFO] node_modules directory not found. Installing dependencies...${NC}"
    npm install
    if [ $? -ne 0 ]; then
        echo -e "${RED}[ERROR] npm install failed. Exiting.${NC}"
        exit 1
    fi
fi

echo "Please select what you want to build:"
echo "1. Build Desktop Application Installers (Creates macOS/Windows/Linux installers)"
echo "2. Build Web Application Production Assets (Prepares Next.js build)"
echo "3. Exit"
echo

read -p "Enter your choice (1-3): " choice

case $choice in
    1)
        echo -e "${GREEN}[INFO] Building Desktop Installers...${NC}"
        npm run desktop:build
        ;;
    2)
        echo -e "${GREEN}[INFO] Building Web Production Assets...${NC}"
        npm run build
        ;;
    3)
        echo "Exiting."
        exit 0
        ;;
    *)
        echo -e "${RED}Invalid choice. Exiting.${NC}"
        exit 1
        ;;
esac
