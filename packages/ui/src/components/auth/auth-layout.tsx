import { PageContainer } from "#components/layout/page-container";

export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <PageContainer className="max-w-xl">
      <div className="mx-auto flex w-full max-w-sm flex-col gap-6">
        {children}
      </div>
    </PageContainer>
  );
}
