/**
 * BankOIDCDemoApp - Main React component for banking OIDC demo
 *
 * This component demonstrates:
 * - OIDC/PKCE authentication flow with WSO2 Identity Server
 * - OAuth2 token management and refresh
 * - Fetching account and transaction data from APIs
 * - Email OTP authentication for transaction authorization
 * - Floating chat assistant for transaction inquiries
 *
 * The component manages multiple auth flows:
 * 1. Standard PKCE authorization code flow
 * 2. Email OTP flow for transaction authorization
 * 3. Token refresh mechanism
 */

import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, LogIn, LogOut, RefreshCcw, ShieldCheck } from "lucide-react";
import { OIDC_CONFIG as C, API_CONFIG } from "../config";
import { fetchAccounts, Account } from "../api";
import { ChatPanel } from "./ChatPanel";

/**
 * PKCE Helper Functions
 * These functions implement the PKCE (Proof Key for Public Clients) OAuth2 extension
 * Required for secure authorization in public/browser-based apps
 */

/**
 * Converts ArrayBuffer to Base64URL encoded string
 * Used for encoding PKCE code challenge
 */
function base64UrlEncode(arrayBuffer: ArrayBuffer) {
  const uint8Array = new Uint8Array(arrayBuffer);
  let base64 = btoa(String.fromCharCode(...uint8Array));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Creates SHA-256 hash of PKCE code verifier
 * Used to generate code_challenge from code_verifier
 */
async function sha256(buffer: string) {
  const data = new TextEncoder().encode(buffer);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(digest);
}

/**
 * Generates cryptographically random string for PKCE code_verifier
 * @param length - Length of random string (default 43)
 * @returns Random string using unreserved URL-safe characters
 */
function randomString(length = 43) {
  const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  let result = "";
  const values = crypto.getRandomValues(new Uint8Array(length));
  for (let i = 0; i < length; i++) result += charset[values[i] % charset.length];
  return result;
}

/**
 * Session Storage Helpers
 * Safely save/load data from browser sessionStorage
 */

/**
 * Save value to sessionStorage with error handling
 * @param key - Storage key
 * @param value - Value to store (will be JSON serialized)
 */
function saveSession(key: string, value: any) { try { sessionStorage.setItem(key, JSON.stringify(value)); } catch {} }

/**
 * Load value from sessionStorage with fallback
 * @param key - Storage key
 * @param fallback - Value to return if key not found or parse fails
 */
function loadSession(key: string, fallback: any = null) {
  try { const v = sessionStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}

/**
 * Main App Component
 */
export default function BankOIDCDemoApp() {
  // ===== Authentication State =====
  const [error, setError] = useState("");                           // Error message display
  const [tokens, setTokens] = useState<any>(() => loadSession("tokens")); // OAuth tokens (access, refresh, id)
  const [userInfo, setUserInfo] = useState<any>(null);             // User profile from /userinfo endpoint
  const exchangingRef = useRef(false);                             // Prevent duplicate token exchanges

  // ===== Account Data State =====
  const [accounts, setAccounts] = useState<Account[] | null>(null); // Array of bank accounts
  const [refreshingAccounts, setRefreshingAccounts] = useState<Set<string>>(new Set()); // Accounts being refreshed

  // ===== Transaction Data State =====
  type Tx = { Date: string; Description: string; Amount: number };
  const [transactions, setTransactions] = useState<Tx[] | null>(null); // Recent transactions list
  const [txLoading, setTxLoading] = useState(false);                  // Loading state for transaction fetch

  // ===== Email OTP Flow State (for transaction authorization) =====
  const [otpVisible, setOtpVisible] = useState(false);             // Show/hide OTP input
  const [otpValue, setOtpValue] = useState("");                    // User-entered OTP code
  const [otpRequesting, setOtpRequesting] = useState(false);       // Loading state for OTP operations
  const [otpError, setOtpError] = useState<string | null>(null);  // OTP-specific error
  const [otpResponse, setOtpResponse] = useState<any>(null);       // OTP flow metadata (flowId, authenticatorId)
  const [transactionSuccess, setTransactionSuccess] = useState(false); // Success flag after OTP exchange
  const [transactionsExpanded, setTransactionsExpanded] = useState(true); // Collapse/expand UI state

  // Fetch userinfo + accounts when tokens available
  useEffect(() => {
    (async () => {
      if (!tokens) return;

      try {
        const res = await fetch(C.USERINFO_ENDPOINT, {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        if (!res.ok) throw new Error("Failed to fetch userinfo");
        setUserInfo(await res.json());
      } catch (e: any) {
        setError(String(e?.message || e));
      }

      try {
        const list = await fetchAccounts(tokens.access_token);
        // Mark all accounts as refreshing
        setRefreshingAccounts(new Set(list.map(acc => acc.name)));
        setAccounts(list);
        // Fade animation completes after 2 seconds
        setTimeout(() => setRefreshingAccounts(new Set()), 2000);
      } catch (e: any) {
        setError(`Accounts fetch failed: ${e?.message || String(e)}`);
      }
    })();
  }, [tokens]);

  async function startLogin(clientId?: string) {
    // Guard: if an event (object) was passed by mistake, ignore it
    if (clientId && typeof clientId !== "string") {
      clientId = undefined;
    }

    setError("");
    const codeVerifier = randomString(64);
    const codeChallenge = await sha256(codeVerifier);
    const state = randomString(24);
    saveSession("pkce_state", state);
    saveSession(`pkce_verifier:${state}`, codeVerifier);
    // Persist which client_id started this auth flow so token exchange/refresh can use it
    saveSession(`pkce_client:${state}`, clientId || C.CLIENT_ID);

    const authUrl = new URL(C.AUTHORIZATION_ENDPOINT);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("client_id", clientId || C.CLIENT_ID);
    authUrl.searchParams.set("redirect_uri", C.REDIRECT_URI);
    authUrl.searchParams.set("scope", C.SCOPE);
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("code_challenge", codeChallenge);
    authUrl.searchParams.set("code_challenge_method", "S256");

    window.location.assign(authUrl.toString());
  }

  async function emailOtpFlow(clientId?: string) {
    // choose client id passed in or fallback to CLIENT_ID2
    const usedClient = clientId || C.CLIENT_ID2;

    // attempt to get tokens from state first, then from session storage
    const currentTokens = tokens || loadSession("tokens");

    // helper to decode JWT payload (base64url)
    function parseJwt(token: string | undefined) {
      if (!token) return null;
      try {
        const parts = token.split(".");
        if (parts.length < 2) return null;
        let payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
        while (payload.length % 4) payload += "=";
        const json = atob(payload);
        return JSON.parse(json);
      } catch {
        return null;
      }
    }

    // extract isk claim and email claim from id_token if present
    //let sessionId: string | undefined;
    let username: string | undefined;
    const idToken = currentTokens?.id_token;
    const payload = parseJwt(idToken);
    if (payload && typeof payload === "object") {
      // if (payload.isk) {
      //   sessionId = String(payload.isk);
      // }
      if (payload.username) {
        username = String(payload.username);
      }
    }

    const url = `${C.AUTHORIZATION_ENDPOINT}/`; // ensure trailing slash as in curl
    const params = new URLSearchParams({
      client_id: usedClient,
      response_type: "code",
      redirect_uri: C.REDIRECT_URI,
      state: "logpg",
      scope: "openid internal_login profile",
      response_mode: "direct"
    });

    // if (sessionId) {
    //   params.set("sessionId", sessionId);
    // }

    if (username) {
      params.set("username", username);
    }

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: params.toString(),
      credentials: "include"
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`emailOtpFlow failed: ${res.status} ${body}`);
    }

    return res.json();
  }

  // start email OTP request and show OTP input
  async function startEmailOtp(clientId?: string) {
    setOtpError(null);
    setOtpResponse(null);
    setOtpRequesting(true);
    try {
      const res = await emailOtpFlow(clientId);

      // normalize common locations for flowId and authenticatorId so submitOtp can read them directly
      const flowId =
        res?.flowId ||
        res?.flowID ||
        res?.sessionDataKey ||
        res?.sessionDataKeyConsent ||
        res?.sessionState ||
        null;

      // Prefer nextStep.authenticators[0].authenticatorId when present (matches provided /authorize response)
      const authenticatorId =
        res?.nextStep?.authenticators?.[0]?.authenticatorId ||
        res?.authenticatorId ||
        res?.authenticators?.[0]?.authenticatorId ||
        res?.authenticators?.[0]?.id ||
        res?.authenticate?.authenticators?.[0]?.id ||
        res?.stepInfo?.options?.[0]?.authenticatorId ||
        res?.stepInfo?.options?.[0]?.id ||
        null;

      // prefer link for the authn endpoint if provided
      const authnHref = res?.links?.[0]?.href || res?.links?.find?.((l:any)=>/authn/i.test(l?.href))?.href || null;

      const normalized = { ...res, flowId, authenticatorId, authnHref };

      setOtpResponse(normalized);
      setOtpVisible(true);
    } catch (e: any) {
      setOtpError(String(e?.message || e));
      setOtpVisible(false);
    } finally {
      setOtpRequesting(false);
    }
  }

  // submit OTP (wire to /authn using flowId + authenticatorId from authorize response)
  async function submitOtp() {
    setOtpError(null);
    if (!otpValue) { setOtpError("Enter OTP"); return; }
    if (!otpResponse) { setOtpError("Missing authorize response (no flow data)"); return; }

    // try common locations for flowId
    const flowId =
      otpResponse.flowId ||
      otpResponse.flowID ||
      otpResponse.sessionDataKey ||
      otpResponse.sessionDataKeyConsent ||
      otpResponse.sessionState ||
      null;

    // try common locations for authenticatorId (pick first available)
    const authenticatorId =
      otpResponse.authenticatorId ||
      otpResponse.nextStep?.authenticators?.[0]?.authenticatorId ||
      otpResponse.authenticators?.[0]?.authenticatorId ||
      otpResponse.authenticators?.[0]?.id ||
      otpResponse.authenticate?.authenticators?.[0]?.id ||
      otpResponse.stepInfo?.options?.[0]?.authenticatorId ||
      otpResponse.stepInfo?.options?.[0]?.id ||
      null;

    if (!flowId) { setOtpError("Unable to locate flowId in authorize response"); return; }
    if (!authenticatorId) { setOtpError("Unable to locate authenticatorId in authorize response"); return; }

    setOtpRequesting(true);
    try {
      const body = {
        flowId: String(flowId),
        selectedAuthenticator: {
          authenticatorId: String(authenticatorId),
          params: {
            OTPCode: otpValue
          }
        }
      };

      const res = await fetch(otpResponse?.authnHref || "https://localhost:9444/oauth2/authn", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json"
        },
        credentials: "include",
        body: JSON.stringify(body)
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const txt = json ? JSON.stringify(json) : await res.text().catch(() => "");
        throw new Error(`OTP verify failed (${res.status}). ${txt}`);
      }

      // Keep the authn response for debugging / next steps
      setOtpResponse(json);

      // If authn completed and returned an authorization code, exchange it for tokens using CLIENT_ID2
      const authCode = json?.authData?.code;
      if (json?.flowStatus === "SUCCESS_COMPLETED" && authCode) {
        try {
          const tokenBody = new URLSearchParams();
          tokenBody.set("grant_type", "authorization_code");
          tokenBody.set("code", String(authCode));
          tokenBody.set("redirect_uri", C.REDIRECT_URI);
          tokenBody.set("client_id", C.CLIENT_ID2);

          const tokenRes = await fetch(C.TOKEN_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: tokenBody,
          });

          if (!tokenRes.ok) {
            const txt = await tokenRes.text().catch(() => "");
            throw new Error(`Token exchange (CLIENT_ID2) failed (${tokenRes.status}). ${txt}`);
          }

          const tokenJson = await tokenRes.json().catch(() => null);
          if (!tokenJson) throw new Error("Token response (CLIENT_ID2) not JSON.");

          // persist client id used with tokens and save session
          try { (tokenJson as any)._client_id = C.CLIENT_ID2; } catch {}
          setTokens(tokenJson);
          saveSession("tokens", tokenJson);
        } catch (e:any) {
          // surface token exchange error to OTP UI
          throw new Error(`Post-OTP token exchange error: ${e?.message || String(e)}`);
        }
      }

      // treat success: hide OTP input and clear value
      setOtpVisible(false);
      setOtpValue("");

      // Use a bearer token from the stored token JSON (try common fields)
      const bearerToken =
        tokens.access_token ||
        tokens.accessToken ||
        tokens.token ||
        tokens.id_token ||
        (typeof tokens === "string" ? tokens : null);

      if (!bearerToken) {
        setError("Missing bearer token in stored tokens. Ensure access_token (or accessToken/token/id_token) is present.");
        return;
      }

      const res1 = await fetch(API_CONFIG.ADD_TRANSACTION_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${bearerToken}`,
        },
        body: JSON.stringify({
            Date: "2025-03-10",
            Description: "Internal Transaction",
            Amount: 50000,
        }),
      });

      if (!res1.ok) {
        const txt = await res1.text().catch(() => "");
        throw new Error(`Transaction failed (${res1.status}). ${txt}`);
      }

      setTransactionSuccess(true);
      // Auto-hide success message after 3 seconds
      setTimeout(() => setTransactionSuccess(false), 3000);

    } catch (e:any) {
      setOtpError(e?.message || String(e));
    } finally {
      setOtpRequesting(false);
    }
  }

  // Single-invoke code consumption (avoid double token calls)
  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const storedState = loadSession("pkce_state");

    if (!code || !state || state !== storedState) return;

    const usedKey = `pkce_code_used:${state}:${code}`;
    const alreadyUsed = sessionStorage.getItem(usedKey);
    if (alreadyUsed || exchangingRef.current) return;

    exchangingRef.current = true;
    sessionStorage.setItem(usedKey, "1");

    (async () => {
      await exchangeCodeForTokens(code, state);
      url.searchParams.delete("code");
      url.searchParams.delete("state");
      url.searchParams.delete("session_state");
      window.history.replaceState({}, document.title, url.pathname);
      exchangingRef.current = false;
    })();
  }, []);

  async function exchangeCodeForTokens(code: string, state?: string) {
    try {
      const codeVerifier =
        (state && loadSession(`pkce_verifier:${state}`)) ||
        loadSession("pkce_verifier");
      // client id used for this auth flow (saved in startLogin)
      const clientIdUsed =
        (state && loadSession(`pkce_client:${state}`)) ||
        C.CLIENT_ID;
      if (!codeVerifier) { setError("Missing PKCE verifier. Please sign in again."); return; }

      const body = new URLSearchParams();
      body.set("grant_type", "authorization_code");
      body.set("client_id", clientIdUsed);
      body.set("code", code);
      body.set("redirect_uri", C.REDIRECT_URI);
      body.set("code_verifier", codeVerifier);

      const res = await fetch(C.TOKEN_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        setError(`Token exchange failed (${res.status}). ${txt || "See Network tab."}`);
        return;
      }
      const json = await res.json().catch(() => null);
      if (!json) { setError("Token response not JSON."); return; }
      // persist which client_id was used together with tokens for future refreshs
      try { (json as any)._client_id = clientIdUsed; } catch {}
      setTokens(json);
      saveSession("tokens", json);
      if (state) { try { sessionStorage.removeItem(`pkce_verifier:${state}`); sessionStorage.removeItem(`pkce_client:${state}`); } catch {} }
    } catch (e: any) {
      setError(`Token exchange error: ${e?.message || String(e)}`);
    }
  }

  // New: fetch recent transactions using stored tokens
  async function fetchRecentTransactions() {
    setError("");
    setTransactions(null); // indicate loading
    setTxLoading(true);
    try {
      if (!tokens) { setError("No tokens available"); setTxLoading(false); return; }

      // Use a bearer token from the stored token JSON (try common fields)
      const bearerToken =
        tokens.access_token ||
        tokens.accessToken ||
        tokens.token ||
        tokens.id_token ||
        (typeof tokens === "string" ? tokens : null);

      if (!bearerToken) {
        setError("Missing bearer token in stored tokens. Ensure access_token (or accessToken/token/id_token) is present.");
        setTxLoading(false);
        return;
      }

      const res = await fetch(API_CONFIG.RECENT_TRANSACTIONS_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${bearerToken}`,
        },
        body: JSON.stringify({
            AccountNumber: "123456789",
            Limit: 25,
        }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        setError(`Transactions fetch failed (${res.status}). ${txt}`);
        setTxLoading(false);
        return;
      }

      const json = await res.json().catch(() => null);
      const txList: Tx[] = json?.GetRecentTransactionsResponse?.Transaction || [];
      setTransactions(txList);
    } catch (e: any) {
      setError(`Transactions error: ${e?.message || String(e)}`);
    } finally {
      setTxLoading(false);
    }
  }

  function clearSession() {
    setTokens(null);
    setUserInfo(null);
    setAccounts(null);
    try { sessionStorage.removeItem("tokens"); } catch {}
  }

  function rpLogout() {
    const url = new URL(C.ENDSESSION_ENDPOINT);
    if (tokens?.id_token) url.searchParams.set("id_token_hint", tokens.id_token);
    url.searchParams.set("post_logout_redirect_uri", C.REDIRECT_URI);
    clearSession();
    window.location.assign(url.toString());
  }

  const Btn = (props: any) => (
    <button
      {...props}
      style={{
        borderRadius: "16px",
        padding: "10px 14px",
        border: "1px solid #cbd5e1",
        background: props.primary ? "#0f172a" : "white",
        color: props.primary ? "white" : "#0f172a",
        display: "inline-flex",
        alignItems: "center",
        gap: "8px",
        cursor: "pointer"
      }}
    >
      {props.children}
    </button>
  );
  const CardBox = (props: any) => (
    <div style={{ border: "1px solid #e2e8f0", borderRadius: "16px", background: "white", boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
      <div style={{ padding: "24px" }}>{props.children}</div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(to bottom, #f8fafc, #f1f5f9)" }}>
      <header style={{ maxWidth: 1024, margin: "0 auto", padding: "24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 16, background: "#0f172a", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold" }}>B</div>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 600 }}>{C.BANK_NAME}</h1>
            <p style={{ fontSize: 12, color: "#64748b" }}>WSO2 Banking Sample Demo</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {tokens ? (
            <Btn onClick={rpLogout}>
              <LogOut size={16} /> Sign out
            </Btn>
          ) : (
            // use arrow so no event object is passed as clientId
            <Btn primary onClick={() => startLogin()}>
              <LogIn size={16} /> Sign in with WSO2 IS
            </Btn>
          )}
        </div>
      </header>

      <main style={{ maxWidth: 1024, margin: "0 auto", padding: "0 24px 64px", display: "grid", gap: 24, gridTemplateColumns: "2fr 1fr" }}>
        <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
          <CardBox>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <h2 style={{ fontSize: 18, fontWeight: 600 }}>Accounts Overview</h2>
              <div style={{ display: "flex", gap: 8 }}>
                {tokens && (
                  <>
                    <Btn onClick={async () => {
                      try {
                        if (!tokens?.refresh_token) { setError("No refresh_token available"); return; }
                        const body = new URLSearchParams();
                        body.set("grant_type", "refresh_token");
                        body.set("client_id", tokens._client_id || C.CLIENT_ID);
                        body.set("refresh_token", tokens.refresh_token);
                        const res = await fetch(C.TOKEN_ENDPOINT, {
                          method: "POST",
                          headers: { "Content-Type": "application/x-www-form-urlencoded" },
                          body,
                        });
                        if (!res.ok) { setError(`Refresh failed (${res.status}).`); return; }
                        const json = await res.json();
                        setTokens(json);
                        saveSession("tokens", json);
                      } catch (e:any) {
                        setError(`Refresh error: ${e?.message || String(e)}`);
                      }
                    }}>
                      <RefreshCcw size={16} /> Refresh Token
                    </Btn>

                    {/* New: Fetch Recent Transactions button */}
                    <Btn onClick={fetchRecentTransactions}>
                      <RefreshCcw size={16} /> Fetch Recent Transactions
                    </Btn>


                  </>
                )}
              </div>
            </div>

            {!tokens ? (
              <div style={{ fontSize: 14, color: "#475569" }}>
                <p style={{ marginBottom: 8 }}>Sign in to fetch your OpenID profile and account data from APIM.</p>
              </div>
            ) : accounts === null ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#475569", fontSize: 14 }}>
                <Loader2 size={16} /> Loading accounts from API…
              </div>
            ) : (
              <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
                {accounts.map((acc) => {
                  const isRefreshing = refreshingAccounts.has(acc.name);
                  return (
                    <motion.div
                      key={acc.name}
                      animate={{ backgroundColor: isRefreshing ? "#e2e8f0" : "white" }}
                      transition={{ duration: 2, ease: "easeOut" }}
                      style={{ borderRadius: 16, border: "1px solid #e2e8f0", padding: 16 }}
                    >
                      <div style={{ fontSize: 12, color: "#64748b", textTransform: "uppercase" }}>{acc.name}</div>
                      <div style={{ fontSize: 22, fontWeight: 600, marginTop: 4 }}>
                        {acc.balance.toLocaleString(undefined,{style:'currency',currency:'USD'})}
                      </div>
                      <div style={{ marginTop: 12, fontSize: 12, color: "#94a3b8" }}>From API</div>
                    </motion.div>
                  );
                })}
              </div>
            )}
            {accounts !== null && accounts.length === 0 && (
              <div style={{ fontSize: 14, color: "#64748b", marginTop: 8 }}>No accounts.</div>
            )}

            {/* New: Transactions display (shown after fetch) */}
            {transactions !== null && (
              <div style={{ marginTop: 20 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", userSelect: "none" }} onClick={() => setTransactionsExpanded(!transactionsExpanded)}>
                  <h3 style={{ fontSize: 16, margin: 0 }}>Recent Transactions</h3>
                  <span style={{ fontSize: 20, color: "#64748b" }}>{transactionsExpanded ? "−" : "+"}</span>
                </div>

                {transactionsExpanded && (
                  <div style={{ marginTop: 12 }}>
                    {txLoading ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#475569", fontSize: 14 }}>
                        <Loader2 size={16} /> Loading transactions…
                      </div>
                    ) : transactions.length === 0 ? (
                      <div style={{ fontSize: 14, color: "#64748b" }}>No transactions.</div>
                    ) : (
                      <div style={{ display: "grid", gap: 12 }}>
                        {transactions.map((t, idx) => (
                          <div key={idx} style={{ borderRadius: 12, border: "1px solid #e2e8f0", padding: 12, background: "white", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                            <div style={{ display: "flex", flexDirection: "column" }}>
                              <div style={{ fontSize: 12, color: "#64748b" }}>{t.Date}</div>
                              <div style={{ fontSize: 14, fontWeight: 600 }}>{t.Description}</div>
                            </div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: t.Amount < 0 ? "#dc2626" : "#0f172a" }}>
                              {t.Amount.toLocaleString(undefined, { style: "currency", currency: "USD" })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </CardBox>
          <CardBox>
            {/* Complete Transaction (start login with CLIENT_ID2) */}
            <h2 style={{ fontSize: 18, fontWeight: 600 }}>Transfer US$50,000 from Savings to Checking</h2>
            {transactionSuccess && (
              <div style={{ padding: 12, marginBottom: 16, borderRadius: 8, background: "#dcfce7", border: "1px solid #86efac", color: "#166534" }}>
                ✓ Transaction completed successfully!
              </div>
            )}
            {!otpVisible ? (
              <Btn onClick={() => startEmailOtp(C.CLIENT_ID2)} disabled={otpRequesting}>
                <RefreshCcw size={16} /> {otpRequesting ? "Requesting…" : "Complete Transaction"}
              </Btn>
            ) : (
              <>
                <div style={{ marginBottom: 16, padding: 12, borderRadius: 8, background: "#fef3c7", border: "1px solid #fcd34d", color: "#92400e" }}>
                  📧 Check your email for the OTP code
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="text"
                    placeholder="Enter email OTP"
                    value={otpValue}
                    onChange={(e) => setOtpValue(e.target.value)}
                    style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #cbd5e1", minWidth: 200 }}
                    disabled={otpRequesting}
                  />
                  <Btn onClick={submitOtp} primary={false} disabled={otpRequesting}>
                    {otpRequesting ? "Submitting…" : "Submit OTP"}
                  </Btn>
                  <Btn onClick={() => { setOtpVisible(false); setOtpValue(""); setOtpError(null); }}>
                    Cancel
                  </Btn>
                  {otpError && <div style={{ color: "#dc2626", marginLeft: 8 }}>{otpError}</div>}
                </div>
              </>
            )}
          </CardBox>                    
        </motion.section>

        <motion.aside initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05, duration: 0.35 }}>
          <CardBox>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <ShieldCheck size={20} />
              <h3 style={{ fontWeight: 600 }}>OIDC Session</h3>
            </div>
            <ul style={{ fontSize: 12, color: "#475569", lineHeight: 1.8 }}>
              <li><code>authorize</code>: {C.AUTHORIZATION_ENDPOINT}</li>
              <li><code>token</code>: {C.TOKEN_ENDPOINT}</li>
              <li><code>userinfo</code>: {C.USERINFO_ENDPOINT}</li>
              <li><code>logout</code>: {C.ENDSESSION_ENDPOINT}</li>
            </ul>
            {error && <div style={{ marginTop: 12, color: "#dc2626", fontSize: 14 }}>{error}</div>}
          </CardBox>

          <CardBox>
            <h3 style={{ fontWeight: 600, marginBottom: 12 }}>User Profile</h3>
            {!tokens ? (
              <p style={{ fontSize: 14, color: "#475569" }}>No profile. Sign in to fetch claims via <code>/userinfo</code>.</p>
            ) : !userInfo ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#475569", fontSize: 14 }}>
                <Loader2 size={16} /> Loading profile…
              </div>
            ) : (
              <div style={{ fontSize: 14 }}>
                {Object.entries(userInfo).map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "6px 0", borderBottom: "1px solid #e2e8f0" }}>
                    <span style={{ color: "#64748b" }}>{k}</span>
                    <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", color: "#0f172a", maxWidth: "12rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={String(v)}>{String(v)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardBox>
        </motion.aside>
      </main>

      {/* Footer */}
      <footer style={{ textAlign: "center", fontSize: 12, color: "#94a3b8", padding: "24px" }}>
        Demo only: do not use as-is in production.
      </footer>

      {/* ===== Chat Panel Integration =====
          * Floating chat assistant positioned in bottom-right corner
          * Shows as minimized blue button (56x56px) until user clicks to expand
          * Only visible when user is authenticated (passes access_token)
          * Integrates with local chat API (http://localhost:3002/chat)
          * Uses OAuth bearer token for authentication to API
          * Features:
          *   - Local keyword analysis of user prompts
          *   - Automatic APIM MCP call for transaction data when needed
          *   - Real-time chat interface with message history
          *   - Error handling and loading states
      */}
      <div style={{
        position: "fixed",          // Fixed positioning relative to viewport
        bottom: "20px",             // 20px from bottom edge
        right: "20px",              // 20px from right edge
        zIndex: 1000,               // Above all other content
      }}>
        {/* ChatPanel Component - Only renders if user is logged in and has access_token */}
        <ChatPanel accessToken={tokens?.access_token || null} />
      </div>
    </div>
  );
}
