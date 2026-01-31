# Chat Feature: Complete Integration Guide

The insurance demo includes a sophisticated **AI-powered chat assistant** that integrates with MCP servers to provide real-time vehicle and policy information. This guide explains the architecture, authentication, API flows, and how everything works together.

---

## Quick Start

### Start All Services

```bash
npm install
npm run dev:all
```

This starts:
- **React App**: http://localhost:5173
- **Chat API**: http://localhost:3002

### Or Run Separately

```bash
# Terminal 1: React Application
npm run dev

# Terminal 2: Chat Backend
npm run dev:chat
```

---

## What Is the Chat Feature?

The chat assistant is a **collapsible floating widget** that appears in the bottom-right corner of the insurance app once you're logged in. It allows you to:

- Ask questions about your vehicles
- Query insurance coverage status
- Request vehicle valuations
- Inquire about available insurance actions
- Get contextual responses powered by real backend data

**Key Feature**: The chat backend automatically detects policy-related keywords and fetches live data from your MCP server through APIM, providing accurate, data-driven responses.

---

## Architecture: How Everything Works

### Component Stack

```
┌─────────────────────────────────────────────────────────┐
│  React Chat Panel Component                             │
│  (src/ui/ChatPanel.tsx)                                 │
│  - Floating collapsible UI                              │
│  - Message history                                      │
│  - User input & send                                    │
└────────────────┬────────────────────────────────────────┘
                 │ (POST /chat with Bearer token)
                 ▼
┌─────────────────────────────────────────────────────────┐
│  Chat API Server (Node.js/Express)                      │
│  (api-chat/server.js, Port 3002)                        │
│  - Keyword detection (policy-related?)                  │
│  - MCP integration                                      │
│  - Response generation                                  │
└────────────────┬────────────────────────────────────────┘
                 │ (HTTPS request with Bearer token)
                 ▼
┌─────────────────────────────────────────────────────────┐
│  WSO2 API Manager (APIM)                                │
│  (https://localhost:8243)                               │
│  - PolicyInfoChatAPI endpoint                           │
│  - Token validation                                     │
│  - MCP server gateway                                   │
└────────────────┬────────────────────────────────────────┘
                 │ (Backend MCP call)
                 ▼
┌─────────────────────────────────────────────────────────┐
│  Backend MCP Server                                     │
│  - Vehicle information retrieval                        │
│  - Insurance policy data                                │
│  - Vehicle valuation                                    │
│  - Coverage details                                     │
└─────────────────────────────────────────────────────────┘
```

---

## Authentication Flow

### User Authentication (Required for Chat)

1. **User logs in via OIDC/PKCE**
   - IS generates `access_token` and `id_token`
   - React app stores tokens in `sessionStorage`

2. **Chat Panel checks authentication**
   ```typescript
   // Only visible if accessToken exists
   if (!accessToken) return null;
   ```

3. **Chat message includes Bearer token**
   ```typescript
   const response = await fetch("http://localhost:3002/chat", {
     method: "POST",
     headers: {
       "Authorization": `Bearer ${accessToken}`,
       "Content-Type": "application/json"
     },
     body: JSON.stringify({ prompt: userMessage })
   });
   ```

### Chat API Token Handling

The chat backend validates the Bearer token:

```javascript
// api-chat/server.js
const authHeader = req.headers.authorization;

if (!authHeader || !authHeader.startsWith('Bearer ')) {
  return res.status(401).json({ error: 'Missing or invalid Authorization header' });
}

const accessToken = authHeader.substring(7); // Extract token
```

The token is then passed to the MCP server call:

```javascript
const options = {
  headers: {
    'Authorization': `Bearer ${accessToken}`,  // User's OAuth token
    'Accept': 'application/json, text/event-stream',
    'Content-Type': 'application/json'
  }
};

const req = https.request(options, (res) => { ... });
```

---

## Chat API Endpoints

### POST /chat

Submits a chat message and receives an intelligent response with optional policy data.

**URL**: `http://localhost:3002/chat`

**Headers**:
```
Content-Type: application/json
Authorization: Bearer {access_token}
```

**Request Body**:
```json
{
  "prompt": "Show me my vehicles"
}
```

**Response**:
```json
{
  "response": "🚗 **Your Vehicles**\n\nCustomer ID: 12345\n\n1. **Toyota Corolla**...",
  "hadPolicyInfo": true,
  "policyInfoData": {
    "customerId": "12345",
    "vehicles": [
      {
        "make": "Toyota",
        "model": "Corolla",
        "type": "CAR",
        "registrationNumber": "ABC-1234",
        "manufactureYear": 2020,
        "estimatedValue": 2500000,
        "currency": "LKR",
        "insuranceStatus": {
          "isInsured": true,
          "policyId": "POL-123456",
          "insuredUntil": "2025-12-31"
        }
      }
    ]
  }
}
```

