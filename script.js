const BASE_URL = 'http://localhost:3000';

const SUCURSALES = {
    '618': 'Terminal Alameda',
    '619': 'Terminal Pajaritos',
    '620': 'Los Andes',
    '622': 'Terminal Valparaíso',
    '627': 'Terminal Viña del Mar'
};

const CATEGORIAS = {
    confirmed_mot: 'Confirmed MOT',
    prepostponed: 'Prepostponed'
};

const BEARER = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMCIsInNjcCI6InVzZXIiLCJhdWQiOm51bGwsImlhdCI6MTc3Mzg0Mjg3OSwiZXhwIjoxNzc0MDU4ODc5LCJqdGkiOiI5OTE3MzEwZS03YzA3LTRkZWMtODI3Yi0yYTFlOWM2ZDFlNzYifQ.3uTWrsi4Se5-QdVAhbtCjAuyU_aJ67C9aVoGNCElfqo';

function getHeaders(sucursalId) {
    return {
        'accept': 'application/json',
        'authorization': `Bearer ${BEARER}`,
        'category_type': '1',
        'switched-user-id': sucursalId
    };
}

document.getElementById('consultarArqueo').addEventListener('click', async () => {
    const cuaId = document.getElementById('cuaId').value.trim();
    const sucursalId = document.getElementById('sucursal').value;
    const resultados = document.getElementById('resultados');

    if (!cuaId) {
        alert('Por favor, ingrese un número de arqueo.');
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

        resultados.innerHTML = '';

        for (const [key, label] of Object.entries(CATEGORIAS)) {
            const items = allData[key] || [];
            if (items.length === 0) continue;

            const section = document.createElement('div');
            section.className = 'categoria-section';
            section.innerHTML = `
                <div class="categoria-header">
                    <span class="categoria-titulo">${label}</span>
                    <span class="categoria-count">${items.length} pendientes</span>
                    <button class="btn-escanear" data-key="${key}">Escanear</button>
                </div>
                <p class="categoria-status" id="status-${key}"></p>
            `;
            resultados.appendChild(section);

            section.querySelector('.btn-escanear').addEventListener('click', () => {
                escanearCategoria(cuaId, sucursalId, key, items, section.querySelector(`#status-${key}`));
            });
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
}