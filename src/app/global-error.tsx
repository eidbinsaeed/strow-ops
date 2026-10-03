"use client";

import { CrashScreen } from "@/components/CrashScreen";

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>
        <CrashScreen error={error} />
      </body>
    </html>
  );
}
