import { redirect } from "next/navigation"

// `/` is not a real page — it forwards to the primary analyze view.
export default function Home() {
  redirect("/analyze")
}
