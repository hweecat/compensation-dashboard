import Decimal from "decimal.js";
import type { z } from "zod";
import type { AssetSchema } from "../../domain/schema";
import { yearFraction } from "../dates";
type Asset = z.infer<typeof AssetSchema>;
export const equityPriceAt = (asset: Asset, date: string) => new Decimal(asset.priceAtAnchor).mul(new Decimal(1).plus(asset.annualGrowth).pow(yearFraction(asset.anchorDate, date)));
