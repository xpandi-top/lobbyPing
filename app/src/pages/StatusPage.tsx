import { useEffect, useState, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { CheckCircle2, Clock, BellRing, Package, Utensils, Users, HelpCircle, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { subscribeArrival, sendReminder, getRoom } from '@/lib/firestore'
import type { Arrival, ResidentResponse, ArrivalType } from '@/lib/types'

const MAX_REMINDERS = 3
const REMINDER_COOLDOWN_MS = 30_000

const TYPE_LABELS: Record<ArrivalType, string> = {
  package: 'Package',
  food: 'Food Delivery',
  guest: 'Guest',
  other: 'Other',
}

const TYPE_ICONS: Record<ArrivalType, React.FC<{ className?: string }>> = {
  package: Package,
  food: Utensils,
  guest: Users,
  other: HelpCircle,
}

const RESPONSE_MESSAGES: Record<ResidentResponse, { title: string; body: string; color: string }> = {
  coming_down: {
    title: 'Resident is coming down',
    body: 'Please wait a moment.',
    color: 'text-green-600',
  },
  leave_in_lobby: {
    title: 'Please leave item in lobby',
    body: 'The resident has been notified.',
    color: 'text-blue-600',
  },
  no_need_to_wait: {
    title: 'No need to wait',
    body: 'You are free to go.',
    color: 'text-muted-foreground',
  },
}

export default function StatusPage() {
  const [searchParams] = useSearchParams()
  const buildingId = searchParams.get('b') ?? ''
  const roomId = searchParams.get('r') ?? ''
  const arrivalId = searchParams.get('a') ?? ''

  const [arrival, setArrival] = useState<Arrival | null | undefined>(undefined)
  const [instructions, setInstructions] = useState<{ package: string; food: string; guest: string } | null>(null)
  const [reminderCooldown, setReminderCooldown] = useState(0)
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!buildingId || !roomId || !arrivalId) return
    const unsub = subscribeArrival(buildingId, roomId, arrivalId, setArrival)
    return unsub
  }, [buildingId, roomId, arrivalId])

  useEffect(() => {
    if (!buildingId || !roomId) return
    getRoom(buildingId, roomId).then((room) => {
      if (room) setInstructions(room.instructions)
    })
  }, [buildingId, roomId])

  function startCooldown() {
    setReminderCooldown(REMINDER_COOLDOWN_MS / 1000)
    cooldownRef.current = setInterval(() => {
      setReminderCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(cooldownRef.current!)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  async function handleReminder() {
    if (!arrival || arrival.reminderCount >= MAX_REMINDERS || reminderCooldown > 0) return
    await sendReminder(buildingId, roomId, arrivalId, arrival.reminderCount)
    toast.success('Reminder sent')
    startCooldown()
  }

  if (arrival === undefined) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-4">
        <div className="w-full max-w-md space-y-4">
          <Skeleton className="h-48 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
        </div>
      </div>
    )
  }

  if (arrival === null) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-4">
        <div className="w-full max-w-md text-center space-y-3">
          <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground" />
          <h2 className="text-xl font-semibold">Notification expired</h2>
          <p className="text-muted-foreground text-sm">This notification is no longer active.</p>
        </div>
      </div>
    )
  }

  const TypeIcon = TYPE_ICONS[arrival.type]
  const isExpired = arrival.status === 'expired' || arrival.expiresAt.toMillis() < Date.now()
  const hasResponse = arrival.status === 'responded' && arrival.response

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-4">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold">Room {arrival.roomNumber}</h1>
          <div className="flex items-center justify-center gap-2 text-muted-foreground text-sm">
            <TypeIcon className="h-4 w-4" />
            <span>{TYPE_LABELS[arrival.type]}</span>
          </div>
        </div>

        {/* Response card */}
        <Card>
          <CardContent className="pt-6">
            {hasResponse ? (
              <div className="text-center space-y-3">
                <CheckCircle2 className="h-12 w-12 mx-auto text-green-500" />
                <div>
                  <p className={`text-lg font-semibold ${RESPONSE_MESSAGES[arrival.response!].color}`}>
                    {RESPONSE_MESSAGES[arrival.response!].title}
                  </p>
                  <p className="text-muted-foreground text-sm mt-1">
                    {RESPONSE_MESSAGES[arrival.response!].body}
                  </p>
                </div>
              </div>
            ) : isExpired ? (
              <div className="text-center space-y-3">
                <Clock className="h-12 w-12 mx-auto text-muted-foreground" />
                <div>
                  <p className="text-lg font-semibold">No response received</p>
                  {instructions && (
                    <div className="mt-3 rounded-md bg-muted p-3 text-left">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                        Delivery instructions
                      </p>
                      <p className="text-sm">
                        {arrival.type === 'food' && instructions.food}
                        {arrival.type === 'package' && instructions.package}
                        {arrival.type === 'guest' && instructions.guest}
                        {arrival.type === 'other' && (instructions.package || 'No instructions left.')}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center space-y-3">
                <div className="relative flex justify-center">
                  <BellRing className="h-12 w-12 text-primary animate-pulse" />
                </div>
                <div>
                  <p className="text-lg font-semibold">Notification sent</p>
                  <p className="text-muted-foreground text-sm mt-1">
                    Waiting for resident to respond…
                  </p>
                </div>

                {/* Reminders */}
                <div className="space-y-2 pt-2">
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handleReminder}
                    disabled={arrival.reminderCount >= MAX_REMINDERS || reminderCooldown > 0}
                  >
                    {reminderCooldown > 0
                      ? `Wait ${reminderCooldown}s`
                      : arrival.reminderCount >= MAX_REMINDERS
                      ? 'Reminder limit reached'
                      : 'Send Reminder'}
                  </Button>
                  {arrival.reminderCount > 0 && (
                    <div className="flex justify-center">
                      <Badge variant="secondary">
                        {arrival.reminderCount}/{MAX_REMINDERS} reminders sent
                      </Badge>
                    </div>
                  )}
                </div>

                {/* Instructions fallback after 2+ reminders */}
                {arrival.reminderCount >= 2 && instructions && (
                  <div className="rounded-md bg-muted p-3 text-left">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                      Delivery instructions
                    </p>
                    <p className="text-sm">
                      {arrival.type === 'food' ? instructions.food :
                       arrival.type === 'package' ? instructions.package :
                       arrival.type === 'guest' ? instructions.guest :
                       instructions.package || 'No instructions left.'}
                    </p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          This notification will expire automatically
        </p>
      </div>
    </div>
  )
}
