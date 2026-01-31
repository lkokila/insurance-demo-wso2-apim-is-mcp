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
        name: "get_getVehicles",
        arguments: {},
        _meta: {
          progressToken: 3
        }
      },
      jsonrpc: "2.0",
      id: 4
    };

    const options = {
      hostname: 'localhost',
      port: 8243,
      path: '/PolicyInfoChatAPI/1/mcp',
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

// Check if prompt refers to policy information
function isPolicyInfoRequest(prompt) {
  const keywords = ['vehicle', 'car', 'insurance', 'policy', 'vehicles', 'cars', 'coverage', 'premium', 'insured', 'van', 'motorcycle', 'bike', 'registration', 'summary', 'overview', 'policies'];
  const lowerPrompt = prompt.toLowerCase();
  return keywords.some(keyword => lowerPrompt.includes(keyword));
}

// Generate response based on prompt and optional policy info data
function generateResponse(prompt, policyInfoData) {
  const lowerPrompt = prompt.toLowerCase();

  // If we have policy info data, generate data-driven response
  if (policyInfoData) {
    const vehicles = policyInfoData.vehicles || [];

    if (vehicles.length === 0) {
      return "I retrieved your policy information, but there are no vehicles registered in your account.";
    }

    // Generate contextual responses based on the prompt
    if (lowerPrompt.includes('summary') || lowerPrompt.includes('overview')) {
      console.log('[CHAT] Matched: summary/overview');
      const insuredCount = vehicles.filter(v => v.insuranceStatus?.isInsured).length;
      return `🚗 **Vehicle & Insurance Summary**\n\nCustomer ID: ${policyInfoData.customerId}\nTotal Vehicles: ${vehicles.length}\nInsured Vehicles: ${insuredCount}\n\n${vehicles.map((v, i) => `${i + 1}. **${v.make} ${v.model}** (${v.type})\n   Registration: ${v.registrationNumber}\n   Insured: ${v.insuranceStatus?.isInsured ? '✅ Yes' : '❌ No'}\n   Policy ID: ${v.insuranceStatus?.policyId || 'N/A'}`).join('\n\n')}`;
    }

    if (lowerPrompt.includes('insured') || lowerPrompt.includes('coverage') || lowerPrompt.includes('policy')) {
      console.log('[CHAT] Matched: insured/coverage/policy');
      const insuredVehicles = vehicles.filter(v => v.insuranceStatus?.isInsured);
      if (insuredVehicles.length === 0) {
        return "None of your vehicles currently have active insurance coverage.";
      }
      return `📋 **Insured Vehicles**\n\n${insuredVehicles.map((v, i) => `${i + 1}. **${v.make} ${v.model}** (${v.registrationNumber})\n   Policy ID: ${v.insuranceStatus?.policyId}\n   Insured Until: ${v.insuranceStatus?.insuredUntil}\n   Value: ${v.estimatedValue.toLocaleString('en-US')} ${v.currency}`).join('\n\n')}`;
    }

    if (lowerPrompt.includes('value') || lowerPrompt.includes('worth') || lowerPrompt.includes('price')) {
      console.log('[CHAT] Matched: value/worth/price');
      const totalValue = vehicles.reduce((sum, v) => sum + v.estimatedValue, 0);
      return `💰 **Vehicle Values**\n\nTotal Estimated Value: ${totalValue.toLocaleString('en-US')} LKR\n\n${vehicles.map((v, i) => `${i + 1}. ${v.make} ${v.model} - ${v.estimatedValue.toLocaleString('en-US')} LKR`).join('\n')}`;
    }

    if (lowerPrompt.includes('action') || lowerPrompt.includes('available')) {
      console.log('[CHAT] Matched: action/available');
      return `🔧 **Available Actions by Vehicle**\n\n${vehicles.map((v, i) => `${i + 1}. **${v.make} ${v.model}** (${v.registrationNumber})\n   Get Quote: ${v.actionsAvailable?.canGetQuote ? '✅' : '❌'}\n   Buy Insurance: ${v.actionsAvailable?.canBuyInsurance ? '✅' : '❌'}\n   View Policy: ${v.actionsAvailable?.canViewPolicy ? '✅' : '❌'}`).join('\n\n')}`;
    }

    // Check for car-only filter
    if (lowerPrompt.includes('car') && !lowerPrompt.includes('motorcycle') && !lowerPrompt.includes('van') && !lowerPrompt.includes('truck')) {
      console.log('[CHAT] Matched: cars only');
      const cars = vehicles.filter(v => v.type === 'CAR');
      if (cars.length === 0) {
        return "You don't have any cars registered in your account.";
      }
      return `🚗 **Your Cars**\n\n${cars.map((v, i) => `${i + 1}. **${v.make} ${v.model}**\n   Registration: ${v.registrationNumber}\n   Year: ${v.manufactureYear}\n   Estimated Value: ${v.estimatedValue.toLocaleString('en-US')} ${v.currency}\n   Insurance Status: ${v.insuranceStatus?.isInsured ? '✅ Insured' : '❌ Not Insured'}\n   Policy ID: ${v.insuranceStatus?.policyId || 'N/A'}\n   Insured Until: ${v.insuranceStatus?.insuredUntil || 'N/A'}`).join('\n\n')}`;
    }

    // Check for specific make/brand filter
    const makes = ['toyota', 'honda', 'bmw', 'mercedes', 'audi', 'ford', 'hyundai', 'kia', 'volkswagen', 'nissan', 'mazda', 'suzuki', 'chevrolet', 'renault', 'tata', 'mahindra', 'skoda'];
    const detectedMake = makes.find(make => lowerPrompt.includes(make));
    if (detectedMake) {
      console.log(`[CHAT] Matched: make filter - ${detectedMake}`);
      const filteredVehicles = vehicles.filter(v => v.make.toLowerCase() === detectedMake);
      if (filteredVehicles.length === 0) {
        return `You don't have any ${detectedMake.charAt(0).toUpperCase() + detectedMake.slice(1)} vehicles registered in your account.`;
      }
      const capitalizedMake = detectedMake.charAt(0).toUpperCase() + detectedMake.slice(1);
      return `🚗 **Your ${capitalizedMake} Vehicles**\n\n${filteredVehicles.map((v, i) => `${i + 1}. **${v.make} ${v.model}** (${v.type})\n   Registration: ${v.registrationNumber}\n   Year: ${v.manufactureYear}\n   Estimated Value: ${v.estimatedValue.toLocaleString('en-US')} ${v.currency}\n   Insurance Status: ${v.insuranceStatus?.isInsured ? '✅ Insured' : '❌ Not Insured'}\n   Policy ID: ${v.insuranceStatus?.policyId || 'N/A'}\n   Insured Until: ${v.insuranceStatus?.insuredUntil || 'N/A'}`).join('\n\n')}`;
    }

    if (lowerPrompt.includes('van') || lowerPrompt.includes('truck')) {
      console.log('[CHAT] Matched: van/truck');
      const commercialVehicles = vehicles.filter(v => ['VAN', 'TRUCK', 'BUS'].includes(v.type));
      if (commercialVehicles.length === 0) {
        return "You don't have any vans or trucks registered.";
      }
      return `🚐 **Commercial Vehicles**\n\n${commercialVehicles.map((v, i) => `${i + 1}. **${v.make} ${v.model}** (${v.type})\n   Registration: ${v.registrationNumber}\n   Year: ${v.manufactureYear}\n   Insured: ${v.insuranceStatus?.isInsured ? '✅' : '❌'}`).join('\n\n')}`;
    }

    // Default response with policy data
    console.log('[CHAT] Matched: default (has policy data)');
    return `🚗 **Your Vehicles**\n\nCustomer ID: ${policyInfoData.customerId}\n\n${vehicles.map((v, i) => `${i + 1}. **${v.make} ${v.model}** (${v.type})\n   Registration: ${v.registrationNumber}\n   Year: ${v.manufactureYear}\n   Estimated Value: ${v.estimatedValue.toLocaleString('en-US')} ${v.currency}\n   Insurance Status: ${v.insuranceStatus?.isInsured ? '✅ Insured' : '❌ Not Insured'}`).join('\n\n')}`;
  }

  // No policy data - provide helpful response
  if (lowerPrompt.includes('vehicle') || lowerPrompt.includes('car') || lowerPrompt.includes('insurance')) {
    console.log('[CHAT] Matched: no policy data path');
    return "I'd like to help you with your vehicle and insurance information! Please ensure your policy data is loaded first, and then ask me again. I can provide insights on your vehicles, insurance coverage, and available actions.";
  }

  // General insurance questions
  if (lowerPrompt.includes('help') || lowerPrompt.includes('what can') || lowerPrompt.includes('how can')) {
    return "I'm your insurance assistant! 🛡️ I can help you with:\n\n🚗 **Vehicle Information** - View your registered vehicles\n📋 **Insurance Coverage** - Check your active policies\n💰 **Vehicle Values** - See estimated values of your vehicles\n🔧 **Available Actions** - Discover what you can do with each vehicle\n\nJust ask me about your vehicles or insurance policies!";
  }

  // Default greeting/response
  return "Hello! 👋 I'm your insurance assistant. I can help you with your vehicle and insurance information. Try asking me about:\n\n• Your vehicles\n• Insurance coverage status\n• Vehicle values\n• Available actions on your policies\n\nJust ask me anything about your vehicles and insurance!";
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
    let policyInfoData = null;

    // Step 1: Analyze prompt locally
    const needsPolicyInfo = isPolicyInfoRequest(prompt);
    console.log(`[CHAT] User prompt: "${prompt}"`);
    console.log(`[CHAT] Needs policy info data: ${needsPolicyInfo}`);
    console.log(`[CHAT] Access Token (first 20 chars): ${accessToken.substring(0, 20)}...`);

    // Step 2: If policy info is needed, call MCP server
    if (needsPolicyInfo) {
      try {
        console.log('[CHAT] Fetching policy info data from MCP server...');
        const mcpResponse = await callMcpServer(accessToken);
        console.log('[CHAT] MCP Response:', JSON.stringify(mcpResponse, null, 2));

        // Extract policy info data from MCP response
        if (mcpResponse.result && mcpResponse.result.content && mcpResponse.result.content[0]) {
          const contentText = mcpResponse.result.content[0].text;
          policyInfoData = JSON.parse(contentText);
          console.log('[CHAT] Policy info data retrieved successfully');
        } else {
          console.log('[CHAT] MCP response missing expected structure. Result:', mcpResponse.result);
        }
      } catch (e) {
        console.error('[CHAT] MCP call failed:', e.message);
        console.error('[CHAT] Error stack:', e.stack);
        // Continue without policy info data
      }
    }

    // Step 3: Generate response locally
    const responseText = generateResponse(prompt, policyInfoData);
    console.log('[CHAT] Response generated');

    res.json({
      response: responseText,
      hadPolicyInfo: !!policyInfoData,
      policyInfoData: policyInfoData || null
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
    service: 'insurance-policy-chat-api',
    mode: 'Local Analysis + Policy Info MCP Integration'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 Chat API Server Started`);
  console.log(`📍 Port: ${PORT}`);
  console.log(`🤖 Mode: Local prompt analysis with PolicyInfoChatAPI MCP integration`);
  console.log(`\n📡 Endpoints:`);
  console.log(`   POST http://localhost:${PORT}/chat - Submit chat message`);
  console.log(`   GET  http://localhost:${PORT}/health - Health check\n`);
});
