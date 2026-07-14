import Decimal from "decimal.js";
import type { Scenario } from "../../domain/schema";
import { yearFraction } from "../dates";
export const fxRateAt = (pair: Scenario["fxPairs"][number], date: string) => new Decimal(pair.rateAtAnchor).mul(new Decimal(1).plus(pair.annualDrift).pow(yearFraction(pair.anchorDate, date)));
export const resolveFxRate = (scenario: Scenario, source: string, reporting: string, date: string) => { if (source === reporting) return { rate: new Decimal(1), pair: undefined }; const direct = scenario.fxPairs.find(p => p.base === source && p.quote === reporting); if (direct) return { rate: fxRateAt(direct, date), pair: `${source}/${reporting}` }; const inverse = scenario.fxPairs.find(p => p.base === reporting && p.quote === source); if (inverse) return { rate: new Decimal(1).div(fxRateAt(inverse, date)), pair: `${source}/${reporting}` }; return undefined; };
