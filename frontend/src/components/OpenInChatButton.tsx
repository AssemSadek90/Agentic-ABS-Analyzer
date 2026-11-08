"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ChatCircle } from "@phosphor-icons/react"

import { Button } from "@/components/ui/button"
import { AuthError, createConversation } from "@/lib/api"

// Creates a new conversation with this run pre-attached, then opens it.
export function OpenInChatButton({ runId }: { runId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  const open = async () => {
    setBusy(true)
    try {
      const conv = await createConversation({ attachedRunId: runId })
      router.push(`/chat/${conv.id}`)
    } catch (err) {
      if (err instanceof AuthError) {
        window.location.assign("/login")
        return
      }
      setBusy(false)
    }
  }

  return (
    <Button variant="outline" size="sm" type="button" disabled={busy} onClick={() => void open()}>
      <ChatCircle weight="duotone" /> {busy ? "Opening..." : "Open in chat"}
    </Button>
  )
}
