"use client"

import { useState } from "react"
import Link from "next/link"
import { CaretDown, GearSix, SignOut, UserCircle } from "@phosphor-icons/react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { RESULT_STORAGE_KEY } from "@/hooks/useAnalysis"
import { logout } from "@/lib/api"
import type { AuthUser } from "@/lib/types"

export function UserMenu({ user }: { user: AuthUser }) {
  const [signingOut, setSigningOut] = useState(false)

  const onSignOut = async () => {
    setSigningOut(true)
    try {
      await logout()
    } catch {
      /* clear locally regardless — the cookie may already be gone */
    }
    try {
      sessionStorage.removeItem(RESULT_STORAGE_KEY) // per-user cache
    } catch {
      /* ignore */
    }
    window.location.replace("/login")
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <UserCircle size={18} className="text-primary" weight="duotone" />
        <span className="max-w-[12ch] truncate">{user.displayName}</span>
        <CaretDown size={12} weight="bold" className="text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <GearSix weight="duotone" /> Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={signingOut}
          onSelect={(e) => {
            e.preventDefault()
            void onSignOut()
          }}
        >
          <SignOut weight="duotone" /> {signingOut ? "Signing out..." : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
