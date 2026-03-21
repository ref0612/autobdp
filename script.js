const BASE_URL = 'https://autobdp.onrender.com';

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

let pendientesPorCategoria = {};

function getHeaders(sucursalId) {
    return {
        'accept': 'application/json',
        'switched-user-id': sucursalId
    };
}

document.getElementById('consultarArqueo').addEventListener('click', async () => {
    const cuaId = document.getElementById('cuaId').value.trim();
    const sucursalId = document.getElementById('sucursal').value;
    const resultados = document.getElementById('resultados');

    if (!cuaId) { alert('Por favor, ingrese un número de arqueo.'); return; }

    resultados.innerHTML = '<p>Consultando...</p>';
    pendientesPorCategoria = {};

    const seccionEntregar = document.getElementById('seccionEntregar');
    seccionEntregar.classList.add('hidden');

    try {
        const res = await fetch(`${BASE_URL}/api/v2/reports/validate_bdp_scan?cua_id=${cuaId}&locale=es`, {
            method: 'GET',
            headers: getHeaders(sucursalId)
        });

        if (!res.ok) {
            const err = await res.json();
            const msg = err.errors || `Error ${res.status}`;
            if (typeof msg === 'string' && msg.toLowerCase().includes('punto de venta ya ha sido escaneado')) {
                resultados.innerHTML = '<p class="info">✅ El punto de venta ya ha sido escaneado. No hay pendientes.</p>';
                return;
            }
            throw new Error(msg);
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

            pendientesPorCategoria[key] = pendientes.length;

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

        seccionEntregar.classList.remove('hidden');
        document.getElementById('btnEntregar').dataset.cuaId = cuaId;
        document.getElementById('btnEntregar').dataset.sucursalId = sucursalId;
        checkEntregarButton();

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
        } catch { fail++; }
    }

    pendientesPorCategoria[key] = 0;
    statusEl.textContent = `✅ Completado: ${ok} ok, ${fail} fallidos.`;
    btn.textContent = 'Escaneado';
    btn.disabled = true;
    checkEntregarButton();
}

function checkEntregarButton() {
    const btnEntregar = document.getElementById('btnEntregar');
    if (!btnEntregar) return;
    const todosEscaneados = Object.values(pendientesPorCategoria).every(v => v === 0);
    btnEntregar.disabled = !todosEscaneados;
}

document.getElementById('btnEntregar').addEventListener('click', async () => {
    const btn = document.getElementById('btnEntregar');
    const cuaId = btn.dataset.cuaId;
    const sucursalId = btn.dataset.sucursalId;
    const statusEntregar = document.getElementById('statusEntregar');

    if (!confirm(`¿Confirmas entregar el arqueo ${cuaId}?`)) return;

    btn.disabled = true;
    statusEntregar.textContent = 'Entregando arqueo...';
    statusEntregar.className = 'entregar-status';

    try {
        const res = await fetch(`${BASE_URL}/api/v2/reports/update_deposit_status_bdp?locale=es`, {
            method: 'POST',
            headers: { ...getHeaders(sucursalId), 'content-type': 'application/json; charset=UTF-8' },
            body: JSON.stringify({ cua_id: cuaId })
        });

        const data = await res.json();
        if (data.success) {
            statusEntregar.textContent = `✅ Arqueo ${cuaId} entregado correctamente.`;
            statusEntregar.className = 'entregar-status ok';
            btn.textContent = 'Entregado';
        } else {
            throw new Error(data.errors || 'Error al entregar');
        }
    } catch (error) {
        console.error(error);
        statusEntregar.textContent = `❌ Error al entregar: ${error.message}`;
        statusEntregar.className = 'entregar-status error';
        btn.disabled = false;
    }
});