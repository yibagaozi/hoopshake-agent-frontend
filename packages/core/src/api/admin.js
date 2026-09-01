import { http } from '../http.js'

/** §13 知识库管理 /api/admin/knowledge · ADMIN */
export const knowledgeApi = {
  create: (payload) => http.post('/api/admin/knowledge/documents', payload),
  list: (page = 0, size = 20) => http.get('/api/admin/knowledge/documents', { page, size }),
  detail: (docId) => http.get(`/api/admin/knowledge/documents/${docId}`),
  remove: (docId) => http.delete(`/api/admin/knowledge/documents/${docId}`),
  reindex: (docId) => http.post(`/api/admin/knowledge/documents/${docId}/reindex`),
  search: (query, topK = 5) => http.post('/api/admin/knowledge/search', { query, topK }),
}
