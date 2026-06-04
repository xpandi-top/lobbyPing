import { useEffect, useState, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  CheckCircle2, Clock, BellRing, Package, Utensils, Users, HelpCircle,
  AlertCircle, MessageCircle, Send, Bell,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { subscribeArrival, sendReminder, getRoom, sendVisitorAck, ringResident } from '@/lib/firestore'
import { triggerPush } from '@/lib/notify'
import { playRingAlarm } from '@/lib/ring'
import type { Arrival, ResidentResponse, ArrivalType } from '@/lib/types'

const MAX_REMINDERS = 3
const REMINDER_COOLDOWN_MS = 30_000
const MAX_RINGS = 3
const RING_COOLDOWN_MS = 20_000
const VISITOR_REPLY_TIMEOUT_SECONDS = 60

const TYPE_LABELS: Record<ArrivalType, string> = {
  package: 'Package', food: 'Food Delivery', guest: 'Guest', other: 'Other',
}
const TYPE_ICONS: Record<ArrivalType, React.FC<{ className?: string }>> = {
  package: Package, food: Utensils, guest: Users, other: HelpCircle,
}
const WAIT_MS: Record<string, number> = {
  '1min': 60_000, '2min': 120_000, '5min': 300_000,
}

// Predefined ack options based on resident response
const ACK_OPTIONS: Record<ResidentResponse, string[]> = {
  coming_down: ["Thanks, I'll wait", "I'm at the entrance", "OK, see you soon"],
  leave_in_lobby: ['Leaving it now, thanks', 'OK, leaving in lobby'],
  no_need_to_wait: ["OK, I'll come back later", 'Understood, thanks'],
}

// Final messages when no response
const FINAL_OPTIONS = [
  'Will reschedule delivery',
  'Leaving at the door',
  'Coming back later',
  'Left with neighbour',
]

const RESPONSE_MESSAGES: Record<ResidentResponse, { title: string; body: string }> = {
  coming_down: { title: 'Resident is coming down', body: 'Please wait a moment.' },
  leave_in_lobby: { title: 'Please leave item in lobby', body: 'The resident has been notified.' },
  no_need_to_wait: { title: 'No need to wait', body: 'You are free to go.' },
}

// ── Elapsed timer hook ─────────────────────────────────────────────────────

function useElapsed(createdAtMs: number, active: boolean) {
  const [elapsed, setElapsed] = useState(Date.now() - createdAtMs)
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setElapsed(Date.now() - createdAtMs), 1000)
    return () => clearInterval(id)
  }, [createdAtMs, active])
  return elapsed
}

function formatElapsed(ms: number) {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const rem = s % 60
  if (m === 0) return `${s}s`
  return `${m}m ${rem.toString().padStart(2, '0')}s`
}

// ── Visitor Ack Panel ──────────────────────────────────────────────────────

