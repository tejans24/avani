/**
 * Loosely-typed re-exports of the design-system components (.jsx, untyped).
 * Without this TS infers every destructured prop — including style/iconLeft —
 * as required. Platform code imports ds core components from here.
 */
import type { ComponentType } from "react";
import { Button as DsButton } from "@/ds/components/core/Button";
import { Badge as DsBadge } from "@/ds/components/core/Badge";
import { Card as DsCard } from "@/ds/components/core/Card";
import { Eyebrow as DsEyebrow } from "@/ds/components/core/Eyebrow";
import { Callout as DsCallout } from "@/ds/components/core/Callout";
import { Divider as DsDivider } from "@/ds/components/core/Divider";

type Loose = ComponentType<Record<string, unknown>>;

export const Button = DsButton as Loose;
export const Badge = DsBadge as Loose;
export const Card = DsCard as Loose;
export const Eyebrow = DsEyebrow as Loose;
export const Callout = DsCallout as Loose;
export const Divider = DsDivider as Loose;
