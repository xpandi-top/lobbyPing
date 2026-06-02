import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import QRCode from 'qrcode'
import { toast } from 'sonner'
import { Building2, Plus, QrCode, KeyRound, Copy, Printer, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { createBuilding, createRoom, listRooms, getBuilding } from '@/lib/firestore'
import type { Room } from '@/lib/types'

const ADMIN_KEY = import.meta.env.VITE_ADMIN_KEY ?? 'admin'

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

const buildingSchema = z.object({
  name: z.string().min(2, 'Building name required'),
  slug: z.string().min(3, 'Slug required').regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers, hyphens only'),
})

const roomSchema = z.object({
  number: z.string().min(1, 'Room number required').max(10),
})

type BuildingForm = z.infer<typeof buildingSchema>
type RoomForm = z.infer<typeof roomSchema>

export default function AdminPage() {
  const [searchParams] = useSearchParams()
  const key = searchParams.get('key')
  const [buildingId, setBuildingId] = useState(searchParams.get('b') ?? '')
  const [buildingName, setBuildingName] = useState('')
  const [rooms, setRooms] = useState<Room[]>([])
  const [qrDataUrl, setQrDataUrl] = useState('')

  const buildingForm = useForm<BuildingForm>({ resolver: zodResolver(buildingSchema) })
  const roomForm = useForm<RoomForm>({ resolver: zodResolver(roomSchema) })

  // Auth gate
  if (key !== ADMIN_KEY) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-4">
        <div className="text-center space-y-3">
          <ShieldAlert className="h-12 w-12 mx-auto text-muted-foreground" />
          <h2 className="text-xl font-semibold">Access Denied</h2>
          <p className="text-muted-foreground text-sm">Admin key required in URL: ?key=YOUR_KEY</p>
        </div>
      </div>
    )
  }

  useEffect(() => {
    if (!buildingId) return
    getBuilding(buildingId).then((b) => {
      if (b) setBuildingName(b.name)
    })
    listRooms(buildingId).then(setRooms)
    generateQR(buildingId)
  }, [buildingId])

  async function generateQR(bid: string) {
    const url = `${window.location.origin}${window.location.pathname}#/visit?b=${bid}`
    const dataUrl = await QRCode.toDataURL(url, { width: 512, margin: 2 })
    setQrDataUrl(dataUrl)
  }

  async function onCreateBuilding(data: BuildingForm) {
    try {
      const id = await createBuilding(data.name, data.slug)
      setBuildingId(id)
      setBuildingName(data.name)
      toast.success(`Building "${data.name}" created`)
      buildingForm.reset()
    } catch {
      toast.error('Failed to create building')
    }
  }

  async function onCreateRoom(data: RoomForm) {
    if (!buildingId) { toast.error('Create a building first'); return }
    const code = generateInviteCode()
    try {
      await createRoom(buildingId, data.number, code)
      const updated = await listRooms(buildingId)
      setRooms(updated)
      toast.success(`Room ${data.number} created — invite code: ${code}`)
      roomForm.reset()
    } catch {
      toast.error('Failed to create room')
    }
  }

  function copyInviteLink(room: Room) {
    const url = `${window.location.origin}${window.location.pathname}#/join?b=${buildingId}&code=${room.inviteCode}`
    navigator.clipboard.writeText(url)
    toast.success('Invite link copied')
  }

  function printQR() {
    const win = window.open('', '_blank')
    if (!win || !qrDataUrl) return
    win.document.write(`
      <html><head><title>LobbyPing QR — ${buildingName}</title>
      <style>body{font-family:sans-serif;text-align:center;padding:40px}img{width:300px}h1{font-size:24px}p{color:#666;margin-top:8px}</style>
      </head><body>
      <h1>${buildingName}</h1>
      <p>Scan to notify a resident</p>
      <img src="${qrDataUrl}" />
      <p style="margin-top:16px;font-size:13px">Powered by LobbyPing</p>
      </body></html>
    `)
    win.document.close()
    win.print()
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl p-4 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3 pt-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Building2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">LobbyPing Admin</h1>
            {buildingName && <p className="text-sm text-muted-foreground">{buildingName}</p>}
          </div>
        </div>

        <Separator />

        {/* Create Building */}
        {!buildingId && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Create Building</CardTitle>
              <CardDescription>Set up your building to get started</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={buildingForm.handleSubmit(onCreateBuilding)} className="space-y-3">
                <div className="space-y-2">
                  <Label>Building name</Label>
                  <Input placeholder="Maple Heights" {...buildingForm.register('name')} />
                  {buildingForm.formState.errors.name && (
                    <p className="text-sm text-destructive">{buildingForm.formState.errors.name.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>URL slug</Label>
                  <Input placeholder="maple-heights" {...buildingForm.register('slug')} />
                  <p className="text-xs text-muted-foreground">Used in visitor QR code link</p>
                  {buildingForm.formState.errors.slug && (
                    <p className="text-sm text-destructive">{buildingForm.formState.errors.slug.message}</p>
                  )}
                </div>
                <Button type="submit" className="w-full">
                  <Plus className="h-4 w-4 mr-2" /> Create Building
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {buildingId && (
          <>
            {/* Building ID */}
            <Card className="bg-muted/30">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Building ID</p>
                    <p className="font-mono text-sm">{buildingId}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { navigator.clipboard.writeText(buildingId); toast.success('Copied') }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* QR Code */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <QrCode className="h-4 w-4" /> Building QR Code
                </CardTitle>
                <CardDescription>Visitors scan this to notify residents</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {qrDataUrl && (
                  <div className="flex justify-center">
                    <img src={qrDataUrl} alt="Building QR Code" className="w-48 h-48 rounded-lg border" />
                  </div>
                )}
                <Button variant="outline" onClick={printQR} className="w-full">
                  <Printer className="h-4 w-4 mr-2" /> Print QR Code
                </Button>
              </CardContent>
            </Card>

            {/* Create Room */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Plus className="h-4 w-4" /> Add Room
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={roomForm.handleSubmit(onCreateRoom)} className="flex gap-2">
                  <div className="flex-1">
                    <Input
                      placeholder="e.g. 101"
                      {...roomForm.register('number')}
                    />
                    {roomForm.formState.errors.number && (
                      <p className="text-sm text-destructive mt-1">{roomForm.formState.errors.number.message}</p>
                    )}
                  </div>
                  <Button type="submit">Add</Button>
                </form>
              </CardContent>
            </Card>

            {/* Room List */}
            {rooms.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Rooms ({rooms.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {rooms.map((room) => (
                      <div
                        key={room.id}
                        className="flex items-center justify-between rounded-md border p-3"
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-medium">Room {room.number}</span>
                          <div className="flex items-center gap-1.5">
                            <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="font-mono text-sm tracking-wider">{room.inviteCode}</span>
                          </div>
                          {room.inviteRedeemed ? (
                            <Badge variant="secondary" className="text-xs">Registered</Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs">Pending</Badge>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyInviteLink(room)}
                          title="Copy invite link"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  )
}
