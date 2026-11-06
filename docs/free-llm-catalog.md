# Catálogo offline de proveedores

`doom catalogo` permite consultar localmente un directorio atribuido de proveedores. Mantiene el modelo local y no configura, contacta ni prueba ningún servicio externo.

## Consulta rápida

```bash
./doom catalogo
./doom catalogo 'Grok'
./doom catalogo --help
```

El filtro busca una subcadena del nombre del proveedor sin distinguir mayúsculas. Las URLs se muestran sólo como datos del snapshot; el comando no las abre ni lee credenciales. Una URL ausente aparece como `no publicado`.

## Alcance y límites

| Tema | Decisión |
| --- | --- |
| Datos | `harness/catalog/snapshot.json`, fijo y local |
| Fuente | `open-free-llm-api/awesome-freellm-apis` |
| Revisión | `d04877f798520a680a0a954ced5a6ee5514406c0` |
| Fecha del snapshot | 2026-10-24 |
| Licencia upstream | MIT; texto preservado en `harness/catalog/LICENSE.upstream` |

Los modelos, contexto, categoría y requisitos son declaraciones del directorio upstream, no verificaciones de cada proveedor. No garantizan gratuidad, disponibilidad, costos, privacidad, compatibilidad ni uso permitido. En particular, las alternativas pagadas de OpenRouter pueden generar cargos.

El catálogo no es un selector de modelo, un actualizador ni una integración de API. Para mantener evidencia sensible, conserva el endpoint local existente y no agrega variables de entorno, claves, red ni fallback externo.
