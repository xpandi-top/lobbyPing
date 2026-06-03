import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Bell, MapPin, AlertTriangle, Crown, Users, Share, PlusSquare, Smartphone, Copy } from 'lucide-react'
import { getAuth } from 'firebase/auth'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { findInviteCode, redeemInviteCode, registerDevice, getBuilding, getRoom } from '@/lib/firestore'
import { getFCMToken, detectPlatform, isIOS, isInstalledPWA } from '@/lib/fcm'
import { saveRoom, getSavedRooms, getLastResidentRoom } from '@/lib/storage'
import { appUrl } from '@/lib/utils'

const schema = z.object({
  buildingId: z.string().min(1, 'Building ID required'),
  code: z.string().min(4, 'Invite code required').max(12),
  name: z.string().min(1, 'Your name required').max(40),
})

type FormData = z.infer<typeof schema>

export default function JoinPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const defaultBuilding = searchParams.get('b') ?? ''
  const defaultCode = searchParams.get('code') ?? ''
  const [loading, setLoading] = useState(false)
  const [buildingName, setBuildingName] = useState<string | null>(null)
  const [buildingNotFound, setBuildingNotFound] = useState(false)
  const iosNeedsInstall = isIOS() && !isInstalledPWA()
  const inviteUrl = appUrl(`join?b=${defaultBuilding}&code=${defaultCode}`)
  const [savedRooms] = useState(() => getSavedRooms())

  useEffect(() => {
    if (defaultBuilding || defaultCode) return
    const lastRoom = getLastResidentRoom()
    if (lastRoom) {
      navigate(`/resident?b=${lastRoom.buildingId}&r=${lastRoom.roomId}`, { replace: true })
      return
    }
    if (savedRooms.length === 1) {
      navigate(`/resident?b=${savedRooms[0].buildingId}&r=${savedRooms[0].roomId}`, { replace: true })
    }
  }, [defaultBuilding, defaultCode, navigate, savedRooms])

  // If the resident refreshes an invite link after redeeming it, recover from
  // local device state instead of asking them to reuse a one-time code.
  useEffect(() => {
    if (!defaultBuilding || !defaultCode) return
    const code = defaultCode.toUpperCase()
    const matches = getSavedRooms().filter((room) =>
      room.buildingId === defaultBuilding &&
      room.inviteCode?.toUpperCase() === code
    )
    if (matches.length === 1) {
      navigate(`/resident?b=${matches[0].buildingId}&r=${matches[0].roomId}`, { replace: true })
    }
  }, [defaultBuilding, defaultCode, navigate])

  useEffect(() => {
    if (!defaultBuilding) return
    getBuilding(defaultBuilding).then((b) => {
      if (b) setBuildingName(b.name)
      else setBuildingNotFound(true)
    }).catch(() => setBuildingNotFound(true))
  }, [defaultBuilding])

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { buildingId: defaultBuilding, code: defaultCode, name: '' },
  })

  async function onSubmit(data: FormData) {
    setLoading(true)
    try {
      const result = await findInviteCode(data.buildingId, data.code)
      if (!result) {
        toast.error('Invalid, expired, or already used invite code')
        setLoading(false)
        return
      }

      const { inviteCode, roomId } = result
      const auth = getAuth()
      const userId = auth.currentUser?.uid ?? 'anonymous'

      // Register device (get FCM token if available)
      const fcmToken = await getFCMToken() ?? `no-token-${Date.now()}`
      const deviceId = await registerDevice(
        data.buildingId, roomId, fcmToken, detectPlatform(),
        inviteCode.role, userId, inviteCode.id, inviteCode.permissions, data.name
      )

      // Mark code as redeemed
      await redeemInviteCode(data.buildingId, roomId, inviteCode.id, deviceId)

      // Fetch room + building for display
      const [room, building] = await Promise.all([
        getRoom(data.buildingId, roomId),
        getBuilding(data.buildingId),
      ])

      // Save to localStorage
      saveRoom({
        buildingId: data.buildingId,
        roomId,
        deviceId,
        userId,
        role: inviteCode.role,
        name: data.name,
        buildingName: building?.name ?? 'Unknown Building',
        roomNumber: room?.number ?? '?',
        inviteCode: data.code.toUpperCase(),
        inviteCodeId: inviteCode.id,
        joinedAt: Date.now(),
      })

      toast.success(`Joined ${building?.name ?? 'building'} — Room ${room?.number}`)
      navigate(`/resident?b=${data.buildingId}&r=${roomId}`)
    } catch (err) {
      toast.error(`Registration failed: ${err instanceof Error ? err.message : String(err)}`)
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-4">
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
              <Bell className="h-8 w-8 text-primary" />
            </div>
          </div>
          <h1 className="text-2xl font-bold">Join LobbyPing</h1>
          <p className="text-muted-foreground text-sm">Enter your invite code to receive arrival notifications</p>
        </div>

        {buildingNotFound && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>Building not found. Check your invite link or contact your admin.</AlertDescription>
          </Alert>
        )}

        {buildingName && (
          <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
            <MapPin className="h-4 w-4 text-primary shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Registering for</p>
              <p className="font-semibold text-sm">{buildingName}</p>
            </div>
          </div>
        )}

        {iosNeedsInstall && defaultBuilding && defaultCode && (
          <Card>
            <CardHeader>
              <CardTitle>iPhone setup note</CardTitle>
              <CardDescription>iPhone notifications work only from the installed resident app.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                {[
                  { icon: Smartphone, text: 'Register this device with your invite code' },
                  { icon: Share, text: 'On the resident room page, tap Share in Safari' },
                  { icon: PlusSquare, text: 'Choose Add to Home Screen and open LobbyPing from there' },
                ].map(({ icon: Icon, text }, index) => (
                  <div key={text} className="flex items-center gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                      {index + 1}
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <span>{text}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="rounded-md bg-muted p-3 text-sm">
                <p className="text-xs text-muted-foreground">Keep this invite handy</p>
                <p className="mt-1 font-mono text-xs break-all">{inviteUrl}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3 w-full"
                  onClick={() => {
                    navigator.clipboard.writeText(inviteUrl)
                    toast.success('Invite link copied')
                  }}
                >
                  <Copy className="mr-2 h-3.5 w-3.5" />
                  Copy Invite Link
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Add to Home Screen from the resident room page after registration. The installed app will open that room, so you do not need to enter the building ID or invite code again.
              </p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Redeem Invite Code</CardTitle>
            <CardDescription>Your building administrator or homeowner provided this code</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {!defaultBuilding && (
                <div className="space-y-2">
                  <Label htmlFor="buildingId">Building ID</Label>
                  <Input id="buildingId" placeholder="Provided by admin" {...register('buildingId')} />
                  {errors.buildingId && <p className="text-sm text-destructive">{errors.buildingId.message}</p>}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="name">Your name</Label>
                <Input id="name" placeholder="e.g. Alice" autoComplete="given-name" {...register('name')} />
                {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="code">Invite Code</Label>
                <Input id="code" placeholder="e.g. ABC123" autoCapitalize="characters"
                  className="tracking-widest text-lg h-12 uppercase" {...register('code')} />
                {errors.code && <p className="text-sm text-destructive">{errors.code.message}</p>}
              </div>
              <Button type="submit" disabled={loading} className="w-full h-12 text-base">
                {loading ? 'Registering…' : 'Register Device'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Already joined rooms */}
        {savedRooms.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Already Joined</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {savedRooms.map((r) => (
                <button
                  key={`${r.buildingId}-${r.roomId}`}
                  type="button"
                  onClick={() => navigate(`/resident?b=${r.buildingId}&r=${r.roomId}`)}
                  className="flex w-full items-center justify-between rounded-md border p-3 hover:bg-muted transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {r.role === 'owner' ? <Crown className="h-4 w-4 text-primary" /> : <Users className="h-4 w-4 text-muted-foreground" />}
                    <div className="text-left">
                      <p className="font-medium text-sm">{r.buildingName}</p>
                      <p className="text-xs text-muted-foreground">Room {r.roomNumber}</p>
                    </div>
                  </div>
                  <Badge variant={r.role === 'owner' ? 'default' : 'secondary'} className="text-xs">
                    {r.role}
                  </Badge>
                </button>
              ))}
            </CardContent>
          </Card>
        )}

        <p className="text-center text-xs text-muted-foreground">Invite codes can only be used once</p>
      </div>
    </div>
  )
}
