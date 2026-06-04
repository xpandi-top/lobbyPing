let audioContext: AudioContext | null = null

function getAudioContext(): AudioContext | null {
  const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextCtor) return null
  audioContext ??= new AudioContextCtor()
  return audioContext
}

export async function primeRingAudio(): Promise<void> {
  const ctx = getAudioContext()
  if (!ctx || ctx.state !== 'suspended') return
  await ctx.resume().catch(() => undefined)
}

function scheduleTone(ctx: AudioContext, start: number, frequency: number, duration: number, volume: number) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'square'
  osc.frequency.setValueAtTime(frequency, start)
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(start)
  osc.stop(start + duration + 0.02)
}

export async function playRingAlarm(seconds = 8): Promise<boolean> {
  if ('vibrate' in navigator) navigator.vibrate([400, 120, 400, 120, 700])

  const ctx = getAudioContext()
  if (!ctx) return false

  try {
    if (ctx.state === 'suspended') await ctx.resume()
    const start = ctx.currentTime
    const cycles = Math.max(1, Math.floor(seconds / 1.2))
    for (let i = 0; i < cycles; i += 1) {
      const cycleStart = start + i * 1.2
      scheduleTone(ctx, cycleStart, 880, 0.28, 0.2)
      scheduleTone(ctx, cycleStart + 0.38, 660, 0.28, 0.2)
    }
    return true
  } catch (err) {
    console.warn('[ring] audio alert failed:', err)
    return false
  }
}

export function playRingAlert(): Promise<boolean> {
  return playRingAlarm(1)
}
