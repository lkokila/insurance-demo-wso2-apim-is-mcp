# Insurance OIDC Demo — Complete Insurance Management Platform

This React + Vite application demonstrates **OpenID Connect (OIDC)** authentication with **WSO2 Identity Server (IS)**, secure API calls through **WSO2 API Manager (APIM)**, and an integrated **AI-powered chat assistant** for vehicle and insurance policy inquiries.

The platform enables users to manage vehicle registration, obtain insurance quotes, purchase policies with email OTP authentication, and interact with an intelligent chat assistant that retrieves real-time policy information via MCP servers.

## Quick Start

### Start All Services (React App + Chat Backend)

```bash
npm install
npm run dev:all
# React app: http://localhost:5173
# Chat API: http://localhost:3002
```

### Or Run Services Separately

```bash
# Terminal 1: React application
npm run dev
# Runs on http://localhost:5173

# Terminal 2: Chat API backend
npm run dev:chat
# Runs on http://localhost:3002
```

## Configuration

### 1. Edit `src/config.ts`

Update the following values based on your WSO2 setup:

```typescript
export const OIDC_CONFIG = {
  AUTHORIZATION_ENDPOINT: "https://localhost:9444/oauth2/authorize",
  TOKEN_ENDPOINT: "https://localhost:9444/oauth2/token",
  USERINFO_ENDPOINT: "https://localhost:9444/oauth2/userinfo",
  ENDSESSION_ENDPOINT: "https://localhost:9444/oidc/logout",
  CLIENT_ID: "YOUR_CLIENT_ID_FOR_LOGIN",        // Primary client for login & account API calls (This application can have the required login flow including MFA and Branding)
  CLIENT_ID2: "YOUR_CLIENT_ID_FOR_TRANSACTIONS", // Secondary client for email OTP transactions
  REDIRECT_URI: "http://localhost:5173",
  SCOPE: "openid profile email",
  BANK_NAME: "Bitwave Bank"
};

export const API_CONFIG = {
  GET_ACCOUNTS_URL: "https://localhost:8243/accountDetails/1/getAccounts",
  ADD_TRANSACTION_URL: "https://localhost:8243/internalTransfer/1/addTransaction",
  RECENT_TRANSACTIONS_URL: "https://localhost:8243/RecentTransactions/1/recentTransactions"
};
```

## WSO2 Identity Server (IS) Setup

### Start IS with Port Offset

WSO2 IS must run on **port 9444** (port offset = 1):

```bash
cd <IS_HOME>/bin
./wso2server.sh -Dport.offset=1
# Windows: wso2server.bat -Dport.offset=1
```

This ensures IS listens on `https://localhost:9444`.

### Register Two OAuth2 Clients

Create **two separate SPA applications** in IS:

#### Client 1: Login & Account API Calls
- **Application Name**: `bank-oidc-app`
- **Protocol**: OpenID Connect
- **Application Type**: Single Page Application
- **Redirect URI**: `http://localhost:5173`
- **Allowed Grant Types**: Authorization Code
- **Token Endpoint Authentication**: None (public client with PKCE)
- **PKCE**: Mandatory (S256)
- **Scopes**: `openid`, `profile`, `email`
- **Client ID**: `HpfVbYONf5MwRREA12p14vNQfJAa` (or generated)
- Store this as `CLIENT_ID` in config.ts

#### Client 2: Email OTP Transactions
- **Application Name**: `bank-otp-app`
- **Protocol**: OpenID Connect
- **Application Type**: Single Page Application
- **Redirect URI**: `http://localhost:5173`
- **Allowed Grant Types**: Authorization Code
- **Token Endpoint Authentication**: None (public client with PKCE)
- **PKCE**: Mandatory (S256)
- **Scopes**: `openid`, `internal_login`, `email`
- **Client ID**: `E0bqe3TldZqJ3befDzav0OQkPtIa` (or generated)
- Store this as `CLIENT_ID2` in config.ts

### Enable Email OTP

Add the following config in the IS/repository/conf/deployment.toml file to enable email OTP with mailtrap https://mailtrap.io/
Add username, password from the mailtrap Sandbox

```toml
[output_adapter.email]
from_address= "otp@bitwave.com"
username= "<mailtrap_sandbox_username>"
password= "<mailtrap_sandbox_password>"
hostname= "sandbox.smtp.mailtrap.io"
port= 2525
enable_start_tls= true
enable_authentication= true
signature = "bitwave.com"
```
---

## WSO2 API Manager (APIM) Setup

### Start APIM

```bash
cd <APIM_HOME>/bin
./api-manager.sh
# Windows: api-manager.bat
# APIM runs on https://localhost:8243
```