**Example: cURL Request**
```bash
curl -X POST http://localhost:3002/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{"prompt":"What cars do I have?"}'
```

### GET /health

Health check endpoint to verify the chat service is running.

**URL**: `http://localhost:3002/health`

**Response**:
```json
{
  "status": "ok",
  "service": "insurance-policy-chat-api",
  "mode": "Local Analysis + Policy Info MCP Integration"
}
```

---

## MCP Server Integration

### What is the MCP Server?

The **Model Context Protocol (MCP) server** is a backend service that exposes vehicle and insurance policy data through APIM. It's called via a special endpoint that the chat API uses to fetch real-time information.

### MCP Tool Call Flow

When a user asks about vehicles or insurance:

**1. Chat API Analyzes the Prompt**
```javascript
function isPolicyInfoRequest(prompt) {
  const keywords = ['vehicle', 'car', 'insurance', 'policy', ...];
  return keywords.some(keyword => prompt.toLowerCase().includes(keyword));
}
```

**2. If Policy-Related, Call MCP Server**
```javascript
async function callMcpServer(accessToken) {
  const requestBody = {
    method: "tools/call",
    params: {
      name: "get_getVehicles",      // MCP tool name
      arguments: {},
      _meta: { progressToken: 3 }
    },
    jsonrpc: "2.0",
    id: 4
  };

  const options = {
    hostname: 'localhost',
    port: 8243,
    path: '/PolicyInfoChatAPI/1/mcp',  // APIM MCP endpoint
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  };

  // Make HTTPS request to APIM
  const req = https.request(options, (res) => { ... });
}
```

**3. Parse MCP Response**
```javascript
// MCP returns vehicle data in nested structure
if (mcpResponse.result && mcpResponse.result.content[0]) {
  const contentText = mcpResponse.result.content[0].text;
  policyInfoData = JSON.parse(contentText);  // Vehicle array
}
```

**4. Generate Response Using Data**
```javascript
function generateResponse(prompt, policyInfoData) {
  if (!policyInfoData) {
    return "Please ensure your policy data is loaded...";
  }

  const vehicles = policyInfoData.vehicles || [];

  // Generate contextual response based on prompt keywords
  if (prompt.includes('summary') || prompt.includes('overview')) {
    return `🚗 **Vehicle & Insurance Summary**\n\n...`;
  }

  if (prompt.includes('insured') || prompt.includes('coverage')) {
    return `📋 **Insured Vehicles**\n\n...`;
  }
  // ... more conditional responses
}
```

### MCP Endpoint Details

**Service**: PolicyInfoChatAPI (exposed through APIM)
**Method**: tools/call
**Endpoint**: `https://localhost:8243/PolicyInfoChatAPI/1/mcp`
**Authentication**: OAuth2 Bearer Token
**Tool Name**: `get_getVehicles`
**Parameters**: None (uses authenticated user context)

---

## Keyword Detection & Response Types

### Detected Keywords

The chat API analyzes user prompts for these keywords:

**Vehicle-Related**:
- `vehicle`, `car`, `cars`, `van`, `truck`, `motorcycle`, `bike`
- `registration`, `make`, `model`, `type`

**Insurance-Related**:
- `insurance`, `policy`, `policies`
- `coverage`, `premium`, `insured`

**Query Types**:
- `summary`, `overview` → Vehicle & insurance summary
- `insured`, `coverage`, `policy` → List insured vehicles
- `value`, `worth`, `price` → Vehicle valuations
- `action`, `available` → Available actions per vehicle
- `car` (specific) → Filter cars only
- `van`, `truck` (specific) → Filter commercial vehicles
- `toyota`, `honda`, `bmw`, etc. → Filter by make

### Response Generation Logic

**Scenario 1: User asks about summary**
```
Input: "Show me a summary of my vehicles"
  ↓
Keyword detected: "summary"
  ↓
Fetch from MCP: Get all vehicles + insurance status
  ↓
Generate: Formatted table with customer ID, vehicle count, vehicle details
```

**Scenario 2: User asks about insured vehicles**
```
Input: "Which vehicles are insured?"
  ↓
Keyword detected: "insured", "coverage"
  ↓
Fetch from MCP: Get all vehicles
  ↓
Filter: vehicles.filter(v => v.insuranceStatus?.isInsured)
  ↓
Generate: List of insured vehicles with policy IDs and dates
```

