import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { orgService } from '@/services/api/org.service'
import type { OrgEventStatus, OrgOrdersQuery } from '@/types/organizer'

/** Chaves do cache do painel (todas começam com 'org' para serem limpas ao sair). */
export const orgKeys = {
  all: ['org'] as const,
  dashboard: (range: number, eventId: string) => ['org', 'dashboard', range, eventId] as const,
  events: (status: string, q: string) => ['org', 'events', status, q] as const,
  event: (id: string) => ['org', 'event', id] as const,
  lots: (eventId: string) => ['org', 'lots', eventId] as const,
  orders: (q: OrgOrdersQuery) => ['org', 'orders', q] as const,
  attendees: (p: object) => ['org', 'attendees', p] as const,
  checkin: (eventId: string) => ['org', 'checkin', eventId] as const,
  report: (p: object) => ['org', 'report', p] as const,
  settings: () => ['org', 'settings'] as const,
  notices: () => ['org', 'notices'] as const,
  search: (q: string) => ['org', 'search', q] as const,
}

export function useOrgDashboard(range: 7 | 30 | 90, eventId: string) {
  return useQuery({
    queryKey: orgKeys.dashboard(range, eventId),
    queryFn: ({ signal }) => orgService.dashboard(range, eventId, signal),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  })
}

export function useOrgEvents(status: OrgEventStatus | '', q: string) {
  return useQuery({
    queryKey: orgKeys.events(status, q),
    queryFn: ({ signal }) => orgService.events({ status, q }, signal),
    placeholderData: keepPreviousData,
  })
}

export function useOrgEvent(id: string) {
  return useQuery({ queryKey: orgKeys.event(id), queryFn: ({ signal }) => orgService.event(id, signal), enabled: !!id })
}

export function useOrgLots(eventId: string) {
  return useQuery({ queryKey: orgKeys.lots(eventId), queryFn: ({ signal }) => orgService.lots(eventId, signal), enabled: !!eventId })
}

export function useOrgOrders(q: OrgOrdersQuery) {
  return useQuery({ queryKey: orgKeys.orders(q), queryFn: ({ signal }) => orgService.orders(q, signal), placeholderData: keepPreviousData })
}

export function useOrgAttendees(p: { eventId: string; q: string; status: string; page: number; pageSize: number }) {
  return useQuery({
    queryKey: orgKeys.attendees(p),
    queryFn: ({ signal }) => orgService.attendees(p, signal),
    placeholderData: keepPreviousData,
  })
}

export function useCheckinStats(eventId: string) {
  return useQuery({
    queryKey: orgKeys.checkin(eventId),
    queryFn: ({ signal }) => orgService.checkinStats(eventId, signal),
    enabled: !!eventId,
    refetchInterval: 15_000, // outros portões também registram entradas
  })
}

export function useOrgReport(p: { eventId: string; from: string; to: string }) {
  return useQuery({ queryKey: orgKeys.report(p), queryFn: ({ signal }) => orgService.report(p, signal), placeholderData: keepPreviousData })
}

export function useOrgSettings() {
  return useQuery({ queryKey: orgKeys.settings(), queryFn: ({ signal }) => orgService.settings(signal) })
}

export function useOrgNotices() {
  return useQuery({ queryKey: orgKeys.notices(), queryFn: ({ signal }) => orgService.notices(signal), refetchInterval: 60_000 })
}
