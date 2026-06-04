import { useEffect, useRef, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import {
  Bell, CheckCircle2, AlertTriangle, Share, PlusSquare, Smartphone,
  BellRing, Volume2, Settings, Package, Utensils, Users,
  ArrowDownToLine, XCircle, Clock, Crown, Plus, Trash2, KeyRound,
  Home, LogOut, Copy, Calendar, MessageCircle,
} from 'lucide-react'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import {
  getRoom, getBuilding,
  updateDeviceFCMToken, updateInstructions, respondToArrival,
  createInviteCode, listInviteCodes, deleteInviteCode,
  listDevices, removeDevice, ringVisitor,
} from '@/lib/firestore'
import {
  requestNotificationPermission, getFCMToken, sendTestNotification,
  setupForegroundMessaging, isIOS, isInstalledPWA,
} from '@/lib/fcm'
import { triggerPush } from '@/lib/notify'
import { playRingAlert } from '@/lib/ring'
import {
  getDismissedArrivalIds,
  getLocalArrivals,
  getSavedRooms,
  getSavedRoom,
  removeLocalArrival,
  removeSavedRoom,
  saveLastResidentRoom,
  saveLocalArrivals,
} from '@/lib/storage'
import type {
  Room, Device, InviteCode, Arrival, ResidentResponse, ArrivalType,
  DeliveryInstructions,
} from '@/lib/types'
import { appUrl, cn } from '@/lib/utils'
import { Timestamp } from 'firebase/firestore'

// ── Multi-room selector ────────────────────────────────────────────────────

function RoomSelector({ currentBuildingId, currentRoomId }: { currentBuildingId: string; currentRoomId: string }) {
  const navigate = useNavigate()
  const rooms = getSavedRooms()
  if (rooms.length <= 1) return null

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {rooms.map((r) => {
        const isCurrent = r.buildingId === currentBuildingId && r.roomId === currentRoomId
        return (
          <button
            key={`${r.buildingId}-${r.roomId}`}
            type="button"
            onClick={() => navigate(`/home?b=${r.buildingId}&r=${r.roomId}`)}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
              isCurrent
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border hover:bg-muted'
            )}
          >
            {r.role === 'owner' ? <Crown className="h-3 w-3" /> : <Home className="h-3 w-3" />}
            <span>{r.buildingName}</span>
            <span className="opacity-60">· {r.roomNumber}</span>
          </button>
        )
      })}
    </div>
  )
}

// ── Notification Setup ─────────────────────────────────────────────────────

type SetupStep = 'add_to_home' | 'enable' | 'enabling' | 'test' | 'done' | 'blocked'

