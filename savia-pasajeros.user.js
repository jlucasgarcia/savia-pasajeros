// ==UserScript==
// @name         Expeditus · Extractor de Pasajeros (Delfos / Mitika / TipTravel)
// @namespace    https://github.com/jlucasgarcia/expeditus-passenger-extractor
// @version      6.1
// @description  Extrae pasajeros de reservas confirmadas y los copia como JSON al portapapeles. Compatible con Delfos, Mitika y TipTravel.
// @author       Expeditus Team
// @license      MIT
// @match        https://mitika.travel/secure/trip-detail.xhtml*
// @match        https://www.delfos.tur.ar/secure/trip-detail.xhtml*
// @match        https://www.tiptravelya.com/secure/trip-detail.xhtml*
// @grant        GM_setClipboard
// @grant        GM_addStyle
// @homepageURL  https://github.com/jlucasgarcia/expeditus-passenger-extractor
// @supportURL   https://github.com/jlucasgarcia/expeditus-passenger-extractor/issues
// @updateURL    https://raw.githubusercontent.com/jlucasgarcia/expeditus-passenger-extractor/main/expeditus-extractor.user.js
// @downloadURL  https://raw.githubusercontent.com/jlucasgarcia/expeditus-passenger-extractor/main/expeditus-extractor.user.js
// ==/UserScript==

