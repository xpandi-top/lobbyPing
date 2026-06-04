let audioContext: AudioContext | null = null

function getAudioContext(): AudioContext | null {
  const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextCtor) return null
  audioContext ??= new AudioContextCtor()
  return audioContext
}

export async function playRingAlert(): Promise<boolean> {
  if ('vibrate' in navigator) navigator.vibrate([180, 80, 180, 80, 260])

  const ctx = getAudioContext()
  if (!ctx) return false

  try {
    if (ctx.state === 'suspended') await ctx.resume()
    const start = ctx.currentTime
    for (let i = 0; i < 3; i += 1) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(880, start + i * 0.28)
      gain.gain.setValueAtTime(0.0001, start + i * 0.28)
      gain.gain.exponentialRampToValueAtTime(0.18, start + i * 0.28 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + i * 0.28 + 0.18)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(start + i * 0.28)
      osc.stop(start + i * 0.28 + 0.2)
    }
    return true
  } catch (err) {
    console.warn('[ring] audio alert failed:', err)
    return false
  }
}