function SetupWizard({ buildingId, roomId }: { buildingId: string; roomId: string }) {
  const navigate = useNavigate()
  const savedRoom = getSavedRoom(buildingId, roomId)
  const ios = isIOS()
  const installed = isInstalledPWA()
  const notificationSupported = 'Notification' in window
  const [step, setStep] = useState<SetupStep>(() => {
    if (ios && !installed) return 'add_to_home'
    if (!notificationSupported) return 'blocked'
    if (Notification.permission === 'granted') return 'done'
    if (Notification.permission === 'denied') return 'blocked'
    return 'enable'
  })
  const [testing, setTesting] = useState(false)

  const steps: SetupStep[] = ios ? ['add_to_home', 'enable', 'test', 'done'] : ['enable', 'test', 'done']
  const stepIndex = steps.indexOf(step)
  const progress = step === 'done' ? 100 : Math.max(0, Math.round((stepIndex / (steps.length - 1)) * 100))

  // Token refresh moved to ResidentPage so it runs on any tab, not just Alerts

  async function handleEnable() {
    if (!savedRoom) {
      toast.error('Add this home before enabling alerts')
      navigate('/join')
      return
    }
    setStep('enabling')
    const perm = await requestNotificationPermission()
    if (perm === 'granted') {
      const token = await getFCMToken()
      if (token && savedRoom) {
        try {
          await updateDeviceFCMToken(buildingId, roomId, savedRoom.deviceId, token)
        } catch (err) {
          console.error('[Alerts] updateDeviceFCMToken failed:', err)
          toast.error('Could not save this notification token. Try rejoining with a new code.')
        }
      } else if (!token) {
        toast.error('Could not get notification token. Check browser console.')
      }
      setStep('test')
    } else if (perm === 'denied') {
      setStep('blocked')
    } else {
      setStep('enable')
    }
  }

  async function handleTest() {
    setTesting(true)
    const ok = await sendTestNotification()
    setTesting(false)
    if (ok) { toast.success('Test notification sent!'); setStep('done') }
    else toast.error('Test failed. Check system notification settings.')
  }

  if (!savedRoom) {
    return (
      <Card className="border-primary/30">
        <CardContent className="pt-6 space-y-3">
          <div className="flex items-start gap-3">
            <Home className="h-6 w-6 text-primary shrink-0" />
            <div>
              <p className="font-semibold">Add this home first</p>
              <p className="text-sm text-muted-foreground">
                Alerts can only be enabled after this browser or installed app is registered with a one-time invite code.
              </p>
            </div>
          </div>
          <Button onClick={() => navigate('/join')} className="w-full">Add Home</Button>
        </CardContent>
      </Card>
    )
  }

  if (step === 'done') {
    return (
      <Card className="border-green-200 bg-green-50">
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-8 w-8 text-green-600 shrink-0" />
            <div>
              <p className="font-semibold text-green-800">LobbyPing is ready</p>
              <p className="text-sm text-green-700">Push notifications active on this device</p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (step === 'blocked') {
    return (
      <Card className="border-destructive/30">
        <CardContent className="pt-6 space-y-3">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-6 w-6 text-destructive shrink-0" />
            <div>
              <p className="font-semibold">{notificationSupported ? 'Notifications blocked' : 'Notifications unavailable'}</p>
              <p className="text-sm text-muted-foreground">
                {notificationSupported
                  ? 'Enable notifications in browser/OS settings, then reload.'
                  : 'Open LobbyPing from the installed app on your Home Screen to enable alerts.'}
              </p>
            </div>
          </div>
          <Button variant="outline" onClick={() => window.location.reload()} className="w-full">Reload Page</Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><BellRing className="h-5 w-5 text-primary" /> Alerts Setup</CardTitle>
        <CardDescription>Install, allow notifications, then send a test</CardDescription>
        <Progress value={progress} className="h-1.5 mt-2" />
      </CardHeader>
      <CardContent className="space-y-4">
        {step === 'add_to_home' && (
          <div className="space-y-4">
            <Alert><Smartphone className="h-4 w-4" /><AlertDescription>iPhone requires LobbyPing to be opened from the Home Screen before alerts can be enabled.</AlertDescription></Alert>
            <div className="space-y-3">
              {[{ icon: Share, text: 'In Safari, open /lobbyPing/ and tap Share' }, { icon: PlusSquare, text: 'Tap "Add to Home Screen"' }, { icon: Smartphone, text: 'Open LobbyPing from the Home Screen, choose this home, then return to Alerts' }].map(({ icon: Icon, text }, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">{i + 1}</div>
                  <div className="flex items-center gap-2 text-sm"><Icon className="h-4 w-4 text-muted-foreground" /><span>{text}</span></div>
                </div>
              ))}
            </div>
            {installed ? (
              <Button onClick={() => setStep('enable')} className="w-full">Continue Alerts Setup</Button>
            ) : (
              <Button variant="outline" onClick={() => window.location.reload()} className="w-full">
                I opened it from Home Screen
              </Button>
            )}
          </div>
        )}
        {(step === 'enable' || step === 'enabling') && (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <Bell className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div><p className="font-medium text-sm">Allow Notifications</p><p className="text-sm text-muted-foreground">Tap below and allow notifications when prompted.</p></div>
            </div>
            <Button onClick={handleEnable} disabled={step === 'enabling'} className="w-full">
              {step === 'enabling' ? 'Requesting…' : 'Enable Notifications'}
            </Button>
          </div>
        )}
        {step === 'test' && (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
              <div><p className="font-medium text-sm text-green-700">Notifications enabled!</p><p className="text-sm text-muted-foreground mt-0.5">Send a test to verify sound and delivery.</p></div>
            </div>
            <div className="rounded-md bg-muted p-3 space-y-2">
              <div className="flex items-center gap-2 text-sm"><Volume2 className="h-4 w-4 text-muted-foreground" /><span>Make sure sound is enabled</span></div>
              <div className="flex items-center gap-2 text-sm"><Settings className="h-4 w-4 text-muted-foreground" /><span>Check Focus Mode is not blocking alerts</span></div>
            </div>
            <Button onClick={handleTest} disabled={testing} className="w-full">{testing ? 'Sending…' : 'Send Test Notification'}</Button>
            <Button variant="ghost" onClick={() => setStep('done')} className="w-full text-muted-foreground">Skip test</Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function NotificationGuide() {
  const ios = isIOS()
  const permission = 'Notification' in window ? Notification.permission : 'denied'
  const installText = ios
    ? 'Install from /lobbyPing/ in Safari, then open LobbyPing from the Home Screen before enabling alerts.'
    : 'Use the browser install option when available, then keep this device signed in.'

  const steps = [
    {
      icon: Smartphone,
      title: ios ? 'Install LobbyPing' : 'Install or keep open',
      body: installText,
    },
    {
      icon: Bell,
      title: permission === 'denied' ? 'Unblock notifications' : 'Allow notifications',
      body: permission === 'denied'
        ? 'Open browser or system settings for LobbyPing, allow notifications, then reload.'
        : 'Tap Enable Notifications and choose Allow in the browser prompt.',
    },
    {
      icon: BellRing,
      title: 'Test alerts',
      body: 'Use Send Test Notification to confirm sound, banners, and Focus settings.',
    },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Alerts checklist</CardTitle>
        <CardDescription>Use this browser or installed app to receive visitor alerts.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {steps.map(({ icon: Icon, title, body }) => (
          <div key={title} className="flex items-start gap-3">
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">{title}</p>
              <p className="text-sm text-muted-foreground">{body}</p>
            </div>
          </div>
        ))}
        <Separator />
        <div className="rounded-md bg-muted px-3 py-2">
          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <Settings className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Still not arriving? Check browser notifications, system notifications, Focus, and sound settings.</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Active Arrivals ────────────────────────────────────────────────────────

const TYPE_LABELS: Record<ArrivalType, string> = { package: 'Package', food: 'Food Delivery', guest: 'Guest', other: 'Other' }
const WAIT_LABELS: Record<string, string> = { '1min': '1 min', '2min': '2 min', '5min': '5 min' }
const WAIT_MS: Record<string, number> = { '1min': 60_000, '2min': 120_000, '5min': 300_000 }
const MAX_RINGS = 3
const RING_COOLDOWN_MS = 20_000

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
  return m === 0 ? `${s}s` : `${m}m ${(s % 60).toString().padStart(2, '0')}s`
}
const RESPONSE_OPTIONS: { value: ResidentResponse; label: string; icon: React.FC<{className?: string}>; color: string }[] = [
  { value: 'coming_down', label: 'Coming Down', icon: ArrowDownToLine, color: 'border-green-200 bg-green-50 text-green-700 hover:bg-green-100' },
  { value: 'leave_in_lobby', label: 'Leave in Lobby', icon: CheckCircle2, color: 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100' },
  { value: 'no_need_to_wait', label: 'No Need to Wait', icon: XCircle, color: 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100' },
]

function ArrivalCard({ arrival, buildingId, roomId, canRespond, responderName, responderRole, responderDeviceId, onRemove }: {
  arrival: Arrival; buildingId: string; roomId: string
  canRespond: boolean; responderName: string; responderRole: 'owner' | 'member'
  responderDeviceId?: string
  onRemove: (arrivalId: string) => void
}) {
  const [responding, setResponding] = useState(false)
  const [ringingVisitor, setRingingVisitor] = useState(false)
  const [ringCooldown, setRingCooldown] = useState(0)
  const [ringNotice, setRingNotice] = useState('')
  const ringCooldownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const seenVisitorRingCount = useRef<number | null>(null)
  const isExpired = arrival.status === 'expired' || arrival.expiresAt.toMillis() < Date.now()
  const hasResponded = arrival.status === 'responded'
  // Only tick while pending — freeze on respond/expire
  const isPending = arrival.status === 'pending'
  const elapsed = useElapsed(arrival.createdAt.toMillis(), isPending)
  const waitMs = WAIT_MS[arrival.waitTime] ?? 120_000
  const waitProgress = Math.min(100, Math.round((elapsed / waitMs) * 100))
  const overWait = elapsed > waitMs
  const isMissed = !hasResponded && !isExpired && overWait
  const visitorRingCount = arrival.ringCount ?? 0
  const residentRingCount = arrival.residentRingCount ?? 0
  const canRingVisitor = canRespond && !arrival.visitorAck && (arrival.status === 'pending' || hasResponded)

  useEffect(() => {
    const count = arrival.ringCount ?? 0
    if (seenVisitorRingCount.current === null) {
      seenVisitorRingCount.current = count
      return
    }
    if (count > seenVisitorRingCount.current && arrival.lastRingBy === 'visitor') {
      playRingAlert().then((played) => {
        const message = played
          ? 'Visitor is ringing'
          : 'Visitor is ringing — tap a button to enable sound'
        setRingNotice(message)
        toast.info(message)
      })
    }
    seenVisitorRingCount.current = count
  }, [arrival.ringCount, arrival.lastRingBy])

  useEffect(() => {
    return () => {
      if (ringCooldownRef.current) clearInterval(ringCooldownRef.current)
    }
  }, [])

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

  async function handleResponse(response: ResidentResponse) {
    if (responding || !canRespond) return
    setResponding(true)
    try {
      await respondToArrival(buildingId, roomId, arrival.id, response, responderName, responderRole)
      // Notify the room's OTHER devices that this arrival was handled.
      triggerPush(buildingId, roomId, arrival.id, 'responded', responderDeviceId)
      toast.success('Response sent')
    } catch (err) {
      toast.error(`Failed: ${err instanceof Error ? err.message : String(err)}`)
      setResponding(false)
    }
  }

  async function handleRingVisitor() {
    if (!canRingVisitor || ringingVisitor || residentRingCount >= MAX_RINGS || ringCooldown > 0) return
    setRingingVisitor(true)
    try {
      await ringVisitor(buildingId, roomId, arrival.id, residentRingCount)
      toast.success('Visitor ring sent')
      startRingCooldown()
    } catch (err) {
      toast.error(`Ring failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setRingingVisitor(false)
    }
  }

  function renderRingVisitorButton() {
    if (!canRingVisitor) return null
    return (
      <div className="space-y-1.5">
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={handleRingVisitor}
          disabled={ringingVisitor || residentRingCount >= MAX_RINGS || ringCooldown > 0}
        >
          <BellRing className="h-4 w-4 mr-2" />
          {ringCooldown > 0
            ? `Ring again in ${ringCooldown}s`
            : residentRingCount >= MAX_RINGS
              ? 'Visitor ring limit reached'
              : ringingVisitor
                ? 'Ringing…'
                : 'Ring / Call Visitor'}
        </Button>
        {residentRingCount > 0 && (
          <p className="text-center text-xs text-muted-foreground">
            {residentRingCount}/{MAX_RINGS} visitor rings sent
          </p>
        )}
      </div>
    )
  }

  return (
    <Card className={cn('border-2', isExpired ? 'opacity-60' : hasResponded ? 'border-green-200' : 'border-primary/30 shadow-md')}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <CardTitle className="text-base">{TYPE_LABELS[arrival.type] ?? arrival.type}</CardTitle>
            {isPending && !isMissed && <Badge variant="default" className="text-xs animate-pulse">Waiting</Badge>}
            {isMissed && <Badge variant="destructive" className="text-xs">Missed</Badge>}
            {hasResponded && <Badge variant="secondary" className="text-xs">Responded</Badge>}
            {/* Only show Expired if not already responded */}
            {isExpired && !hasResponded && <Badge variant="outline" className="text-xs">Expired</Badge>}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {/* Only show elapsed timer on pending/missed arrivals */}
            {(isPending || isMissed) && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                {arrival.reminderCount > 0 && <span className="text-orange-500">{arrival.reminderCount}× </span>}
                <Clock className="h-3 w-3" />
                <span className={cn('font-mono', overWait ? 'text-destructive font-semibold' : '')}>
                  {formatElapsed(elapsed)}
                </span>
              </div>
            )}
            <Button
              variant="ghost"
              size="icon"
              title="Remove from this device"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={() => onRemove(arrival.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        {/* Wait progress bar — only show while actively pending (not missed/expired/responded) */}
        {isPending && !isMissed && (
          <div className="mt-2 space-y-0.5">
            <Progress value={waitProgress} className={cn('h-1', overWait ? '[&>div]:bg-destructive' : '')} />
            <p className="text-xs text-muted-foreground">
              {overWait ? 'Past expected wait time' : `Expected: ${WAIT_LABELS[arrival.waitTime]}`}
            </p>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {(ringNotice || visitorRingCount > 0) && (
          <div className="mb-3 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary">
            <div className="flex items-center gap-2">
              <BellRing className="h-4 w-4 shrink-0" />
              <span className="font-medium">{ringNotice || `Visitor rang ${visitorRingCount} time${visitorRingCount === 1 ? '' : 's'}`}</span>
            </div>
          </div>
        )}
        {hasResponded ? (
          <div className="space-y-2">
            <div className="space-y-0.5">
              <p className="text-sm text-muted-foreground">
                Responded: <span className="font-medium text-foreground">{RESPONSE_OPTIONS.find(r => r.value === arrival.response)?.label}</span>
              </p>
              {arrival.respondedByName && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  {arrival.respondedByRole === 'owner' ? <Crown className="h-3 w-3" /> : <Users className="h-3 w-3" />}
                  {arrival.respondedByName}
                </p>
              )}
            </div>
            {arrival.visitorAck && (
              <div className="rounded-md bg-muted px-3 py-2 flex items-start gap-2">
                <MessageCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-muted-foreground">Visitor replied</p>
                  <p className="text-sm">{arrival.visitorAck}</p>
                </div>
              </div>
            )}
            {renderRingVisitorButton()}
          </div>
        ) : isMissed || isExpired ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {isMissed ? 'Visitor\'s wait time passed — no response sent.' : 'Notification expired — no response.'}
            </p>
            {arrival.visitorAck && (
              <div className="rounded-md bg-muted px-3 py-2 flex items-start gap-2">
                <MessageCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-muted-foreground">Visitor's note</p>
                  <p className="text-sm">{arrival.visitorAck}</p>
                </div>
              </div>
            )}
            {/* Still allow late response in case visitor is still there */}
            {canRespond && !arrival.visitorAck && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground italic">Visitor may still be waiting. Respond?</p>
                <div className="space-y-1.5">
                  {RESPONSE_OPTIONS.map(({ value, label, icon: Icon, color }) => (
                    <button key={value} type="button"
                      onClick={() => respondToArrival(buildingId, roomId, arrival.id, value, responderName, responderRole).then(() => { triggerPush(buildingId, roomId, arrival.id, 'responded', responderDeviceId); toast.success('Response sent') }).catch(err => toast.error(String(err)))}
                      className={cn('flex w-full items-center gap-3 rounded-lg border p-2.5 text-left transition-colors text-sm', color)}>
                      <Icon className="h-3.5 w-3.5 shrink-0" />{label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {!isExpired && renderRingVisitorButton()}
          </div>
        ) : canRespond ? (
          <div className="space-y-2">
            {renderRingVisitorButton()}
            {RESPONSE_OPTIONS.map(({ value, label, icon: Icon, color }) => (
              <button key={value} type="button" onClick={() => handleResponse(value)} disabled={responding}
                className={cn('flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors disabled:opacity-50', color)}>
                <Icon className="h-4 w-4 shrink-0" /><span className="font-medium text-sm">{label}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">You don't have permission to respond.</p>
        )}
      </CardContent>
    </Card>
  )
}

function ActiveArrivals({ buildingId, roomId, canRespond, responderName, responderRole, responderDeviceId }: {
  buildingId: string; roomId: string; canRespond: boolean
  responderName: string; responderRole: 'owner' | 'member'
  responderDeviceId?: string
}) {
  const [arrivals, setArrivals] = useState<Arrival[]>(() => getLocalArrivals(buildingId, roomId))

  useEffect(() => {
    if (!buildingId || !roomId) return
    // Include 'expired' so arrivals with visitor notes stay visible until Cloud Function cleans them up (30min)
    const q = query(collection(db, 'buildings', buildingId, 'rooms', roomId, 'arrivals'), where('status', 'in', ['pending', 'responded', 'expired']))
    return onSnapshot(q, (snap) => {
      const dismissed = getDismissedArrivalIds(buildingId, roomId)

      const liveArrivals = snap.docs
        .map(d => ({ id: d.id, ...d.data() }) as Arrival)
        .filter((arrival) => !dismissed.has(arrival.id))
      setArrivals(saveLocalArrivals(buildingId, roomId, liveArrivals))
    })
  }, [buildingId, roomId])

  function handleRemove(arrivalId: string) {
    removeLocalArrival(buildingId, roomId, arrivalId)
    setArrivals(getLocalArrivals(buildingId, roomId))
    toast.success('Removed from this device')
  }

  if (arrivals.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <Bell className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">No active arrivals</p>
        <p className="text-xs text-muted-foreground mt-1">Notifications appear here in real-time</p>
      </div>
    )
  }
  return (
    <div className="space-y-3">
      {arrivals.map(a => (
        <ArrivalCard key={a.id} arrival={a} buildingId={buildingId} roomId={roomId}
          canRespond={canRespond} responderName={responderName} responderRole={responderRole}
          responderDeviceId={responderDeviceId} onRemove={handleRemove} />
      ))}
    </div>
  )
}

// ── Delivery Instructions ──────────────────────────────────────────────────

const instructionsSchema = z.object({ package: z.string().max(300), food: z.string().max(300), guest: z.string().max(300) })
type InstructionsForm = z.infer<typeof instructionsSchema>

function DeliveryInstructionsForm({ buildingId, roomId, initial }: { buildingId: string; roomId: string; initial: DeliveryInstructions }) {
  const [saving, setSaving] = useState(false)
  const { register, handleSubmit, formState: { isDirty } } = useForm<InstructionsForm>({ resolver: zodResolver(instructionsSchema), defaultValues: initial })

  async function onSubmit(data: InstructionsForm) {
    setSaving(true)
    try {
      await updateInstructions(buildingId, roomId, data)
      toast.success('Instructions saved')
    } catch (err) {
      toast.error(`Failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally { setSaving(false) }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2"><Label className="flex items-center gap-2"><Package className="h-4 w-4" /> Package</Label><Textarea placeholder="e.g. Leave inside parcel locker in lobby" rows={2} {...register('package')} /></div>
      <div className="space-y-2"><Label className="flex items-center gap-2"><Utensils className="h-4 w-4" /> Food Delivery</Label><Textarea placeholder="e.g. Please wait 2 minutes. Leave at front desk if no answer." rows={2} {...register('food')} /></div>
      <div className="space-y-2"><Label className="flex items-center gap-2"><Users className="h-4 w-4" /> Guest</Label><Textarea placeholder="e.g. Resident will come downstairs." rows={2} {...register('guest')} /></div>
      <Button type="submit" disabled={saving || !isDirty} className="w-full">{saving ? 'Saving…' : 'Save Instructions'}</Button>
    </form>
  )
}

// ── Owner: Manage Members ──────────────────────────────────────────────────

const memberCodeSchema = z.object({
  expiryDays: z.string().optional(),
  canRespond: z.boolean().default(false),
})
type MemberCodeForm = z.infer<typeof memberCodeSchema>

function MembersPanel({ buildingId, roomId, ownerDeviceId }: { buildingId: string; roomId: string; ownerDeviceId: string }) {
  const [codes, setCodes] = useState<InviteCode[]>([])
  const [devices, setDevices] = useState<Device[]>([])
  const [creatingCode, setCreatingCode] = useState(false)
  const [transferCode, setTransferCode] = useState<string | null>(null)
  const [showMemberForm, setShowMemberForm] = useState(false)
  const { register, handleSubmit, watch, setValue, reset } = useForm<MemberCodeForm>({ defaultValues: { canRespond: false } })
  const canRespond = watch('canRespond')

  useEffect(() => {
    Promise.all([
      listInviteCodes(buildingId, roomId),
      listDevices(buildingId, roomId),
    ]).then(([c, d]) => { setCodes(c); setDevices(d) })
  }, [buildingId, roomId])

  async function onCreateCode(data: MemberCodeForm) {
    setCreatingCode(true)
    const code = generateCode()
    let expiresAt: Timestamp | null = null
    if (data.expiryDays && parseInt(data.expiryDays) > 0) {
      expiresAt = Timestamp.fromMillis(Date.now() + parseInt(data.expiryDays) * 86400_000)
    }
    try {
      await createInviteCode(buildingId, roomId, code, 'member', ownerDeviceId, {
        expiresAt,
        permissions: { notify: true, respond: data.canRespond },
      })
      const updated = await listInviteCodes(buildingId, roomId)
      setCodes(updated)
      toast.success(`Member code: ${code}`)
      reset()
      setShowMemberForm(false)
    } catch (err) {
      toast.error(`Failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally { setCreatingCode(false) }
  }

  async function handleCreateTransferCode() {
    const code = generateCode()
    const expiresAt = Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000) // 24h
    try {
      await createInviteCode(buildingId, roomId, code, 'owner', ownerDeviceId, {
        expiresAt,
        permissions: { notify: true, respond: true },
      })
      const updated = await listInviteCodes(buildingId, roomId)
      setCodes(updated)
      setTransferCode(code)
      const url = appUrl(`join?b=${buildingId}&code=${code}`)
      navigator.clipboard.writeText(url)
      toast.success('Transfer link copied to clipboard')
    } catch (err) {
      toast.error(`Failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  async function handleDeleteCode(codeId: string) {
    await deleteInviteCode(buildingId, roomId, codeId)
    setCodes((prev) => prev.filter((c) => c.id !== codeId))
    toast.success('Code deleted')
  }

  async function handleRemoveDevice(device: Device) {
    const isCurrent = device.id === ownerDeviceId
    const label = device.name || device.platform
    const msg = isCurrent
      ? `Remove THIS device (${label})? You will be logged out of this room.`
      : `Remove ${label}?`
    if (!confirm(msg)) return
    await removeDevice(buildingId, roomId, device.id)
    setDevices((prev) => prev.filter((d) => d.id !== device.id))
    toast.success('Device removed')
  }

  function copyCode(code: string) {
    const url = appUrl(`join?b=${buildingId}&code=${code}`)
    navigator.clipboard.writeText(url)
    toast.success('Invite link copied')
  }

  const memberCodes = codes.filter((c) => c.role === 'member')

  return (
    <div className="space-y-5">

      {/* Device Transfer */}
      <div>
        <h3 className="font-medium text-sm mb-1">Switch / Transfer Device</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Moving to a new phone? Generate a 24-hour transfer code, join on new device, then remove old device below.
        </p>
        {transferCode ? (
          <div className="rounded-md bg-muted p-3 space-y-2">
            <p className="text-xs text-muted-foreground">Transfer code (24h, owner access):</p>
            <div className="flex items-center gap-2">
              <span className="font-mono text-lg tracking-widest font-bold">{transferCode}</span>
              <Button variant="ghost" size="icon" onClick={() => {
                const url = appUrl(`join?b=${buildingId}&code=${transferCode}`)
                navigator.clipboard.writeText(url)
                toast.success('Link copied')
              }}><Copy className="h-3.5 w-3.5" /></Button>
            </div>
            <p className="text-xs text-muted-foreground">Open link on new device, enter your name, register. Then remove old device from the list below.</p>
            <Button variant="ghost" size="sm" onClick={() => setTransferCode(null)} className="text-muted-foreground">Dismiss</Button>
          </div>
        ) : (
          <Button variant="outline" className="w-full" onClick={handleCreateTransferCode}>
            <KeyRound className="h-4 w-4 mr-2" /> Generate Transfer Code
          </Button>
        )}
      </div>

      <Separator />

      {/* All devices */}
      <div>
        <h3 className="font-medium text-sm mb-3">All Devices ({devices.length})</h3>
        {devices.length === 0 ? (
          <p className="text-sm text-muted-foreground">No registered devices.</p>
        ) : (
          <div className="space-y-2">
            {devices.map((d) => {
              const isCurrent = d.id === ownerDeviceId
              return (
                <div key={d.id} className={cn('flex items-center justify-between rounded-md border px-3 py-2', isCurrent && 'border-primary/40 bg-primary/5')}>
                  <div className="flex items-center gap-2">
                    {d.role === 'owner' ? <Crown className="h-4 w-4 text-primary shrink-0" /> : <Users className="h-4 w-4 text-muted-foreground shrink-0" />}
                    <div>
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium">{d.name || `${d.platform} device`}</p>
                        {isCurrent && <Badge variant="outline" className="text-xs border-primary/40 text-primary">This device</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground capitalize">
                        {d.platform} · {d.role} · {d.permissions.respond ? 'can respond' : 'notify only'}
                      </p>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive"
                    onClick={() => handleRemoveDevice(d)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <Separator />

      {/* Create member code */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium text-sm">Member Invite Codes</h3>
          <Button size="sm" variant="outline" onClick={() => setShowMemberForm(!showMemberForm)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Create Code
          </Button>
        </div>

        {showMemberForm && (
          <Card className="mb-3">
            <CardContent className="pt-4 space-y-3">
              <div className="space-y-2">
                <Label className="flex items-center gap-2"><Calendar className="h-4 w-4" /> Expiry (days, blank = never)</Label>
                <Input type="number" placeholder="e.g. 7" min="1" max="365" {...register('expiryDays')} />
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={canRespond} onCheckedChange={(v) => setValue('canRespond', v)} id="canRespond" />
                <Label htmlFor="canRespond" className="cursor-pointer">Allow member to respond to arrivals</Label>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleSubmit(onCreateCode)} disabled={creatingCode} className="flex-1">
                  {creatingCode ? 'Creating…' : 'Generate Code'}
                </Button>
                <Button variant="ghost" onClick={() => setShowMemberForm(false)}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {memberCodes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No member codes yet.</p>
        ) : (
          <div className="space-y-2">
            {memberCodes.map((ic) => (
              <div key={ic.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-mono text-sm tracking-wider">{ic.code}</span>
                  </div>
                  {ic.redeemed ? <Badge variant="outline" className="text-xs text-green-600 border-green-300">Used</Badge>
                    : ic.expiresAt && ic.expiresAt.toMillis() < Date.now() ? <Badge variant="destructive" className="text-xs">Expired</Badge>
                    : <Badge variant="outline" className="text-xs">Available</Badge>}
                  {ic.permissions.respond && <Badge variant="secondary" className="text-xs">Can Respond</Badge>}
                  {ic.expiresAt && <span className="text-xs text-muted-foreground">Exp: {new Date(ic.expiresAt.toMillis()).toLocaleDateString()}</span>}
                </div>
                <div className="flex items-center gap-1">
                  {!ic.redeemed && <Button variant="ghost" size="icon" onClick={() => copyCode(ic.code)}><Copy className="h-3.5 w-3.5" /></Button>}
                  <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDeleteCode(ic.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function ResidentPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const buildingId = searchParams.get('b') ?? ''
  const roomId = searchParams.get('r') ?? ''
  const [room, setRoom] = useState<Room | null>(null)
  const [buildingName, setBuildingName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const savedRoom = getSavedRoom(buildingId, roomId)
  const isOwner = savedRoom?.role === 'owner'
  const canRespond = savedRoom != null // both owner and member can respond (owner always, member if permissions.respond)
  const responderName = savedRoom?.name ?? 'Resident'
  const responderRole = savedRoom?.role ?? 'member'

  useEffect(() => {
    if (!buildingId || !roomId) { setLoading(false); return }
    saveLastResidentRoom(buildingId, roomId)
    Promise.all([getRoom(buildingId, roomId), getBuilding(buildingId)]).then(([r, b]) => {
      setRoom(r); if (b) setBuildingName(b.name); setLoading(false)
    })
  }, [buildingId, roomId])

  // Refresh FCM token on every page load so stale tokens (e.g. after SW update) get replaced.
  // Must run at this level — SetupWizard only mounts when Alerts tab is active.
  useEffect(() => {
    if (!savedRoom || !('Notification' in window) || Notification.permission !== 'granted') return
    getFCMToken()
      .then((token) => token ? updateDeviceFCMToken(buildingId, roomId, savedRoom.deviceId, token) : undefined)
      .catch((err) => console.error('[Alerts] refresh token failed:', err))
  }, [buildingId, roomId, savedRoom?.deviceId])

  // Show system notification popup when FCM message arrives while app is foregrounded.
  // Without this, FCM bypasses the SW on foreground and nothing shows.
  useEffect(() => {
    if (!('Notification' in window) || Notification.permission !== 'granted') return
    setupForegroundMessaging(async (payload: unknown) => {
      try {
        const reg = await navigator.serviceWorker.ready
        // Foreground onMessage carries the notification payload; data holds the tag.
        const p = payload as { notification?: { title?: string; body?: string }; data?: Record<string, string> }
        await reg.showNotification(p.notification?.title ?? 'LobbyPing', {
          body: p.notification?.body ?? '',
          icon: `${import.meta.env.BASE_URL}icon-light.png`,
          badge: `${import.meta.env.BASE_URL}icon-light.png`,
          tag: p.data?.tag,
          renotify: true,
          data: p.data,
        } as NotificationOptions & { renotify?: boolean })
      } catch (err) {
        console.error('[FCM] foreground notification failed:', err)
      }
    })
  }, [])

  function handleLeave() {
    if (!confirm('Leave this room? You will need a new invite code to rejoin.')) return
    removeSavedRoom(buildingId, roomId)
    const remaining = getSavedRooms()
    if (remaining.length > 0) navigate(`/home?b=${remaining[0].buildingId}&r=${remaining[0].roomId}`)
    else navigate('/join')
  }

  if (loading) return <div className="flex min-h-screen items-center justify-center"><div className="text-muted-foreground text-sm">Loading…</div></div>

  if (!room) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-4">
        <Alert variant="destructive" className="max-w-md">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>Room not found. <button className="underline" onClick={() => navigate('/join')}>Register again</button></AlertDescription>
        </Alert>
      </div>
    )
  }

  const tabCount = isOwner ? 4 : 3

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-md p-4 space-y-4">
        {/* Header */}
        <div className="pt-4 pb-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                {isOwner ? <Crown className="h-5 w-5 text-primary" /> : <Bell className="h-5 w-5 text-primary" />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold">LobbyPing</h1>
                  {isOwner && <Badge variant="default" className="text-xs">Owner</Badge>}
                </div>
                <p className="text-sm text-muted-foreground">
                  {buildingName ? `${buildingName} · ` : ''}Room {room.number}
                  {savedRoom?.name ? ` · ${savedRoom.name}` : ''}
                </p>
              </div>
            </div>
            <Button variant="ghost" size="icon" title="Leave room" onClick={handleLeave}>
              <LogOut className="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>
        </div>

        {/* Multi-room selector */}
        <RoomSelector currentBuildingId={buildingId} currentRoomId={roomId} />

        <Separator />

        <Tabs defaultValue="arrivals">
          <TabsList className={cn('w-full', tabCount === 4 ? 'grid grid-cols-4' : 'grid grid-cols-3')}>
            <TabsTrigger value="arrivals">Arrivals</TabsTrigger>
            <TabsTrigger value="notifications">Alerts</TabsTrigger>
            <TabsTrigger value="instructions">Notes</TabsTrigger>
            {isOwner && <TabsTrigger value="members"><Crown className="h-3.5 w-3.5 mr-1" />Members</TabsTrigger>}
          </TabsList>

          <TabsContent value="arrivals" className="mt-4">
            <ActiveArrivals key={`${buildingId}-${roomId}`} buildingId={buildingId} roomId={roomId} canRespond={canRespond}
              responderName={responderName} responderRole={responderRole} responderDeviceId={savedRoom?.deviceId} />
          </TabsContent>

          <TabsContent value="notifications" className="mt-4">
            <div className="space-y-4">
              <SetupWizard buildingId={buildingId} roomId={roomId} />
              <NotificationGuide />
            </div>
          </TabsContent>

          <TabsContent value="instructions" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Delivery Instructions</CardTitle>
                <CardDescription>Shown to visitors when you don't respond</CardDescription>
              </CardHeader>
              <CardContent>
                <DeliveryInstructionsForm buildingId={buildingId} roomId={roomId} initial={room.instructions} />
              </CardContent>
            </Card>
          </TabsContent>

          {isOwner && savedRoom && (
            <TabsContent value="members" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" /> Manage Members</CardTitle>
                  <CardDescription>Create invite codes for family or roommates. Control their permissions.</CardDescription>
                </CardHeader>
                <CardContent>
                  <MembersPanel buildingId={buildingId} roomId={roomId} ownerDeviceId={savedRoom.deviceId} />
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  )
}