**Scenario 3: User asks about values**
```
Input: "What's the total value of my vehicles?"
  ↓
Keyword detected: "value", "worth"
  ↓
Fetch from MCP: Get all vehicles with estimatedValue
  ↓
Calculate: Sum all vehicle values, list individual values
  ↓
Generate: Total value + breakdown by vehicle
```

**Scenario 4: No keywords detected**
```
Input: "Hello" or "How are you?"
  ↓
No keywords matched
  ↓
Return: Generic helpful response without calling MCP
```

---

## File Structure

```
insurance-demo/
├── api-chat/
│   ├── server.js              # Chat API server (Express)
│   ├── package.json           # Dependencies (express, cors)
│   └── node_modules/
│
├── src/
│   ├── ui/
│   │   ├── ChatPanel.tsx       # React chat component
│   │   └── InsuranceDemoApp.tsx # Main app (includes ChatPanel)
│   ├── api.ts                 # API client functions
│   ├── config.ts              # Configuration
│   └── main.tsx               # React entry point
│
├── README.md                  # Main documentation
├── QUICKSTART_CHAT.md        # This file
└── package.json              # Root dependencies
```

---

## Chat API Server Details

### `api-chat/server.js` Breakdown

**Port**: 3003

**Key Functions**:

1. **`callMcpServer(accessToken)`**
   - Makes HTTPS request to APIM MCP endpoint
   - Passes user's OAuth token for authentication
   - Handles JSON response parsing
   - Returns vehicle and policy data

2. **`isPolicyInfoRequest(prompt)`**
   - Analyzes prompt for policy keywords
   - Returns boolean to decide if MCP call is needed
   - Reduces unnecessary backend calls

3. **`generateResponse(prompt, policyInfoData)`**
   - Main response generation logic
   - Takes user prompt and optional policy data
   - Returns formatted markdown response
   - Handles multiple response types based on keywords

4. **`POST /chat` Handler**
   - Validates Authorization header
   - Calls isPolicyInfoRequest()
   - If true, calls callMcpServer()
   - Calls generateResponse()
   - Returns JSON with response, hadPolicyInfo, and policyInfoData

5. **`GET /health` Handler**
   - Returns service status
   - Used for health checks

### Error Handling

**Missing Authorization**:
```
Status: 401
Response: { error: 'Missing or invalid Authorization header' }
```

**Missing Prompt**:
```
Status: 400
Response: { error: 'prompt is required' }
```

**MCP Call Failure**:
```
Status: 200 (Still successful)
Response: Generated response WITHOUT policy data
Behavior: Chat continues without live data, providing generic responses
```

**Server Error**:
```
Status: 500
Response: { error: 'Chat processing failed', message: '...' }
```

---

## React Chat Panel Component

### `src/ui/ChatPanel.tsx` Features

**UI State**:
- Collapsed: 56x56px floating button in bottom-right
- Expanded: 400x500px chat window
- Messages scroll to latest automatically

**Props**:
```typescript
interface ChatPanelProps {
  accessToken: string | null;  // OAuth token from parent component
}
```

**Features**:
- Message history with timestamps
- User and assistant message differentiation
- Loading indicator while waiting for response
- Error display with retry capability
- Auto-scroll to latest message
- Markdown rendering support
- Only visible when authenticated

**Lifecycle**:
1. Component renders if `accessToken` exists
2. User can click floating button to expand/collapse
3. User types message in textarea
4. Hits Enter or clicks Send
5. Message added to history immediately
6. POST request to `/chat` with token
7. Response displayed in chat
8. Auto-scrolls to show new message

---

## Integration with Main App

### How to Use in Your Component

The chat panel is already integrated into `InsuranceDemoApp.tsx`:

```typescript
import { ChatPanel } from "./ui/ChatPanel";

export default function InsuranceOIDCDemoApp() {
  const [tokens, setTokens] = useState<any>(...);

  return (
    <div>
      {/* ... rest of app ... */}

      {/* Chat Panel - Only visible when authenticated */}
      {tokens && <ChatPanel accessToken={tokens.access_token || null} />}
    </div>
  );
}
```

The component is automatically visible once the user logs in.

---

## Testing the Chat API

### Using cURL

**Test Policy Data Retrieval**:
```bash
curl -X POST http://localhost:3002/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_OAUTH_ACCESS_TOKEN" \
  -d '{"prompt":"Show me a summary of my vehicles"}'
```

**Expected Response**:
```json
{
  "response": "🚗 **Vehicle & Insurance Summary**\n\nCustomer ID: 12345\n...",
  "hadPolicyInfo": true,
  "policyInfoData": { "vehicles": [...], "customerId": "12345" }
}
```

