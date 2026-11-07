import { redirect } from "next/navigation";
import { hasAccess } from "@/lib/access";
import { currentUser } from "@/lib/auth";
import { PayForm } from "@/components/PayForm";

export default async function PayPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (hasAccess(user)) redirect("/");
  return <PayForm email={user.email} />;
}
