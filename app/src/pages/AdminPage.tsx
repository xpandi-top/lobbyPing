import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import QRCode from 'qrcode'
import { toast } from 'sonner'
import {
  Building2, Plus, QrCode, KeyRound, Copy, Printer, ShieldAlert,
  Trash2, RefreshCw, ChevronLeft, Users, Home, Crown,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'

import {
  createBuilding, listBuildings, deleteBuilding,
  createRoom, listRooms, deleteRoom,
  createInviteCode, listInviteCodes, deleteInviteCode,
  getBuilding,
} from '@/lib/firestore'
import type { Building, Room, InviteCode } from '@/lib/types'
import { appUrl } from '@/lib/utils'

const ADMIN_KEY = import.meta.env.VITE_ADMIN_KEY ?? 'admin'

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

const buildingSchema = z.object({
  name: z.string().min(2, 'Building name required'),
  slug: z.string().min(3).regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers, hyphens only'),
})
const roomSchema = z.object({ number: z.string().min(1).max(10) })

type BuildingForm = z.infer<typeof buildingSchema>
type RoomForm = z.infer<typeof roomSchema>

// ── Building List ─────────────────────────────────────────────────────────

function BuildingList({ onSelect, onCreate }: { onSelect: (b: Building) => void; onCreate: () => void }) {
  const [buildings, setBuildings] = useState<Building[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    listBuildings().then((b) => { setBuildings(b); setLoading(false) })
  }, [])

  async function handleDelete(b: Building) {
    if (!confirm(`Delete "${b.name}" and ALL its rooms? Cannot be undone.`)) return
    setDeletingId(b.id)
    try {
      await deleteBuilding(b.id)
      setBuildings((prev) => prev.filter((x) => x.id !== b.id))
      toast.success(`"${b.name}" deleted`)
    } catch (err) {
      toast.error(`Delete failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) return <div className="text-center text-sm text-muted-foreground py-8">Loading…</div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Buildings ({buildings.length})</h2>
        <Button size="sm" onClick={onCreate}><Plus className="h-4 w-4 mr-1" /> New Building</Button>
      </div>
      {buildings.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <Building2 className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">No buildings yet</p>
          <Button size="sm" className="mt-3" onClick={onCreate}>Create first building</Button>
        </div>
      ) : (
        <div className="space-y-2">
          {buildings.map((b) => (
            <Card key={b.id} className="cursor-pointer hover:border-primary/50 transition-colors">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between">
                  <button type="button" className="flex items-center gap-3 flex-1 text-left" onClick={() => onSelect(b)}>
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <Home className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">{b.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{b.qrSlug}</p>
                    </div>
                  </button>
                  <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    disabled={deletingId === b.id} onClick={(e) => { e.stopPropagation(); handleDelete(b) }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Create Building Form ──────────────────────────────────────────────────

function CreateBuildingForm({ onCreated, onCancel }: { onCreated: (b: Building) => void; onCancel: () => void }) {
  const form = useForm<BuildingForm>({ resolver: zodResolver(buildingSchema) })
  async function onSubmit(data: BuildingForm) {
    try {
      const id = await createBuilding(data.name, data.slug)
      toast.success(`"${data.name}" created`)
      onCreated({ id, name: data.name, qrSlug: data.slug } as Building)
    } catch (err) {
      toast.error(`Failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">New Building</CardTitle>
        <CardDescription>Create a building to generate QR codes and rooms</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
          <div className="space-y-2">
            <Label>Building name</Label>
            <Input placeholder="Maple Heights" {...form.register('name')} />
            {form.formState.errors.name && <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>}
          </div>
          <div className="space-y-2">
            <Label>URL slug</Label>
            <Input placeholder="maple-heights" {...form.register('slug')} />
            <p className="text-xs text-muted-foreground">Used in visitor QR code link</p>
            {form.formState.errors.slug && <p className="text-sm text-destructive">{form.formState.errors.slug.message}</p>}
          </div>
          <div className="flex gap-2">
            <Button type="submit" className="flex-1"><Plus className="h-4 w-4 mr-2" /> Create</Button>
            <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

// ── Room Invite Codes Panel ───────────────────────────────────────────────

function RoomCodesPanel({ buildingId, room }: { buildingId: string; room: Room }) {
  const [codes, setCodes] = useState<InviteCode[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    listInviteCodes(buildingId, room.id).then((c) => { setCodes(c); setLoading(false) })
  }, [buildingId, room.id])

  async function addOwnerCode() {
    const code = generateCode()
    try {
      await createInviteCode(buildingId, room.id, code, 'owner', 'admin', {
        permissions: { notify: true, respond: true },
      })
      const updated = await listInviteCodes(buildingId, room.id)
      setCodes(updated)
      toast.success(`Owner code created: ${code}`)
    } catch (err) {
      toast.error(`Failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  async function handleDelete(codeId: string) {
    try {
      await deleteInviteCode(buildingId, room.id, codeId)
      setCodes((prev) => prev.filter((c) => c.id !== codeId))
      toast.success('Code deleted')
    } catch (err) {
      toast.error(`Failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  function copyInviteLink(ic: InviteCode) {
    const url = appUrl(`join?b=${buildingId}&code=${ic.code}`)
    navigator.clipboard.writeText(url)
    toast.success('Invite link copied')
  }

  if (loading) return <p className="text-xs text-muted-foreground py-2">Loading codes…</p>

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Invite Codes ({codes.length})
        </p>
        <Button size="sm" variant="outline" onClick={addOwnerCode}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add Owner Code
        </Button>
      </div>
      {codes.length === 0 && (
        <p className="text-xs text-muted-foreground italic">No codes. Add one above.</p>
      )}
      {codes.map((ic) => (
        <div key={ic.id} className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1">
              <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-mono text-sm tracking-wider">{ic.code}</span>
            </div>
            <Badge variant={ic.role === 'owner' ? 'default' : 'secondary'} className="text-xs">
              {ic.role === 'owner' && <Crown className="h-3 w-3 mr-1" />}
              {ic.role}
            </Badge>
            {ic.redeemed ? (
              <Badge variant="outline" className="text-xs text-green-600 border-green-300">Used</Badge>
            ) : ic.expiresAt && ic.expiresAt.toMillis() < Date.now() ? (
              <Badge variant="destructive" className="text-xs">Expired</Badge>
            ) : (
              <Badge variant="outline" className="text-xs">Available</Badge>
            )}
            {ic.expiresAt && (
              <span className="text-xs text-muted-foreground">
                Exp: {new Date(ic.expiresAt.toMillis()).toLocaleDateString()}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {!ic.redeemed && (
              <Button variant="ghost" size="icon" title="Copy invite link" onClick={() => copyInviteLink(ic)}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive"
              onClick={() => handleDelete(ic.id)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Building Detail ───────────────────────────────────────────────────────

function BuildingDetail({ building, onBack }: { building: Building; onBack: () => void }) {
  const [rooms, setRooms] = useState<Room[]>([])
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [deletingRoomId, setDeletingRoomId] = useState<string | null>(null)
  const [expandedRoomId, setExpandedRoomId] = useState<string | null>(null)
  const roomForm = useForm<RoomForm>({ resolver: zodResolver(roomSchema) })

  useEffect(() => {
    listRooms(building.id).then(setRooms)
    const url = appUrl(`visit?b=${building.id}`)
    QRCode.toDataURL(url, { width: 512, margin: 2 }).then(setQrDataUrl)
  }, [building.id])

  async function onCreateRoom(data: RoomForm) {
    const duplicate = rooms.find((r) => r.number.trim().toLowerCase() === data.number.trim().toLowerCase())
    if (duplicate) {
      toast.error(`Room ${data.number} already exists.`)
      return
    }
    try {
      const roomId = await createRoom(building.id, data.number)
      // Auto-create first owner invite code
      const code = generateCode()
      await createInviteCode(building.id, roomId, code, 'owner', 'admin', {
        permissions: { notify: true, respond: true },
      })
      const updated = await listRooms(building.id)
      setRooms(updated)
      setExpandedRoomId(roomId)
      toast.success(`Room ${data.number} created — owner code: ${code}`)
      roomForm.reset()
    } catch (err) {
      toast.error(`Failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  async function handleDeleteRoom(room: Room) {
    if (!confirm(`Delete Room ${room.number}? All devices and arrivals will be removed.`)) return
    setDeletingRoomId(room.id)
    try {
      await deleteRoom(building.id, room.id)
      setRooms((prev) => prev.filter((r) => r.id !== room.id))
      toast.success(`Room ${room.number} deleted`)
    } catch (err) {
      toast.error(`Delete failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setDeletingRoomId(null)
    }
  }

  function printQR() {
    const win = window.open('', '_blank')
    if (!win || !qrDataUrl) return
    win.document.write(`<html><head><title>LobbyPing QR — ${building.name}</title>
      <style>body{font-family:sans-serif;text-align:center;padding:40px}img{width:300px}h1{font-size:24px}p{color:#666;margin-top:8px}</style>
      </head><body><h1>${building.name}</h1><p>Scan to notify a resident</p>
      <img src="${qrDataUrl}" /><p style="margin-top:16px;font-size:13px">Powered by LobbyPing</p></body></html>`)
    win.document.close()
    win.print()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}><ChevronLeft className="h-4 w-4" /></Button>
        <div>
          <h2 className="font-bold text-lg">{building.name}</h2>
          <p className="text-xs text-muted-foreground font-mono">{building.id}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <Card><CardContent className="pt-4 pb-4 text-center">
          <p className="text-2xl font-bold">{rooms.length}</p>
          <p className="text-xs text-muted-foreground">Total rooms</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-4 text-center">
          <p className="text-2xl font-bold text-green-600">{rooms.length}</p>
          <p className="text-xs text-muted-foreground">Active rooms</p>
        </CardContent></Card>
      </div>

      {/* QR Code */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><QrCode className="h-4 w-4" /> Building QR Code</CardTitle>
          <CardDescription>Post this in the lobby for visitors to scan</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {qrDataUrl && <div className="flex justify-center"><img src={qrDataUrl} alt="QR" className="w-48 h-48 rounded-lg border" /></div>}
          <div className="flex gap-2">
            <Button variant="outline" onClick={printQR} className="flex-1"><Printer className="h-4 w-4 mr-2" /> Print</Button>
            <Button variant="outline" onClick={() => {
              const url = appUrl(`visit?b=${building.id}`)
              navigator.clipboard.writeText(url); toast.success('Visitor link copied')
            }} className="flex-1"><Copy className="h-4 w-4 mr-2" /> Copy Link</Button>
          </div>
        </CardContent>
      </Card>

      {/* Add Room */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Plus className="h-4 w-4" /> Add Room</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={roomForm.handleSubmit(onCreateRoom)} className="flex gap-2">
            <div className="flex-1">
              <Input placeholder="Room number e.g. 101" {...roomForm.register('number')} />
              {roomForm.formState.errors.number && (
                <p className="text-sm text-destructive mt-1">{roomForm.formState.errors.number.message}</p>
              )}
            </div>
            <Button type="submit">Add</Button>
          </form>
          <p className="text-xs text-muted-foreground mt-2">An owner invite code is auto-generated when room is created.</p>
        </CardContent>
      </Card>

      {/* Room List */}
      {rooms.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Users className="h-4 w-4" /> Rooms ({rooms.length})</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {rooms.map((room) => (
                <div key={room.id} className="rounded-md border overflow-hidden">
                  <div className="flex items-center justify-between p-3">
                    <button type="button" className="flex items-center gap-2 flex-1 text-left font-medium"
                      onClick={() => setExpandedRoomId(expandedRoomId === room.id ? null : room.id)}>
                      Room {room.number}
                      <RefreshCw className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${expandedRoomId === room.id ? 'rotate-180' : ''}`} />
                    </button>
                    <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive"
                      disabled={deletingRoomId === room.id} onClick={() => handleDeleteRoom(room)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {expandedRoomId === room.id && (
                    <div className="border-t bg-muted/20 p-3">
                      <RoomCodesPanel buildingId={building.id} room={room} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────

type AdminView = 'list' | 'create' | 'detail'

export default function AdminPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const key = searchParams.get('key')
  const [view, setView] = useState<AdminView>(() => searchParams.get('b') ? 'detail' : 'list')
  const [selectedBuilding, setSelectedBuilding] = useState<Building | null>(null)

  useEffect(() => {
    const bId = searchParams.get('b')
    if (bId && !selectedBuilding) {
      getBuilding(bId).then((b) => {
        if (b) { setSelectedBuilding(b); setView('detail') }
      })
    }
  }, [])

  if (key !== ADMIN_KEY) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-4">
        <div className="text-center space-y-3">
          <ShieldAlert className="h-12 w-12 mx-auto text-muted-foreground" />
          <h2 className="text-xl font-semibold">Access Denied</h2>
          <p className="text-muted-foreground text-sm">Admin key required: ?key=YOUR_KEY</p>
        </div>
      </div>
    )
  }

  function selectBuilding(b: Building) {
    setSelectedBuilding(b)
    setSearchParams({ key: key!, b: b.id })
    setView('detail')
  }

  function goBack() {
    setSelectedBuilding(null)
    setSearchParams({ key: key! })
    setView('list')
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl p-4 space-y-4">
        <div className="flex items-center gap-3 pt-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Building2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">LobbyPing Admin</h1>
            <p className="text-xs text-muted-foreground">Building management</p>
          </div>
        </div>
        <Separator />
        {view === 'list' && <BuildingList onSelect={selectBuilding} onCreate={() => setView('create')} />}
        {view === 'create' && <CreateBuildingForm onCreated={selectBuilding} onCancel={() => setView('list')} />}
        {view === 'detail' && selectedBuilding && <BuildingDetail building={selectedBuilding} onBack={goBack} />}
      </div>
    </div>
  )
}
