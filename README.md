# Gastos viaje a Melo

App web para registrar los consumos del hotel desde el iPhone. Cada registro se guarda en Google Sheets con fecha y hora, y las fotos van a Google Drive.

## Cómo funciona (arquitectura)

```
iPhone (GitHub Pages: index.html)
        |  fetch GET / POST (JSON)
        v
Google Apps Script (Code.gs, publicado como "Aplicación web")
        |                     |
        v                     v
Google Sheets            Google Drive
(pestaña "Consumos")     (carpeta de fotos)
```

- **index.html** es el frontend: HTML + CSS + JavaScript puro, sin librerías. GitHub Pages solo sirve archivos estáticos, por eso necesita un "backend" externo.
- **Code.gs** es el backend: vive en Google, tiene permiso para escribir en tu hoja y en tu Drive, y expone una URL que la app llama.
- La hoja es la base de datos. La app la lee para armar el historial y el ranking.

## Archivos

| Archivo | Para qué |
|---|---|
| `index.html` | La app. Va a GitHub. |
| `icon.png` | Ícono al agregarla a la pantalla de inicio del iPhone. Va a GitHub. |
| `Code.gs` | Script de Google. Está aquí como copia de referencia; el que funciona es el que pegas en Apps Script. |

---

## Paso 1. Pegar el script en Google

1. Abre la hoja de cálculo del viaje.
2. Menú **Extensiones > Apps Script**.
3. Borra lo que haya en `Código.gs` y pega todo el contenido de `Code.gs` (está en este repositorio).
4. Guarda (ícono de disquete o Ctrl+S).

## Paso 2. Dar permisos (una sola vez)

1. En la barra de arriba elige la función **probar** y pulsa **Ejecutar**.
2. Google pedirá permisos: **Revisar permisos > tu cuenta > Configuración avanzada > Ir a (proyecto) > Permitir**.
   Es normal que diga "app no verificada": la app eres tú.
3. Al terminar verás en la hoja una pestaña nueva **Consumos** con los encabezados, y en Drive la carpeta **Viaje a Melo - Fotos consumos**.

## Paso 3. Publicar como aplicación web

1. Botón **Implementar > Nueva implementación**.
2. Engranaje de "Seleccionar tipo" > **Aplicación web**.
3. Configura:
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier usuario**
4. **Implementar** y copia la **URL de la aplicación web** (termina en `/exec`).

> Si después cambias algo en `Code.gs`: **Implementar > Gestionar implementaciones > lápiz > Versión: Nueva versión > Implementar**. Así la URL no cambia. Si no haces esto, la app sigue usando el código viejo.

Prueba rápida: abre la URL en el navegador. Debe responder `{"ok":true,"mensaje":"API de Gastos Melo activa"}`.

## Paso 4. Conectar la app

Abre `index.html` y pega la URL:

```js
const CONFIG = {
  API_URL: 'https://script.google.com/macros/s/XXXXXXXX/exec',
  MONEDA: 'COP',
  LOCALE: 'es-CO'
};
```

Si en Melo pagan en otra moneda, cambia `MONEDA` (por ejemplo `'UYU'` para pesos uruguayos o `'USD'`).

Puedes editarlo directo en GitHub: abre `index.html` > ícono del lápiz > pega la URL > **Commit changes**.

## Paso 5. GitHub Pages

La app se publica en `https://eravebo.github.io/ConsumosAmigos/`. Cada cambio en `main` se actualiza solo en uno o dos minutos.

## Paso 6. Instalar en cada iPhone

1. Abre el enlace en **Safari**.
2. Botón **Compartir > Agregar a pantalla de inicio**.
3. Se abre como app, a pantalla completa, con el ícono de MELO.

---

## Funciones

No tiene clave: cualquiera con el enlace puede registrar o eliminar consumos, así que compártanlo solo entre ustedes.


- **Registrar**: producto, valor, cantidad, quién consume (uno o varios: se divide en partes iguales), nota y foto.
- **Sin internet**: si el wifi del hotel falla, el consumo queda "pendiente" en el celular y se envía solo cuando vuelva la conexión.
- **Historial**: agrupado por día, filtro por persona, ver fotos en grande, eliminar.
- **Ranking 🏆**: total del viaje, cuánto le corresponde a cada uno, porcentaje, y botón para copiar el resumen a WhatsApp.

## Columnas de la hoja

`ID | Fecha | Hora | Producto | Cantidad | Valor total | Quién consume | Valor por persona | Nota | Foto (enlace) | Foto | Registrado en servidor`

- **Fecha y Hora**: la del celular al momento de registrar (hora local del viaje).
- **Registrado en servidor**: hora en que llegó a Google (sirve de respaldo si alguien registró sin internet).
- **Foto**: miniatura dentro de la hoja con `=IMAGE()`.

## Problemas comunes

| Síntoma | Causa probable |
|---|---|
| Guardo cambios en Code.gs y no pasa nada | Falta publicar una **nueva versión** (paso 3). |
| No se ven las miniaturas | La cuenta de Google no permite compartir archivos con "cualquiera con el enlace" (pasa con cuentas empresariales). Usa una cuenta Gmail personal para el script. |
| Se queda en "pendiente" | No hay internet o la URL de `API_URL` está mal. Toca el botón de estado para reintentar. |
