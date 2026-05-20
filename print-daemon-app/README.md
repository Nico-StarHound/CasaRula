# Casa Rula Print

Daemon de impresión empaquetado como app de escritorio para macOS. Vive en la barra de menú; sin dock, sin ventanas por defecto. Arranca el daemon de `../print-daemon/`, lo reinicia si se cae, mantiene el iMac despierto en horario de servicio con `caffeinate -i`, y permite ver registro/editar config desde el menubar.

## Desarrollo

```bash
# Una sola vez
cd print-daemon
npm install
cd ../print-daemon-app
npm install

# Arrancar
npm start
```

## Build DMG para distribuir

```bash
npm run dist
# Resultado en release/Casa Rula Print-*.dmg
```

El .dmg no está firmado por Apple (no tenemos Developer ID). La primera vez que se abra, hay que hacer Ctrl+Click → "Abrir" para saltar Gatekeeper. Se hace una sola vez por instalación.

## Configuración

La primera vez que se abre, la app pide:

- URL de Supabase (https://...supabase.co)
- Service Role Key
- Restaurant ID
- Horario de servicio (start/end en formato HH:MM, puede pasar de medianoche)

Se guardan en `~/Library/Application Support/Casa Rula Print/config.json`.

## Logs

`Click en menubar → Ver registro…`. Las últimas 500 líneas se mantienen en memoria.

## Notas

- El daemon NO se distribuye como binario independiente. La app embebe el código TypeScript del daemon y lo ejecuta con Node de Electron (ELECTRON_RUN_AS_NODE=1) en producción, o con tsx en desarrollo.
- `caffeinate -i` solo impide el sleep del SISTEMA, no de la pantalla. La pantalla del iMac se puede apagar normalmente sin afectar al daemon.
- Auto-restart con rate limit: 5 reintentos en 1 minuto. Si supera, marca error y espera intervención manual del usuario.
