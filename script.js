const BASE_URL = 'http://localhost:3000';

const SUCURSALES = {
    '618': 'Terminal Alameda',
    '619': 'Terminal Pajaritos',
    '620': 'Los Andes',
    '622': 'Terminal Valparaíso',
    '627': 'Terminal Viña del Mar'
};

const ETIQUETAS = {
    confirmed_mot: 'Confirmed MOT',
    prepostponed:  'Prepostponed',
    cancelled_mot: 'Cancelled MOT',
    confirmed_ot:  'Confirmed OT',
    expenses:      'Gastos',
    incomes:       'Ingresos',
    rectify:       'Rectificar',
    cancelled:     'Cancelados'
};

const DEFAULT_BEARER = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMCIsInNjcCI6InVzZXIiLCJhdWQiOm51bGwsImlhdCI6MTc3Mzg1OTMxNSwiZXhwIjoxNzc0MDc1MzE1LCJqdGkiOiIzMWUwZmFhMi1kZjE4LTQyNmItODM1ZS01MmNkYTBhOWM3M2MifQ.QHl5VAgQ31hWlntze5Xvodn5QOZpeHuH5X0_eh6-njk';

let currentBearer = localStorage.getItem('bearer') || DEFAULT_BEARER;

function getHeaders(sucursalId) {
    return {
        'accept': 'application/json',
        'authorization': `Bearer ${currentBearer}`,
        'category_type': '1',
        'switched-user-id': sucursalId
    };
}

function isTokenExpired(token) {
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return Date.now() / 1000 > payload.exp;
    } catch {
        return true;
    }
}

function getTokenExpiry(token) {
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return new Date(payload.exp * 1000);
    } catch {
        return null;
    }
}

function updateTokenStatus() {
    const statusEl = document.getElementById('tokenStatus');
    if (isTokenExpired(currentBearer)) {
        statusEl.textContent = '⚠️ Token expirado — actualízalo para continuar';
        statusEl.className = 'token-status expired';
    } else {
        const exp = getTokenExpiry(currentBearer);
        const diff = Math.round((exp - Date.now()) / 1000 / 3600);
        statusEl.textContent = `🟢 Token válido — expira en ${diff}h (${exp.toLocaleDateString('es-CL')} ${exp.toLocaleTimeString('es-CL', {hour: '2-digit', minute:'2-digit'})})`;
        statusEl.className = 'token-status valid';
    }
}

// Modal handlers
document.getElementById('btnActualizarToken').addEventListener('click', () => {
    document.getElementById('modalToken').classList.remove('hidden');
    document.getElementById('inputNuevoToken').value = '';
    document.getElementById('inputNuevoToken').focus();
});

document.getElementById('btnCancelarToken').addEventListener('click', () => {
    document.getElementById('modalToken').classList.add('hidden');
});

document.getElementById('btnGuardarToken').addEventListener('click', () => {
    const nuevoToken = document.getElementById('inputNuevoToken').value.trim();
    if (!nuevoToken) {
        alert('Por favor, ingresa el token.');
        return;
    }
    if (nuevoToken.split('.').length !== 3) {
        alert('El token no parece válido. Debe tener 3 partes separadas por puntos.');
        return;
    }
    if (isTokenExpired(nuevoToken)) {
        alert('⚠️ El token ingresado ya está expirado. Ingresa uno vigente.');
        return;
    }
    currentBearer = nuevoToken;
    localStorage.setItem('bearer', nuevoToken);
    document.getElementById('modalToken').classList.add('hidden');
    updateTokenStatus();
});

// Cerrar modal al hacer click fuera
document.getElementById('modalToken').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modalToken')) {
        document.getElementById('modalToken').classList.add('hidden');
    }
});

document.getElementById('consultarArqueo').addEventListener('click', async () => {
    const cuaId = document.getElementById('cuaId').value.trim();
    const sucursalId = document.getElementById('sucursal').value;
    const resultados = document.getElementById('resultados');

    if (!cuaId) {
        alert('Por favor, ingrese un número de arqueo.');
        return;
    }

    if (isTokenExpired(currentBearer)) {
        resultados.innerHTML = '<p class="error">⚠️ El token está expirado. Presiona "Actualizar Token" para continuar.</p>';
        return;
    }

    resultados.innerHTML = '<p>Consultando...</p>';

    try {
        const res = await fetch(`${BASE_URL}/api/v2/reports/validate_bdp_scan?cua_id=${cuaId}&locale=es`, {
            method: 'GET',
            headers: getHeaders(sucursalId)
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.errors || `Error ${res.status}`);
        }

        const data = await res.json();
        const allData = data.data.all_data;
        const scannedData = data.data.scanned_data || {};

        resultados.innerHTML = '';

        for (const [key, items] of Object.entries(allData)) {
            if (!items || items.length === 0) continue;

            const label = ETIQUETAS[key] || key;
            const scanned = scannedData[key] || [];
            const pendientes = items.filter(i => !scanned.includes(i));
            const todoEscaneado = pendientes.length === 0;

            const section = document.createElement('div');
            section.className = 'categoria-section';
            section.innerHTML = `
                <div class="categoria-header">
                    <span class="categoria-titulo">${label}</span>
                    <span class="categoria-count">
                        ${todoEscaneado
                            ? `<span class="badge-ok">✅ Todo escaneado (${items.length})</span>`
                            : `${pendientes.length} pendientes / ${scanned.length} escaneados`
                        }
                    </span>
                    ${!todoEscaneado
                        ? `<button class="btn-escanear" data-key="${key}">Escanear</button>`
                        : ''
                    }
                </div>
                <p class="categoria-status" id="status-${key}"></p>
            `;
            resultados.appendChild(section);

            if (!todoEscaneado) {
                section.querySelector('.btn-escanear').addEventListener('click', () => {
                    escanearCategoria(cuaId, sucursalId, key, pendientes, section.querySelector(`#status-${key}`));
                });
            }
        }

        if (!resultados.innerHTML) {
            resultados.innerHTML = '<p>No hay items pendientes.</p>';
        }

    } catch (error) {
        console.error(error);
        resultados.innerHTML = `<p class="error">❌ Error: ${error.message}</p>`;
    }
});

async function escanearCategoria(cuaId, sucursalId, key, items, statusEl) {
    const btn = document.querySelector(`[data-key="${key}"]`);
    btn.disabled = true;

    let ok = 0, fail = 0;

    for (let i = 0; i < items.length; i++) {
        statusEl.textContent = `Escaneando ${i + 1} de ${items.length}...`;

        try {
            const res = await fetch(`${BASE_URL}/api/v2/reports/bdp_onscan_update?locale=es`, {
                method: 'POST',
                headers: { ...getHeaders(sucursalId), 'content-type': 'application/json; charset=UTF-8' },
                body: JSON.stringify({ cua_id: cuaId, scan_type: key, scan_data: items[i] })
            });
            const data = await res.json();
            data.success ? ok++ : fail++;
        } catch {
            fail++;
        }
    }

    statusEl.textContent = `✅ Completado: ${ok} ok, ${fail} fallidos.`;
    btn.textContent = 'Escaneado';
    btn.disabled = true;
}

// Inicializar estado del token al cargar
updateTokenStatus();