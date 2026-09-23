# LocalSight Browser Agent 🤖

LocalSight is a robust, general-purpose conversational web browser agent. It operates as a unified system consisting of a Chrome Extension and a Python FastAPI backend, utilizing Vision-Language Models (VLMs) and LLMs to autonomously interact with web pages to achieve user goals.

## Architecture
- **`extension/`**: A Chrome extension (Manifest V3) built with React, Vite, and TypeScript. Acts as the frontend side panel and executes content scripts in the browser.
- **`server/`**: A Python FastAPI backend service. Acts as the orchestrator/brain.

## Prerequisites
- Node.js (v18 or higher)
- Python (v3.10 or higher)
- Google Chrome Browser

---

## 🚀 Getting Started (Quick Setup)

We have provided convenient scripts to easily set up and run the individual components on both **Mac (using venv)** and **Windows (system Python, no venv)**.

### Step 1: Clone the Repository
```bash
git clone <your-repo-url>
cd Prototype
```

### Step 2: Set up Environment Variables
1. Navigate to the `server/` directory.
2. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
3. Add your `GROQ_API_KEY` and `GEMINI_API_KEY` into the `.env` file. **(Note: `.env` is ignored in Git and will not be pushed).**

---

### Step 3: Install Dependencies & Setup

**🍏 For Mac/Linux Users (Uses Python `venv`)**
Run the setup script from the root directory to install both server and extension dependencies:
```bash
chmod +x setup_mac.sh
./setup_mac.sh
```

**🪟 For Windows Users (Uses global Python)**
Double click or run the batch file from the root directory:
```bash
chmod +x setup_windows.bat
./setup_windows.bat
```

---

### Step 4: Start the Backend Server

**🍏 For Mac/Linux Users**
```bash
chmod +x start_server_mac.sh
./start_server_mac.sh
```

**🪟 For Windows Users**
```bash
chmod +x start_server_windows.bat
./start_server_windows.bat
```
*The server will run on `http://127.0.0.1:8000`.*

---

### Step 5: Build the Extension / Frontend

**🍏 For Mac/Linux Users**
```bash
chmod +x start_extension_mac.sh
./start_extension_mac.sh
```

**🪟 For Windows Users**
```bash
chmod +x start_extension_windows.bat
./start_extension_windows.bat
```
*This will build the extension into the `extension/dist/` directory.*

### Step 6: Load the Extension in Chrome
1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** in the top right corner.
3. Click **Load unpacked** and select the `extension/dist/` folder from this project.
4. Pin the extension and click it to open the Side Panel!

---

## Important Git Rules
To prevent sensitive information and large binaries from being pushed to GitHub, the `.gitignore` has been strictly configured. 
**NEVER PUSH THE FOLLOWING FILES:**
- `.env` files (contains API keys)
- `node_modules/`
- `.venv/` or `venv/`
- `__pycache__/`

Enjoy building with LocalSight!
