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

    // Campos de producto de los leads en la cuenta romerojeweler (Ajustes → Campos).
    // Si un id no aparece en el lead (otra cuenta, campo recreado), se busca por nombre.
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
    var PESTANA_ORDEN = 'Orden de producción';
    var CAMPOS_ORDEN = [
      { clave: 'orden', nombre: 'Order #', tipo: 'text' },
      { clave: 'stuller', nombre: 'Stuller O.#', tipo: 'text' },
      { clave: 'nivoda', nombre: 'Nivoda O.#', tipo: 'text' },
      { clave: 'ancho', nombre: 'Width bottom', tipo: 'text' },
      { clave: 'grosor', nombre: 'Thickness', tipo: 'text' },
      { clave: 'peso', nombre: 'Est. Weight', tipo: 'text' },
      { clave: 'cabeza', nombre: 'Head style', tipo: 'text' },
      { clave: 'pdf', nombre: 'Orden de producción (PDF)', tipo: 'file' }
    ];
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
      return pagina(ruta + '?limit=250');
    };

    this.asegurarPestana = function (nombre) {
      return self.todos('/api/v4/leads/custom_fields/groups', 'custom_field_groups').then(function (grupos) {
        var g = grupos.filter(function (x) { return x.name === nombre; })[0];
        if (g) return g.id;
        return self.kommoApi('POST', '/api/v4/leads/custom_fields/groups', [{ name: nombre, sort: 500 }])
          .then(function (d) { return d._embedded.custom_field_groups[0].id; });
      });
    };

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

    // { orden: id, stuller: id, …, pdf: id } de la pestaña "Orden de producción".
    this.camposOrden = function () {
      return self.asegurarPestana(PESTANA_ORDEN).then(function (grupoId) {
        return self.asegurarCampos(grupoId, function (enPestana) {
          return CAMPOS_ORDEN.filter(function (c) {
            return !enPestana.some(function (x) { return x.name === c.nombre; });
          });
        });
      }).then(function (campos) {
        var ids = {};
        CAMPOS_ORDEN.forEach(function (c) {
          var campo = campos.filter(function (x) { return x.name === c.nombre; })[0];
          if (campo) ids[c.clave] = campo.id;
        });
        return ids;
      });
    };

    var numeroImagen = function (c) { return Number(c.name.slice(PREFIJO_IMAGEN.length)) || 0; };

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

    var valorEn = function (lead, campoId) {
      var c = (lead.custom_fields_values || []).filter(function (f) { return f.field_id === campoId; })[0];
      return c && c.values && c.values[0] ? c.values[0].value : null;
    };
    var ocupado = function (lead, campoId) {
      var v = valorEn(lead, campoId);
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

    // Valores de la pestaña "Orden de producción" del lead: { orden: '1146', ancho: '2mm', … }.
    this.valoresOrden = function (leadId) {
      return $.when(self.camposOrden(), self.kommoApi('GET', '/api/v4/leads/' + leadId)).then(function (ids, lead) {
        var valores = {};
        CAMPOS_ORDEN.forEach(function (c) {
          if (c.tipo !== 'text' || !ids[c.clave]) return;
          var v = valorEn(lead, ids[c.clave]);
          valores[c.clave] = v == null ? '' : String(v);
        });
        return valores;
      });
    };

    this.guardarValoresOrden = function (leadId, valores) {
      return self.camposOrden().then(function (ids) {
        var cuerpo = CAMPOS_ORDEN.filter(function (c) { return c.tipo === 'text' && ids[c.clave]; }).map(function (c) {
          var v = String(valores[c.clave] || '').trim();
          // Vacío: se borra el valor del campo en Kommo.
          return { field_id: ids[c.clave], values: v ? [{ value: v }] : null };
        });
        return self.kommoApi('PATCH', '/api/v4/leads/' + leadId, { custom_fields_values: cuerpo }).then(function () { return ids; });
      });
    };

    // Lo que la app (app.js) usa de Kommo. Devuelven promesas de jQuery, que la app espera con await.
    this.kommo = function () {
      return {
        campoImagenLibre: self.campoImagenLibre,
        valoresOrden: self.valoresOrden,
        guardarValoresOrden: self.guardarValoresOrden
      };
    };

    // Al instalar (y al guardar los ajustes): las dos pestañas con sus campos.
    this.prepararKommo = function () {
      $.when(self.camposOrden(), self.camposImagenes(IMAGENES_INICIALES)).fail(function (detalle) {
        console.warn('[rj-invoice] No se pudieron crear las pestañas en Kommo: ' + detalle);
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
