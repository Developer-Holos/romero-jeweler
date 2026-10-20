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
    // - El PDF, la IA y la plantilla compartida los resuelve el servidor del
    //   widget (carpeta server/ del repo), con la URL y la clave de los ajustes.

    var ROOT_ID = 'rj-invoice-root';

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
      onSave: function () { return true; },
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
      return { url: settings.proxy_url || '', clave: settings.widget_key || '' };
    };

    // ─── Tarjeta del lead ─────────────────────────────────────────────────────

    this.shellHtml = function () {
      return '<div id="' + ROOT_ID + '" class="rj-invoice">' +
        '<p class="rj-invoice__hint">' + self.esc(self.t('card_hint')) + '</p>' +
        '<button type="button" id="rj-invoice-abrir" class="rj-invoice__btn">' + self.esc(self.t('card_button')) + '</button>' +
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
        $(document).off('click.rjinvoice').on('click.rjinvoice', '#rj-invoice-abrir', self.abrir);
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

    this.abrir = function () {
      var servidor = self.servidor();
      if (!servidor.url || !servidor.clave) {
        self.status(self.t('error_settings'), 'error');
        return;
      }
      var $btn = $('#rj-invoice-abrir').prop('disabled', true);
      self.status(self.t('loading'), 'working');
      $.when(self.loadApp(), self.leadInfo())
        .done(function (app, lead) {
          self.status('');
          app.abrirGenerador({ lead: lead, servidor: servidor });
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
      if (!servidor.url || !servidor.clave) {
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
