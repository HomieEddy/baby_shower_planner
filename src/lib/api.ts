const token = () => sessionStorage.getItem('admin_token');

export function adminFetch(url: string, options?: RequestInit): Promise<Response> {
  const t = token();
  return fetch(url, {
    ...options,
    headers: {
      ...options?.headers,
      ...(t ? { 'x-admin-token': t } : {}),
    },
  });
}

export function requireAuth(): boolean {
  return !!token();
}

export function logout() {
  sessionStorage.removeItem('admin_token');
}
