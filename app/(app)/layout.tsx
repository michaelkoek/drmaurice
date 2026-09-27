import { DataProvider } from "@/lib/data";
import { Toaster } from "@/components/ui";
import { AppHeader } from "@/components/AppHeader";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <DataProvider>
      <div className="mx-auto max-w-[1160px] px-4 pb-12 pt-[max(12px,env(safe-area-inset-top))]">
        <AppHeader />
        {children}
      </div>
      <Toaster />
    </DataProvider>
  );
}
