// Axios API client - the code twin of the "Axios API Client (attaches JWT
// header)" box in the architecture diagram.
//
// The token lives in localStorage under one key; a request interceptor
// attaches it as Authorization: Bearer on every call, and a response
// interceptor clears it when the server answers 401 for a request that
// carried a token (expired or invalidated session), notifying the app via
// a window event so the auth context can drop the user.
import axios from 'axios';

const TOKEN_KEY = 'fitness_platform_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401 && getToken()) {
      setToken(null);
      window.dispatchEvent(new Event('auth:logout'));
    }
    return Promise.reject(error);
  }
);

export default api;
