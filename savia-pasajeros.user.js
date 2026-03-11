// ==UserScript==
// @name         Savia - Pasajeros Ola & Mitika (Expeditus)
// @namespace    http://tampermonkey.net/
// @version      9.0
// @description  Extracción con reglas de ordenamiento ADL/INF/CHD y limpieza CUIT
// @author       Juan Lucas
// @match        http://www.savia3.com.ar:8080/savia/*
// @updateURL    https://raw.githubusercontent.com/jlucasgarcia/savia-pasajeros/main/savia-pasajeros.user.js
// @downloadURL  https://raw.githubusercontent.com/jlucasgarcia/savia-pasajeros/main/savia-pasajeros.user.js
// @grant        GM_setClipboard
// ==/UserScript==

(function() {
    'use strict';

    const clean = (s) => s.replace(/\D/g, '');

    const formatDoc = (tipo, num) => {
        const d = clean(num);
        return (tipo.includes("CUIT") || tipo.includes("CUIL")) ? d.substring(2, 10) : d;
    };

    const getRawData = () => {
        const rows = Array.from(document.querySelectorAll('.z-row, tr'));
        let paxs = [];
        rows.forEach(r => {
            const labels = Array.from(r.querySelectorAll('.z-label, .z-listcell-content'));
            if (labels.length >= 2 && (labels[0].innerText.includes("TIT") || labels[0].innerText.includes("ACO"))) {
                const parts = labels[1].innerText.split(' - ');
                const [ape, nom] = parts[0].split(', ').map(s => s.trim());
                const docInfo = parts[1] || "";
                const edadStr = labels[2]?.innerText || "";
                const nac = edadStr.match(/\((.*?)\)/)?.[1] || "";
                const edad = parseInt(edadStr.split(' ')[0]) || 0;

                paxs.push({
                    rol: labels[0].innerText.trim(),
                    nom, ape,
                    tipoDoc: docInfo.split(' ')[0] || "DNI",
                    numDoc: docInfo.split(' ')[1] || "",
                    nac, edad
                });
            }
        });
        return paxs;
    };

    const copiarOla = () => {
        const paxs = getRawData();
        const hoy = new Date();
        const v = { d: hoy.getDate().toString(), m: (hoy.getMonth()+1).toString(), y: (hoy.getFullYear()+2).toString() };

        // Regla OLA: 1. ADL (>12), 2. INF (0-1), 3. CHD (2-11)
        const ordenado = paxs.sort((a, b) => {
            const cat = (e) => e >= 12 ? 1 : (e <= 1 ? 2 : 3);
            return cat(a.edad) - cat(b.edad);
        });

        const out = {
            pasajeros: ordenado.map(p => {
                const [d, m, y] = p.nac.split('/');
                const item = {
                    nombre: p.nom, apellido: p.ape,
                    documento: formatDoc(p.tipoDoc, p.numDoc),
                    genero: p.nom.endsWith('A') ? "F" : "M",
                    nacimiento: { d: parseInt(d).toString(), m: parseInt(m).toString(), y },
                    vencDoc: v
                };
                if (p.tipoDoc.includes("CUIT")) item.cuit = clean(p.numDoc);
                return item;
            })
        };
        GM_setClipboard(JSON.stringify(out, null, 2));
        alert("JSON Pasajeros Ola copiado (" + out.pasajeros.length + " paxs)");
    };

    const copiarMitika = () => {
        const paxs = getRawData();
        // Regla Mitika: 1. TIT, 2. ACOs orden aparición, 3. Niños menor a mayor edad [cite: 311, 314]
        const adultos = paxs.filter(p => p.edad >= 18 || p.rol === "TIT").sort((a,b) => a.rol === "TIT" ? -1 : 0);
        const niños = paxs.filter(p => p.edad < 18 && p.rol !== "TIT").sort((a,b) => a.edad - b.edad);
        const final = [...adultos, ...niños];

        const out = {
            passengers: final.map((p, i) => ({
                nombre: p.nom, apellidos: p.ape,
                documentType: p.tipoDoc.includes("PAS") ? "PASSPORT" : "DNI",
                documentNumber: formatDoc(p.tipoDoc, p.numDoc),
                birthDate: p.nac,
                ...(i === 0 ? { country: "AR", email: "gmv.ludmila@gmail.com" } : {})
            }))
        };
        GM_setClipboard(JSON.stringify(out, null, 2));
        alert("JSON Pasajeros Mitika copiado (" + out.passengers.length + " paxs)");
    };

    const inyectar = () => {
        if (document.getElementById('exp-tools')) return;
        const c = document.createElement('div');
        c.id = 'exp-tools';
        c.style = "position:fixed; top:150px; right:20px; z-index:2147483647; display:flex; flex-direction:column; gap:10px;";

        const btn = (t, cl, fn) => {
            const b = document.createElement('button');
            b.innerText = t;
            b.style = `padding:12px; background:${cl}; color:white; border:none; border-radius:6px; font-weight:bold; cursor:pointer; box-shadow:0 2px 5px rgba(0,0,0,0.2);`;
            b.onclick = fn;
            return b;
        };

        c.appendChild(btn("Pasajeros Ola", "#E67E22", copiarOla));
        c.appendChild(btn("Pasajeros Mitika/Delfos/Tip", "#2980B9", copiarMitika));
        document.body.appendChild(c);
    };

    const obs = new MutationObserver(inyectar);
    obs.observe(document.body, { childList: true, subtree: true });
    inyectar();
})();
