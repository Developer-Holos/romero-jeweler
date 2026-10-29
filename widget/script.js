define(['jquery'], function ($) {
  var CustomWidget = function () {
    var self = this;

    // ─── Cómo está armado ─────────────────────────────────────────────────────
    // - Tarjeta del lead (lcard-1): un botón "Generar invoice" que abre una
    //   ventana flotante con el generador (formulario + vista previa del PDF).
    // - Ajustes avanzados (advanced_settings): el editor del diseño del invoice
    //   (orden de bloques, colores, tipografía, logo). Kommo deja un
    //   <div id="work-area-<código>"> vacío y el widget lo llena — mismo
    //   contenedor que usa el Bot de Distribución.
    // - Ambas pantallas son la app de Svelte compilada en app.js (ver
    //   vite.widget.config.ts en el repo romero-jeweler), montada dentro de un
    //   Shadow DOM para que su CSS y el de Kommo no se mezclen.
    // - El PDF, la IA y la plantilla compartida los resuelve la API del widget
    //   (src/routes/api de la app romero-jeweler, la misma de la página de
    //   tracking), en SERVIDOR_URL (la clave de los ajustes solo hace falta si la
    //   app tiene WIDGET_KEY).

    var ROOT_ID = 'rj-invoice-root';

    // API del widget en la app publicada en Railway.
    var SERVIDOR_URL = 'https://romero-jeweler-production.up.railway.app/api';

    // Campos sueltos de producto de la cuenta romerojeweler (de antes de los grupos por anillo): si el lead los
    // tiene llenos, precargan la primera pieza. Si un id no aparece en el lead, se busca por nombre.
    var CAMPOS_PRODUCTO = {
      metal: { id: 133508, nombre: 'metal' },
      quilates: { id: 133510, nombre: 'quilates' },
      piedra: { id: 133562, nombre: 'piedra' },
      talla: { id: 133564, nombre: 'talla' }
    };
    var appPromise = null;
    var desmontarDisenador = null;

    this.t = function (key) {
      var labels = self.i18n('labels') || {};
      return labels[key] || key;
    };

    this.callbacks = {
      settings: function () {
        self.loadCSS();
        return true;
      },
      init: function () {
        self.loadCSS();
        return true;
      },
      bind_actions: function () { return true; },
      render: function () {
        if (APP.data.is_card && APP.data.current_entity === 'leads') {
          self.mount();
        }
        return true;
      },
      advancedSettings: function () {
        self.loadCSS();
        self.waitForAdvancedSettingsForm();
        return true;
      },
      // Kommo lo llama al instalar el widget y al guardar sus ajustes.
      onSave: function () {
        self.prepararKommo();
        return true;
      },
      destroy: function () {
        if (window.RJInvoiceApp) window.RJInvoiceApp.cerrarGenerador();
        if (desmontarDisenador) { desmontarDisenador(); desmontarDisenador = null; }
      }
    };

    // ─── CSS y app ────────────────────────────────────────────────────────────

    // Kommo no adjunta style.css de forma confiable: se carga a mano, sin duplicar.
    this.loadCSS = function () {
      var settings = self.get_settings() || {};
      if (!settings.path) return;
      var href = settings.path + '/style.css?v=' + settings.version;
      if ($('link[href="' + href + '"]').length) return;
      $('head').append('<link href="' + href + '" type="text/css" rel="stylesheet">');
    };

    // app.js se descarga recién al primer uso (pesa ~190 KB) y queda en window.RJInvoiceApp.
    this.loadApp = function () {
      if (window.RJInvoiceApp) return $.Deferred().resolve(window.RJInvoiceApp).promise();
      if (appPromise) return appPromise;
      var settings = self.get_settings() || {};
      appPromise = $.ajax({
        url: settings.path + '/app.js?v=' + settings.version,
        dataType: 'script',
        cache: true
      }).then(function () {
        if (!window.RJInvoiceApp) return $.Deferred().reject(self.t('error_app')).promise();
        return window.RJInvoiceApp;
      }, function () {
        appPromise = null; // permite reintentar
        return $.Deferred().reject(self.t('error_app')).promise();
      });
      return appPromise;
    };

    this.servidor = function () {
      var settings = self.get_settings() || {};
      return { url: SERVIDOR_URL, clave: settings.widget_key || '' };
    };

    // ─── Pestañas y campos del lead en Kommo ───────────────────────────────────
    // Los crea el widget con la API de Kommo y la sesión del usuario (como el widget "IA Campos y Bots"):
    // busca por nombre y crea solo lo que falta, así que se puede llamar las veces que sea.
    //
    // Todo va en la pestaña "Orden" (las viejas "Widget Invoice" y "Orden de producción" se vacían en ella y se
    // borran): primero los campos del pedido y, después, un grupo por anillo con el formato del widget Group Fields:
    //   *Anillo °1*      ← abre el grupo (no se llena)
    //   [1] Metal …      ← los campos del anillo 1
    //   *!*              ← cierra el grupo
    // Los grupos son de la cuenta; Group Fields muestra en cada lead tantos como diga "N° de Anillos".
    var PESTANA = 'Orden';
    var PESTANAS_VIEJAS = ['Widget Invoice', 'Orden de producción'];
    var CAMPO_ANILLOS = { id: 283974, nombre: 'N° de Anillos' };
    var CAMPOS_PEDIDO = [
      { clave: 'orden', nombre: 'Order #', tipo: 'text' },
      { clave: 'stuller', nombre: 'Stuller O.#', tipo: 'text' },
      { clave: 'nivoda', nombre: 'Nivoda O.#', tipo: 'text' },
      { clave: 'pdf', nombre: 'Orden de producción (PDF)', tipo: 'file' }
    ];
    // Igual que KOMMO_ANILLO de src/lib/invoice/campos.ts. `lista`: opciones del campo (de /api/opciones).
    var CAMPOS_ANILLO = [
      { clave: 'metal', nombre: 'Metal', tipo: 'select', lista: 'metales' },
      { clave: 'quilates', nombre: 'Quilates', tipo: 'select', lista: 'quilates' },
      { clave: 'piedra', nombre: 'Piedra', tipo: 'multiselect', lista: 'piedras' },
      { clave: 'talla', nombre: 'Talla', tipo: 'text' },
      { clave: 'tipo', nombre: 'Ring Type', tipo: 'select', lista: 'tipos' },
      { clave: 'size', nombre: 'Size', tipo: 'text' },
      { clave: 'ancho', nombre: 'Width', tipo: 'text' },
      { clave: 'grosor', nombre: 'Thickness', tipo: 'text' },
      { clave: 'peso', nombre: 'Est. Weight', tipo: 'text' },
      { clave: 'grabado', nombre: 'Engraving', tipo: 'text' },
      { clave: 'cabeza', nombre: 'Head style', tipo: 'text' },
      { clave: 'halo', nombre: 'Halo Stones', tipo: 'text' },
      { clave: 'notas', nombre: 'Notes', tipo: 'textarea' }
    ];
    var CIERRE = '*!*';
    var cabecera = function (n) { return '*Anillo °' + n + '*'; };
    var grupoGF = function (n) { return 'Anillo °' + n; };
    var numeroCabecera = function (nombre) { var m = /^\*Anillo °(\d+)\*$/.exec(nombre); return m ? Number(m[1]) : 0; };
    // Orden dentro de la pestaña: el pedido arriba, después cada anillo en su tramo de 100.
    var base = function (n) { return 1000 + n * 100; };

    var PESTANA_IMAGENES = 'Imágenes de la pieza';
    var PREFIJO_IMAGEN = 'Imagen ';
    var IMAGENES_INICIALES = 3;

    // $.ajax a la API de Kommo. El rechazo es explícito: en jQuery 3 devolver un valor resolvería la promesa.
    this.kommoApi = function (metodo, ruta, cuerpo) {
      return $.ajax({
        url: ruta,
        method: metodo,
        dataType: 'json',
        timeout: 30000,
        contentType: cuerpo ? 'application/json' : undefined,
        data: cuerpo ? JSON.stringify(cuerpo) : undefined
      }).then(function (d) { return d; }, function (xhr) {
        var detalle = xhr.statusText === 'timeout' ? 'Kommo no respondió en 30 s' :
          (xhr.responseJSON && (xhr.responseJSON.detail || xhr.responseJSON.title)) || ('Kommo respondió ' + xhr.status);
        return $.Deferred().reject(detalle).promise();
      });
    };

    this.todos = function (ruta, clave) {
      var items = [];
      function pagina(url) {
        return self.kommoApi('GET', url).then(function (d) {
          items = items.concat((d && d._embedded && d._embedded[clave]) || []);
          var siguiente = d && d._links && d._links.next && d._links.next.href;
          return siguiente ? pagina(siguiente) : items;
        });
      }
      return pagina(ruta + (ruta.indexOf('?') === -1 ? '?' : '&') + 'limit=250');
    };

    // De a 40 por pedido: Kommo limita cuántos campos se crean o cambian en uno solo.
    this.enTandas = function (metodo, ruta, lista) {
      var hechos = [];
      var tanda = function (i) {
        if (i >= lista.length) return $.Deferred().resolve(hechos).promise();
        return self.kommoApi(metodo, ruta, lista.slice(i, i + 40)).then(function (d) {
          hechos = hechos.concat((d && d._embedded && d._embedded.custom_fields) || []);
          return tanda(i + 40);
        });
      };
      return tanda(0);
    };

    // Opciones compartidas (metales, quilates, piedras… y campos extra de la orden), desde la app.
    this.opciones = function () {
      var servidor = self.servidor();
      return $.ajax({
        url: servidor.url + '/opciones',
        dataType: 'json',
        timeout: 30000,
        headers: servidor.clave ? { 'X-Widget-Key': servidor.clave } : {}
      }).then(function (d) { return d.opciones; }, function () {
        return $.Deferred().reject('No se pudieron leer las opciones de la app').promise();
      });
    };

    this.asegurarPestana = function (nombre) {
      return self.todos('/api/v4/leads/custom_fields/groups', 'custom_field_groups').then(function (grupos) {
        var g = grupos.filter(function (x) { return x.name === nombre; })[0];
        if (g) return g.id;
        return self.kommoApi('POST', '/api/v4/leads/custom_fields/groups', [{ name: nombre, sort: 500 }])
          .then(function (d) { return d._embedded.custom_field_groups[0].id; });
      });
    };

    // Las pestañas viejas se vacían en "Orden" (sus campos y lo que tienen guardado se conservan) y se borran.
    this.migrarPestanas = function (ordenId) {
      return $.when(
        self.todos('/api/v4/leads/custom_fields/groups', 'custom_field_groups'),
        self.todos('/api/v4/leads/custom_fields', 'custom_fields')
      ).then(function (grupos, campos) {
        var viejas = grupos.filter(function (g) { return PESTANAS_VIEJAS.indexOf(g.name) !== -1; });
        if (!viejas.length) return;
        var mover = campos.filter(function (c) {
          return viejas.some(function (g) { return g.id === c.group_id; });
        }).map(function (c, i) { return { id: c.id, group_id: ordenId, sort: 100 + i }; });
        return self.enTandas('PATCH', '/api/v4/leads/custom_fields', mover).then(function () {
          return $.when.apply($, viejas.map(function (g) {
            return self.kommoApi('DELETE', '/api/v4/leads/custom_fields/groups/' + g.id);
          }));
        });
      });
    };

    var enumsDe = function (lista) {
      return lista.map(function (v, i) { return { value: v, sort: (i + 1) * 10 }; });
    };
    var mismoTexto = function (a, b) { return String(a).trim().toLowerCase() === String(b).trim().toLowerCase(); };

    // Lo que hay en la pestaña "Orden", creando lo que falte: los campos del pedido, los grupos de los anillos
    // 1…`cantidad` (y completa los que ya existan), y las opciones de los campos de selección. `extra`: un campo
    // recién creado en la orden ({ donde, clave, nombre }) que puede no estar todavía en las opciones de la app.
    // Devuelve { pedido: { clave: campo }, anillos: { n: { clave: campo } }, anillosCampo, catalogo }.
    this.estructura = function (cantidad, extra) {
      return $.when(self.opciones(), self.asegurarPestana(PESTANA)).then(function (op, grupoId) {
        return self.migrarPestanas(grupoId).then(function () {
          return self.todos('/api/v4/leads/custom_fields', 'custom_fields');
        }).then(function (todos) {
          var enPestana = todos.filter(function (c) { return c.group_id === grupoId; });
          var porNombre = function (nombre) { return enPestana.filter(function (c) { return c.name === nombre; })[0]; };
          var extrasAnillo = (op.camposAnillo || []).slice();
          var extrasPedido = (op.camposPedido || []).slice();
          if (extra && extra.donde === 'anillo' && !extrasAnillo.some(function (c) { return c.clave === extra.clave; })) extrasAnillo.push(extra);
          if (extra && extra.donde === 'pedido' && !extrasPedido.some(function (c) { return c.clave === extra.clave; })) extrasPedido.push(extra);
          var catalogoAnillo = CAMPOS_ANILLO.concat(extrasAnillo.map(function (c) { return { clave: c.clave, nombre: c.nombre, tipo: 'text' }; }));
          var catalogoPedido = CAMPOS_PEDIDO.concat(extrasPedido.map(function (c) { return { clave: c.clave, nombre: c.nombre, tipo: 'text' }; }));

          var nuevos = [];
          catalogoPedido.forEach(function (c, i) {
            if (!porNombre(c.nombre)) nuevos.push({ name: c.nombre, type: c.tipo, group_id: grupoId, sort: 10 + i });
          });
          var existentes = enPestana.map(function (c) { return numeroCabecera(c.name); }).filter(Boolean);
          var hasta = Math.max(cantidad || 0, existentes.length ? Math.max.apply(null, existentes) : 0);
          var creados = [];
          for (var n = 1; n <= hasta; n++) {
            var hayCabecera = !!porNombre(cabecera(n));
            if (!hayCabecera && n > cantidad) continue;
            if (!hayCabecera) { nuevos.push({ name: cabecera(n), type: 'text', group_id: grupoId, sort: base(n) }); creados.push(n); }
            catalogoAnillo.forEach(function (c, k) {
              if (porNombre('[' + n + '] ' + c.nombre)) return;
              var campo = { name: '[' + n + '] ' + c.nombre, type: c.tipo, group_id: grupoId, sort: base(n) + (k < CAMPOS_ANILLO.length ? 1 + k : 50 + k) };
              if (c.lista) campo.enums = enumsDe(op[c.lista] || []);
              nuevos.push(campo);
            });
            var desde = base(n);
            var hayCierre = enPestana.some(function (c) { return c.name === CIERRE && c.sort > desde && c.sort < desde + 100; });
            if (!hayCierre) nuevos.push({ name: CIERRE, type: 'text', group_id: grupoId, sort: desde + 99 });
          }

          return self.enTandas('POST', '/api/v4/leads/custom_fields', nuevos).then(function (hechos) {
            enPestana = enPestana.concat(hechos);
            // Campos de selección a los que les falta alguna opción (agregada después en la app).
            var cambios = [];
            enPestana.forEach(function (c) {
              var m = /^\[(\d+)\] (.+)$/.exec(c.name);
              var def = m && CAMPOS_ANILLO.filter(function (x) { return x.nombre === m[2] && x.lista; })[0];
              if (!def) return;
              var actuales = c.enums || [];
              var faltan = (op[def.lista] || []).filter(function (v) { return !actuales.some(function (e) { return mismoTexto(e.value, v); }); });
              if (faltan.length) cambios.push({ id: c.id, enums: actuales.concat(faltan.map(function (v, i) { return { value: v, sort: (actuales.length + i + 1) * 10 }; })) });
            });
            return self.enTandas('PATCH', '/api/v4/leads/custom_fields', cambios).then(function (cambiados) {
              cambiados.forEach(function (c) {
                enPestana = enPestana.map(function (x) { return x.id === c.id ? $.extend({}, x, c) : x; });
              });
              var mapa = { pedido: {}, anillos: {}, catalogoAnillo: catalogoAnillo, grupoId: grupoId, todos: todos.concat(hechos) };
              catalogoPedido.forEach(function (c) { var campo = porNombreEn(enPestana, c.nombre); if (campo) mapa.pedido[c.clave] = campo; });
              enPestana.forEach(function (c) {
                var m = /^\[(\d+)\] (.+)$/.exec(c.name);
                var def = m && catalogoAnillo.filter(function (x) { return x.nombre === m[2]; })[0];
                if (!def) return;
                (mapa.anillos[m[1]] = mapa.anillos[m[1]] || {})[def.clave] = c;
              });
              mapa.anillosCampo = mapa.todos.filter(function (c) { return c.id === CAMPO_ANILLOS.id; })[0] ||
                mapa.todos.filter(function (c) { return mismoTexto(c.name, CAMPO_ANILLOS.nombre); })[0];
              var total = Object.keys(mapa.anillos).length;
              // Si se creó algún grupo, Group Fields tiene que saber que existe.
              if (!creados.length) return mapa;
              return self.actualizarGroupFields(total, mapa.anillosCampo).then(function () { return mapa; }, function (e) {
                console.warn('[rj-invoice] No se pudo actualizar Group Fields: ' + e);
                return mapa;
              });
            });
          });
        });
      });
    };
    var porNombreEn = function (lista, nombre) { return lista.filter(function (c) { return c.name === nombre; })[0]; };

    // Agrega "Anillo °1…N" a la regla de visibilidad del widget Group Fields (su ajuste ring_config:
    // { field: "N° de Anillos", groups: ["Anillo °1", …] }), sin tocar sus otros ajustes.
    this.actualizarGroupFields = function (total, campoAnillos) {
      var tieneRingConfig = function (w) {
        var t = w.settings_template || [];
        return $.isArray(t) ? t.some(function (s) { return s && s.key === 'ring_config'; }) : !!t.ring_config;
      };
      return self.todos('/api/v4/widgets', 'widgets').then(function (ws) {
        var gf = ws.filter(tieneRingConfig)[0];
        if (!gf) return;
        return self.kommoApi('GET', '/api/v4/widgets/' + gf.code).then(function (w) {
          var ajustes = $.extend({}, w.settings);
          var actual = {};
          try { actual = JSON.parse(ajustes.ring_config || '{}') || {}; } catch (e) { actual = {}; }
          var grupos = $.isArray(actual.groups) ? actual.groups.slice() : [];
          var otros = grupos.filter(function (g) { return !/^Anillo °\d+$/.test(String(g).trim()); });
          var anillos = [];
          for (var n = 1; n <= total; n++) anillos.push(grupoGF(n));
          var nueva = { field: actual.field || (campoAnillos && campoAnillos.name) || CAMPO_ANILLOS.nombre, groups: anillos.concat(otros) };
          if (JSON.stringify(nueva) === JSON.stringify({ field: actual.field, groups: grupos })) return;
          ajustes.ring_config = JSON.stringify(nueva);
          return self.kommoApi('POST', '/api/v4/widgets/' + gf.code, { settings: ajustes });
        });
      });
    };

    // Valor de un campo del lead como texto (o lista, en una selección múltiple).
    var valorDe = function (lead, campo) {
      var c = (lead.custom_fields_values || []).filter(function (f) { return f.field_id === campo.id; })[0];
      var vs = (c && c.values) || [];
      if (campo.type === 'multiselect') return vs.map(function (v) { return String(v.value); });
      return vs[0] && vs[0].value != null ? String(vs[0].value) : '';
    };

    // { cantidad, pedido: { clave: valor }, anillos: [{ clave: valor }, …] } de la pestaña "Orden" del lead.
    this.leerOrden = function (leadId) {
      return $.when(self.estructura(0), self.kommoApi('GET', '/api/v4/leads/' + leadId)).then(function (mapa, lead) {
        var pedido = {};
        Object.keys(mapa.pedido).forEach(function (k) {
          if (mapa.pedido[k].type !== 'file') pedido[k] = valorDe(lead, mapa.pedido[k]);
        });
        var anillos = [];
        Object.keys(mapa.anillos).map(Number).sort(function (a, b) { return a - b; }).forEach(function (n) {
          var a = {};
          Object.keys(mapa.anillos[n]).forEach(function (k) { a[k] = valorDe(lead, mapa.anillos[n][k]); });
          anillos[n - 1] = a;
        });
        for (var i = 0; i < anillos.length; i++) anillos[i] = anillos[i] || {};
        return { cantidad: mapa.anillosCampo ? Number(valorDe(lead, mapa.anillosCampo)) || 0 : 0, pedido: pedido, anillos: anillos };
      });
    };

    // Escribe la orden en el lead: crea los grupos que falten, agrega a los campos de selección las opciones
    // que todavía no tengan, y guarda "N° de Anillos". Devuelve { pdf: id del campo del PDF de la orden }.
    this.guardarOrden = function (leadId, datos) {
      return self.estructura(datos.cantidad).then(function (mapa) {
        // Opciones nuevas que llegan en los valores (ej. un metal escrito a mano en un borrador viejo).
        var faltan = {};
        datos.anillos.forEach(function (a, i) {
          var campos = mapa.anillos[i + 1] || {};
          Object.keys(a).forEach(function (k) {
            var c = campos[k];
            if (!c || (c.type !== 'select' && c.type !== 'multiselect')) return;
            [].concat(a[k] || []).forEach(function (v) {
              if (!String(v).trim() || (c.enums || []).some(function (e) { return mismoTexto(e.value, v); })) return;
              (faltan[c.id] = faltan[c.id] || { c: c, vs: [] }).vs.push(String(v).trim());
            });
          });
        });
        var cambios = Object.keys(faltan).map(function (id) {
          var f = faltan[id], actuales = f.c.enums || [];
          return { id: f.c.id, enums: actuales.concat(f.vs.map(function (v, i) { return { value: v, sort: (actuales.length + i + 1) * 10 }; })) };
        });
        return self.enTandas('PATCH', '/api/v4/leads/custom_fields', cambios).then(function (cambiados) {
          var enums = {};
          cambiados.forEach(function (c) { enums[c.id] = c.enums; });
          var valor = function (c, v) {
            var lista = [].concat(v == null ? [] : v).map(function (x) { return String(x).trim(); }).filter(Boolean);
            if (!lista.length) return null; // vacío: se borra el valor del campo en Kommo
            if (c.type !== 'select' && c.type !== 'multiselect') return [{ value: lista.join(', ') }];
            var opciones = enums[c.id] || c.enums || [];
            var ids = lista.map(function (x) {
              var e = opciones.filter(function (o) { return mismoTexto(o.value, x); })[0];
              return e ? { enum_id: e.id } : null;
            }).filter(Boolean);
            return ids.length ? (c.type === 'select' ? ids.slice(0, 1) : ids) : null;
          };
          var cuerpo = [];
          Object.keys(datos.pedido).forEach(function (k) {
            var c = mapa.pedido[k];
            if (c && c.type !== 'file') cuerpo.push({ field_id: c.id, values: valor(c, datos.pedido[k]) });
          });
          datos.anillos.forEach(function (a, i) {
            var campos = mapa.anillos[i + 1] || {};
            Object.keys(a).forEach(function (k) {
              if (campos[k]) cuerpo.push({ field_id: campos[k].id, values: valor(campos[k], a[k]) });
            });
          });
          if (mapa.anillosCampo) cuerpo.push({ field_id: mapa.anillosCampo.id, values: [{ value: datos.cantidad }] });
          return self.kommoApi('PATCH', '/api/v4/leads/' + leadId, { custom_fields_values: cuerpo }).then(function () {
            return { pdf: mapa.pedido.pdf && mapa.pedido.pdf.id };
          });
        });
      });
    };

    this.asegurarAnillos = function (cantidad) {
      return self.estructura(cantidad).then(function () { return true; });
    };

    // Una opción nueva (metal, quilates, piedra…) va a los campos de selección de todos los anillos.
    this.agregarOpcion = function (lista, valor) {
      return self.estructura(0).then(function (mapa) {
        var cambios = [];
        Object.keys(mapa.anillos).forEach(function (n) {
          CAMPOS_ANILLO.filter(function (c) { return c.lista === lista; }).forEach(function (def) {
            var c = mapa.anillos[n][def.clave];
            if (!c || (c.enums || []).some(function (e) { return mismoTexto(e.value, valor); })) return;
            cambios.push({ id: c.id, enums: (c.enums || []).concat([{ value: valor, sort: ((c.enums || []).length + 1) * 10 }]) });
          });
        });
        return self.enTandas('PATCH', '/api/v4/leads/custom_fields', cambios);
      });
    };

    // Un campo nuevo de la orden: en el pedido, o como "[N] Nombre" en el grupo de cada anillo.
    this.crearCampo = function (donde, clave, nombre) {
      return self.estructura(0, { donde: donde, clave: clave, nombre: nombre }).then(function () { return true; });
    };

    var numeroImagen = function (c) { return Number(c.name.slice(PREFIJO_IMAGEN.length)) || 0; };

    // `faltan(campos de la pestaña)` dice qué campos crear: [{ nombre, tipo }].
    this.asegurarCampos = function (grupoId, faltan) {
      return self.todos('/api/v4/leads/custom_fields', 'custom_fields').then(function (todos) {
        var enPestana = todos.filter(function (c) { return c.group_id === grupoId; });
        var nuevos = faltan(enPestana);
        if (!nuevos.length) return enPestana;
        var cuerpo = nuevos.map(function (c, i) { return { name: c.nombre, type: c.tipo, group_id: grupoId, sort: 500 + enPestana.length + i }; });
        return self.kommoApi('POST', '/api/v4/leads/custom_fields', cuerpo)
          .then(function (d) { return enPestana.concat(d._embedded.custom_fields); });
      });
    };

    // Campos "Imagen N" de la pestaña, al menos `cantidad`, ordenados.
    this.camposImagenes = function (cantidad) {
      return self.asegurarPestana(PESTANA_IMAGENES).then(function (grupoId) {
        return self.asegurarCampos(grupoId, function (enPestana) {
          var actuales = enPestana.filter(function (c) { return c.type === 'file' && c.name.indexOf(PREFIJO_IMAGEN) === 0; });
          var ultimo = actuales.reduce(function (m, c) { return Math.max(m, numeroImagen(c)); }, 0);
          var nuevos = [];
          for (var n = actuales.length; n < cantidad; n++) nuevos.push({ nombre: PREFIJO_IMAGEN + (ultimo + nuevos.length + 1), tipo: 'file' });
          return nuevos;
        });
      }).then(function (campos) {
        return campos.filter(function (c) { return c.type === 'file' && c.name.indexOf(PREFIJO_IMAGEN) === 0; })
          .sort(function (a, b) { return numeroImagen(a) - numeroImagen(b); });
      });
    };

    var ocupado = function (lead, campoId) {
      var c = (lead.custom_fields_values || []).filter(function (f) { return f.field_id === campoId; })[0];
      var v = c && c.values && c.values[0] ? c.values[0].value : null;
      return !!(v && v.file_uuid && !v.is_deleted);
    };

    // Primer campo "Imagen N" libre del lead; si están todos ocupados, crea el siguiente.
    this.campoImagenLibre = function (leadId) {
      return $.when(self.camposImagenes(IMAGENES_INICIALES), self.kommoApi('GET', '/api/v4/leads/' + leadId)).then(function (campos, lead) {
        var libre = campos.filter(function (c) { return !ocupado(lead, c.id); })[0];
        if (libre) return { id: libre.id, nombre: libre.name };
        return self.camposImagenes(campos.length + 1).then(function (todos) {
          var nuevo = todos.filter(function (c) { return !ocupado(lead, c.id); })[0];
          return { id: nuevo.id, nombre: nuevo.name };
        });
      });
    };

    // Lo que la app (app.js) usa de Kommo. Devuelven promesas de jQuery, que la app espera con await.
    this.kommo = function () {
      return {
        campoImagenLibre: self.campoImagenLibre,
        leerOrden: self.leerOrden,
        guardarOrden: self.guardarOrden,
        asegurarAnillos: self.asegurarAnillos,
        agregarOpcion: self.agregarOpcion,
        crearCampo: self.crearCampo
      };
    };

    // Al instalar (y al guardar los ajustes): la pestaña "Orden" con el grupo del anillo 1, la de imágenes,
    // y Group Fields al día.
    this.prepararKommo = function () {
      $.when(self.estructura(1), self.camposImagenes(IMAGENES_INICIALES)).then(function (mapa) {
        return self.actualizarGroupFields(Object.keys(mapa.anillos).length, mapa.anillosCampo);
      }).fail(function (detalle) {
        console.warn('[rj-invoice] No se pudo preparar la pestaña Orden en Kommo: ' + detalle);
      });
    };

    // ─── Tarjeta del lead ─────────────────────────────────────────────────────

    this.shellHtml = function () {
      return '<div id="' + ROOT_ID + '" class="rj-invoice">' +
        '<p class="rj-invoice__hint">' + self.esc(self.t('card_hint')) + '</p>' +
        '<button type="button" id="rj-invoice-abrir" class="rj-invoice__btn">' + self.esc(self.t('card_button')) + '</button>' +
        '<button type="button" id="rj-invoice-orden" class="rj-invoice__btn rj-invoice__btn--secundario">' + self.esc(self.t('order_button')) + '</button>' +
        '<div id="rj-invoice-status" class="rj-invoice__status"></div>' +
      '</div>';
    };

    this.mount = function () {
      self.render_template({
        caption: { class_name: 'rj-invoice-widget' },
        body: '',
        render: self.shellHtml()
      });
      setTimeout(function () {
        self.ensureMounted();
        $(document).off('click.rjinvoice')
          .on('click.rjinvoice', '#rj-invoice-abrir', function () { self.abrir('abrirGenerador', $(this)); })
          .on('click.rjinvoice', '#rj-invoice-orden', function () { self.abrir('abrirOrden', $(this)); });
      }, 0);
    };

    // Si Kommo no pinta el render_template, se inyecta el mismo markup a mano.
    this.ensureMounted = function () {
      if (document.getElementById(ROOT_ID)) return;
      var code = (self.get_settings() || {}).widget_code;
      var $target = $();
      if (code) {
        $target = $('#widget_' + code + ' .widget_body');
        if (!$target.length) $target = $('#widget_' + code);
      }
      if (!$target.length) $target = $('.rj-invoice-widget').first();
      if ($target.length) $target.append(self.shellHtml());
      else console.warn('[rj-invoice] No se encontró dónde montar el panel en la tarjeta del lead.');
    };

    this.status = function (text, state) {
      $('#rj-invoice-status')
        .removeClass('rj-invoice__status--error rj-invoice__status--working')
        .addClass(state ? 'rj-invoice__status--' + state : '')
        .text(text || '');
    };

    // `ventana`: abrirGenerador (invoice) o abrirOrden (orden de producción). Las dos usan el mismo borrador.
    this.abrir = function (ventana, $btn) {
      var servidor = self.servidor();
      if (!servidor.url) {
        self.status(self.t('error_settings'), 'error');
        return;
      }
      $btn.prop('disabled', true);
      self.status(self.t('loading'), 'working');
      $.when(self.loadApp(), self.leadInfo())
        .done(function (app, lead) {
          self.status('');
          app[ventana]({ lead: lead, servidor: servidor, kommo: self.kommo() });
        })
        .fail(function (msg) {
          self.status(typeof msg === 'string' ? msg : self.t('error_lead'), 'error');
        })
        .always(function () { $btn.prop('disabled', false); });
    };

    // Datos del lead para precargar el invoice: contacto principal, correo,
    // responsable, presupuesto (precio del lead, solo lectura) y campos de producto.
    this.leadInfo = function () {
      var leadId = APP.data.current_card.id;
      return $.ajax({ url: '/api/v4/leads/' + leadId + '?with=contacts', dataType: 'json' })
        .then(function (lead) {
          var contactos = (lead._embedded && lead._embedded.contacts) || [];
          var principal = contactos.filter(function (c) { return c.is_main; })[0] || contactos[0];
          var info = {
            id: lead.id,
            nombre: lead.name || '',
            contacto: '',
            email: '',
            responsable: self.userName(lead.responsible_user_id),
            presupuesto: Number(lead.price) || 0,
            producto: self.producto(lead)
          };
          if (!principal) return info;
          return $.ajax({ url: '/api/v4/contacts/' + principal.id, dataType: 'json' })
            .then(function (contacto) {
              info.contacto = contacto.name || '';
              info.email = self.fieldValue(contacto, 'EMAIL');
              return info;
            }, function () {
              return $.Deferred().resolve(info).promise(); // sin contacto, el asesor lo escribe a mano
            });
        }, function () {
          // Rechazo explícito: en jQuery 3 devolver un valor desde aquí resolvería la promesa.
          return $.Deferred().reject(self.t('error_lead')).promise();
        });
    };

    // Campos de producto del lead (Metal, Quilates, Piedra, Talla). Ver docs/DECISIONES.md, #12.
    this.producto = function (lead) {
      var campos = lead.custom_fields_values || [];
      function valor(c) {
        var campo = campos.filter(function (f) { return f.field_id === c.id; })[0] ||
          campos.filter(function (f) { return String(f.field_name || '').trim().toLowerCase() === c.nombre; })[0];
        var v = campo && campo.values && campo.values[0] && campo.values[0].value;
        return v == null ? '' : String(v);
      }
      return {
        metal: valor(CAMPOS_PRODUCTO.metal),
        quilates: valor(CAMPOS_PRODUCTO.quilates),
        piedra: valor(CAMPOS_PRODUCTO.piedra),
        talla: valor(CAMPOS_PRODUCTO.talla)
      };
    };

    this.fieldValue = function (entity, code) {
      var campos = entity.custom_fields_values || [];
      var campo = campos.filter(function (f) { return f.field_code === code; })[0];
      return (campo && campo.values && campo.values[0] && campo.values[0].value) || '';
    };

    // Nombre del usuario responsable sin pedirlo a la API (no todos los usuarios pueden listar usuarios).
    this.userName = function (userId) {
      try {
        var managers = APP.constant('managers') || {};
        var m = managers[userId];
        return (m && (m.title || m.name)) || '';
      } catch (e) {
        return '';
      }
    };

    // ─── Ajustes avanzados: diseño del invoice ────────────────────────────────

    this.findAdvancedSettingsContainer = function () {
      var $content = $('[id^="work-area-"]').first();
      return $content.length ? $content : null;
    };

    this.waitForAdvancedSettingsForm = function () {
      var attempts = 0;
      var maxAttempts = 40; // ~8s a 200ms
      var timer = setInterval(function () {
        attempts++;
        var $container = self.findAdvancedSettingsContainer();
        if ($container) {
          clearInterval(timer);
          self.mountDesigner($container);
        } else if (attempts >= maxAttempts) {
          clearInterval(timer);
          console.warn('[rj-invoice] No apareció el contenedor "work-area-*" de los ajustes avanzados.');
        }
      }, 200);
    };

    this.mountDesigner = function ($container) {
      if ($container.data('rj-invoice-montado')) return;
      $container.data('rj-invoice-montado', true);
      var servidor = self.servidor();
      if (!servidor.url) {
        $container.html('<div class="rj-invoice rj-invoice--aviso">' + self.esc(self.t('error_settings')) + '</div>');
        return;
      }
      $container.html('<div class="rj-invoice rj-invoice--aviso">' + self.esc(self.t('loading')) + '</div>');
      self.loadApp()
        .done(function (app) {
          desmontarDisenador = app.montarDisenador($container[0], servidor);
        })
        .fail(function (msg) {
          $container.data('rj-invoice-montado', false);
          $container.html('<div class="rj-invoice rj-invoice--aviso rj-invoice__status--error">' + self.esc(msg) + '</div>');
        });
    };

    this.esc = function (s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    };

    return this;
  };
  return CustomWidget;
});
