# Notas App

App de notas y listas de tareas ligera, pensada para correr desde **Termux** en Android y ser accedida desde cualquier dispositivo en la misma red.

Sin base de datos, sin dependencias externas. Solo Python.

## Caracteristicas

- Sesiones compartidas: crea un espacio de trabajo con un nombre y comparte ese nombre con otros
- Notas con formato basico (negrita, cursiva, listas)
- Listas de tareas con checkbox
- Todos los cambios quedan registrados con el nombre del usuario que los hizo
- Funciona en movil y PC desde el navegador

## Requisitos

- Python 3.6 o superior
- Sin paquetes adicionales (usa solo la biblioteca estandar)

## Instalacion en Termux

```bash
pkg update && pkg install python git
git clone https://github.com/tu-usuario/notas-app.git
cd notas-app
python server.py
```

Luego abri el navegador del celular en:

```
http://localhost:8000
```

## Acceso desde otros dispositivos

El servidor escucha en todas las interfaces (`0.0.0.0`). Para acceder desde otra PC o celular en la misma red WiFi, obtene la IP del dispositivo donde corre el servidor:

```bash
ip addr show wlan0 | grep "inet "
```

Y en el otro dispositivo abrí:

```
http://192.168.x.x:8000
```

## Cambiar puerto

```bash
PORT=8080 python server.py
```

## Estructura

```
notas-app/
  server.py          # Servidor HTTP y API REST
  static/
    index.html       # Interfaz (app de una sola pagina)
    css/style.css
    js/
      api.js         # Cliente de la API
      app.js         # Logica del frontend
  data/
    sessions/        # Datos de cada sesion (JSON, generado automaticamente)
```

## Como funciona

- Al entrar escribis tu nombre (sin contrasena, solo para registrar quien hizo cada cambio)
- Creas una sesion con un nombre generado al azar (lo podes modificar antes de crear)
- Otros usuarios se unen escribiendo el mismo nombre de sesion
- Cada sesion tiene sus propias notas y lista de tareas

## Notas tecnicas

- Los datos se guardan como archivos JSON en `data/sessions/`
- El servidor usa un lock por archivo para evitar condiciones de carrera en escrituras concurrentes
- No hay autenticacion: cualquiera con acceso a la red puede entrar a cualquier sesion por nombre
- Recomendado para redes locales de confianza (casa, oficina pequena)

## Limitaciones conocidas

- Sin autenticacion ni contrasenas por diseno
- Los datos no se sincronizan si el servidor se reinicia con archivos borrados
- No probado con mas de ~20 usuarios simultaneos
