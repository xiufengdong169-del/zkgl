import type { SessionUser } from "@zkgl/shared";

export interface SensitiveGrantRow {
  fieldCode: string;
  accessLevel: string;
  explicitDeny: boolean | number;
}

export function resolveSensitiveFieldAccess(
  rows: SensitiveGrantRow[],
): Record<string, "FULL" | "MASKED" | "DENY"> {
  const grouped = new Map<string, SensitiveGrantRow[]>();
  for (const row of rows)
    grouped.set(row.fieldCode, [...(grouped.get(row.fieldCode) ?? []), row]);
  return Object.fromEntries(
    [...grouped].map(([field, grants]) => {
      if (grants.some((grant) => Boolean(grant.explicitDeny)))
        return [field, "DENY"];
      if (grants.some((grant) => grant.accessLevel === "FULL"))
        return [field, "FULL"];
      return [field, "MASKED"];
    }),
  );
}

export function maskBankAccount(value: unknown): string | null {
  if (value == null || value === "") return null;
  const text = String(value);
  return text.length <= 4
    ? "****"
    : `${"*".repeat(Math.min(12, text.length - 4))}${text.slice(-4)}`;
}

const bankFields = new Set([
  "bankAccount",
  "receivingAccount",
  "payerAccount",
  "payingAccount",
  "account",
  "buyerInformation",
]);
const profitFields = new Set([
  "profit",
  "estimatedProfit",
  "expectedProfit",
  "operatingProfit",
  "contractOperatingProfit",
  "cashContribution",
]);
const partnerSettlementFields = new Set([
  "ratio",
  "ratioSnapshot",
  "fixedAmount",
  "upperLimit",
  "lowerLimit",
  "netAmount",
  "netSettlementAmount",
  "grossSettlementAmount",
  "historicalSettledAmount",
  "deductionAmount",
  "settledAmount",
  "settlementAmount",
]);

function fieldClass(key: string): string | null {
  if (bankFields.has(key)) return "bank_account";
  if (profitFields.has(key)) return "profit";
  if (partnerSettlementFields.has(key)) return "partner_settlement";
  return null;
}

function protectValue(
  value: unknown,
  access: SessionUser["sensitiveFieldAccess"],
): unknown {
  if (Array.isArray(value))
    return value.map((item) => protectValue(item, access));
  if (!value || typeof value !== "object") return value;
  if (Object.prototype.toString.call(value) !== "[object Object]") return value;
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const category = fieldClass(key);
    if (!category) {
      output[key] = protectValue(item, access);
      continue;
    }
    const level = access[category] ?? "DENY";
    if (level === "DENY") continue;
    output[key] =
      level === "MASKED"
        ? category === "bank_account"
          ? maskBankAccount(item)
          : null
        : protectValue(item, access);
  }
  return output;
}

export function protectSensitiveResult(
  user: SessionUser,
  result: unknown,
): unknown {
  return protectValue(result, user.sensitiveFieldAccess);
}
