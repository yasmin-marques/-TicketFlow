/**
 * Ponte entre o cliente HTTP e a camada de autenticação, para o `http`
 * não depender de React. O `AuthProvider` registra os handlers ao iniciar.
 *
 * Contrato com a API real (JWT): `getAccessToken` devolve o JWT de acesso;
 * `refresh` chama `POST /auth/refresh` com o refresh token e devolve o novo
 * JWT (ou `null` se a sessão não puder ser renovada).
 */
interface AuthBridge {
  getAccessToken: () => string | null
  refresh: () => Promise<string | null>
  onSessionLost: () => void
}

export const authBridge: AuthBridge = {
  getAccessToken: () => null,
  refresh: async () => null,
  onSessionLost: () => undefined,
}
