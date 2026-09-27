import { UploadLesson } from "@/components/UploadLesson";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <UploadLesson examId={id} />;
}
