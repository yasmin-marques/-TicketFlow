import type {
  CheckinResult,
  CheckinStats,
  OrgAttendee,
  OrgAttendeesResponse,
  OrgDashboard,
  OrgEvent,
  OrgEventInput,
  OrgEventsResponse,
  OrgEventStatus,
  OrgLot,
  OrgLotInput,
  OrgNotice,
  OrgOrder,
  OrgOrdersQuery,
  OrgPage,
  OrgReport,
  OrgSearchResults,
  OrgSeatMap,
  OrgSettings,
} from '@/types/organizer'
import { http } from './http'

const data = <T>(r: { data: T }) => r.data
const clean = <T extends object>(params: T) =>
  Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v !== undefined && v !== null))

/**
 * Serviço do painel do organizador. Todas as rotas exigem papel ORGANIZER
 * (o backend valida; o frontend só esconde as telas).
 */
export const orgService = {
  dashboard: (range: 7 | 30 | 90, eventId: string, signal?: AbortSignal) =>
    http.get<OrgDashboard>('/org/dashboard', { params: clean({ range, eventId }), signal }).then(data),

  report: (params: { eventId: string; from: string; to: string }, signal?: AbortSignal) =>
    http.get<OrgReport>('/org/reports', { params: clean(params), signal }).then(data),

  /* Eventos */
  events: (params: { status: OrgEventStatus | ''; q: string }, signal?: AbortSignal) =>
    http.get<OrgEventsResponse>('/org/events', { params: clean(params), signal }).then(data),
  event: (id: string, signal?: AbortSignal) => http.get<OrgEvent>(`/org/events/${id}`, { signal }).then(data),
  slugAvailable: (slug: string, exceptId?: string, signal?: AbortSignal) =>
    http.get<{ slug: string; available: boolean }>('/org/events/slug-available', { params: clean({ slug, exceptId }), signal }).then(data),
  createEvent: (input: Partial<OrgEventInput>) => http.post<OrgEvent>('/org/events', input).then(data),
  updateEvent: (id: string, input: Partial<OrgEventInput>) => http.patch<OrgEvent>(`/org/events/${id}`, input).then(data),
  publishEvent: (id: string) => http.post<OrgEvent>(`/org/events/${id}/publish`).then(data),
  unpublishEvent: (id: string) => http.post<OrgEvent>(`/org/events/${id}/unpublish`).then(data),
  cancelEvent: (id: string) => http.post<OrgEvent>(`/org/events/${id}/cancel`).then(data),
  deleteEvent: (id: string) => http.delete(`/org/events/${id}`).then(() => undefined),
  saveSeatMap: (id: string, seatMap: OrgSeatMap | null) => http.put<OrgEvent>(`/org/events/${id}/seat-map`, { seatMap }).then(data),

  /* Lotes */
  lots: (eventId: string, signal?: AbortSignal) => http.get<OrgLot[]>(`/org/events/${eventId}/lots`, { signal }).then(data),
  createLot: (eventId: string, input: OrgLotInput) => http.post<OrgLot>(`/org/events/${eventId}/lots`, input).then(data),
  updateLot: (id: string, input: Partial<OrgLotInput>) => http.patch<OrgLot>(`/org/lots/${id}`, input).then(data),
  deleteLot: (id: string) => http.delete(`/org/lots/${id}`).then(() => undefined),

  /* Pedidos */
  orders: (q: OrgOrdersQuery, signal?: AbortSignal) =>
    http.get<OrgPage<OrgOrder>>('/org/orders', { params: clean(q), signal }).then(data),
  refundOrder: (id: string) => http.post<OrgOrder>(`/org/orders/${id}/refund`).then(data),

  /* Participantes e check-in */
  attendees: (params: { eventId: string; q: string; status: string; page: number; pageSize: number }, signal?: AbortSignal) =>
    http.get<OrgAttendeesResponse>('/org/attendees', { params: clean(params), signal }).then(data),
  manualCheckin: (ticketId: string) => http.post<OrgAttendee>(`/org/attendees/${ticketId}/checkin`, { gate: 'Manual' }).then(data),
  undoCheckin: (ticketId: string) => http.delete<OrgAttendee>(`/org/attendees/${ticketId}/checkin`).then(data),
  checkinStats: (eventId: string, signal?: AbortSignal) => http.get<CheckinStats>(`/org/events/${eventId}/checkin`, { signal }).then(data),
  checkin: (eventId: string, code: string, gate: string) =>
    http.post<CheckinResult>(`/org/events/${eventId}/checkin`, { code, gate }).then(data),

  /* Configurações, avisos e busca */
  settings: (signal?: AbortSignal) => http.get<OrgSettings>('/org/settings', { signal }).then(data),
  updateSettings: (input: Partial<Omit<OrgSettings, 'members' | 'webhooks'>>) => http.patch<OrgSettings>('/org/settings', input).then(data),
  addMember: (input: { name: string; email: string; role: string }) => http.post<OrgSettings>('/org/members', input).then(data),
  removeMember: (id: string) => http.delete<OrgSettings>(`/org/members/${id}`).then(data),
  addWebhook: (input: { url: string; events: string[] }) => http.post<OrgSettings>('/org/webhooks', input).then(data),
  toggleWebhook: (id: string, active: boolean) => http.patch<OrgSettings>(`/org/webhooks/${id}`, { active }).then(data),
  removeWebhook: (id: string) => http.delete<OrgSettings>(`/org/webhooks/${id}`).then(data),
  notices: (signal?: AbortSignal) => http.get<OrgNotice[]>('/org/notifications', { signal }).then(data),
  markNoticesRead: () => http.post('/org/notifications/read').then(() => undefined),
  search: (q: string, signal?: AbortSignal) => http.get<OrgSearchResults>('/org/search', { params: { q }, signal }).then(data),
}
