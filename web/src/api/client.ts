// web/src/api/client.ts
import type { RecalcReq, RecalcRes, GenerateReq, GenerateRes, AdaptReq, AdaptRes } from "../types";

async function postJSON<T>(path: string, body: any): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`HTTP ${res.status}: ${txt}`);
  }
  return res.json() as Promise<T>;
}

export const API = {
  recalc:   (b: RecalcReq)   => postJSON<RecalcRes>("/api/recalculateIndexes", b),
  generate: (b: GenerateReq) => postJSON<GenerateRes>("/api/generatePlan", b),
  adapt:    (b: AdaptReq)    => postJSON<AdaptRes>("/api/adaptPlan", b),
};
