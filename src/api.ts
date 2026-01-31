import { API_CONFIG } from "./config";

export interface Vehicle {
  vehicleId: string;
  make: string;
  model: string;
  registrationNumber: string;
  type: string;
  manufactureYear: number;
  estimatedValue: number;
  currency: string;
  insuranceStatus: {
    isInsured: boolean;
    policyId?: string;
    insuredUntil?: string;
  };
  actionsAvailable: {
    canGetQuote: boolean;
    canBuyInsurance: boolean;
    canViewPolicy: boolean;
  };
}

export interface Quote {
  id: string;
  vehicleId: string;
  premium: number;
  coverage: string;
  validUntil: string;
}

export interface InsurancePolicy {
  id: string;
  vehicleId: string;
  policyNumber: string;
  startDate: string;
  endDate: string;
  premium: number;
  status: "Active" | "Expired";
}

// Mock data for vehicles (fallback)
const mockVehicles: Vehicle[] = [
  {
    vehicleId: "VEH-001",
    make: "Toyota",
    model: "Corolla",
    registrationNumber: "WP-CA-4521",
    type: "CAR",
    manufactureYear: 2022,
    estimatedValue: 4500000,
    currency: "LKR",
    insuranceStatus: {
      isInsured: true,
      policyId: "POL-2025-000874",
      insuredUntil: "2025-12-31"
    },
    actionsAvailable: {
      canGetQuote: false,
      canBuyInsurance: false,
      canViewPolicy: true
    }
  },
  {
    vehicleId: "VEH-002",
    make: "Honda",
    model: "Civic",
    registrationNumber: "WP-CB-7834",
    type: "CAR",
    manufactureYear: 2021,
    estimatedValue: 3800000,
    currency: "LKR",
    insuranceStatus: {
      isInsured: true,
      policyId: "POL-2025-000874",
      insuredUntil: "2025-12-31"
    },
    actionsAvailable: {
      canGetQuote: false,
      canBuyInsurance: false,
      canViewPolicy: true
    }
  },
  {
    vehicleId: "VEH-003",
    make: "Toyota",
    model: "Hiace",
    registrationNumber: "WP-KA-9912",
    type: "VAN",
    manufactureYear: 2020,
    estimatedValue: 5200000,
    currency: "LKR",
    insuranceStatus: {
      isInsured: false
    },
    actionsAvailable: {
      canGetQuote: true,
      canBuyInsurance: false,
      canViewPolicy: false
    }
  }
];

export async function fetchVehicles(accessToken: string): Promise<Vehicle[]> {
  const res = await fetch(API_CONFIG.GET_VEHICLES_URL, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Accept": "application/json"
    }
  });

  if (res.status === 204) return mockVehicles;
  if (!res.ok) {
    // Return mock data as fallback
    return mockVehicles;
  }

  const data = await res.json().catch(() => null);
  if (!data) return mockVehicles;

  // Parse API response structure
  if (Array.isArray(data)) return data as Vehicle[];
  if (Array.isArray(data.vehicles)) return data.vehicles as Vehicle[];
  if (data?.list && Array.isArray(data.list)) return data.list as Vehicle[];

  return mockVehicles;
}

export async function addVehicle(
  accessToken: string,
  registrationNumber: string,
  vehicleType: string,
  year: number
): Promise<Vehicle> {
  const res = await fetch(API_CONFIG.ADD_VEHICLE_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Accept": "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      registrationNumber,
      vehicleType,
      year
    })
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to add vehicle: ${res.status} ${text}`);
  }

  const data = await res.json().catch(() => null);
  if (!data) throw new Error("Vehicle response was not JSON");

  return data as Vehicle;
}

export async function getQuote(
  accessToken: string,
  vehicleId: string
): Promise<Quote> {
  const url = new URL(API_CONFIG.GET_QUOTE_URL);
  url.searchParams.set("vehicleId", vehicleId);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Accept": "application/json"
    }
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to get quote: ${res.status} ${text}`);
  }

  const data = await res.json().catch(() => null);
  if (!data) throw new Error("Quote response was not JSON");

  return data as Quote;
}

export async function buyInsurance(
  accessToken: string,
  vehicleId: string,
  quoteId: string
): Promise<InsurancePolicy> {
  const url = new URL(API_CONFIG.BUY_INSURANCE_URL);
  url.searchParams.set("vehicleId", vehicleId);
  url.searchParams.set("quoteId", quoteId);

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Accept": "application/json"
    }
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to buy insurance: ${res.status} ${text}`);
  }

  const data = await res.json().catch(() => null);
  if (!data) throw new Error("Insurance response was not JSON");

  return data as InsurancePolicy;
}
