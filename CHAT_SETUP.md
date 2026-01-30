# Chat Feature Setup Guide

## Overview
This guide walks through setting up and integrating the new chat feature with Gemini LLM and MCP server.

**Important:** No existing files were modified. The chat feature is fully isolated in new files.

---

## Backend Setup (`/api-chat`)

### 1. Install Dependencies
```bash
cd api-chat
npm install
```

### 2. Start the Chat Backend
```bash
npm start
```

The server will start on **http://localhost:3002**

**Endpoints:**
- `POST /chat` - Chat with Gemini (requires Authorization header)
- `GET /health` - Health check

### 3. Environment Variables
The Gemini API key is hardcoded in `server.js`:
```javascript
const GEMINI_API_KEY = "AIzaSyBLSY3-OFt045Rq2_JXf7zKwQ5B3My7mzM";
```

If needed to change, update `server.js` line 9.

---

## Chat API Request/Response

### Request Format
```bash
curl -X POST http://localhost:3002/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{"prompt":"Show me recent transactions"}'
```

### Response Format
```json
{
  "response": "Here are your recent transactions...",
  "hadTransactions": true,
  "transactionData": {
    "GetRecentTransactionsResponse": {
      "Transaction": [...]
    }
  }
}
```

### How It Works
1. **Receives** Authorization header with OAuth access token
2. **Analyzes** prompt for transaction-related keywords
3. **If transaction request**, calls MCP server via APIM:
   - `POST https://localhost:8243/FetchTransactionsMcp/1/mcp`
   - Passes the same access token
   - Extracts transaction data
4. **Sends** enhanced prompt to Gemini with transaction context
5. **Returns** LLM response + transaction metadata

---

## Frontend Integration (`ChatPanel.tsx`)

### Component Props
```typescript
interface ChatPanelProps {
  accessToken: string | null;
}
```

### Usage Example
```tsx
import { ChatPanel } from "./ui/ChatPanel";

// Inside your component with access to the tokens state:
<ChatPanel accessToken={tokens?.access_token || null} />
```

### What the Component Does
1. **Reads** the OAuth access token from parent
2. **Sends** messages to `http://localhost:3002/chat`
3. **Includes** Authorization header with the token
4. **Displays** chat history with animations
5. **Shows** loading/error states
6. **Indicates** when response used transaction data

### Features
- Real-time message display
- Auto-scroll to latest message
- Keyboard shortcut (Shift+Enter for newline, Enter to send)
- Error handling and display
- Loading indicators
- Transaction data indicator

---

## How to Integrate ChatPanel into BankOIDCDemoApp

You can optionally add ChatPanel to the main app by importing and rendering it where needed:

```tsx
import { ChatPanel } from "./ChatPanel";

// Inside BankOIDCDemoApp component:
<ChatPanel accessToken={tokens?.access_token || null} />
```

**NOTE:** The CLAUDE.md instruction said "Do NOT modify existing React auth, login, or API logic." For this reason, integration is shown as optional. You can add it to your layout as desired.

---

## Security Notes

✅ **What's Secure:**
- Access token is passed via Authorization header (not in body)
- Token is forwarded to MCP server (standard OAuth pattern)
- CORS enabled for localhost development
- Self-signed cert rejection disabled for localhost only

⚠️ **For Production:**
- Use environment variables for Gemini API key
- Enable HTTPS on backend
- Implement proper CORS restrictions
- Add request rate limiting
- Validate/sanitize prompts
- Log all API calls for audit

---

## Troubleshooting

### "Backend not found" Error
- Ensure chat backend is running on port 3002
- Check: `curl http://localhost:3002/health`

### "Failed to fetch MCP response"
- Verify APIM is running on `https://localhost:8243`
- Ensure access token is valid
- Check network connectivity to APIM

### "Gemini API error"
- Verify Gemini API key is valid
- Check Google Cloud quota/limits
- Ensure Internet connection available

### No Transaction Data
- Ensure prompt contains keywords: transaction, recent, history, activity, movements, transfers
- Verify MCP endpoint returns valid response
- Check access token has required scopes

---

## File Manifest

### New Files Created:
```
/api-chat/
├── package.json          # Backend dependencies
└── server.js             # Express server with Gemini + MCP integration

/src/ui/
└── ChatPanel.tsx         # React chat component

/CHAT_SETUP.md            # This file
```

### Modified Files:
**NONE** - No existing files were changed per requirements.

---

## Next Steps

1. Install backend dependencies: `cd api-chat && npm install`
2. Start the backend: `npm start`
3. Keep the React dev server running (already started)
4. Import ChatPanel in your desired location
5. Test by entering transaction-related queries

---

## Example Prompts to Test

- "Show me my recent transactions"
- "What was my last transfer?"
- "Give me a summary of my transaction activity"
- "How much did I withdraw yesterday?"
- "List my recent account movements"
