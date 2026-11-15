// api/index.js - Vercel Serverless Function entry point
let serverModule = null;

module.exports = async (req, res) => {
  try {
    if (!serverModule) {
      serverModule = require('../server.js');
    }
    return await serverModule.handleRequest(req, res);
  } catch (err) {
    console.error('Vercel Function Error:', err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: 'SERVERLESS_FUNCTION_ERROR',
        message: err.message,
        stack: err.stack
      }));
    }
  }
};
