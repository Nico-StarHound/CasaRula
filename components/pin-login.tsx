'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { UtensilsCrossed, Delete } from 'lucide-react'

interface PinLoginProps {
  restaurantName: string
}

export function PinLogin({ restaurantName }: PinLoginProps) {
  const router = useRouter()
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleDigit = (digit: string) => {
    if (pin.length < 4) {
      setPin(prev => prev + digit)
      setError(null)
    }
  }

  const handleDelete = () => {
    setPin(prev => prev.slice(0, -1))
    setError(null)
  }

  const handleClear = () => {
    setPin('')
    setError(null)
  }

  useEffect(() => {
    if (pin.length === 4) {
      handleSubmit()
    }
  }, [pin])

  async function handleSubmit() {
    if (pin.length !== 4) return
    
    setLoading(true)
    setError(null)
    
    try {
      const response = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      })
      
      const text = await response.text()
      let result
      try {
        result = JSON.parse(text)
      } catch {
        setError(`Error del servidor: ${text.slice(0, 100)}`)
        setPin('')
        setLoading(false)
        return
      }
      
      if (response.ok && result.success) {
        // Use window.location for full page navigation to ensure cookie is sent
        const destination = result.role === 'cocina' ? '/cocina' : '/mapa'
        window.location.href = destination
        return
      } else {
        setError(result.error || `Error ${response.status}`)
        setPin('')
        setLoading(false)
      }
    } catch (err) {
      setError(`Error de conexión: ${err instanceof Error ? err.message : 'unknown'}`)
      setPin('')
      setLoading(false)
    }
  }

  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'delete']

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <UtensilsCrossed className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl text-balance">{restaurantName}</CardTitle>
          <CardDescription>Ingresa tu PIN para continuar</CardDescription>
        </CardHeader>
        <CardContent>
          {/* PIN Display */}
          <div className="flex justify-center gap-3 mb-8">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`w-4 h-4 rounded-full transition-colors ${
                  i < pin.length ? 'bg-primary' : 'bg-muted'
                }`}
              />
            ))}
          </div>

          {/* Keypad */}
          <div className="grid grid-cols-3 gap-3">
            {digits.map((digit, i) => {
              if (digit === '') {
                return <div key={i} />
              }
              if (digit === 'delete') {
                return (
                  <Button
                    key={i}
                    variant="ghost"
                    size="lg"
                    className="h-14 text-lg"
                    onClick={handleDelete}
                    disabled={loading || pin.length === 0}
                  >
                    <Delete className="h-6 w-6" />
                  </Button>
                )
              }
              return (
                <Button
                  key={i}
                  variant="outline"
                  size="lg"
                  className="h-14 text-xl font-semibold"
                  onClick={() => handleDigit(digit)}
                  disabled={loading}
                >
                  {digit}
                </Button>
              )
            })}
          </div>

          {error && (
            <p className="mt-6 text-sm text-destructive text-center">{error}</p>
          )}

          {loading && (
            <div className="mt-6 flex justify-center">
              <Spinner />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
