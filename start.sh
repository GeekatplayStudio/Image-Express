#!/bin/bash

# Colorful output helper
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0;37m' # No Color

echo -e "${BLUE}===================================================${NC}"
echo -e "${BLUE}           Image Express Starter Script            ${NC}"
echo -e "${BLUE}===================================================${NC}"
echo

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}[INFO] node_modules directory not found.${NC}"
    read -p "Would you like to run 'npm install' first? (y/N): " install_choice
    if [[ "$install_choice" =~ ^[Yy]$ ]]; then
        echo -e "${BLUE}[INFO] Installing dependencies...${NC}"
        npm install
        if [ $? -ne 0 ]; then
            echo -e "${RED}[ERROR] npm install failed. Exiting.${NC}"
            exit 1
        fi
    else
        echo -e "${YELLOW}[WARNING] Proceeding without installing dependencies. This may fail.${NC}"
    fi
fi

echo
echo "Please select how you want to start the project:"
echo "1. Start Desktop App in Development Mode (Recommended for testing desktop features)"
echo "2. Start Desktop App in Production Mode (Builds first, then runs desktop shell)"
echo "3. Start Web App in Development Mode (Runs on http://localhost:3000)"
echo "4. Start Web App in Production Mode (Runs on http://localhost:3000 after build)"
echo "5. Run Super Installer / Setup (Configure ComfyUI, Ollama, Models)"
echo "6. Exit"
echo

read -p "Enter your choice (1-6): " choice

case $choice in
    1)
        echo -e "${GREEN}[INFO] Starting Desktop App in Development Mode...${NC}"
        npm run desktop:dev
        ;;
    2)
        echo -e "${GREEN}[INFO] Starting Desktop App in Production Mode...${NC}"
        npm run desktop:start
        ;;
    3)
        echo -e "${GREEN}[INFO] Starting Web App in Development Mode...${NC}"
        npm run dev
        ;;
    4)
        echo -e "${GREEN}[INFO] Starting Web App in Production Mode...${NC}"
        npm run build && npm run start
        ;;
    5)
        echo -e "${GREEN}[INFO] Starting Super Installer Setup...${NC}"
        npm run install:super
        ;;
    6)
        echo "Exiting."
        exit 0
        ;;
    *)
        echo -e "${RED}Invalid choice. Exiting.${NC}"
        exit 1
        ;;
esac