(function() {
    'use strict';

    GM_addStyle(`
        #btn-extraer-rebooking-expeditus {
            position: fixed;
            bottom: 30px;
            left: 30px;
            z-index: 10000;
            background-color: #1A1A1A;
            color: #FFFFFF;
            border: 2px solid #000000;
            font-family: 'Segoe UI', sans-serif;
            font-size: 13px;
            font-weight: 700;
            letter-spacing: 1.2px;
            text-transform: uppercase;
            padding: 14px 24px;
            border-radius: 4px;
            cursor: pointer;
            box-shadow: 0 4px 0px #FF6D00;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        #btn-extraer-rebooking-expeditus:hover {
            background-color: #FF6D00;
            color: #1A1A1A;
            box-shadow: 0 2px 0px #000000;
            transform: translateY(2px);
        }
        #expeditus-toast {
            position: fixed;
            bottom: 90px;
            left: 30px;
            z-index: 10001;
            background: #1A1A1A;
            color: #FF6D00;
            font-family: 'Segoe UI', sans-serif;
            font-size: 12px;
            font-weight: 600;
            padding: 10px 18px;
            border-radius: 4px;
            display: none;
            border-left: 3px solid #FF6D00;
        }
    `);

    // ─── Estrategia Delfos ────────────────────────────────────────────────────
    // Estructura DOM:
    //   div.o-block__item
    //     span "Pasajero N"
    //     div > div.o-group > b "APELLIDO, NOMBRE"
    //     em "DNI"
    //     em "DD/MM/YYYY"
    //     em "email" (opcional)
    function extraerDelfos() {
        const pasajeros = [];

        document.querySelectorAll('div.o-block__item').forEach(bloque => {
            const spanPasajero = bloque.querySelector('span');
            if (!spanPasajero || !/Pasajero\s+\d+/i.test(spanPasajero.innerText)) return;

            const tagB = bloque.querySelector('b');
            if (!tagB) return;
            const nombreCompleto = tagB.innerText.trim();
            if (!nombreCompleto.includes(',')) return;

            const ems   = [...bloque.querySelectorAll('em')].map(e => e.innerText.trim());
            const dni   = ems.find(e => /^\d{7,9}$/.test(e));
            const fecha = ems.find(e => /^\d{2}\/\d{2}\/\d{4}$/.test(e));
            const email = ems.find(e => /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(e));

            if (!dni || !fecha) return;

            const partes   = nombreCompleto.split(',');
            const pasajero = {
                "nombre":         partes[1].trim().toUpperCase(),
                "apellidos":      partes[0].trim().toUpperCase(),
                "documentType":   "DNI",
                "documentNumber": dni,
                "country":        "AR",
                "birthDate":      fecha,
            };
            if (email) pasajero.email = email.toLowerCase();

            pasajeros.push(pasajero);
        });

        return pasajeros;
    }

    // ─── Estrategia Mitika / TipTravel ───────────────────────────────────────
    // Estructura DOM: bloques con texto multilinea
    //   "Pasajero N\nAPELLIDO, NOMBRE\nDNI DD/MM/YYYY"
    function extraerMitikaStyle() {
        const pasajeros = [];

        ['.o-block__item', '.ui-block-b', '.ui-grid-a'].forEach(selector => {
            document.querySelectorAll(selector).forEach(bloque => {
                const texto = bloque.innerText.trim();
                if (!texto.includes("Pasajero") || !/\d{2}\/\d{2}\/\d{4}/.test(texto)) return;

                const lineas      = texto.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                const lineaNombre = lineas.find(l => l.includes(',') && !l.includes('/') && !l.includes('@'));
                const lineaDatos  = lineas.find(l => /\d{7,9}/.test(l) && /\d{2}\/\d{2}\/\d{4}/.test(l));

                if (!lineaNombre || !lineaDatos) return;

                const partes     = lineaNombre.split(',');
                const datosMatch = lineaDatos.match(/(\d{7,9})\s+(\d{2}\/\d{2}\/\d{4})/);
                const emailMatch = texto.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);

                if (partes.length < 2 || !datosMatch) return;

                const pasajero = {
                    "nombre":         partes[1].trim().toUpperCase(),
                    "apellidos":      partes[0].trim().toUpperCase(),
                    "documentType":   "DNI",
                    "documentNumber": datosMatch[1],
                    "country":        "AR",
                    "birthDate":      datosMatch[2],
                };
                if (emailMatch) pasajero.email = emailMatch[0].toLowerCase();

                pasajeros.push(pasajero);
            });
        });

        return pasajeros;
    }

    // ─── Deduplicar por número de documento ──────────────────────────────────
    function deduplicar(lista) {
        const vistos = new Set();
        return lista.filter(p => {
            if (vistos.has(p.documentNumber)) return false;
            vistos.add(p.documentNumber);
            return true;
        });
    }

    // ─── Extraer según plataforma detectada ──────────────────────────────────
    function extraerJSON() {
        const host = location.hostname;
        let pasajeros = [];

        if (host.includes('delfos')) {
            pasajeros = extraerDelfos();
            if (pasajeros.length === 0) pasajeros = extraerMitikaStyle();
        } else {
            pasajeros = extraerMitikaStyle();
        }

        pasajeros = deduplicar(pasajeros);

        if (pasajeros.length === 0) {
            mostrarToast('⚠ No se encontraron pasajeros');
            return;
        }

        const json = JSON.stringify({ passengers: pasajeros }, null, 2);
        GM_setClipboard(json);
        mostrarToast(`✓ ${pasajeros.length} pasajero(s) copiado(s)`);
        console.log('[Expeditus] JSON copiado al portapapeles:\n', json);
    }

    // ─── Toast de feedback visual ─────────────────────────────────────────────
    function mostrarToast(msg) {
        let toast = document.getElementById('expeditus-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'expeditus-toast';
            document.body.appendChild(toast);
        }
        toast.textContent = msg;
        toast.style.display = 'block';
        setTimeout(() => { toast.style.display = 'none'; }, 3000);
    }

    // ─── Crear botón flotante ─────────────────────────────────────────────────
    function crearBoton() {
        if (document.getElementById('btn-extraer-rebooking-expeditus')) return;
        const btn = document.createElement('button');
        btn.id = 'btn-extraer-rebooking-expeditus';
        btn.innerHTML = '⬡ EXPEDITUS · COPIAR PASAJEROS';
        btn.addEventListener('click', extraerJSON);
        document.body.appendChild(btn);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', crearBoton);
    } else {
        crearBoton();
    }

})();
