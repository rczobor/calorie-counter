import { redirect } from "next/navigation";

export default function Home() {
  redirect("/cookings");
  return null;
}
