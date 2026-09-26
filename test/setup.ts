import http from 'node:http'

// Supertest starts a throwaway server per request. Node 22's global agent keeps sockets
// alive, so a later request could reuse a pooled socket whose server has closed (and whose
// port another throwaway server now holds): ECONNRESET or a garbled response. Tests use
// fresh connections instead.
http.globalAgent = new http.Agent({ keepAlive: false })
