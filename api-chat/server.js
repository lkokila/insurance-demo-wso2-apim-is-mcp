import express from 'express';
import cors from 'cors';
import https from 'https';

const app = express();
const PORT = 3002;

// Middleware
app.use(cors());
app.use(express.json());

// Helper function to call MCP server via APIM
async function callMcpServer(accessToken) {
  return new Promise((resolve, reject) => {
    const requestBody = {
      method: "tools/call",
      params: {
        name: "post_recentTransactions",
        arguments: {
          requestBody: {
            AccountNumber: "1234567",
            Limit: 5
          }
        },
        _meta: {
          progressToken: 2
        }
      },
      jsonrpc: "2.0",
      id: 1
    };

    const options = {
      hostname: 'localhost',
      port: 8243,
      path: '/FetchTransactionsMcp/1/mcp',
      method: 'POST',
      headers: {
        'Accept': 'application/json, text/event-stream',
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(JSON.stringify(requestBody))
      },
      rejectUnauthorized: false
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse MCP response: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.write(JSON.stringify(requestBody));
    req.end();
  });
}

// Check if prompt refers to transactions
function isTransactionRequest(prompt) {
  const keywords = ['transaction', 'recent', 'history', 'activity', 'movements', 'transfers', 'spending', 'balance', 'account', 'expense', 'spend', 'spent'];
  const lowerPrompt = prompt.toLowerCase();
  return keywords.some(keyword => lowerPrompt.includes(keyword));
}

// Generate response based on prompt and optional transaction data
function generateResponse(prompt, transactionData) {
  const lowerPrompt = prompt.toLowerCase();

  // If we have transaction data, generate data-driven response
  if (transactionData) {
    const txList = transactionData.GetRecentTransactionsResponse?.Transaction || [];

    if (txList.length === 0) {
      return "I retrieved your transaction data, but there are no recent transactions to display. Your account appears to have no activity in the selected period.";
    }

    const totalDebit = txList.filter(t => t.Amount < 0).reduce((sum, t) => sum + t.Amount, 0);
    const totalCredit = txList.filter(t => t.Amount > 0).reduce((sum, t) => sum + t.Amount, 0);
    const netFlow = totalCredit + totalDebit;

    // Generate contextual responses based on the prompt
    if (lowerPrompt.includes('summary') || lowerPrompt.includes('overview')) {
      console.log('[CHAT] Matched: summary/overview');
      return `📊 **Transaction Summary**\n\nYou have ${txList.length} recent transactions:\n\n💰 **Credits:** ${totalCredit.toLocaleString('en-US', {style: 'currency', currency: 'USD'})}\n💸 **Debits:** ${Math.abs(totalDebit).toLocaleString('en-US', {style: 'currency', currency: 'USD'})}\n📈 **Net Flow:** ${netFlow.toLocaleString('en-US', {style: 'currency', currency: 'USD'})}`;
    }

    if (lowerPrompt.includes('spending') || lowerPrompt.includes('expense') || lowerPrompt.includes('spend')) {
      console.log('[CHAT] Matched: spending/expense/spend');
      return `💳 **Spending Analysis**\n\nTotal spent: ${Math.abs(totalDebit).toLocaleString('en-US', {style: 'currency', currency: 'USD'})}\nTotal received: ${totalCredit.toLocaleString('en-US', {style: 'currency', currency: 'USD'})}\n\nRecent activity:\n${txList.slice(0, 3).map((t, i) => `${i + 1}. ${t.Description} - ${t.Amount.toLocaleString('en-US', {style: 'currency', currency: 'USD'})} (${t.Date})`).join('\n')}`;
    }

    if (lowerPrompt.includes('recent') || lowerPrompt.includes('latest') || lowerPrompt.includes('last')) {
      console.log('[CHAT] Matched: recent/latest/last');
      return `📋 **Recent Transactions**\n\n${txList.map((t, i) => `${i + 1}. **${t.Description}**\n   Amount: ${t.Amount.toLocaleString('en-US', {style: 'currency', currency: 'USD'})}\n   Date: ${t.Date}`).join('\n\n')}`;
    }

    if (lowerPrompt.includes('highest') || lowerPrompt.includes('largest') || lowerPrompt.includes('biggest')) {
      console.log('[CHAT] Matched: highest/largest/biggest');
      const largest = txList.reduce((max, t) => Math.abs(t.Amount) > Math.abs(max.Amount) ? t : max);
      return `💰 **Largest Transaction**\n\n${largest.Description}\nAmount: ${largest.Amount.toLocaleString('en-US', {style: 'currency', currency: 'USD'})}\nDate: ${largest.Date}`;
    }

    if (lowerPrompt.includes('average')) {
      console.log('[CHAT] Matched: average');
      const avgTransaction = txList.length > 0 ? netFlow / txList.length : 0;
      return `📊 **Average Transaction**\n\nAverage per transaction: ${avgTransaction.toLocaleString('en-US', {style: 'currency', currency: 'USD'})}\nTotal transactions: ${txList.length}\nPeriod: Last ${txList.length} transactions`;
    }

    // Default response with transaction data
    console.log('[CHAT] Matched: default (has transaction data)');
    const txDetails = txList.map((t, i) => `${i + 1}. **${t.Description}**\n   Amount: ${t.Amount.toLocaleString('en-US', {style: 'currency', currency: 'USD'})}\n   Date: ${t.Date}`).join('\n\n');
    return `📋 **Recent Transactions**\n\n${txDetails}`;
  }

  // No transaction data - provide helpful response
  if (lowerPrompt.includes('transaction') || lowerPrompt.includes('recent') || lowerPrompt.includes('history')) {
    console.log('[CHAT] Matched: no transaction data path');
    return "I'd like to help you with your transactions! Please click the \"Fetch Recent Transactions\" button in the accounts section first to retrieve your transaction data, and then ask me again. I can then provide insights on your spending patterns, account activity, and transaction details.";
  }

  // General banking questions
  if (lowerPrompt.includes('help') || lowerPrompt.includes('what can') || lowerPrompt.includes('how can')) {
    return "I'm your banking assistant! 🏦 I can help you with:\n\n📊 **Transaction Analysis** - View and analyze your recent transactions\n💰 **Spending Insights** - Understand your spending patterns\n📋 **Account Activity** - Review your account movements\n💳 **Transaction Details** - Get details about specific transactions\n\nJust ask me about your transactions or account activity, and I'll provide detailed insights!";
  }

  // Default greeting/response
  return "Hello! 👋 I'm your banking assistant. I can help you understand your account activity and transactions. Try asking me about:\n\n• Your recent transactions\n• Your spending patterns\n• Your transaction history\n• Account movements\n\nFirst, make sure to click \"Fetch Recent Transactions\" to load your data!";
}

// Chat endpoint
app.post('/chat', async (req, res) => {
  try {
    const { prompt } = req.body;
    const authHeader = req.headers.authorization;

    if (!prompt) {
      return res.status(400).json({ error: 'prompt is required' });
    }

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid Authorization header' });
    }

    const accessToken = authHeader.substring(7);
    let transactionData = null;

    // Step 1: Analyze prompt locally
    const needsTransactions = isTransactionRequest(prompt);
    console.log(`[CHAT] User prompt: "${prompt}"`);
    console.log(`[CHAT] Needs transaction data: ${needsTransactions}`);
    console.log(`[CHAT] Access Token (first 20 chars): ${accessToken.substring(0, 20)}...`);

    // Step 2: If transaction data is needed, call MCP server
    if (needsTransactions) {
      try {
        console.log('[CHAT] Fetching transaction data from MCP server...');
        const mcpResponse = await callMcpServer(accessToken);
        console.log('[CHAT] MCP Response:', JSON.stringify(mcpResponse, null, 2));

        // Extract transaction data from MCP response
        if (mcpResponse.result && mcpResponse.result.content && mcpResponse.result.content[0]) {
          const contentText = mcpResponse.result.content[0].text;
          transactionData = JSON.parse(contentText);
          console.log('[CHAT] Transaction data retrieved successfully');
        } else {
          console.log('[CHAT] MCP response missing expected structure. Result:', mcpResponse.result);
        }
      } catch (e) {
        console.error('[CHAT] MCP call failed:', e.message);
        console.error('[CHAT] Error stack:', e.stack);
        // Continue without transaction data
      }
    }

    // Step 3: Generate response locally
    const responseText = generateResponse(prompt, transactionData);
    console.log('[CHAT] Response generated');

    res.json({
      response: responseText,
      hadTransactions: !!transactionData,
      transactionData: transactionData || null
    });

  } catch (error) {
    console.error('[CHAT] Error:', error);
    res.status(500).json({
      error: 'Chat processing failed',
      message: error.message
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'bank-oidc-chat-api',
    mode: 'Local Analysis + MCP Integration'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 Chat API Server Started`);
  console.log(`📍 Port: ${PORT}`);
  console.log(`🤖 Mode: Local prompt analysis with APIM MCP integration`);
  console.log(`\n📡 Endpoints:`);
  console.log(`   POST http://localhost:${PORT}/chat - Submit chat message`);
  console.log(`   GET  http://localhost:${PORT}/health - Health check\n`);
});
