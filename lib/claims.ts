import type { ClaimType } from "./types";

/** Maps PayPal's dispute reason code to the claim types the scorer understands. Rules, not AI. */
export function claimTypeForReason(reason: string): ClaimType {
  switch (reason) {
    case "MERCHANDISE_OR_SERVICE_NOT_RECEIVED":
      return "INR";
    case "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED":
      return "SNAD";
    case "UNAUTHORISED":
    case "UNAUTHORIZED":
      return "UNAUTHORIZED";
    default:
      return "OTHER";
  }
}

export const CLAIM_LABEL: Record<ClaimType, string> = {
  INR: "Item not received",
  SNAD: "Not as described",
  UNAUTHORIZED: "Unauthorized payment",
  OTHER: "Other",
};

/** "Lena Müller" -> "Lena M." Keeps buyer names short everywhere, including AI prompts. */
export function shortName(full: string | undefined | null): string {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

/** "lena.mueller@example.com" -> "l***@example.com" */
export function maskEmail(email: string | undefined | null): string {
  if (!email || !email.includes("@")) return "";
  const [user, domain] = email.split("@");
  return `${user[0]}***@${domain}`;
}

const COUNTRY: Record<string, string> = { DE: "Germany", GB: "United Kingdom", US: "United States", IN: "India" };
export const countryName = (code: string) => COUNTRY[code] ?? code;
/** For use after "in": "in the United States", "in Germany". */
export const inCountry = (code: string) => (code === "GB" || code === "US" ? `the ${countryName(code)}` : countryName(code));

/** "2026-11-04" or an ISO timestamp -> "4 Nov 2026" */
export function formatDate(isoDate: string): string {
  const d = new Date(isoDate.length === 10 ? `${isoDate}T12:00:00Z` : isoDate);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
