// api/index.js - Vercel Serverless Function entry point
const { handleRequest } = require('../server.js');

module.exports = async (req, res) => {
  return handleRequest(req, res);
};