### Configure IS as Key Manager (OAuth2 Provider)
Follow instructions in the below document
https://apim.docs.wso2.com/en/latest/api-security/key-management/third-party-key-managers/configure-wso2is7-connector/


In APIM Admin Console:

1. Navigate to **Settings > Key Manager**
2. Add a new Key Manager with these details:
   - **Name**: `WSO2-IS`
   - **Key Manager Type**: `WSO2-Identity-Server`
   - **Server URL**: `https://localhost:9444`
   - **Introspection URL**: `https://localhost:9444/oauth2/introspect`
   - **Token URL**: `https://localhost:9444/oauth2/token`
   - **Revoke URL**: `https://localhost:9444/oauth2/revoke`
   - **Userinfo URL**: `https://localhost:9444/oauth2/userinfo`
   - **Client ID & Secret**: (from an APIM-IS service account, if required)
3. Click **Save**
4. Set this Key Manager as **Default** (if not already)

### Create APIs in APIM

Publish the following APIs in APIM to match the endpoints in `config.ts`. The appropriate backends for the APIs can be implemented using any language/framework. 

#### API 1: Account Details
- **Name**: `AccountDetails`
- **Context**: `/accountDetails`
- **Version**: `1`
- **Resource Path**: `/1/getAccounts`
- **Method**: POST
- **Backend URL**: (mock service or your bank backend)
- **Security**: OAuth2

#### API 2: Internal Transfer
- **Name**: `InternalTransfer`
- **Context**: `/internalTransfer`
- **Version**: `1`
- **Resource Path**: `/1/addTransaction`
- **Method**: POST
- **Backend URL**: (mock service or your bank backend)
- **Security**: OAuth2

#### API 3: Recent Transactions
- **Name**: `RecentTransactions`
- **Context**: `/RecentTransactions`
- **Version**: `1`
- **Resource Path**: `/1/recentTransactions`
- **Method**: POST
- **Backend URL**: (mock service or your bank backend)
- **Security**: OAuth2

### Enable CORS

For each API in APIM:
1. Navigate to **Runtime** settings
2. Enable **CORS** and add:
   - **Access-Control-Allow-Origins**: `http://localhost:5173`
   - **Access-Control-Allow-Headers**: `Content-Type, Authorization`
   - **Access-Control-Allow-Methods**: `POST, OPTIONS`

---

## TLS Certificate Trust

Since both IS and APIM use self-signed certificates:

1. **Browser**: Accept or install the self-signed certificates for:
   - `https://localhost:9444` (IS)
   - `https://localhost:8243` (APIM)
2. **Fetch API**: May require additional certificate configuration depending on your environment.

---

