import { QueryClient } from '@tanstack/react-query'
import { ApiError } from '@/services/api/http'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // Erros 4xx não melhoram ao repetir; falhas de rede/5xx ganham 1 nova tentativa.
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status !== null && error.status < 500) return false
        return failureCount < 1
      },
    },
  },
})
