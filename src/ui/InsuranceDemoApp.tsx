/**
 * InsuranceOIDCDemoApp - Main React component for insurance OIDC demo
 *
 * This component demonstrates:
 * - OIDC/PKCE authentication flow with WSO2 Identity Server
 * - OAuth2 token management and refresh
 * - Vehicle management and insurance quote retrieval
 * - Email OTP authentication for insurance purchase
 * - Motor insurance policy management
 *
 * The component manages multiple auth flows:
 * 1. Standard PKCE authorization code flow
 * 2. Email OTP flow for insurance purchase authorization
 * 3. Token refresh mechanism
 */

import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, LogIn, LogOut, ShieldCheck, Plus, FileText } from "lucide-react";
import { OIDC_CONFIG as C, API_CONFIG } from "../config";
import { fetchVehicles, addVehicle, getQuote, Vehicle, Quote } from "../api";
import { ChatPanel } from "./ChatPanel";

/**
 * PKCE Helper Functions
 */

function base64UrlEncode(arrayBuffer: ArrayBuffer) {
  const uint8Array = new Uint8Array(arrayBuffer);
  let base64 = btoa(String.fromCharCode(...uint8Array));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256(buffer: string) {
  const data = new TextEncoder().encode(buffer);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(digest);
}

function randomString(length = 43) {
  const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  let result = "";
  const values = crypto.getRandomValues(new Uint8Array(length));
  for (let i = 0; i < length; i++) result += charset[values[i] % charset.length];
  return result;
}

/**
 * Session Storage Helpers
 */

function saveSession(key: string, value: any) { try { sessionStorage.setItem(key, JSON.stringify(value)); } catch {} }

function loadSession(key: string, fallback: any = null) {
  try { const v = sessionStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}

/**
 * Main App Component
 */
export default function InsuranceOIDCDemoApp() {
  // ===== Authentication State =====
  const [error, setError] = useState("");
  const [tokens, setTokens] = useState<any>(() => loadSession("tokens"));
  const [userInfo, setUserInfo] = useState<any>(null);
  const exchangingRef = useRef(false);

  // ===== Vehicle Management State =====
  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [newVehicleForm, setNewVehicleForm] = useState({ registrationNumber: "", vehicleType: "Sedan", year: new Date().getFullYear() });

  // ===== Quote & Purchase State =====
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [addVehicleLoading, setAddVehicleLoading] = useState(false);

  // ===== Email OTP Flow State =====
  const [otpVisible, setOtpVisible] = useState(false);
  const [otpValue, setOtpValue] = useState("");
  const [otpRequesting, setOtpRequesting] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpResponse, setOtpResponse] = useState<any>(null);
  const [purchaseSuccess, setPurchaseSuccess] = useState(false);

  // Fetch userinfo + vehicles when tokens available
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
        const list = await fetchVehicles(tokens.access_token);
        setVehicles(list);
      } catch (e: any) {
        setError(`Vehicles fetch failed: ${e?.message || String(e)}`);
      }
    })();
  }, [tokens]);

  async function startLogin(clientId?: string) {
    if (clientId && typeof clientId !== "string") {
      clientId = undefined;
    }

    setError("");
    const codeVerifier = randomString(64);
    const codeChallenge = await sha256(codeVerifier);
    const state = randomString(24);
    saveSession("pkce_state", state);
    saveSession(`pkce_verifier:${state}`, codeVerifier);
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
    const usedClient = clientId || C.CLIENT_ID2;
    const currentTokens = tokens || loadSession("tokens");

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

    let username: string | undefined;
    const idToken = currentTokens?.id_token;
    const payload = parseJwt(idToken);
    if (payload && typeof payload === "object") {
      if (payload.username) {
        username = String(payload.username);
      }
    }

    const url = `${C.AUTHORIZATION_ENDPOINT}/`;
    const params = new URLSearchParams({
      client_id: usedClient,
      response_type: "code",
      redirect_uri: C.REDIRECT_URI,
      state: "logpg",
      scope: "openid internal_login profile",
      response_mode: "direct"
    });

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

  async function startEmailOtp(clientId?: string) {
    setOtpError(null);
    setOtpResponse(null);
    setOtpRequesting(true);
    try {
      const res = await emailOtpFlow(clientId);

      const flowId =
        res?.flowId ||
        res?.flowID ||
        res?.sessionDataKey ||
        res?.sessionDataKeyConsent ||
        res?.sessionState ||
        null;

      const authenticatorId =
        res?.nextStep?.authenticators?.[0]?.authenticatorId ||
        res?.authenticatorId ||
        res?.authenticators?.[0]?.authenticatorId ||
        res?.authenticators?.[0]?.id ||
        res?.authenticate?.authenticators?.[0]?.id ||
        res?.stepInfo?.options?.[0]?.authenticatorId ||
        res?.stepInfo?.options?.[0]?.id ||
        null;

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

  async function submitOtp() {
    setOtpError(null);
    if (!otpValue) { setOtpError("Enter OTP"); return; }
    if (!otpResponse) { setOtpError("Missing authorize response (no flow data)"); return; }

    const flowId =
      otpResponse.flowId ||
      otpResponse.flowID ||
      otpResponse.sessionDataKey ||
      otpResponse.sessionDataKeyConsent ||
      otpResponse.sessionState ||
      null;

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

      setOtpResponse(json);

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

          try { (tokenJson as any)._client_id = C.CLIENT_ID2; } catch {}
          setTokens(tokenJson);
          saveSession("tokens", tokenJson);
        } catch (e:any) {
          throw new Error(`Post-OTP token exchange error: ${e?.message || String(e)}`);
        }
      }

      setOtpVisible(false);
      setOtpValue("");

      // Call buy insurance API
      const bearerToken =
        tokens.access_token ||
        tokens.accessToken ||
        tokens.token ||
        tokens.id_token ||
        (typeof tokens === "string" ? tokens : null);

      if (!bearerToken) {
        setError("Missing bearer token in stored tokens.");
        return;
      }

      if (!selectedVehicle || !quote) {
        setError("Missing vehicle or quote information");
        return;
      }

      const res1 = await fetch(`${API_CONFIG.BUY_INSURANCE_URL}?vehicleId=${selectedVehicle.vehicleId}&quoteId=${quote.id}`, {
        method: "POST",
        headers: {
          Accept: "*/*",
          Authorization: `Bearer ${bearerToken}`,
        },
      });

      if (!res1.ok) {
        const txt = await res1.text().catch(() => "");
        throw new Error(`Insurance purchase failed (${res1.status}). ${txt}`);
      }

      const policyResponse = await res1.json().catch(() => null);
      if (!policyResponse) {
        throw new Error("Policy response was not JSON");
      }

      console.log("Policy Response:", policyResponse);

      // Update the selected vehicle with new insurance status
      const updatedVehicle: Vehicle = {
        ...selectedVehicle,
        insuranceStatus: {
          isInsured: true,
          policyId: policyResponse.policyNumber || policyResponse.id,
          insuredUntil: policyResponse.endDate
        },
        actionsAvailable: {
          ...selectedVehicle.actionsAvailable,
          canGetQuote: false,
          canViewPolicy: true
        }
      };

      console.log("Updated Vehicle:", updatedVehicle);

      // Update vehicles list with the newly insured vehicle
      const updatedVehicles = (vehicles || []).map(v =>
        v.vehicleId === selectedVehicle.vehicleId ? updatedVehicle : v
      );

      console.log("Updated Vehicles List:", updatedVehicles);

      setVehicles(updatedVehicles);
      setSelectedVehicle(updatedVehicle);
      setPurchaseSuccess(true);
      setQuote(null);
      setOtpVisible(false);
      setOtpValue("");

      console.log("Insurance purchase completed successfully");

      setTimeout(() => setPurchaseSuccess(false), 3000);

    } catch (e:any) {
      setOtpError(e?.message || String(e));
    } finally {
      setOtpRequesting(false);
    }
  }

  // Single-invoke code consumption
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
      try { (json as any)._client_id = clientIdUsed; } catch {}
      setTokens(json);
      saveSession("tokens", json);
      if (state) { try { sessionStorage.removeItem(`pkce_verifier:${state}`); sessionStorage.removeItem(`pkce_client:${state}`); } catch {} }
    } catch (e: any) {
      setError(`Token exchange error: ${e?.message || String(e)}`);
    }
  }

  async function handleAddVehicle() {
    if (!newVehicleForm.registrationNumber) {
      setError("Please enter registration number");
      return;
    }

    setAddVehicleLoading(true);
    setError("");
    try {
      const bearerToken =
        tokens.access_token ||
        tokens.accessToken ||
        tokens.token ||
        tokens.id_token ||
        (typeof tokens === "string" ? tokens : null);

      if (!bearerToken) {
        setError("Missing bearer token");
        setAddVehicleLoading(false);
        return;
      }

      const newVehicle = await addVehicle(
        bearerToken,
        newVehicleForm.registrationNumber,
        newVehicleForm.vehicleType,
        newVehicleForm.year
      );

      setVehicles([...(vehicles || []), newVehicle]);
      setNewVehicleForm({ registrationNumber: "", vehicleType: "Sedan", year: new Date().getFullYear() });
      setShowAddVehicle(false);
    } catch (e: any) {
      setError(`Failed to add vehicle: ${e?.message || String(e)}`);
    } finally {
      setAddVehicleLoading(false);
    }
  }

  async function handleGetQuote(vehicle: Vehicle) {
    if (vehicle.insuranceStatus.isInsured) {
      setError("This vehicle already has active insurance");
      return;
    }

    setQuoteLoading(true);
    setError("");
    try {
      const bearerToken =
        tokens.access_token ||
        tokens.accessToken ||
        tokens.token ||
        tokens.id_token ||
        (typeof tokens === "string" ? tokens : null);

      if (!bearerToken) {
        setError("Missing bearer token");
        setQuoteLoading(false);
        return;
      }

      const quoteData = await getQuote(bearerToken, vehicle.vehicleId);
      setQuote(quoteData);
    } catch (e: any) {
      setError(`Failed to get quote: ${e?.message || String(e)}`);
    } finally {
      setQuoteLoading(false);
    }
  }

  function clearSession() {
    setTokens(null);
    setUserInfo(null);
    setVehicles(null);
    setSelectedVehicle(null);
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
        cursor: "pointer",
        ...props.style
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
            <h1 style={{ fontSize: 18, fontWeight: 600 }}>{C.INSURANCE_NAME}</h1>
            <p style={{ fontSize: 12, color: "#64748b" }}>Motor Insurance Demo</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {tokens ? (
            <Btn onClick={rpLogout}>
              <LogOut size={16} /> Sign out
            </Btn>
          ) : (
            <Btn primary onClick={() => startLogin()}>
              <LogIn size={16} /> Sign in with WSO2 IS
            </Btn>
          )}
        </div>
      </header>

      <main style={{ maxWidth: 1024, margin: "0 auto", padding: "0 24px 64px", display: "grid", gap: 24, gridTemplateColumns: "2fr 1fr" }}>
        <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
          {/* Vehicles List */}
          <CardBox>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <h2 style={{ fontSize: 18, fontWeight: 600 }}>My Vehicles</h2>
              <Btn onClick={() => setShowAddVehicle(!showAddVehicle)} primary={showAddVehicle}>
                <Plus size={16} /> Add Vehicle
              </Btn>
            </div>

            {!tokens ? (
              <div style={{ fontSize: 14, color: "#475569" }}>
                <p style={{ marginBottom: 8 }}>Sign in to view and manage your vehicles.</p>
              </div>
            ) : vehicles === null ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#475569", fontSize: 14 }}>
                <Loader2 size={16} /> Loading vehicles…
              </div>
            ) : (
              <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
                {vehicles.map((vehicle) => (
                  <motion.div
                    key={vehicle.vehicleId}
                    onClick={() => setSelectedVehicle(selectedVehicle?.vehicleId === vehicle.vehicleId ? null : vehicle)}
                    style={{
                      borderRadius: 12,
                      border: selectedVehicle?.vehicleId === vehicle.vehicleId ? "2px solid #0f172a" : "1px solid #e2e8f0",
                      padding: 16,
                      cursor: "pointer",
                      background: selectedVehicle?.vehicleId === vehicle.vehicleId ? "#f8fafc" : "white",
                      transition: "all 0.2s"
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 12 }}>
                      <div>
                        <div style={{ fontSize: 16, fontWeight: 600 }}>{vehicle.make} {vehicle.model}</div>
                        <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                          {vehicle.type} • {vehicle.manufactureYear}
                        </div>
                      </div>
                      <div style={{
                        padding: "4px 12px",
                        borderRadius: 8,
                        background: vehicle.insuranceStatus.isInsured ? "#dcfce7" : "#fef3c7",
                        color: vehicle.insuranceStatus.isInsured ? "#166534" : "#92400e",
                        fontSize: 11,
                        fontWeight: 600,
                        whiteSpace: "nowrap"
                      }}>
                        {vehicle.insuranceStatus.isInsured ? "✓ Insured" : "Not insured"}
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: "#64748b", marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid #e2e8f0" }}>
                      <div>Reg: {vehicle.registrationNumber}</div>
                      <div>Value: {vehicle.estimatedValue.toLocaleString()} {vehicle.currency}</div>
                    </div>
                    {vehicle.insuranceStatus.isInsured && (
                      <div style={{ fontSize: 11, color: "#64748b", marginBottom: 8 }}>
                        Policy: {vehicle.insuranceStatus.policyId}
                        <br />
                        Until: {vehicle.insuranceStatus.insuredUntil}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {vehicle.insuranceStatus.isInsured ? (
                        <span style={{ fontSize: 11, padding: "4px 8px", background: "#f3e8ff", color: "#7e22ce", borderRadius: 6 }}>
                          View Policy
                        </span>
                      ) : (
                        vehicle.actionsAvailable.canGetQuote && (
                          <span style={{ fontSize: 11, padding: "4px 8px", background: "#dbeafe", color: "#1e40af", borderRadius: 6 }}>
                            Get Quote Available
                          </span>
                        )
                      )}
                      {vehicle.actionsAvailable.canBuyInsurance && (
                        <span style={{ fontSize: 11, padding: "4px 8px", background: "#dcfce7", color: "#166534", borderRadius: 6 }}>
                          Buy Insurance
                        </span>
                      )}
                    </div>
                  </motion.div>
                ))}
                {vehicles.length === 0 && (
                  <div style={{ fontSize: 14, color: "#64748b", textAlign: "center", padding: "20px", gridColumn: "1/-1" }}>
                    No vehicles added yet. Click "Add Vehicle" to get started.
                  </div>
                )}
              </div>
            )}
          </CardBox>

          {/* Add Vehicle Form */}
          {showAddVehicle && (
            <CardBox>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Add New Vehicle</h3>
              <div style={{ display: "grid", gap: 12 }}>
                <input
                  type="text"
                  placeholder="Registration Number"
                  value={newVehicleForm.registrationNumber}
                  onChange={(e) => setNewVehicleForm({ ...newVehicleForm, registrationNumber: e.target.value })}
                  style={{ padding: "10px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 14 }}
                />
                <select
                  value={newVehicleForm.vehicleType}
                  onChange={(e) => setNewVehicleForm({ ...newVehicleForm, vehicleType: e.target.value })}
                  style={{ padding: "10px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 14 }}
                >
                  <option>Sedan</option>
                  <option>SUV</option>
                  <option>Truck</option>
                  <option>Motorcycle</option>
                  <option>Other</option>
                </select>
                <input
                  type="number"
                  placeholder="Year"
                  value={newVehicleForm.year}
                  onChange={(e) => setNewVehicleForm({ ...newVehicleForm, year: parseInt(e.target.value) })}
                  style={{ padding: "10px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 14 }}
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <Btn primary onClick={handleAddVehicle} disabled={addVehicleLoading}>
                    {addVehicleLoading ? "Adding..." : "Add Vehicle"}
                  </Btn>
                  <Btn onClick={() => setShowAddVehicle(false)}>Cancel</Btn>
                </div>
              </div>
            </CardBox>
          )}

          {/* Vehicle Details & Quote */}
          {selectedVehicle && !quote && (
            <CardBox>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
                {selectedVehicle.make} {selectedVehicle.model} - Details
              </h3>
              <div style={{ display: "grid", gap: 8, marginBottom: 16, fontSize: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #e2e8f0" }}>
                  <span style={{ color: "#64748b" }}>Registration:</span>
                  <span>{selectedVehicle.registrationNumber}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #e2e8f0" }}>
                  <span style={{ color: "#64748b" }}>Type:</span>
                  <span>{selectedVehicle.type}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #e2e8f0" }}>
                  <span style={{ color: "#64748b" }}>Year:</span>
                  <span>{selectedVehicle.manufactureYear}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #e2e8f0" }}>
                  <span style={{ color: "#64748b" }}>Estimated Value:</span>
                  <span>{selectedVehicle.estimatedValue.toLocaleString()} {selectedVehicle.currency}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0" }}>
                  <span style={{ color: "#64748b" }}>Status:</span>
                  <span style={{ fontWeight: 600, color: selectedVehicle.insuranceStatus.isInsured ? "#16a34a" : "#dc2626" }}>
                    {selectedVehicle.insuranceStatus.isInsured ? "✓ Insured" : "Not insured"}
                  </span>
                </div>
              </div>

              {/* Show policy details if insured */}
              {selectedVehicle.insuranceStatus.isInsured && selectedVehicle.insuranceStatus.policyId && (
                <div style={{ padding: 12, marginBottom: 16, background: "#f0fdf4", borderRadius: 8, border: "1px solid #dcfce7" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#166534", marginBottom: 8 }}>Active Policy</div>
                  <div style={{ display: "grid", gap: 6, fontSize: 12, color: "#166534" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Policy ID:</span>
                      <span style={{ fontFamily: "ui-monospace" }}>{selectedVehicle.insuranceStatus.policyId}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Valid Until:</span>
                      <span>{selectedVehicle.insuranceStatus.insuredUntil}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Show Get Quote button only if not insured and action is available */}
              {!selectedVehicle.insuranceStatus.isInsured && selectedVehicle.actionsAvailable.canGetQuote && (
                <Btn primary onClick={() => handleGetQuote(selectedVehicle)} disabled={quoteLoading}>
                  {quoteLoading ? <Loader2 size={16} /> : <FileText size={16} />}
                  {quoteLoading ? "Getting quote..." : "Get Quote"}
                </Btn>
              )}
            </CardBox>
          )}

          {/* Quote Display & Purchase */}
          {selectedVehicle && quote && (
            <CardBox>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Insurance Quote</h3>
              <div style={{ display: "grid", gap: 12, marginBottom: 16, padding: 12, background: "#f8fafc", borderRadius: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#64748b" }}>Vehicle:</span>
                  <span style={{ fontWeight: 600 }}>{selectedVehicle.make} {selectedVehicle.model}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#64748b" }}>Coverage:</span>
                  <span style={{ fontWeight: 600 }}>{quote.coverage}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8, borderTop: "1px solid #e2e8f0" }}>
                  <span style={{ color: "#64748b", fontWeight: 600 }}>Premium:</span>
                  <span style={{ fontSize: 18, fontWeight: 700, color: "#0f172a" }}>
                    ${quote.premium.toLocaleString()}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: "#64748b" }}>Valid until: {quote.validUntil}</div>
              </div>
              {purchaseSuccess && (
                <div style={{ padding: 12, marginBottom: 16, borderRadius: 8, background: "#dcfce7", border: "1px solid #86efac", color: "#166534" }}>
                  ✓ Insurance purchased successfully!
                </div>
              )}
              {!otpVisible ? (
                <Btn primary onClick={() => startEmailOtp(C.CLIENT_ID2)} disabled={otpRequesting}>
                  {otpRequesting ? <Loader2 size={16} /> : <ShieldCheck size={16} />}
                  {otpRequesting ? "Requesting..." : "Buy Insurance"}
                </Btn>
              ) : (
                <>
                  <div style={{ marginBottom: 16, padding: 12, borderRadius: 8, background: "#fef3c7", border: "1px solid #fcd34d", color: "#92400e" }}>
                    📧 Check your email for the OTP code to complete your purchase
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
                      {otpRequesting ? "Submitting..." : "Submit OTP"}
                    </Btn>
                    <Btn onClick={() => { setOtpVisible(false); setOtpValue(""); setOtpError(null); }}>
                      Cancel
                    </Btn>
                  </div>
                  {otpError && <div style={{ color: "#dc2626", marginTop: 8, fontSize: 14 }}>{otpError}</div>}
                </>
              )}
            </CardBox>
          )}
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

      <footer style={{ textAlign: "center", fontSize: 12, color: "#94a3b8", padding: "24px" }}>
        Demo only: do not use as-is in production.
      </footer>

      <div style={{
        position: "fixed",
        bottom: "20px",
        right: "20px",
        zIndex: 1000,
      }}>
        <ChatPanel accessToken={tokens?.access_token || null} />
      </div>
    </div>
  );
}