function AckPanel({
  arrival,
  buildingId,
  roomId,
  arrivalId,
  mode,
  onFinalAckSent,
}: {
  arrival: Arrival
  buildingId: string
  roomId: string
  arrivalId: string
  mode: 'responded' | 'no_response'
  onFinalAckSent?: () => void
}) {
  const [sent, setSent] = useState(!!arrival.visitorAck)
  const [custom, setCustom] = useState('')
  const [sending, setSending] = useState(false)
  const [showCustom, setShowCustom] = useState(false)

  const options = mode === 'responded' && arrival.response
    ? ACK_OPTIONS[arrival.response]
    : FINAL_OPTIONS

  async function send(message: string) {
    if (sending || sent) return
    setSending(true)
    try {
      // no_response mode: also close the arrival so resident sees it as expired
      await sendVisitorAck(buildingId, roomId, arrivalId, message, mode === 'no_response')
      setSent(true)
      onFinalAckSent?.()
    } catch (err) {
      toast.error(`Failed: ${err instanceof Error ? err.message : String(err)}`)
      setSending(false)
    }
  }

  if (arrival.visitorAck || sent) {
    return (
      <div className="rounded-md bg-muted px-4 py-3 flex items-start gap-2">
        <MessageCircle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
        <div>
          <p className="text-xs text-muted-foreground">Your message</p>
          <p className="text-sm font-medium">{arrival.visitorAck ?? custom}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {mode === 'responded' ? 'Reply to resident' : 'Leave a note'}
      </p>
      <div className="grid grid-cols-1 gap-2">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            disabled={sending}
            onClick={() => send(opt)}
            className="flex w-full items-center gap-2 rounded-md border bg-background px-3 py-2.5 text-left text-sm hover:bg-muted transition-colors disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            {opt}
          </button>
        ))}
        {!showCustom ? (
          <button
            type="button"
            onClick={() => setShowCustom(true)}
            className="text-sm text-muted-foreground underline underline-offset-2 text-left pl-1"
          >
            Write custom message…
          </button>
        ) : (
          <div className="space-y-2">
            <Textarea
              placeholder="Type your message…"
              maxLength={200}
              rows={2}
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
            />
            <Button
              size="sm"
              onClick={() => send(custom.trim())}
              disabled={!custom.trim() || sending}
              className="w-full"
            >
              {sending ? 'Sending…' : 'Send'}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────

export default function StatusPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const buildingId = searchParams.get('b') ?? ''
  const roomId = searchParams.get('r') ?? ''
  const arrivalId = searchParams.get('a') ?? ''

  const [arrival, setArrival] = useState<Arrival | null | undefined>(undefined)
  const [instructions, setInstructions] = useState<{ package: string; food: string; guest: string } | null>(null)
  const [reminderCooldown, setReminderCooldown] = useState(0)
  const [ringCooldown, setRingCooldown] = useState(0)
  const [ackSent, setAckSent] = useState(false)
  const [visitorRingNotice, setVisitorRingNotice] = useState('')
  const [replyTimeoutSeconds, setReplyTimeoutSeconds] = useState(VISITOR_REPLY_TIMEOUT_SECONDS)
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const ringCooldownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const replyTimeoutRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const seenResidentRingCount = useRef<number | null>(null)
  const residentRingCountForAlert = arrival?.residentRingCount ?? null
  const lastRingByForAlert = arrival?.lastRingBy ?? null
  const visitorReplyPending = arrival?.status === 'responded' && !!arrival.response && !arrival.visitorAck && !ackSent

  useEffect(() => {
    if (!buildingId || !roomId || !arrivalId) return
    return subscribeArrival(buildingId, roomId, arrivalId, setArrival)
  }, [buildingId, roomId, arrivalId])

  useEffect(() => {
    if (!buildingId || !roomId) return
    getRoom(buildingId, roomId).then((r) => { if (r) setInstructions(r.instructions) })
  }, [buildingId, roomId])

  useEffect(() => {
    if (residentRingCountForAlert === null) return
    const count = residentRingCountForAlert
    if (seenResidentRingCount.current === null) {
      seenResidentRingCount.current = count
      return
    }
    if (count > seenResidentRingCount.current && lastRingByForAlert === 'resident') {
      playRingAlarm().then((played) => {
        const message = played
          ? 'Resident alarm is ringing'
          : 'Resident is ringing you — tap a button to enable alarm sound'
        setVisitorRingNotice(message)
        toast.info(message)
      })
    }
    seenResidentRingCount.current = count
  }, [residentRingCountForAlert, lastRingByForAlert])

  useEffect(() => {
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current)
      if (ringCooldownRef.current) clearInterval(ringCooldownRef.current)
      if (replyTimeoutRef.current) clearInterval(replyTimeoutRef.current)
    }
  }, [])

  useEffect(() => {
    if (replyTimeoutRef.current) {
      clearInterval(replyTimeoutRef.current)
      replyTimeoutRef.current = null
    }
    if (!visitorReplyPending) {
      setReplyTimeoutSeconds(VISITOR_REPLY_TIMEOUT_SECONDS)
      return
    }
    setReplyTimeoutSeconds(VISITOR_REPLY_TIMEOUT_SECONDS)
    replyTimeoutRef.current = setInterval(() => {
      setReplyTimeoutSeconds((prev) => {
        if (prev <= 1) {
          if (replyTimeoutRef.current) clearInterval(replyTimeoutRef.current)
          navigate(`/visit?b=${buildingId}`)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => {
      if (replyTimeoutRef.current) clearInterval(replyTimeoutRef.current)
    }
  }, [visitorReplyPending, buildingId, navigate])

  const createdAtMs = arrival?.createdAt?.toMillis() ?? Date.now()
  const isPending = arrival?.status === 'pending'
  const elapsed = useElapsed(createdAtMs, isPending)
  const waitMs = arrival ? (WAIT_MS[arrival.waitTime] ?? 120_000) : 120_000
  const waitProgress = Math.min(100, Math.round((elapsed / waitMs) * 100))
  const overWait = elapsed > waitMs

  function startCooldown() {
    if (cooldownRef.current) clearInterval(cooldownRef.current)
    setReminderCooldown(REMINDER_COOLDOWN_MS / 1000)
    cooldownRef.current = setInterval(() => {
      setReminderCooldown((prev) => {
        if (prev <= 1) { clearInterval(cooldownRef.current!); return 0 }
        return prev - 1
      })
    }, 1000)
  }

  function startRingCooldown() {
    if (ringCooldownRef.current) clearInterval(ringCooldownRef.current)
    setRingCooldown(RING_COOLDOWN_MS / 1000)
    ringCooldownRef.current = setInterval(() => {
      setRingCooldown((prev) => {
        if (prev <= 1) { clearInterval(ringCooldownRef.current!); return 0 }
        return prev - 1
      })
    }, 1000)
  }

  async function handleReminder() {
    if (!arrival || arrival.reminderCount >= MAX_REMINDERS || reminderCooldown > 0) return
    await sendReminder(buildingId, roomId, arrivalId, arrival.reminderCount)
    triggerPush(buildingId, roomId, arrivalId, 'reminder')
    toast.success('Reminder sent')
    startCooldown()
  }

  async function handleRingResident() {
    if (!arrival || arrival.status !== 'pending' || (arrival.ringCount ?? 0) >= MAX_RINGS || ringCooldown > 0) return
    try {
      await ringResident(buildingId, roomId, arrivalId, arrival.ringCount ?? 0)
      triggerPush(buildingId, roomId, arrivalId, 'ring')
      toast.success('Resident ring sent')
      startRingCooldown()
    } catch (err) {
      toast.error(`Ring failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  function renderRingResidentButton(ringCount: number) {
    return (
      <div className="space-y-2">
        <Button
          className="w-full"
          onClick={handleRingResident}
          disabled={ringCount >= MAX_RINGS || ringCooldown > 0}
        >
          <BellRing className="h-4 w-4 mr-2" />
          {ringCooldown > 0
            ? `Ring again in ${ringCooldown}s`
            : ringCount >= MAX_RINGS
              ? 'Ring limit reached'
              : 'Ring / Call Resident'}
        </Button>
        {ringCount > 0 && (
          <div className="flex justify-center">
            <Badge variant="secondary">
              {ringCount}/{MAX_RINGS} rings sent
            </Badge>
          </div>
        )}
      </div>
    )
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
  const noResponse = !hasResponse && (isExpired || overWait)
  const ringCount = arrival.ringCount ?? 0
  // Done once the visitor acknowledges, for both resident-response and no-response flows.
  // ackSent closes immediately while visitorAck covers page reloads after the write lands.
  const isDone = ackSent || !!arrival.visitorAck

  if (isDone) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
        <div className="w-full max-w-md space-y-5 text-center">
          <div className="flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
              <CheckCircle2 className="h-8 w-8 text-muted-foreground" />
            </div>
          </div>
          <div>
            <h2 className="text-xl font-bold">All done</h2>
            <p className="text-muted-foreground text-sm mt-1">Your message was sent to the resident.</p>
          </div>
          <div className="space-y-2">
            <Button className="w-full" onClick={() => navigate(`/visit?b=${buildingId}`)}>
              <Bell className="h-4 w-4 mr-2" />
              Notify another room
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-4">
        {/* Header */}
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold">Room {arrival.roomNumber}</h1>
          <div className="flex items-center justify-center gap-2 text-muted-foreground text-sm">
            <TypeIcon className="h-4 w-4" />
            <span>{TYPE_LABELS[arrival.type]}</span>
          </div>
        </div>

        {/* Elapsed timer — only while waiting, hide when done or no-response */}
        {!noResponse && <Card>
          <CardContent className="pt-4 pb-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>Waiting time</span>
              </div>
              <span className={`font-mono font-semibold ${overWait ? 'text-destructive' : 'text-foreground'}`}>
                {formatElapsed(elapsed)}
              </span>
            </div>
            <Progress value={waitProgress} className={`h-2 ${overWait ? '[&>div]:bg-destructive' : ''}`} />
            <p className="text-xs text-muted-foreground text-right">
              {overWait
                ? 'Past expected wait time'
                : `Expected wait: ${arrival.waitTime.replace('min', ' min')}`}
            </p>
          </CardContent>
        </Card>}

        {/* Status card */}
        <Card>
          <CardContent className="pt-6 space-y-4">
            {visitorRingNotice && (
              <div className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm font-medium text-primary">
                <div className="flex items-center gap-2">
                  <BellRing className="h-4 w-4 shrink-0" />
                  <span>{visitorRingNotice}</span>
                </div>
              </div>
            )}
            {hasResponse ? (
              <>
                <div className="text-center space-y-2">
                  <CheckCircle2 className="h-10 w-10 mx-auto text-green-500" />
                  <p className="text-lg font-semibold">
                    {arrival.responseMessage ? 'Resident replied' : RESPONSE_MESSAGES[arrival.response!].title}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {arrival.responseMessage || RESPONSE_MESSAGES[arrival.response!].body}
                  </p>
                  {arrival.respondedByName && (
                    <Badge variant="secondary" className="text-xs">
                      {arrival.respondedByName}
                    </Badge>
                  )}
                  {visitorReplyPending && (
                    <p className="text-xs text-muted-foreground">
                      Reply closes in {replyTimeoutSeconds}s
                    </p>
                  )}
                </div>
                {isPending && !isExpired && renderRingResidentButton(ringCount)}
                <AckPanel
                  arrival={arrival}
                  buildingId={buildingId}
                  roomId={roomId}
                  arrivalId={arrivalId}
                  mode="responded"
                  onFinalAckSent={() => setAckSent(true)}
                />
              </>
            ) : noResponse ? (
              <>
                <div className="text-center space-y-2">
                  <Clock className="h-10 w-10 mx-auto text-muted-foreground" />
                  <p className="text-lg font-semibold">
                    {isExpired ? 'No response received' : 'Wait time passed'}
                  </p>
                  {instructions && (
                    <div className="rounded-md bg-muted p-3 text-left mt-2">
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
                <AckPanel
                  arrival={arrival}
                  buildingId={buildingId}
                  roomId={roomId}
                  arrivalId={arrivalId}
                  mode="no_response"
                  onFinalAckSent={() => setAckSent(true)}
                />
              </>
            ) : (
              /* Waiting state */
              <div className="space-y-4">
                <div className="text-center space-y-2">
                  <BellRing className="h-10 w-10 mx-auto text-primary animate-pulse" />
                  <p className="text-lg font-semibold">Notification sent</p>
                  <p className="text-muted-foreground text-sm">Waiting for resident to respond…</p>
                </div>

                {/* Reminders */}
                <div className="space-y-2">
                  {renderRingResidentButton(ringCount)}
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

                {/* Show instructions after 2+ reminders */}
                {arrival.reminderCount >= 2 && instructions && (
                  <div className="rounded-md bg-muted p-3">
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
          This notification expires automatically
        </p>
      </div>
    </div>
  )
}
