import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Bell, Package, Utensils, Users, HelpCircle, Clock, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getBuildingBySlug, getBuilding, getRoomByNumber, createArrival, listRooms } from '@/lib/firestore'
import { triggerPush } from '@/lib/notify'
import type { ArrivalType, Room, WaitTime } from '@/lib/types'
import { cn } from '@/lib/utils'

const schema = z.object({
  room: z.string().min(1, 'Room number required').max(10),
})

type FormData = z.infer<typeof schema>

const ARRIVAL_TYPES: { value: ArrivalType; label: string; icon: React.FC<{ className?: string }> }[] = [
  { value: 'package', label: 'Package', icon: Package },
  { value: 'food', label: 'Food Delivery', icon: Utensils },
  { value: 'guest', label: 'Guest', icon: Users },
  { value: 'other', label: 'Other', icon: HelpCircle },
]

const WAIT_TIMES: { value: WaitTime; label: string }[] = [
  { value: '1min', label: '1 minute' },
  { value: '2min', label: '2 minutes' },
  { value: '5min', label: '5 minutes' },
]

function sortRooms(rooms: Room[]) {
  return [...rooms].sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true, sensitivity: 'base' }))
}

export default function VisitorPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const buildingParam = searchParams.get('b') // building ID or slug
  const [step, setStep] = useState<'room' | 'type' | 'wait' | 'sending'>('room')
  const [arrivalType, setArrivalType] = useState<ArrivalType>('package')
  const [waitTime, setWaitTime] = useState<WaitTime>('2min')
  const [roomNumber, setRoomNumber] = useState('')
  const [buildingName, setBuildingName] = useState<string | null>(null)
  const [buildingId, setBuildingId] = useState<string | null>(null)
  const [rooms, setRooms] = useState<Room[]>([])
  const [loadingRooms, setLoadingRooms] = useState(false)

  const { register, handleSubmit, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  useEffect(() => {
    if (!buildingParam) return
    const load = async () => {
      try {
        let building = null
        if (!buildingParam.match(/^[A-Za-z0-9]{20}$/)) {
          building = await getBuildingBySlug(buildingParam)
        } else {
          building = await getBuilding(buildingParam)
        }

        if (building) {
          setBuildingId(building.id)
          setBuildingName(building.name)
          setLoadingRooms(true)
          const buildingRooms = await listRooms(building.id)
          setRooms(sortRooms(buildingRooms))
        }
      } catch { /* non-critical */ }
      finally { setLoadingRooms(false) }
    }
    load()
  }, [buildingParam])

  async function onRoomSubmit(data: FormData) {
    setRoomNumber(data.room.trim())
    setStep('type')
  }

  function selectRoom(number: string) {
    setValue('room', number)
    setRoomNumber(number)
    setStep('type')
  }

  async function onSend() {
    setStep('sending')
    try {
      if (!buildingParam) {
        toast.error('Invalid QR code link — missing building ID.')
        setStep('wait')
        return
      }

      let resolvedBuildingId = buildingId ?? buildingParam
      // Slug (short, human-readable) vs Firestore auto-ID (20 alphanum chars)
      if (!resolvedBuildingId.match(/^[A-Za-z0-9]{20}$/)) {
        const building = await getBuildingBySlug(resolvedBuildingId)
        if (!building) { toast.error('Building not found.'); setStep('wait'); return }
        resolvedBuildingId = building.id
      } else {
        const building = await getBuilding(resolvedBuildingId)
        if (!building) { toast.error('Building not found.'); setStep('wait'); return }
      }

      const room = await getRoomByNumber(resolvedBuildingId, roomNumber)
      if (!room) {
        toast.error('Room not found. Check the number and try again.')
        setStep('type')
        return
      }

      const arrivalId = await createArrival(resolvedBuildingId, room.id, roomNumber, arrivalType, waitTime)
      triggerPush(resolvedBuildingId, room.id, arrivalId, 'arrival')
      navigate(`/status?b=${resolvedBuildingId}&r=${room.id}&a=${arrivalId}`)
    } catch (err) {
      console.error('[VisitorPage] onSend error:', err)
      toast.error(`Error: ${err instanceof Error ? err.message : String(err)}`)
      setStep('wait')
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-4">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
              <Bell className="h-8 w-8 text-primary" />
            </div>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">LobbyPing</h1>
          {buildingName ? (
            <div className="flex items-center justify-center gap-1.5 text-sm font-medium text-primary">
              <MapPin className="h-3.5 w-3.5" />
              <span>{buildingName}</span>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">Notify a resident you've arrived</p>
          )}
        </div>

        {/* Step: Room Number */}
        {step === 'room' && (
          <Card>
            <CardHeader>
              <CardTitle>Which room?</CardTitle>
              <CardDescription>Tap a room or enter the number</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {(loadingRooms || rooms.length > 0) && (
                <div className="space-y-2">
                  <Label>Available rooms</Label>
                  {loadingRooms ? (
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {Array.from({ length: 6 }).map((_, index) => (
                        <div key={index} className="h-11 rounded-lg bg-muted" />
                      ))}
                    </div>
                  ) : (
                    <div className="grid max-h-56 grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-4">
                      {rooms.map((room) => (
                        <button
                          key={room.id}
                          type="button"
                          onClick={() => selectRoom(room.number)}
                          className="min-w-0 truncate rounded-lg border border-border bg-background px-2 py-3 text-sm font-semibold transition-colors hover:border-primary hover:bg-primary/5 hover:text-primary"
                        >
                          {room.number}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <form onSubmit={handleSubmit(onRoomSubmit)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="room">Room number</Label>
                  <Input
                    id="room"
                    placeholder="e.g. 101"
                    autoFocus
                    autoComplete="off"
                    inputMode="text"
                    {...register('room')}
                    className="text-lg h-12"
                  />
                  {errors.room && (
                    <p className="text-sm text-destructive">{errors.room.message}</p>
                  )}
                </div>
                <Button type="submit" className="w-full h-12 text-base">
                  Next
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Step: Arrival Type */}
        {step === 'type' && (
          <Card>
            <CardHeader>
              <CardTitle>What's the visit for?</CardTitle>
              <CardDescription>Room {roomNumber}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {ARRIVAL_TYPES.map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setArrivalType(value)}
                    className={cn(
                      'flex flex-col items-center gap-2 rounded-lg border p-4 transition-colors',
                      arrivalType === value
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border hover:border-primary/50 hover:bg-muted'
                    )}
                  >
                    <Icon className="h-6 w-6" />
                    <span className="text-sm font-medium">{label}</span>
                  </button>
                ))}
              </div>
              <Button onClick={() => setStep('wait')} className="w-full h-12 text-base mt-2">
                Next
              </Button>
              <Button variant="ghost" onClick={() => setStep('room')} className="w-full">
                Back
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Step: Wait Time */}
        {(step === 'wait' || step === 'sending') && (
          <Card>
            <CardHeader>
              <CardTitle>How long can you wait?</CardTitle>
              <CardDescription>Room {roomNumber} · {ARRIVAL_TYPES.find(t => t.value === arrivalType)?.label}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                {WAIT_TIMES.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setWaitTime(value)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg border p-3 transition-colors',
                      waitTime === value
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border hover:border-primary/50 hover:bg-muted'
                    )}
                  >
                    <Clock className="h-4 w-4 shrink-0" />
                    <span className="font-medium">{label}</span>
                  </button>
                ))}
              </div>
              <Button
                onClick={onSend}
                disabled={step === 'sending'}
                className="w-full h-12 text-base mt-2"
              >
                {step === 'sending' ? 'Sending…' : 'Notify Resident'}
              </Button>
              <Button variant="ghost" onClick={() => setStep('type')} className="w-full" disabled={step === 'sending'}>
                Back
              </Button>
            </CardContent>
          </Card>
        )}

        <p className="text-center text-xs text-muted-foreground">
          Your information is never stored or shared
        </p>
      </div>
    </div>
  )
}
