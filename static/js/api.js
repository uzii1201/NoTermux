const API = (() => {
  async function req(method, path, body) {
    const opts = { method, headers: {} };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(path, opts);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || 'Error desconocido');
    }
    return res.status === 204 ? null : res.json();
  }

  return {
    getSessions:   ()              => req('GET',    '/api/sessions'),
    createSession: (name, by)      => req('POST',   '/api/sessions', { name, created_by: by }),
    getSession:    (name)          => req('GET',    `/api/sessions/${name}`),
    deleteSession: (name)          => req('DELETE', `/api/sessions/${name}`),

    createNote:  (s, d) => req('POST',   `/api/sessions/${s}/notes`, d),
    updateNote:  (s, id, d) => req('PUT',    `/api/sessions/${s}/notes/${id}`, d),
    deleteNote:  (s, id) => req('DELETE', `/api/sessions/${s}/notes/${id}`),

    createTodo:  (s, d) => req('POST',   `/api/sessions/${s}/todos`, d),
    updateTodo:  (s, id, d) => req('PUT',    `/api/sessions/${s}/todos/${id}`, d),
    deleteTodo:  (s, id) => req('DELETE', `/api/sessions/${s}/todos/${id}`),
  };
})();
