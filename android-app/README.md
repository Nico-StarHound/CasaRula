# Casa Rula — Android wrapper APK

Aplicación Android que abre `https://r.casarula.com` en un WebView a
pantalla completa. Pensada para tablets/móviles de la sala/barra donde
el "Añadir a pantalla de inicio" de Chrome no aparece (caso típico:
launchers de algunos fabricantes — Lenovo, Realme, Honor — que bloquean
los atajos web).

## Cómo instalarla en una tablet/móvil Android

1. **Descarga el APK** (`casarula.apk`) en el dispositivo. Lo más fácil:
   - Abre el navegador del dispositivo
   - Ve a la URL directa del archivo:
     `https://github.com/Nico-StarHound/CasaRula/raw/main/android-app/casarula.apk`
   - Pulsa "Descargar"

2. **Permite la instalación de "orígenes desconocidos"**:
   - Cuando intentes abrir el `.apk`, Android te dirá que no puede
   - Pulsa **Ajustes** en el aviso
   - Activa **"Permitir desde esta fuente"** para el navegador desde el
     que has descargado el APK
   - Vuelve atrás y abre el APK otra vez

3. **Pulsa "Instalar"**. Tarda 5 segundos.

4. **Aparece "Casa Rula"** en la pantalla de inicio con el icono propio.

## Qué hace la app

- Carga `https://r.casarula.com` en un WebView a pantalla completa.
- Sin barras de URL ni botones del navegador.
- Las cookies (sesión PIN) persisten entre aperturas — solo metes el PIN
  el primer día y el navegador lo recuerda igual que en Chrome.
- El botón "atrás" físico navega dentro de la app como un navegador
  normal (no la cierra a la primera).
- La pantalla nunca se apaga mientras la app está abierta (útil para
  tablets fijas en la barra).

## Cómo regenerar / actualizar el APK

El proyecto fuente está en `/tmp/casarula-apk` (no commiteado todavía —
si quieres, lo subimos). Necesitas:

- JDK 21
- Android SDK build-tools 34.0.0
- Android Platform 34

Comandos resumidos (en orden):

```bash
aapt2 compile --dir src/main/res -o build/res.zip
aapt2 link -o build/casarula.unsigned.apk -I $PLAT \
  --manifest src/main/AndroidManifest.xml --java build/gen \
  --min-sdk-version 23 --target-sdk-version 34 \
  --version-code 1 --version-name "1.0" build/res.zip
javac -d build/classes -classpath $PLAT -source 11 -target 11 \
  src/main/java/com/casarula/app/*.java build/gen/com/casarula/app/R.java
d8 --min-api 23 --lib $PLAT --output build/ build/classes/com/casarula/app/*.class
cp build/casarula.unsigned.apk build/casarula.unaligned.apk
(cd build && zip -j casarula.unaligned.apk classes.dex)
zipalign -f -p 4 build/casarula.unaligned.apk build/casarula.aligned.apk
apksigner sign --ks build/casarula.keystore \
  --ks-pass pass:casarula1551 --key-pass pass:casarula1551 \
  --out build/casarula.apk build/casarula.aligned.apk
```

## La clave de firma

El archivo `casarula.keystore` está aquí en el repo. Eso es **suficiente
para nuestro caso** porque no publicamos en Play Store. La contraseña es
`casarula1551`.

⚠️ **No cambies la firma** entre versiones — Android rechaza actualizar
una app si la nueva versión está firmada con otra clave. Para actualizar
solo cambia el código y `version-code` / `version-name`, y vuelve a
firmar con este mismo keystore.

Si algún día subimos a Play Store, habrá que generar una clave nueva con
contraseñas serias y guardarla fuera del repo.
