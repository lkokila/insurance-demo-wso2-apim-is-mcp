import React, { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Send, Loader2, MessageSquare, ChevronDown, ChevronUp } from "lucide-react";

/**
 * ChatMessage interface represents a single message in the chat conversation
 * @property id - Unique identifier for the message
 * @property role - Either "user" for user messages or "assistant" for bot responses
 * @property content - The text content of the message (supports markdown)
 * @property timestamp - When the message was created
 * @property hadTransactions - Optional flag indicating if response includes transaction data
 */
interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  hadTransactions?: boolean;
}

/**
 * ChatPanelProps interface for the ChatPanel component
 * @property accessToken - OAuth access token used to authenticate requests to the chat API
 */
interface ChatPanelProps {
  accessToken: string | null;
}

/**
 * ChatPanel Component - Floating chat assistant for transaction inquiries
 *
 * Features:
 * - Collapsible to a small floating button (56x56px) in bottom-right corner
 * - Expands to full chat window (400x500px) when clicked
 * - Sends prompts to local chat API (http://localhost:3002/chat)
 * - Displays transaction data from MCP server via APIM
 * - Only visible when user is authenticated
 *
 * @param accessToken - OAuth access token for API authentication
 */
export function ChatPanel({ accessToken }: ChatPanelProps) {
  // State management for chat functionality
  const [messages, setMessages] = useState<ChatMessage[]>([]); // Array of chat messages
  const [input, setInput] = useState(""); // Current user input in textarea
  const [loading, setLoading] = useState(false); // Loading state while waiting for API response
  const [error, setError] = useState<string | null>(null); // Error message if API call fails
  const [isCollapsed, setIsCollapsed] = useState(true); // Collapse/expand state (default: collapsed)
  const messagesEndRef = useRef<HTMLDivElement>(null); // Ref to auto-scroll to latest message

  /**
   * Utility function to auto-scroll chat to the latest message
   * Called whenever messages array updates
   */
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  /**
   * Effect hook: Auto-scroll to latest message when messages array changes
   */
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  /**
   * sendMessage - Main chat submission handler
   *
   * Flow:
   * 1. Validate input (not empty, user authenticated, not loading)
   * 2. Clear previous errors
   * 3. Add user message to chat history
   * 4. Send POST request to http://localhost:3002/chat
   *    - Passes: prompt (user text) and Authorization header (Bearer token)
   * 5. Handle response:
   *    - If transaction keywords detected: Server calls MCP endpoint via APIM
   *    - Response includes: response text + hadTransactions flag
   * 6. Display assistant response in chat
   * 7. Handle errors gracefully with user-friendly messages
   *
   * @throws Error if API call fails or response is invalid
   */
  const sendMessage = async () => {
    // Validate before sending: input not empty, user authenticated, not already loading
    if (!input.trim() || !accessToken || loading) return;

    const prompt = input;
    setError(null);

    // Create user message object
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: prompt,
      timestamp: new Date(),
    };

    // Add user message to chat and clear input field
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      // Send message to local chat API server
      const response = await fetch("http://localhost:3002/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`, // OAuth token for authentication
        },
        body: JSON.stringify({ prompt: prompt }),
      });

      // Check for HTTP errors
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }

      // Parse successful response
      const data = await response.json();

      // Create assistant message with optional transaction data flag
      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.response, // AI-generated or locally generated response
        timestamp: new Date(),
        hadTransactions: data.hadTransactions, // True if response includes transaction data
      };

      // Add assistant response to chat history
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err: any) {
      // Display error to user and log for debugging
      setError(err.message || "Failed to send message");
      console.error("Chat error:", err);
    } finally {
      // Always stop loading state after response/error
      setLoading(false);
    }
  };

  /**
   * handleKeyPress - Keyboard event handler for textarea
   * - Enter: Send message
   * - Shift+Enter: New line (default textarea behavior)
   */
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Don't render chat if user is not authenticated
  if (!accessToken) {
    return null;
  }

  return (
    // Main container with smooth animation between collapsed/expanded states
    <motion.div
      animate={{
        width: isCollapsed ? "56px" : "400px",      // Collapsed: small button, Expanded: full width
        height: isCollapsed ? "56px" : "500px",      // Collapsed: square button, Expanded: full height
      }}
      transition={{ duration: 0.3, ease: "easeInOut" }} // Smooth 300ms animation
      style={{
        display: "flex",
        flexDirection: "column",
        backgroundColor: "#ffffff",
        borderRadius: isCollapsed ? "50%" : "12px", // Collapsed: circle, Expanded: rounded rect
        border: "1px solid #e2e8f0",
        overflow: "hidden",
        boxShadow: isCollapsed ? "0 4px 12px rgba(0, 0, 0, 0.1)" : "0 10px 25px rgba(0, 0, 0, 0.15)",
      }}
    >
      {/* Header/Button Section - Changes based on collapsed state */}
      <div
        style={{
          padding: isCollapsed ? "0" : "16px",
          borderBottom: isCollapsed ? "none" : "1px solid #e2e8f0",
          backgroundColor: "#f8fafc",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          cursor: "pointer",
          userSelect: "none",
          height: isCollapsed ? "56px" : "auto",
          width: "100%",
        }}
        onClick={() => !isCollapsed && setIsCollapsed(!isCollapsed)}
      >
        {/* Collapsed State: Show blue floating button with chat icon */}
        {isCollapsed ? (
          <motion.button
            whileHover={{ scale: 1.1 }}  // Scale up on hover
            whileTap={{ scale: 0.95 }}   // Scale down on click
            onClick={() => setIsCollapsed(false)}
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "50%",
              backgroundColor: "#3b82f6",  // Blue color
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#ffffff",
              boxShadow: "0 4px 12px rgba(59, 130, 246, 0.4)",
            }}
          >
            <MessageSquare size={24} />
          </motion.button>
        ) : (
          // Expanded State: Show title and close button
          <>
            <div>
              <h3 style={{ margin: "0", fontSize: "16px", color: "#0f172a" }}>
                Chat Assistant
              </h3>
              <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#64748b" }}>
                Ask about your transactions
              </p>
            </div>
            {/* Close button (chevron icon) to collapse the chat */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsCollapsed(true);
              }}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "#64748b",
                padding: "4px",
                display: "flex",
                alignItems: "center",
              }}
            >
              <ChevronDown size={20} />
            </button>
          </>
        )}
      </div>

      {/* Messages Container - Only shown when expanded */}
      {!isCollapsed && (
      <div
        style={{
          flex: 1,                // Takes remaining vertical space
          overflowY: "auto",      // Scrollable when messages exceed height
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        {/* Empty state message */}
        {messages.length === 0 && (
          <div
            style={{
              textAlign: "center",
              color: "#94a3b8",
              fontSize: "14px",
              paddingTop: "24px",
            }}
          >
            No messages yet. Start by asking about your transactions!
          </div>
        )}

        {/* Render all messages with fade-in animation */}
        {messages.map((msg) => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 10 }}      // Fade in from below
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div
              style={{
                display: "flex",
                // User messages align right, assistant messages align left
                justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
              }}
            >
              <div
                style={{
                  maxWidth: "80%",
                  padding: "12px 16px",
                  borderRadius: "8px",
                  // User: blue background, Assistant: gray background
                  backgroundColor:
                    msg.role === "user" ? "#3b82f6" : "#e2e8f0",
                  color: msg.role === "user" ? "#ffffff" : "#0f172a",
                  fontSize: "14px",
                  lineHeight: "1.5",
                  wordWrap: "break-word",
                }}
              >
                {msg.content}
                {/* Badge showing if response includes transaction data */}
                {msg.hadTransactions && (
                  <div
                    style={{
                      marginTop: "8px",
                      fontSize: "12px",
                      opacity: 0.8,
                      fontStyle: "italic",
                    }}
                  >
                    (based on recent transactions)
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        ))}

        {/* Loading state - shows spinning icon while waiting for response */}
        {loading && (
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <div
              style={{
                padding: "12px 16px",
                borderRadius: "8px",
                backgroundColor: "#e2e8f0",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <Loader2
                size={16}
                style={{ animation: "spin 1s linear infinite" }}
              />
              <span style={{ fontSize: "14px", color: "#0f172a" }}>
                Thinking...
              </span>
            </div>
          </div>
        )}

        {/* Error message - shown if API call fails */}
        {error && (
          <div
            style={{
              padding: "12px 16px",
              borderRadius: "8px",
              backgroundColor: "#fee2e2",
              color: "#991b1b",
              fontSize: "14px",
            }}
          >
            Error: {error}
          </div>
        )}

        {/* Invisible element used to auto-scroll to latest message */}
        <div ref={messagesEndRef} />
      </div>
      )}

      {/* Input Area - Textarea + Send Button - Only shown when expanded */}
      {!isCollapsed && (
      <div
        style={{
          padding: "12px 16px",
          borderTop: "1px solid #e2e8f0",
          backgroundColor: "#f8fafc",
        }}
      >
        <div style={{ display: "flex", gap: "8px" }}>
          {/* Textarea for user input */}
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}  // Enter to send, Shift+Enter for newline
            placeholder="Ask about your transactions..."
            disabled={loading}            // Disable while waiting for response
            style={{
              flex: 1,
              padding: "10px 12px",
              borderRadius: "8px",
              border: "1px solid #e2e8f0",
              fontSize: "14px",
              fontFamily: "inherit",
              resize: "none",              // Disable manual resize
              minHeight: "40px",
              maxHeight: "100px",           // Allow up to 4 lines
              color: "#0f172a",
              opacity: loading ? 0.6 : 1,  // Fade out when disabled
              cursor: loading ? "not-allowed" : "text",
            }}
          />
          {/* Send Button */}
          <button
            onClick={sendMessage}
            disabled={loading || !input.trim()}  // Disable if loading or no text
            style={{
              padding: "10px 16px",
              // Gray if disabled, blue if enabled
              backgroundColor:
                loading || !input.trim() ? "#cbd5e1" : "#3b82f6",
              color: "#ffffff",
              border: "none",
              borderRadius: "8px",
              cursor: loading || !input.trim() ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "14px",
              fontWeight: "500",
            }}
          >
            {/* Show spinner icon while loading, send icon otherwise */}
            {loading ? (
              <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
            ) : (
              <Send size={16} />
            )}
          </button>
        </div>
      </div>
      )}

      {/* CSS animation for loading spinner */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </motion.div>
  );
}
