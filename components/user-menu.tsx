'use client'

import { useEffect, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { LogOut, User as UserIcon } from 'lucide-react'
import { getSession, logout } from '@/app/actions/auth'

interface SessionInfo {
  name: string
  role: string
}

export function UserMenu() {
  const [info, setInfo] = useState<SessionInfo | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    getSession().then(session => {
      if (session?.staff) {
        setInfo({ name: session.staff.name, role: session.staff.role })
      }
    })
  }, [])

  const handleLogout = () => {
    startTransition(async () => {
      await logout()
    })
  }

  // Capitalize role for display
  const roleLabel = info?.role
    ? info.role.charAt(0).toUpperCase() + info.role.slice(1)
    : ''

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2 h-8 px-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10">
            <UserIcon className="h-4 w-4 text-primary" />
          </div>
          <span className="hidden sm:inline text-sm font-medium">
            {info?.name ?? '...'}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col">
            <span className="font-medium">{info?.name ?? '...'}</span>
            {roleLabel && (
              <span className="text-xs text-muted-foreground">{roleLabel}</span>
            )}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleLogout}
          disabled={isPending}
          className="text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400"
        >
          <LogOut className="mr-2 h-4 w-4" />
          {isPending ? 'Cerrando...' : 'Cerrar sesión'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
