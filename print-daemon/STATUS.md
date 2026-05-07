# Casa Rula POS — Estado y siguiente sesión

Última sesión: jueves 7 mayo 2026.

## ¿Qué hay funcionando ahora mismo?

- App Next.js desplegada en Vercel.
- Daemon de impresión corriendo en Mac, conectado a Supabase Realtime.
- Munbyn ITPP047P por WiFi (192.168.0.27) imprimiendo correctamente.
- Pipeline end-to-end: app → `print_jobs` en Supabase → daemon → Munbyn.
- Tipografía Inter renderizada como bitmap (`ESC *` mode).
- Diseños: comanda cocina (variante B, mesa enorme + nota arriba + urgente invertido)
  y factura (Casa Rula + items + base imponible + TOTAL invertido).
- Encoding correcto para ñ, tildes, €.
- Rutas arregladas: `/comandas` redirige a `/comandas/tomar`, los flujos vuelven a `/mapa`.
- Rediseño de `sendToKitchen` y `createTicket` para encolar `print_jobs` (no `window.print()`).
- Anulación de items ya enviados → encola job `anulacion`.
- "Imprimir cuenta" desde el mapa → encola job `cuenta_provisional`.

## ¿Qué queda pendiente?

### Diseño de tickets (rápido, sin tocar arquitectura)

- [ ] Rediseñar **anulación** como imagen (ahora aún sale en modo texto viejo).
- [ ] Rediseñar **cuenta provisional** como imagen (idem).
- [ ] Iterar tamaños y márgenes de la **comanda** según uso real.
- [ ] Iterar **factura** según uso real (¿añadir últimos 4 dígitos de tarjeta? ¿pie con horario?).

### Empaquetado del daemon (importante antes de junio)

- [ ] Empaquetar daemon como ejecutable único con `pkg` o `caxa` para Mac.
  Doble click → instala como servicio launchd → arranca solo al encender el iMac.
- [ ] Auto-discovery de impresora por mDNS / escaneo de red local
  (sobrevive a cambios de IP, no requiere configurar nada).
- [ ] Logs visibles en archivo (`~/Library/Logs/casarula-print/daemon.log`).
- [ ] Versión Windows del mismo binario.
- [ ] (Opcional) icono de bandeja con estado: ✓ conectado / ✗ impresora no encontrada.

### Funcionalidad

- [ ] División de cuenta (split por items o equitativo entre N personas).
- [ ] Más impresoras: cuando lleguen las dos definitivas (cocina + barra/caja),
  configurarlas en la tabla `printers` de Supabase. El daemon las detecta solas.
- [ ] Categorías de menú con `printer_target = 'barra'` para bebidas
  (ahora todo va a cocina; cuando hagamos esto, el ticket de barra ya funciona solo).

### Cosas a vigilar

- Tabla `menu_items` tiene dos columnas duplicadas (`is_available` y `available`),
  conviene unificarlas en algún momento.
- RLS deshabilitada en `print_jobs`. Coherente con el resto del sistema (las demás
  tablas tampoco tienen RLS activa). Si en el futuro se reactiva todo, hay que
  reactivar `print_jobs` también con políticas para `anon`.
- Las dos impresoras térmicas reales del restaurante van a llegar más adelante;
  por ahora todo apunta a la única Munbyn de pruebas.

## Variables de entorno del daemon (`.env`)

```
SUPABASE_URL=https://ryjnwzkrsodgadvqucqa.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service role key>
RESTAURANT_ID=bf17533a-fc4e-43c9-a81f-50b364cca9a9
PRINTER_COCINA_IP=192.168.0.27
PRINTER_BARRA_IP=192.168.0.27
PRINTER_CAJA_IP=192.168.0.27
PRINTER_PORT=9100
DRY_RUN=false
# Optional: CHUNK_DELAY_MS=30  (default 30, lower = faster but riskier)
# Optional: DEBUG_DUMP=true    (writes raw ESC/POS bytes to /tmp for inspection)
```

## Cómo arrancar el daemon manualmente (mientras no haya instalador)

```
cd ~/Documents/CasaRula/print-daemon
npm install        # solo la primera vez o cuando cambien deps
npm run dev        # con watch para desarrollo
npm start          # producción (sin watch)
```

## Comandos útiles

```
# Imprimir tickets de prueba (3: comanda normal, urgente, factura)
PRINTER_IP=192.168.0.27 npm run test:print

# Solo uno
PRINTER_IP=192.168.0.27 ONLY=normal   npm run test:print
PRINTER_IP=192.168.0.27 ONLY=urgente  npm run test:print
PRINTER_IP=192.168.0.27 ONLY=factura  npm run test:print

# Sin gastar papel: dump del bitmap a /tmp
DRY_RUN=true ONLY=normal npm run test:print
```
