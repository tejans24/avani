import { ashby } from "./ashby";
import { greenhouse } from "./greenhouse";
import { lever } from "./lever";
import { smartrecruiters } from "./smartrecruiters";
import type { SourceName, SourcePlugin } from "./types";
import { usajobs } from "./usajobs";
import { workday } from "./workday";

/**
 * Source registry: the one place a new plugin is wired in. Adding a source =
 * write the plugin, add it here, add its name to the JobSource enum.
 */
export const SOURCES: Record<SourceName, SourcePlugin> = {
  GREENHOUSE: greenhouse,
  LEVER: lever,
  ASHBY: ashby,
  SMARTRECRUITERS: smartrecruiters,
  WORKDAY: workday,
  USAJOBS: usajobs,
};

export function pluginFor(source: string): SourcePlugin | null {
  return (SOURCES as Record<string, SourcePlugin>)[source] ?? null;
}
