const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();

app.use(cors());

app.use('/', createProxyMiddleware({
    target: 'https://api-costas.konnectpro.cl',
    changeOrigin: true,
    on: {
        proxyReq: (proxyReq) => {
            proxyReq.setHeader('x-api-key', 'QHH79qF2fsWEx98pvNeZpQ');
        }
    }
}));

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Proxy server running at http://localhost:${PORT}`);
});