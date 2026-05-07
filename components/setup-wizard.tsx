'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FieldGroup, Field, FieldLabel } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import { UtensilsCrossed } from 'lucide-react'

export function SetupWizard() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(formData: FormData) {
    setLoading(true)
    setError(null)
    
    const restaurantName = formData.get('restaurantName') as string
    const ownerName = formData.get('ownerName') as string
    const pin = formData.get('pin') as string
    const confirmPin = formData.get('confirmPin') as string
    
    if (pin !== confirmPin) {
      setError('Los PINs no coinciden')
      setLoading(false)
      return
    }
    
    try {
      const response = await fetch('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurantName, ownerName, pin }),
      })
      
      const result = await response.json()
      
      if (response.ok && result.success) {
        // Use window.location for full page navigation to ensure cookie is sent
        window.location.href = '/mapa'
        return
      } else {
        setError(result.error || 'Error al configurar')
        setLoading(false)
      }
    } catch {
      setError('Error de conexión')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <UtensilsCrossed className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Configuración Inicial</CardTitle>
          <CardDescription>
            Configura tu restaurante para comenzar a gestionar reservas
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={handleSubmit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="restaurantName">Nombre del Restaurante</FieldLabel>
                <Input
                  id="restaurantName"
                  name="restaurantName"
                  placeholder="Mi Restaurante"
                  required
                  autoComplete="off"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="ownerName">Tu Nombre (Dueño)</FieldLabel>
                <Input
                  id="ownerName"
                  name="ownerName"
                  placeholder="Juan García"
                  required
                  autoComplete="off"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="pin">PIN de Acceso (4 dígitos)</FieldLabel>
                <Input
                  id="pin"
                  name="pin"
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]{4}"
                  maxLength={4}
                  placeholder="••••"
                  required
                  autoComplete="off"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="confirmPin">Confirmar PIN</FieldLabel>
                <Input
                  id="confirmPin"
                  name="confirmPin"
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]{4}"
                  maxLength={4}
                  placeholder="••••"
                  required
                  autoComplete="off"
                />
              </Field>
            </FieldGroup>

            {error && (
              <p className="mt-4 text-sm text-destructive text-center">{error}</p>
            )}

            <Button type="submit" className="w-full mt-6" disabled={loading}>
              {loading ? <Spinner className="mr-2" /> : null}
              {loading ? 'Configurando...' : 'Comenzar'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
