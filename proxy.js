const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();

// Credenciales de login
const LOGIN_URL = 'https://api-costas.konnectpro.cl/api/v2/users/signin?is_system_side=false&locale=es';
const CREDENTIALS = { user: { login: 'owner', password: 'K0n$Sys@1001' } };
const API_KEY = 'QHH79qF2fsWEx98pvNeZpQ';

let cachedToken = null;
let tokenExpiry = 0;

async function getToken() {
    // Si el token es válido y quedan más de 10 minutos, reutilizarlo
    if (cachedToken && Date.now() < tokenExpiry - 10 * 60 * 1000) {
        return cachedToken;
    }

    console.log('Obteniendo nuevo token...');
    const res = await fetch(LOGIN_URL, {
        method: 'POST',
        headers: {
            'accept': 'application/json',
            'content-type': 'application/json; charset=UTF-8',
            'x-api-key': API_KEY,
            'category_type': '1'
        },
        body: JSON.stringify(CREDENTIALS)
    });

    const data = await res.json();
    cachedToken = data.data?.token;

    // Decodificar expiración del JWT
    const payload = JSON.parse(Buffer.from(cachedToken.split('.')[1], 'base64').toString());
    tokenExpiry = payload.exp * 1000;

    const expDate = new Date(tokenExpiry).toLocaleString('es-CL');
    console.log(`Token renovado. Expira: ${expDate}`);

    return cachedToken;
}

app.use(cors());

// Middleware que inyecta el token automáticamente
app.use(async (req, res, next) => {
    try {
        req.authToken = await getToken();
        next();
    } catch (err) {
        console.error('Error obteniendo token:', err);
        res.status(500).json({ error: 'No se pudo autenticar con la API' });
    }
});

app.use('/', createProxyMiddleware({
    target: 'https://api-costas.konnectpro.cl',
    changeOrigin: true,
    on: {
        proxyReq: (proxyReq, req) => {
            proxyReq.setHeader('x-api-key', API_KEY);
            proxyReq.setHeader('authorization', `Bearer ${req.authToken}`);
            proxyReq.setHeader('category_type', '1');
        }
    }
}));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Proxy server running at http://localhost:${PORT}`);
    // Login inicial al arrancar
    getToken().catch(console.error);
});