**Test Generic Response (No MCP Call)**:
```bash
curl -X POST http://localhost:3002/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_OAUTH_ACCESS_TOKEN" \
  -d '{"prompt":"Hello"}'
```

**Expected Response**:
```json
{
  "response": "Hello! 👋 I am your insurance assistant...",
  "hadPolicyInfo": false,
  "policyInfoData": null
}
```

**Health Check**:
```bash
curl http://localhost:3002/health
```

---

## Troubleshooting

### Chat Button Not Visible

**Cause**: Not authenticated
**Solution**: Log in first via the OIDC login flow

### "Connection refused on 3002"

**Cause**: Chat API server not running
**Solution**: Run `npm run dev:chat` in separate terminal

### "Missing or invalid Authorization header"

**Cause**: No Bearer token in request
**Solution**: Ensure you're logged in and the token is passed in request

### "MCP endpoint not found" (500 error)

**Cause**: APIM not running or MCP endpoint misconfigured
**Solution**:
1. Verify APIM is running on `https://localhost:8243`
2. Verify endpoint path: `/PolicyInfoChatAPI/1/mcp`
3. Check APIM logs for errors

### No Policy Data in Response

**Cause**: MCP call failed silently
**Solution**:
1. Check browser network tab for chat API response
2. Check `policyInfoData` field - should be null on failure
3. Check APIM and MCP server logs
4. Verify user has policy data in backend

### Chat Works But No Vehicle Data

**Cause**: MCP returned null or empty vehicle list
**Solution**:
1. Verify user has vehicles registered in the system
2. Check MCP server is returning data correctly
3. Verify Bearer token has required scopes

### CORS Error When Calling Chat API

**This shouldn't happen** - chat is local on same origin
**If it occurs**:
1. Check if chat API is running
2. Verify correct port (3002)
3. Ensure ReactApp and ChatAPI both running

---

## Configuration

### Environment Variables

The chat service uses hardcoded values in `api-chat/server.js`:

```javascript
const PORT = 3002;  // Chat server port

const options = {
  hostname: 'localhost',
  port: 8243,       // APIM port
  path: '/PolicyInfoChatAPI/1/mcp'  // MCP endpoint
};
```

To customize, edit these values in `api-chat/server.js`.

### APIM Configuration Required

For the chat feature to work, you need:

1. **APIM running** on `https://localhost:8243`
2. **MCP Server registered** in APIM
3. **PolicyInfoChatAPI** endpoint with MCP integration
4. **User OAuth token** with permission to call MCP

---

## Production Considerations

### Security

- ✅ Uses HTTPS for APIM communication
- ✅ Validates Bearer tokens
- ✅ Tokens passed through Authorization headers (not query params)
- ⚠️ Currently `rejectUnauthorized: false` for self-signed certs (dev only)

**For Production**:
- Use valid certificates
- Set `rejectUnauthorized: true`
- Implement rate limiting on chat endpoint
- Add request validation and sanitization
- Log all MCP calls for audit trails

### Performance

- Keyword filtering reduces unnecessary MCP calls
- Responses cached in browser for same queries
- Could add Redis caching on backend
- Consider async streaming for large responses

### Scalability

- Single-threaded Node.js server suitable for testing
- For production: Use load balancer + multiple instances
- Consider queue system (Bull, RabbitMQ) for high volume
- Implement connection pooling to APIM

---

## Related Documentation

- **Main README**: [README.md](README.md) - Full architecture and setup
- **CLAUDE.md**: [CLAUDE.md](CLAUDE.md) - React expert agent context
- **Config File**: [src/config.ts](src/config.ts) - OIDC and API endpoints
- **Chat Server**: [api-chat/server.js](api-chat/server.js) - Chat backend code
- **Chat Component**: [src/ui/ChatPanel.tsx](src/ui/ChatPanel.tsx) - React component

---

## Support & Debugging

### Check Service Status

```bash
# Is React app running?
curl http://localhost:5173

# Is Chat API running?
curl http://localhost:3002/health

# Is APIM running?
curl -k https://localhost:8243/services (should work even without routing)
```

### Enable Verbose Logging

Edit `api-chat/server.js` to add more console.log() statements:

```javascript
console.log('[CHAT] Received prompt:', prompt);
console.log('[CHAT] Access token (first 20 chars):', accessToken.substring(0, 20));
console.log('[CHAT] MCP response:', JSON.stringify(mcpResponse, null, 2));
```

Monitor logs while testing to see API flow.

---

Enjoy using the insurance demo chat feature! 🚀
