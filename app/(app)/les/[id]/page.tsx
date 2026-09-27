import { Study } from "@/components/Study";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Study lessonId={id} />;
}
