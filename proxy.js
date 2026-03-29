const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();

const LOGIN_URL = 'https://api-costas.konnectpro.cl/api/v2/users/signin?is_system_side=false&locale=es';
const CREDENTIALS = { user: { login: 'owner', password: 'K0n$Sys@1001' } };
const API_KEY = 'QHH79qF2fsWEx98pvNeZpQ';

let cachedToken = null;
let tokenExpiry = 0;

async function getToken() {
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
    const payload = JSON.parse(Buffer.from(cachedToken.split('.')[1], 'base64').toString());
    tokenExpiry = payload.exp * 1000;
    console.log(`Token renovado. Expira: ${new Date(tokenExpiry).toLocaleString('es-CL')}`);
    return cachedToken;
}

const corsOptions = {
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['content-type', 'accept', 'switched-user-id', 'authorization', 'category_type']
};

app.use(cors(corsOptions));

// Manejar preflight manualmente sin usar '*'
app.use((req, res, next) => {
    if (req.method === 'OPTIONS') {
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.set('Access-Control-Allow-Headers', 'content-type, accept, switched-user-id, authorization, category_type');
        return res.sendStatus(200);
    }
    next();
});

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

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Proxy server running at http://localhost:${PORT}`);
    getToken().catch(console.error);
});