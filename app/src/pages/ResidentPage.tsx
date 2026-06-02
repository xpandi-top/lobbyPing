import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import {
  Bell, CheckCircle2, AlertTriangle, Share, PlusSquare, Smartphone,
  BellRing, Volume2, Settings, Package, Utensils, Users,
  ArrowDownToLine, XCircle, Clock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { getRoom, registerDevice, updateInstructions, respondToArrival } from '@/lib/firestore'
import {
  collection, query, where, onSnapshot,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import {
  requestNotificationPermission,
  getFCMToken,
  sendTestNotification,
  isIOS,
  isInstalledPWA,
  detectPlatform,
} from '@/lib/fcm'
import type { Room, DeliveryInstructions, Arrival, ResidentResponse } from '@/lib/types'
import { cn } from '@/lib/utils'

// ── Setup Wizard ────────────────────────────────────────────────────────────

type SetupStep = 'add_to_home' | 'enable' | 'enabling' | 'test' | 'done' | 'blocked'

function SetupWizard({ buildingId, roomId }: { buildingId: string; roomId: string }) {
  const ios = isIOS()
  const installed = isInstalledPWA()
  const [step, setStep] = useState<SetupStep>(() => {
    if (Notification.permission === 'granted') return 'done'
    if (Notification.permission === 'denied') return 'blocked'
    if (!installed && ios) return 'add_to_home'
    return 'enable'
  })
  const [testing, setTesting] = useState(false)
  const [tokenRegistered, setTokenRegistered] = useState(false)

  const steps: SetupStep[] = ios
    ? ['add_to_home', 'enable', 'test', 'done']
    : ['enable', 'test', 'done']
  const stepIndex = steps.indexOf(step)
  const progress = step === 'done' ? 100 : Math.max(0, Math.round((stepIndex / (steps.length - 1)) * 100))

  async function handleEnableNotifications() {
    setStep('enabling')
    const perm = await requestNotificationPermission()
    if (perm === 'granted') {
      const token = await getFCMToken()
      if (token) {
        try {
          await registerDevice(buildingId, roomId, token, detectPlatform())
          setTokenRegistered(true)
          toast.success('Device registered for notifications')
        } catch (err) {
          console.error('[Setup] registerDevice failed:', err)
          toast.error(`Device registration failed: ${err instanceof Error ? err.message : String(err)}`)
        }
      } else {
        console.warn('[Setup] FCM token was null — SW registration may have failed')
        toast.error('Could not get notification token. Check browser console.')
      }
      setStep('test')
    } else if (perm === 'denied') {
      setStep('blocked')
    } else {
      // dismissed
      setStep('enable')
    }
  }

  async function handleTestNotification() {
    setTesting(true)
    const ok = await sendTestNotification()
    setTesting(false)
    if (ok) {
      toast.success('Test notification sent! Check your notifications.')
      setStep('done')
    } else {
      toast.error('Test failed. Make sure notifications are enabled in system settings.')
    }
  }

  if (step === 'done') {
    return (
      <Card className="border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950">
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-8 w-8 text-green-600 shrink-0" />
            <div>
              <p className="font-semibold text-green-800 dark:text-green-200">LobbyPing is ready</p>
              <p className="text-sm text-green-700 dark:text-green-300">
                {tokenRegistered ? 'Device registered. Push notifications active.' : 'Notifications enabled.'}
              </p>
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
              <p className="font-semibold">Notifications blocked</p>
              <p className="text-sm text-muted-foreground">
                Enable notifications in your browser/OS settings, then reload this page.
              </p>
            </div>
          </div>
          <Button variant="outline" onClick={() => window.location.reload()} className="w-full">
            Reload Page
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BellRing className="h-5 w-5 text-primary" />
          Notification Setup
        </CardTitle>
        <CardDescription>Required to receive arrival alerts</CardDescription>
        <Progress value={progress} className="h-1.5 mt-2" />
      </CardHeader>
      <CardContent className="space-y-4">
        {/* iOS: Add to Home Screen */}
        {step === 'add_to_home' && (
          <div className="space-y-4">
            <Alert>
              <Smartphone className="h-4 w-4" />
              <AlertDescription>
                iOS requires LobbyPing to be installed as an app to receive notifications.
              </AlertDescription>
            </Alert>
            <div className="space-y-3">
              {[
                { icon: Share, text: 'Tap the Share button in Safari' },
                { icon: PlusSquare, text: 'Tap "Add to Home Screen"' },
                { icon: Smartphone, text: 'Open LobbyPing from your Home Screen' },
              ].map(({ icon: Icon, text }, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                    {i + 1}
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <span>{text}</span>
                  </div>
                </div>
              ))}
            </div>
            <Button onClick={() => setStep('enable')} className="w-full">
              {installed ? "I've opened from Home Screen" : "I've added to Home Screen"}
            </Button>
          </div>
        )}

        {/* Enable notifications */}
        {(step === 'enable' || step === 'enabling') && (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <Bell className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-medium text-sm">Allow Notifications</p>
                <p className="text-sm text-muted-foreground">
                  Tap the button below and allow notifications when the browser prompts you.
                </p>
              </div>
            </div>
            <Button
              onClick={handleEnableNotifications}
              disabled={step === 'enabling'}
              className="w-full"
            >
              {step === 'enabling' ? 'Requesting permission…' : 'Enable Notifications'}
            </Button>
          </div>
        )}

        {/* Test notification */}
        {step === 'test' && (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-sm text-green-700">Notifications enabled!</p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Now send a test to verify sound and delivery.
                </p>
              </div>
            </div>
            <div className="rounded-md bg-muted p-3 space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Volume2 className="h-4 w-4 text-muted-foreground" />
                <span>Make sure sound is enabled</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Settings className="h-4 w-4 text-muted-foreground" />
                <span>Check Focus Mode is not blocking alerts</span>
              </div>
            </div>
            <Button onClick={handleTestNotification} disabled={testing} className="w-full">
              {testing ? 'Sending…' : 'Send Test Notification'}
            </Button>
            <Button variant="ghost" onClick={() => setStep('done')} className="w-full text-muted-foreground">
              Skip test
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ── Active Arrivals ─────────────────────────────────────────────────────────

const ARRIVAL_TYPE_LABELS: Record<string, string> = {
  package: 'Package',
  food: 'Food Delivery',
  guest: 'Guest',
  other: 'Other',
}

const WAIT_LABELS: Record<string, string> = {
  '1min': '1 min',
  '2min': '2 min',
  '5min': '5 min',
}

const RESPONSE_OPTIONS: {
  value: ResidentResponse
  label: string
  icon: React.FC<{ className?: string }>
  color: string
}[] = [
  { value: 'coming_down', label: 'Coming Down', icon: ArrowDownToLine, color: 'border-green-200 bg-green-50 text-green-700 hover:bg-green-100' },
  { value: 'leave_in_lobby', label: 'Leave in Lobby', icon: CheckCircle2, color: 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100' },
  { value: 'no_need_to_wait', label: 'No Need to Wait', icon: XCircle, color: 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100' },
]

function ArrivalCard({
  arrival,
  buildingId,
  roomId,
}: {
  arrival: Arrival
  buildingId: string
  roomId: string
}) {
  const [responding, setResponding] = useState(false)
  const isExpired = arrival.status === 'expired' || arrival.expiresAt.toMillis() < Date.now()
  const hasResponded = arrival.status === 'responded'

  async function handleResponse(response: ResidentResponse) {
    if (responding) return
    setResponding(true)
    try {
      await respondToArrival(buildingId, roomId, arrival.id, response)
      toast.success('Response sent to visitor')
    } catch (err) {
      toast.error(`Failed: ${err instanceof Error ? err.message : String(err)}`)
      setResponding(false)
    }
  }

  return (
    <Card className={cn(
      'border-2',
      isExpired ? 'opacity-50' : hasResponded ? 'border-green-200' : 'border-primary/30 shadow-md'
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">
              {ARRIVAL_TYPE_LABELS[arrival.type] ?? arrival.type}
            </CardTitle>
            {!hasResponded && !isExpired && (
              <Badge variant="default" className="text-xs animate-pulse">
                Waiting
              </Badge>
            )}
            {hasResponded && <Badge variant="secondary" className="text-xs">Responded</Badge>}
            {isExpired && <Badge variant="outline" className="text-xs">Expired</Badge>}
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {WAIT_LABELS[arrival.waitTime] ?? arrival.waitTime}
            {arrival.reminderCount > 0 && (
              <span className="ml-1 text-orange-500">· {arrival.reminderCount} reminder{arrival.reminderCount > 1 ? 's' : ''}</span>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {hasResponded ? (
          <p className="text-sm text-muted-foreground">
            You responded: <span className="font-medium text-foreground">
              {RESPONSE_OPTIONS.find(r => r.value === arrival.response)?.label ?? arrival.response}
            </span>
          </p>
        ) : isExpired ? (
          <p className="text-sm text-muted-foreground">Visitor left without a response.</p>
        ) : (
          <div className="space-y-2">
            {RESPONSE_OPTIONS.map(({ value, label, icon: Icon, color }) => (
              <button
                key={value}
                type="button"
                onClick={() => handleResponse(value)}
                disabled={responding}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors disabled:opacity-50',
                  color
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="font-medium text-sm">{label}</span>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ActiveArrivals({ buildingId, roomId }: { buildingId: string; roomId: string }) {
  const [arrivals, setArrivals] = useState<Arrival[]>([])

  useEffect(() => {
    if (!buildingId || !roomId) return
    const arrivalsRef = collection(db, 'buildings', buildingId, 'rooms', roomId, 'arrivals')
    const q = query(arrivalsRef, where('status', 'in', ['pending', 'responded']))
    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs
        .map(d => ({ id: d.id, ...d.data() }) as Arrival)
        .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis())
      setArrivals(docs)
    })
    return unsub
  }, [buildingId, roomId])

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
      {arrivals.map(arrival => (
        <ArrivalCard
          key={arrival.id}
          arrival={arrival}
          buildingId={buildingId}
          roomId={roomId}
        />
      ))}
    </div>
  )
}

// ── Delivery Instructions ───────────────────────────────────────────────────

const instructionsSchema = z.object({
  package: z.string().max(300),
  food: z.string().max(300),
  guest: z.string().max(300),
})

type InstructionsForm = z.infer<typeof instructionsSchema>

function DeliveryInstructionsForm({
  buildingId,
  roomId,
  initial,
}: {
  buildingId: string
  roomId: string
  initial: DeliveryInstructions
}) {
  const [saving, setSaving] = useState(false)
  const { register, handleSubmit, formState: { isDirty } } = useForm<InstructionsForm>({
    resolver: zodResolver(instructionsSchema),
    defaultValues: initial,
  })

  async function onSubmit(data: InstructionsForm) {
    setSaving(true)
    try {
      await updateInstructions(buildingId, roomId, data)
      toast.success('Instructions saved')
    } catch (err) {
      toast.error(`Failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <Package className="h-4 w-4" /> Package instructions
        </Label>
        <Textarea
          placeholder="e.g. Leave inside parcel locker in lobby"
          rows={2}
          {...register('package')}
        />
      </div>
      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <Utensils className="h-4 w-4" /> Food delivery instructions
        </Label>
        <Textarea
          placeholder="e.g. Please wait 2 minutes. Leave at front desk if no answer."
          rows={2}
          {...register('food')}
        />
      </div>
      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <Users className="h-4 w-4" /> Guest instructions
        </Label>
        <Textarea
          placeholder="e.g. Resident will come downstairs to meet you."
          rows={2}
          {...register('guest')}
        />
      </div>
      <Button type="submit" disabled={saving || !isDirty} className="w-full">
        {saving ? 'Saving…' : 'Save Instructions'}
      </Button>
    </form>
  )
}

// ── Main Page ───────────────────────────────────────────────────────────────

export default function ResidentPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const buildingId = searchParams.get('b') ?? ''
  const roomId = searchParams.get('r') ?? ''
  const [room, setRoom] = useState<Room | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!buildingId || !roomId) { setLoading(false); return }
    getRoom(buildingId, roomId).then((r) => {
      setRoom(r)
      setLoading(false)
    })
  }, [buildingId, roomId])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-muted-foreground text-sm">Loading…</div>
      </div>
    )
  }

  if (!room) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-4">
        <Alert variant="destructive" className="max-w-md">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Room not found. Check your link or invite code.{' '}
            <button
              className="underline"
              onClick={() => navigate('/join')}
            >
              Register again
            </button>
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-md p-4 space-y-4">
        {/* Header */}
        <div className="pt-4 pb-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <Bell className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold">LobbyPing</h1>
              <p className="text-sm text-muted-foreground">Room {room.number}</p>
            </div>
          </div>
        </div>

        <Separator />

        <Tabs defaultValue="arrivals">
          <TabsList className="w-full">
            <TabsTrigger value="arrivals" className="flex-1">Arrivals</TabsTrigger>
            <TabsTrigger value="notifications" className="flex-1">Notifications</TabsTrigger>
            <TabsTrigger value="instructions" className="flex-1">Instructions</TabsTrigger>
          </TabsList>

          <TabsContent value="arrivals" className="mt-4">
            <ActiveArrivals buildingId={buildingId} roomId={roomId} />
          </TabsContent>

          <TabsContent value="notifications" className="mt-4">
            <SetupWizard buildingId={buildingId} roomId={roomId} />
          </TabsContent>

          <TabsContent value="instructions" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Delivery Instructions</CardTitle>
                <CardDescription>
                  Shown to visitors when you don't respond
                </CardDescription>
              </CardHeader>
              <CardContent>
                <DeliveryInstructionsForm
                  buildingId={buildingId}
                  roomId={roomId}
                  initial={room.instructions}
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
