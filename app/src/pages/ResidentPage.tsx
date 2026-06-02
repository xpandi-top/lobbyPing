import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import {
  Bell, CheckCircle2, AlertTriangle, Share, PlusSquare, Smartphone,
  BellRing, Volume2, Settings, Package, Utensils, Users
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { getRoom, registerDevice, updateInstructions } from '@/lib/firestore'
import {
  requestNotificationPermission,
  getFCMToken,
  sendTestNotification,
  isIOS,
  isInstalledPWA,
  detectPlatform,
} from '@/lib/fcm'
import type { Room, DeliveryInstructions } from '@/lib/types'

// ── Setup Wizard ────────────────────────────────────────────────────────────

type SetupStep = 'check' | 'add_to_home' | 'enable' | 'test' | 'done'

function SetupWizard({ buildingId, roomId }: { buildingId: string; roomId: string }) {
  const ios = isIOS()
  const installed = isInstalledPWA()
  const [step, setStep] = useState<SetupStep>(() => {
    if (Notification.permission === 'granted' && installed) return 'done'
    if (!installed && ios) return 'add_to_home'
    if (Notification.permission !== 'granted') return 'enable'
    return 'check'
  })
  const [testing, setTesting] = useState(false)

  const steps: SetupStep[] = ios
    ? ['add_to_home', 'enable', 'test', 'done']
    : ['enable', 'test', 'done']

  const stepIndex = steps.indexOf(step)
  const progress = step === 'done' ? 100 : Math.round((stepIndex / (steps.length - 1)) * 100)

  async function handleEnableNotifications() {
    const perm = await requestNotificationPermission()
    if (perm === 'granted') {
      const token = await getFCMToken()
      if (token) {
        await registerDevice(buildingId, roomId, token, detectPlatform())
      }
      setStep('test')
    } else {
      toast.error('Notifications blocked. Check your browser settings.')
    }
  }

  async function handleTestNotification() {
    setTesting(true)
    const ok = await sendTestNotification()
    setTesting(false)
    if (ok) {
      toast.success('Test notification sent!')
      setStep('done')
    } else {
      toast.error('Test failed. Make sure notifications are enabled.')
    }
  }

  if (step === 'done') {
    return (
      <Card className="border-green-200 bg-green-50">
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-8 w-8 text-green-600 shrink-0" />
            <div>
              <p className="font-semibold text-green-800">LobbyPing is ready</p>
              <p className="text-sm text-green-700">You will receive arrival notifications</p>
            </div>
          </div>
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
            <Button
              onClick={() => setStep('enable')}
              className="w-full"
              variant={installed ? 'default' : 'outline'}
            >
              {installed ? "I've opened from Home Screen" : "I've added to Home Screen"}
            </Button>
          </div>
        )}

        {/* Enable notifications */}
        {step === 'enable' && (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <Bell className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-medium text-sm">Allow Notifications</p>
                <p className="text-sm text-muted-foreground">
                  Tap the button below and allow notifications when prompted.
                </p>
              </div>
            </div>
            <Button onClick={handleEnableNotifications} className="w-full">
              Enable Notifications
            </Button>
          </div>
        )}

        {/* Test notification */}
        {step === 'test' && (
          <div className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <BellRing className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-sm">Send a test notification</p>
                  <p className="text-sm text-muted-foreground">
                    Verify notifications arrive and sound is on.
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
            </div>
            <Button onClick={handleTestNotification} disabled={testing} className="w-full">
              {testing ? 'Sending…' : 'Send Test Notification'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
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
    } catch {
      toast.error('Failed to save')
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
          <AlertDescription>Room not found. Check your link or invite code.</AlertDescription>
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

        <Tabs defaultValue="notifications">
          <TabsList className="w-full">
            <TabsTrigger value="notifications" className="flex-1">Notifications</TabsTrigger>
            <TabsTrigger value="instructions" className="flex-1">Instructions</TabsTrigger>
          </TabsList>

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
