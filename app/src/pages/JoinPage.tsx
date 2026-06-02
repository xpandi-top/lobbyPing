import { useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getRoomByInviteCode, redeemInviteCode } from '@/lib/firestore'

const schema = z.object({
  buildingId: z.string().min(1, 'Building ID required'),
  code: z.string().min(4, 'Invite code required').max(12),
})

type FormData = z.infer<typeof schema>

export default function JoinPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const defaultBuilding = searchParams.get('b') ?? ''
  const defaultCode = searchParams.get('code') ?? ''
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { buildingId: defaultBuilding, code: defaultCode },
  })

  async function onSubmit(data: FormData) {
    setLoading(true)
    try {
      const room = await getRoomByInviteCode(data.buildingId, data.code)
      if (!room) {
        toast.error('Invalid or already used invite code')
        setLoading(false)
        return
      }
      await redeemInviteCode(data.buildingId, room.id)
      toast.success(`Room ${room.number} registered!`)
      navigate(`/resident?b=${data.buildingId}&r=${room.id}`)
    } catch {
      toast.error('Registration failed. Try again.')
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
          <p className="text-muted-foreground text-sm">
            Enter your invite code to receive arrival notifications
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Redeem Invite Code</CardTitle>
            <CardDescription>
              Your building administrator provided this code
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {!defaultBuilding && (
                <div className="space-y-2">
                  <Label htmlFor="buildingId">Building ID</Label>
                  <Input
                    id="buildingId"
                    placeholder="Provided by admin"
                    {...register('buildingId')}
                  />
                  {errors.buildingId && (
                    <p className="text-sm text-destructive">{errors.buildingId.message}</p>
                  )}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="code">Invite Code</Label>
                <Input
                  id="code"
                  placeholder="e.g. ABC123"
                  autoCapitalize="characters"
                  className="tracking-widest text-lg h-12 uppercase"
                  {...register('code')}
                />
                {errors.code && (
                  <p className="text-sm text-destructive">{errors.code.message}</p>
                )}
              </div>
              <Button type="submit" disabled={loading} className="w-full h-12 text-base">
                {loading ? 'Registering…' : 'Register Device'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Invite codes can only be used once
        </p>
      </div>
    </div>
  )
}
