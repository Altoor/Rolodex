"use client";

import { AuthGate } from "../components/auth/auth-gate";
import { ApiPageContent } from "../components/api/api-page-content";

export default function ApiPage() {
  return (
    <AuthGate>
      <ApiPageContent />
    </AuthGate>
  );
}
