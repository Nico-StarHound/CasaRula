# Casa Rula Print Daemon

Daemon que consume `print_jobs` de Supabase (Realtime) e imprime en impresoras térmicas ESC/POS via TCP:9100.

## Setup

```bash
cd print-daemon
npm install
cp .env.example .env
# editar .env con SUPABASE_SERVICE_ROLE_KEY, RESTAURANT_ID, IPs de impresoras
```

## Probar la impresora primero (sin Supabase)

```bash
PRINTER_IP=192.168.1.50 npm run test:print
```

Si imprime una comanda y un ticket de prueba, la impresora está OK.

## Arrancar el daemon

```bash
npm run dev      # con watch para desarrollo
npm start        # producción
```

Variables de entorno:
- `SUPABASE_URL` — URL del proyecto
- `SUPABASE_SERVICE_ROLE_KEY` — service role (bypassa RLS)
- `RESTAURANT_ID` — UUID del restaurante a procesar
- `PRINTER_COCINA_IP`, `PRINTER_BARRA_IP`, `PRINTER_CAJA_IP` — overrides para testing local. Si no se setean, el daemon lee la tabla `printers` de Supabase.
- `PRINTER_PORT` — default 9100
- `DRY_RUN=true` — no imprime, solo loggea bytes

## Cómo funciona

1. La app crea filas en `print_jobs` (status='pending')
2. El daemon recibe el evento Realtime de INSERT
3. Llama al RPC `claim_next_print_job()` que atómicamente toma el siguiente job (FOR UPDATE SKIP LOCKED, evita doble impresión)
4. Renderiza ESC/POS según `kind` (comanda_cocina, comanda_barra, anulacion, factura)
5. Envía bytes a la impresora correspondiente vía TCP
6. Marca status='done' o 'error' (con reintentos hasta `max_attempts=3`)

Polling cada 30s como red de seguridad por si Realtime se desconecta.

## Producción en Mac (autostart)

```bash
# Una opción simple: usar pm2
npm install -g pm2
pm2 start npm --name casarula-print -- start
pm2 startup
pm2 save
```

Para Windows: usar `node-windows` o `nssm` con `node` apuntando a `npx tsx src/index.ts`.
