const BASE_URL = 'https://autobdp.fly.dev';

const ETIQUETAS = {
    confirmed_mot: 'Cupones Confirmados (MOT)',
    prepostponed:  'Cambios de Fecha',
    cancelled_mot: 'Cupones Cancelados (MOT)',
    confirmed_ot:  'Cupones Confirmados (OT)',
    expenses:      'Gastos',
    incomes:       'Ingresos',
    rectify:       'Anulaciones',
    cancelled:     'Boletos Cancelados'
};

let pendientesPorCategoria = {};

function getHeaders(sucursalId) {
    return {
        'accept': 'application/json',
        'switched-user-id': sucursalId
    };
}

function setLoading(msg) {
    document.getElementById('resultados').innerHTML = `
        <div class="msg loading">
            <div class="spinner"></div>
            ${msg}
        </div>`;
}

// Enter key en input
document.getElementById('cuaId').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('consultarArqueo').click();
});

document.getElementById('consultarArqueo').addEventListener('click', async () => {
    const cuaId = document.getElementById('cuaId').value.trim();
    const sucursalId = document.getElementById('sucursal').value;
    const resultados = document.getElementById('resultados');

    if (!cuaId) { alert('Por favor, ingrese un número de arqueo.'); return; }

    setLoading('Consultando arqueo...');
    pendientesPorCategoria = {};
    document.getElementById('seccionEntregar').classList.add('hidden');

    try {
        const res = await fetch(`${BASE_URL}/api/v2/reports/validate_bdp_scan?cua_id=${cuaId}&locale=es`, {
            method: 'GET',
            headers: getHeaders(sucursalId)
        });

        if (!res.ok) {
            const err = await res.json();
            const msg = err.errors || `Error ${res.status}`;
            if (typeof msg === 'string' && msg.toLowerCase().includes('punto de venta ya ha sido escaneado')) {
                resultados.innerHTML = '<div class="msg info">✅ El punto de venta ya ha sido escaneado. No hay pendientes.</div>';
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
            const pct = Math.round((scanned.length / items.length) * 100);

            pendientesPorCategoria[key] = pendientes.length;

            const section = document.createElement('div');
            section.className = `categoria-section${todoEscaneado ? ' completo' : ''}`;
            section.innerHTML = `
                <div class="categoria-header">
                    <span class="categoria-titulo">${label}</span>
                    <span class="categoria-count">
                        ${todoEscaneado
                            ? `<span class="badge-ok">✓ ${items.length} escaneados</span>`
                            : `<span class="badge-pendiente">${pendientes.length} pendientes</span>`
                        }
                    </span>
                    ${!todoEscaneado
                        ? `<button class="btn-scan" data-key="${key}">Escanear</button>`
                        : ''
                    }
                </div>
                ${!todoEscaneado ? `
                <div class="progress-bar">
                    <div class="progress-fill" style="width:${pct}%"></div>
                </div>` : ''}
                <p class="categoria-status" id="status-${key}"></p>
            `;
            resultados.appendChild(section);

            if (!todoEscaneado) {
                section.querySelector('.btn-scan').addEventListener('click', () => {
                    escanearCategoria(cuaId, sucursalId, key, items.length, pendientes, section);
                });
            }
        }

        if (!resultados.innerHTML) {
            resultados.innerHTML = '<div class="msg info">✅ No hay items pendientes.</div>';
        }

        document.getElementById('seccionEntregar').classList.remove('hidden');
        document.getElementById('btnEntregar').dataset.cuaId = cuaId;
        document.getElementById('btnEntregar').dataset.sucursalId = sucursalId;
        checkEntregarButton();

    } catch (error) {
        console.error(error);
        resultados.innerHTML = `<div class="msg error">❌ ${error.message}</div>`;
    }
});

async function escanearCategoria(cuaId, sucursalId, key, total, items, section) {
    const btn = section.querySelector('.btn-scan');
    const statusEl = section.querySelector(`#status-${key}`);
    const progressFill = section.querySelector('.progress-fill');
    btn.disabled = true;

    let ok = 0, fail = 0;

    for (let i = 0; i < items.length; i++) {
        const pct = Math.round(((i + 1) / items.length) * 100);
        statusEl.textContent = `Escaneando ${i + 1} de ${items.length}...`;
        if (progressFill) progressFill.style.width = `${pct}%`;

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
    section.classList.add('completo');

    // Reemplazar badge y barra
    const countEl = section.querySelector('.categoria-count');
    countEl.innerHTML = `<span class="badge-ok">✓ ${total} escaneados</span>`;
    if (progressFill) {
        progressFill.style.width = '100%';
        progressFill.classList.add('done');
    }

    statusEl.textContent = fail > 0 ? `✓ ${ok} ok · ${fail} fallidos` : `✓ Completado`;
    btn.remove();

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
    statusEntregar.textContent = 'Entregando...';
    statusEntregar.className = 'entregar-status';

    try {
        const res = await fetch(`${BASE_URL}/api/v2/reports/update_deposit_status_bdp?locale=es`, {
            method: 'POST',
            headers: { ...getHeaders(sucursalId), 'content-type': 'application/json; charset=UTF-8' },
            body: JSON.stringify({ cua_id: cuaId })
        });

        const data = await res.json();
        if (data.success) {
            statusEntregar.textContent = `✅ Arqueo ${cuaId} entregado.`;
            statusEntregar.className = 'entregar-status ok';
            btn.textContent = '✓ Entregado';
        } else {
            throw new Error(data.errors || 'Error al entregar');
        }
    } catch (error) {
        console.error(error);
        statusEntregar.textContent = `❌ ${error.message}`;
        statusEntregar.className = 'entregar-status error';
        btn.disabled = false;
    }
});