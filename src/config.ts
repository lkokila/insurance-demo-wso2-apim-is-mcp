/**
 * OIDC: WSO2 Identity Server
 * If your IS runs on 9443 (direct) instead of 9444, change the port numbers below.
 */
export const OIDC_CONFIG = {
  AUTHORIZATION_ENDPOINT: "https://localhost:9444/oauth2/authorize",
  TOKEN_ENDPOINT: "https://localhost:9444/oauth2/token",
  USERINFO_ENDPOINT: "https://localhost:9444/oauth2/userinfo",
  ENDSESSION_ENDPOINT: "https://localhost:9444/oidc/logout",
  CLIENT_ID: "AqB3RGyqMl0xW342z9laa1wy3YEa",
  CLIENT_ID2: "E0bqe3TldZqJ3befDzav0OQkPtIa",
  REDIRECT_URI: "http://localhost:5173",
  SCOPE: "openid profile email",
  INSURANCE_NAME: "Bitwave Insurance"
};

/**
 * APIM: Insurance API endpoints
 * with Authorization: Bearer <access_token>
 */
export const API_CONFIG = {
  GET_VEHICLES_URL: "https://localhost:8243/vehicles/1/getVehicles",
  ADD_VEHICLE_URL: "https://localhost:8243/vehicleapi/1.0.0/vehicles/add",
  GET_VEHICLE_DETAIL_URL: "https://localhost:8243/vehicleapi/1.0.0/vehicles/{id}",
  GET_QUOTE_URL: "https://localhost:8243/motorinsurancequoteapi/2/quote",
  BUY_INSURANCE_URL: "https://localhost:8243/motorinsurancepolicyapi/2/buy-insurance"
};
