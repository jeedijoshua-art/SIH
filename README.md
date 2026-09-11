# LocalSight Browser Agent 🤖

LocalSight is a robust, general-purpose conversational web browser agent. It operates as a unified system consisting of a Chrome Extension and a Python FastAPI backend, utilizing Vision-Language Models (VLMs) and LLMs to autonomously interact with web pages to achieve user goals.

## Architecture

The project is split into two main components:

- **`extension/`**: A Chrome extension (Manifest V3) built with React, Vite, and TypeScript. 
  - **Content Script (`content.ts`)**: Analyzes the DOM, filters safe elements, resolves semantic targets, and executes precise browser actions.
  - **Background Worker (`background.ts`)**: Runs the autonomous agent state machine, managing the observation, reasoning, execution, and verification loops. It handles edge cases like navigation context invalidation and ambiguous target detection safely.
  - **Side Panel (`App.tsx`)**: Provides the user interface for interacting with the agent.

- **`server/`**: A Python FastAPI backend service.
  - Acts as the fusion provider, orchestrating LLM and VLM reasoning.
  - Integrates with Groq (for blazing fast intent classification and planning) and Google Gemini (for visual perception and fallback reasoning).
  - Implements robust prompt injection safety and validates agent responses.

## Prerequisites

- Node.js (v18 or higher)
- Python (v3.10 or higher)
- Google Chrome Browser

## Installation & Setup

### 1. Server Setup

Navigate to the `server/` directory and install the dependencies:

```bash
cd server
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Create an environment file to store your API keys:
```bash
cp .env.example .env
```
Add your Groq and Gemini API keys to the `.env` file.

Start the backend server:
```bash
uvicorn app.main:app --reload
```

### 2. Extension Setup

Navigate to the `extension/` directory and build the extension:

```bash
cd extension
npm install
npm run build
```

Load the extension in Chrome:
1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** in the top right.
3. Click **Load unpacked** and select the `extension/dist/` directory.

## Testing & Validation

LocalSight has been extensively hardened with adversarial regression testing. 

### Backend Tests
Run the backend pytest suite to verify prompt injection safety, ambiguity logic, and provider routing:
```bash
cd server
source .venv/bin/activate
pytest
```

### Extension Regression Tests
Run the Node-based regression tests for target resolution and ambiguity:
```bash
cd extension
node test_ambiguity.js
```

Local E2E test pages are also provided in the `test_pages/` directory to manually verify agent behaviors like ambiguous targets, normal interactions, prompt injections, and BFCache/navigation handling.

## Development & Philosophy
LocalSight prioritizes **Reliability > Performance > Features > UI**. The agent is built to gracefully handle failures, safely recover from missing targets, and refuse ambiguous executions to protect the user's browser state.
