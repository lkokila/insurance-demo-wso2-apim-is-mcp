# Quick Start: Chat Feature

## What Was Created

✅ **Backend** (`/api-chat`) - Node.js Express server
✅ **Frontend** (`/src/ui/ChatPanel.tsx`) - React chat component
✅ **Integration** - Gemini LLM + MCP server for transactions

**NO existing files were modified.**

---

## Start Everything

### Terminal 1: React App (Already Running)
```bash
# Already running on http://localhost:5173/
npm run dev
```

### Terminal 2: Chat Backend
```bash
cd api-chat
npm start
# Server runs on http://localhost:3002/
```

---

## Use the Chat Feature

### Option A: Via Code
Add to your component where you have `tokens`:
```tsx
import { ChatPanel } from "./ui/ChatPanel";

<ChatPanel accessToken={tokens?.access_token || null} />
```

### Option B: Via API (Manual Testing)
```bash
curl -X POST http://localhost:3002/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{"prompt":"Show recent transactions"}'
```

---

## What It Does

1. **You send** → User question with OAuth token
2. **Backend checks** → Is this about transactions?
3. **If yes** → Calls APIM's MCP server to fetch data
4. **Then** → Sends enhanced prompt to Gemini
5. **Returns** → AI response about your transactions

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "Connection refused on 3002" | Run `npm start` in `/api-chat` folder |
| "Missing Authorization header" | Ensure valid OAuth token is sent |
| "MCP endpoint not found" | Verify APIM is running on `https://localhost:8243` |

---

## Files Reference

- **Backend Server**: `/api-chat/server.js`
- **React Component**: `/src/ui/ChatPanel.tsx`
- **Full Setup Guide**: `CHAT_SETUP.md`

Enjoy! 🚀