## Architecture Overview

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                    React Application                         │
│         (Vite dev server on port 5173)                      │
├─────────────────────────────────────────────────────────────┤
│  - Insurance Demo App (main UI)                             │
│  - Chat Panel Component (collapsible chat UI)               │
│  - OIDC Authentication (PKCE flow)                          │
│  - Vehicle & Quote Management                              │
└────────────┬──────────────────────┬──────────────────────────┘
             │                      │
             │ (Bearer Token)       │ (Bearer Token)
             ▼                      ▼
     ┌──────────────────────────────────────────────┐
     │  WSO2 Identity Server (IS)                   │
     │     (https://localhost:9444)                  │
     │  - OIDC/PKCE Authorization                   │
     │  - Token Generation & Refresh                │
     │  - Email OTP Authentication                  │
     │  - User Profile Management                   │
     └──────────────────────────────────────────────┘
             │
             │ (Bearer Token)
             ▼
     ┌──────────────────────────────────────────────┐
     │  WSO2 API Manager (APIM)                     │
     │     (https://localhost:8243)                  │
     │  - Vehicle API Gateway                       │
     │  - Insurance Quote API                       │
     │  - Policy Purchase API                       │
     │  - MCP Server Integration                    │
     └────────┬─────────────────────────────────────┘
              │
              │ (MCP Call)
              ▼
     ┌──────────────────────────────────────────────┐
     │  Backend MCP Server                          │
     │  - Get Vehicles Information                  │
     │  - Get Insurance Quotes                      │
     │  - Get Policy Details                        │
     └──────────────────────────────────────────────┘
             ▲
             │ (Backend API Call)
             │
     ┌──────────────────────────────────────────────┐
     │  Chat API Server (Node.js/Express)           │
     │     (http://localhost:3002)                   │
     │  - /chat endpoint (POST)                     │
     │  - Policy keyword detection                  │
     │  - MCP server integration                    │
     │  - Response generation                       │
     └──────────────────────────────────────────────┘
```

## App Features

### Authentication & Session Management
- **OIDC/PKCE Login**: Authorization Code flow with Proof Key for Code Exchange
- **Multi-Client Support**: Primary client for standard login, secondary client for OTP flows
- **Token Management**: Automatic token refresh and sessionStorage persistence
- **RP-Initiated Logout**: Secure logout with server-side session cleanup

### Vehicle Management
- **Vehicle Registry**: Add and view registered vehicles
- **Vehicle Information**: Make, model, registration number, year, estimated value
- **Insurance Status**: Track which vehicles are insured

### Insurance Features
- **Quote Generation**: Request insurance quotes for vehicles via APIM
- **Email OTP Authentication**: Secure insurance purchase with OTP verification
- **Policy Management**: View and manage active insurance policies

### Chat Assistant (AI-Powered)
- **Floating Chat Interface**: Collapsible chat widget in bottom-right corner
- **Policy Inquiries**: Ask questions about vehicles and insurance
- **MCP Integration**: Real-time vehicle and policy data retrieval
- **Smart Context**: Detects policy-related questions and fetches relevant data
- **Markdown Support**: Formatted responses with vehicle summaries and details

---

## API Integrations & MCP Servers

### 1. Vehicle Management APIs

**Endpoint**: `/vehicleManagement/1/getVehicles`
- **Method**: POST
- **Authentication**: Bearer Token (OAuth2)
- **Purpose**: Retrieve list of registered vehicles for the user
- **Response**: Array of Vehicle objects with details (make, model, registration, insurance status, etc.)

**Endpoint**: `/vehicleManagement/1/addVehicle`
- **Method**: POST
- **Authentication**: Bearer Token (OAuth2)
- **Purpose**: Register a new vehicle in the system
- **Request**: Vehicle registration details
- **Response**: Confirmation with vehicle ID

### 2. Insurance Quote & Policy APIs

**Endpoint**: `/insuranceQuote/1/getQuote`
- **Method**: POST
- **Authentication**: Bearer Token (OAuth2)
- **Purpose**: Generate insurance quote for a vehicle
- **Request**: Vehicle details and quote parameters
- **Response**: Quote with premium, coverage, and terms

**Endpoint**: `/policyManagement/1/purchasePolicy`
- **Method**: POST
- **Authentication**: Bearer Token (OAuth2)
- **Purpose**: Purchase an insurance policy (OTP-protected)
- **Request**: Policy details and OTP
- **Response**: Policy confirmation and policy number

### 3. Chat API Server (`/api-chat`)

**Endpoint**: `POST /chat`
- **Authentication**: Bearer Token (OAuth2)
- **Purpose**: Submit chat message and receive AI response with policy data
- **Request Body**:
  ```json
  {
    "prompt": "Show me my vehicles"
  }
  ```
- **Response**:
  ```json
  {
    "response": "🚗 Your Vehicles...",
    "hadPolicyInfo": true,
    "policyInfoData": { ... }
  }
  ```

**Endpoint**: `GET /health`
- **Purpose**: Health check for the chat service
- **Response**: Service status and mode information

### 4. MCP Server Integration

The chat API integrates with a **Model Context Protocol (MCP) server** exposed through APIM for policy data retrieval.

**MCP Tool Call**:
- **Tool**: `get_getVehicles`
- **Method**: `tools/call`
- **Endpoint**: `https://localhost:8243/PolicyInfoChatAPI/1/mcp`
- **Authentication**: Bearer Token (from user session)
- **Flow**:
  1. Chat API detects policy keywords in user prompt
  2. Calls MCP endpoint with `get_getVehicles` tool
  3. Receives vehicle and insurance policy data
  4. Generates contextual response using the data
  5. Returns enriched response to client

---

## Authentication Flow Details

### Standard OIDC/PKCE Flow (Login)

```
User clicks "Sign In"
    ↓
1. Generate PKCE Parameters:
   - code_verifier (43+ char random string)
   - code_challenge = SHA256(code_verifier)
   - state (for CSRF protection)

2. Store in sessionStorage:
   sessionStorage.setItem("pkce_state", JSON.stringify({
     code_verifier,
     state,
     redirect_uri
   }))

3. Redirect to IS Authorization Endpoint:
   GET /oauth2/authorize?
     client_id=CLIENT_ID&
     response_type=code&
     scope=openid+profile+email&
     redirect_uri=http://localhost:5173&
     code_challenge=BASE64(SHA256)&
     code_challenge_method=S256&
     state=RANDOM_STATE

User authenticates and authorizes
    ↓
4. IS Redirects back with authorization code:
   http://localhost:5173?code=AUTH_CODE&state=RETURNED_STATE

5. App exchanges code for tokens:
   POST /oauth2/token
   - code: AUTH_CODE
   - code_verifier: (retrieved from sessionStorage)
   - client_id: CLIENT_ID
   - grant_type: authorization_code
   - redirect_uri: http://localhost:5173

6. IS returns tokens:
   {
     access_token: "...",
     id_token: "...",
     refresh_token: "...",
     expires_in: 3600
   }

7. Store tokens in sessionStorage

8. Tokens used for all API calls:
   Authorization: Bearer {access_token}
```

### Email OTP Flow (Secure Purchase)

```
User clicks "Purchase Policy"
    ↓
1. Initiate OTP Flow:
   POST /oauth2/authorize
   - client_id: CLIENT_ID2 (secondary client)
   - username: (extracted from id_token)
   - response_mode: direct

2. IS returns flow metadata:
   {
     flowId: "...",
     authenticatorId: "..."
   }

3. Show OTP Input UI to user

User enters OTP
    ↓
4. Submit OTP:
   POST /oauth2/authn
   - flowId: (from step 2)
   - authenticatorId: (from step 2)
   - otp: USER_ENTERED_OTP

5. IS validates OTP and returns auth code

6. Exchange auth code for tokens:
   POST /oauth2/token
   - code: (from OTP validation)
   - code_verifier: (PKCE verifier)
   - client_id: CLIENT_ID2
   - grant_type: authorization_code

7. Use new tokens for secure operations
```

### Token Refresh Flow

```
When access_token expires:
    ↓
POST /oauth2/token
- grant_type: refresh_token
- refresh_token: (stored from login)
- client_id: CLIENT_ID

IS validates refresh token and returns new tokens
    ↓
Update sessionStorage with new tokens
    ↓
Retry original API call with new access_token
```

---

## Chat Feature Flow

### How Chat Works

```
User types message in Chat Panel
    ↓
1. ChatPanel.tsx (React Component):
   - Validates input (not empty, authenticated)
   - Adds message to chat history
   - Sends POST /chat to localhost:3002

2. Chat API Server (api-chat/server.js):
   - Receives prompt + Bearer token
   - Checks prompt keywords for policy content
   - If policy-related:
     a. Calls MCP server via APIM
        POST https://localhost:8243/PolicyInfoChatAPI/1/mcp
        Headers: Authorization: Bearer {accessToken}
        Body: tools/call with get_getVehicles
     b. Parses response: vehicle list, coverage, values

3. Response Generation:
   - Uses retrieved data (if any)
   - Generates contextual markdown response
   - Includes vehicle summaries, policy status, values

4. Return Response:
   {
     response: "Formatted markdown with vehicle info",
     hadPolicyInfo: true,
     policyInfoData: { vehicles, customerId, ... }
   }

5. ChatPanel displays formatted response
   - Auto-scrolls to latest message
   - Renders markdown formatting
   - Shows data source attribution
```

### Keywords Detected by Chat API

Policy-related keywords that trigger MCP data retrieval:
- `vehicle`, `car`, `insurance`, `policy`, `vehicles`, `cars`
- `coverage`, `premium`, `insured`, `van`, `motorcycle`, `bike`
- `registration`, `summary`, `overview`, `policies`

### Chat Response Types

**Without Policy Data**:
- Generic helpful responses
- Prompts user to ask about vehicles/insurance
- Tips on available features

**With Policy Data**:
- Vehicle summaries with registration and insurance status
- Insured vehicles list with policy details
- Total vehicle values and individual valuations
- Available actions per vehicle (quote, buy, view policy)
- Filtered results (cars only, specific make, commercial vehicles)

---

## Dev-Mode Notes

- React StrictMode can double-invoke effects in development. This app prevents duplicate token exchanges using a ref gate and session storage tracking.
- Tokens are persisted in `sessionStorage` for page reloads within the same session.
- All sensitive operations (OTP, transactions) use bearer tokens from the configured Key Manager.
- Chat API makes HTTPS requests with `rejectUnauthorized: false` for self-signed certificates in development.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Port already in use | Change port offset or kill the process using the port |
| "Redirect URI mismatch" | Ensure redirect URI in IS matches `http://localhost:5173` exactly |
| Token exchange fails | Verify IS is running on 9444 and PKCE is enabled for the client |
| "Missing bearer token" error | Ensure Key Manager is configured in APIM and tokens are valid |
| CORS errors | Enable CORS on APIs in APIM for `http://localhost:5173` |
| Certificate errors | Accept self-signed certificates in browser or configure trusted CA |
