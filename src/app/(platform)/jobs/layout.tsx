import { Suspense } from "react";
import { JobsTabs } from "@/components/platform/jobs/JobsNav";

export default function JobsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Suspense>
        <JobsTabs />
      </Suspense>
      {children}
    </>
  );
}
