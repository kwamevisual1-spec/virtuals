export type Plan = {
  code: string;
  /** predictions per day; null = unlimited (Elite) */
  dailyLimit: number | null;
  name: string;
  amount: string;
  totalPredictions: string;
  features: string[];
  badge?: string | null;
  highlight?: boolean;
  duration: string;
  buttonVariant: "outline" | "primary";
};

export const PLANS: Plan[] = [
  {
    code: "starter",
    dailyLimit: 2,
    name: "Starter",
    amount: "250.00",
    totalPredictions: "2 total predictions",
    duration: "30 days",
    buttonVariant: "outline",
    features: [
      "2 predictions/day",
      "Match screenshot analysis",
      "Basic virtual match cards",
      "Email support",
    ],
  },
  {
    code: "basic",
    dailyLimit: 4,
    name: "Basic",
    amount: "500.00",
    totalPredictions: "4 total predictions",
    duration: "30 days",
    buttonVariant: "outline",
    features: [
      "4 predictions/day",
      "Match screenshot analysis",
      "Basic virtual match cards",
      "Email support",
      "Priority email support",
    ],
  },
  {
    code: "standard",
    dailyLimit: 10,
    name: "Standard",
    amount: "1000.00",
    totalPredictions: "10 total predictions",
    duration: "30 days",
    buttonVariant: "primary",
    badge: "POPULAR",
    highlight: true,
    features: [
      "10 predictions/day",
      "Advanced screenshot analysis",
      "Full virtual match cards",
      "30-day prediction history",
      "Priority support",
      "Standard badge",
    ],
  },
  {
    code: "pro",
    dailyLimit: 20,
    name: "Pro",
    amount: "2000.00",
    totalPredictions: "20 total predictions",
    duration: "30 days",
    buttonVariant: "primary",
    badge: "BEST VALUE",
    features: [
      "20 predictions/day",
      "Advanced screenshot analysis",
      "Premium match cards",
      "Full history",
      "Priority AI processing",
      "Pro badge",
      "Early access features",
    ],
  },
  {
    code: "elite",
    dailyLimit: 50,
    name: "Elite",
    amount: "5000.00",
    totalPredictions: "50 total predictions",
    duration: "30 days",
    buttonVariant: "primary",
    badge: "ELITE",
    features: [
      "Unlimited predictions",
      "Elite AI analysis",
      "Exclusive match cards",
      "Full history",
      "Dedicated AI processing",
      "Elite badge",
      "Early access",
      "VIP 24/7 support",
    ],
  },
];

export function getPlan(code: string | null | undefined): Plan | undefined {
  if (!code) return undefined;
  return PLANS.find((p) => p.code === code);
}

export const REGISTRATION_FEE = "50.00";
export const RECIPIENT = {
  network: "TELECEL NETWORK",
  number: "0506805681",
  name: "Richard Alorzuke",
};
