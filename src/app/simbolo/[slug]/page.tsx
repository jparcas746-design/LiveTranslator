import { redirect } from "next/navigation";

type RouteParams = {
  params: Promise<{ slug: string }>;
};

export default async function SimboloRedirectPage({ params }: RouteParams) {
  const { slug } = await params;
  redirect(`/symbols/${slug}`);
}
