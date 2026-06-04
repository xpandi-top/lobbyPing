import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { CheckCircle2, ArrowDownToLine, XCircle, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { subscribeArrival, respondToArrival } from '@/lib/firestore'
import { triggerPush } from '@/lib/notify'
import { getSavedRoom } from '@/lib/storage'
import type { Arrival, ResidentResponse, ArrivalType } from '@/lib/types'
import { cn } from '@/lib/utils'

const TYPE_LABELS: Record<ArrivalType, string> = {
  package: 'Package',
  food: 'Food Delivery',
  guest: 'Guest',
  other: 'Other',
}

const WAIT_LABELS: Record<string, string> = {
  '1min': '1 minute',
  '2min': '2 minutes',
  '5min': '5 minutes',
}

const RESPONSES: {
  value: ResidentResponse
  label: string
  description: string
  icon: React.FC<{ className?: string }>
  color: string
}[] = [
  {
    value: 'coming_down',
    label: 'Coming Down',
    description: 'Tell visitor you are on your way',
    icon: ArrowDownToLine,
    color: 'border-green-200 bg-green-50 text-green-700 hover:bg-green-100',
  },
  {
    value: 'leave_in_lobby',
    label: 'Leave In Lobby',
    description: 'Ask them to leave the item',
    icon: CheckCircle2,
    color: 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100',
  },
  {
    value: 'no_need_to_wait',
    label: 'No Need To Wait',
    description: 'Dismiss the visitor',
    icon: XCircle,
    color: 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100',
  },
]

export default function RespondPage() {
  const [searchParams] = useSearchParams()
  const buildingId = searchParams.get('b') ?? ''
  const roomId = searchParams.get('r') ?? ''
  const arrivalId = searchParams.get('a') ?? ''

  const [arrival, setArrival] = useState<Arrival | null | undefined>(undefined)
  const [responding, setResponding] = useState(false)
  const [showCustom, setShowCustom] = useState(false)
  const [customMessage, setCustomMessage] = useState('')

  useEffect(() => {
    if (!buildingId || !roomId || !arrivalId) return
    const unsub = subscribeArrival(buildingId, roomId, arrivalId, setArrival)
    return unsub
  }, [buildingId, roomId, arrivalId])

  const savedRoom = getSavedRoom(buildingId, roomId)
  const responderName = savedRoom?.name ?? 'Resident'
  const responderRole = savedRoom?.role ?? 'member'

  async function handleResponse(response: ResidentResponse, message?: string) {
    if (!arrival || responding) return
    if (!savedRoom?.deviceId) {
      toast.error('Open this link from a registered resident device.')
      return
    }
    setResponding(true)
    try {
      await respondToArrival(buildingId, roomId, arrivalId, response, responderName, responderRole, savedRoom.deviceId, message)
      triggerPush(buildingId, roomId, arrivalId, 'responded', savedRoom?.deviceId)
      toast.success('Response sent')
    } catch {
      toast.error('Failed to send response')
      setResponding(false)
    }
  }

  if (arrival === undefined) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-4">
        <div className="w-full max-w-md space-y-4">
          <Skeleton className="h-48 w-full rounded-lg" />
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
          <p className="text-muted-foreground text-sm">This arrival notification has expired.</p>
        </div>
      </div>
    )
  }

  const isExpired = arrival.status === 'expired' || arrival.expiresAt.toMillis() < Date.now()
  const hasResponded = arrival.status === 'responded'

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-4">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold">Someone is downstairs</h1>
          <p className="text-muted-foreground text-sm">Room {arrival.roomNumber}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {TYPE_LABELS[arrival.type]}
            </CardTitle>
            <CardDescription>
              Willing to wait {WAIT_LABELS[arrival.waitTime]}
              {arrival.reminderCount > 0 && ` · ${arrival.reminderCount} reminder${arrival.reminderCount > 1 ? 's' : ''} sent`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {hasResponded ? (
              <div className="rounded-lg bg-muted p-4 text-center">
                <CheckCircle2 className="h-8 w-8 mx-auto text-green-500 mb-2" />
                <p className="font-medium">Response sent</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {RESPONSES.find(r => r.value === arrival.response)?.label}
                </p>
                {arrival.responseMessage && (
                  <p className="text-sm font-medium mt-2">{arrival.responseMessage}</p>
                )}
              </div>
            ) : isExpired ? (
              <div className="rounded-lg bg-muted p-4 text-center">
                <p className="text-muted-foreground text-sm">This notification has expired.</p>
              </div>
            ) : (
              <>
                {RESPONSES.map(({ value, label, description, icon: Icon, color }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => handleResponse(value)}
                    disabled={responding}
                    className={cn(
                      'flex w-full items-center gap-4 rounded-lg border p-4 text-left transition-colors disabled:opacity-50',
                      color
                    )}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    <div>
                      <p className="font-semibold text-sm">{label}</p>
                      <p className="text-xs opacity-75">{description}</p>
                    </div>
                  </button>
                ))}
                {!showCustom ? (
                  <Button variant="outline" className="w-full" onClick={() => setShowCustom(true)} disabled={responding}>
                    Write custom message
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <Textarea
                      placeholder="Type a message for the visitor..."
                      maxLength={200}
                      rows={3}
                      value={customMessage}
                      onChange={(e) => setCustomMessage(e.target.value)}
                    />
                    <Button
                      className="w-full"
                      disabled={!customMessage.trim() || responding}
                      onClick={() => handleResponse('coming_down', customMessage.trim())}
                    >
                      {responding ? 'Sending...' : 'Send Custom Message'}
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
