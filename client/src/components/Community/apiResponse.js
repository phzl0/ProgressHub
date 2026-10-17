export async function readApiResponse(response) {
  if (response.status === 429) {
    const seconds = Number(response.headers?.get?.('Retry-After')) || 60;
    const error = new Error(`Muitas consultas em pouco tempo. Aguarde ${seconds} segundos e tente novamente. Seus dados foram preservados.`);
    error.status = 429; throw error;
  }
  let data;
  try { data = await response.json(); }
  catch (_) {
    const error = new Error('O servidor não respondeu como esperado. Tente novamente em instantes.');
    error.status = response.status; throw error;
  }
  if (!response.ok) { const error = new Error(data.error || 'Não foi possível concluir a solicitação.'); error.status = response.status; throw error; }
  return data;
}
