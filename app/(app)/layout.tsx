import { redirect } from "next/navigation";
import { DataProvider } from "@/lib/data";
import { Toaster } from "@/components/ui";
import { AppHeader } from "@/components/AppHeader";
import { hasAccess } from "@/lib/access";
import { currentUser } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // browser tests run without a database or auth (same guard as proxy.ts)
  if (!(process.env.NEXT_PUBLIC_E2E === "1" && process.env.VERCEL !== "1")) {
    const user = await currentUser();
    if (!user) redirect("/login");
    if (!hasAccess(user)) redirect("/betalen");
  }
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
