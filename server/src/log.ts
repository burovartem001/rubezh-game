/** Журнал в формате JSON-строк. Пароли, токены и тела запросов не записываются. */
type Fields = Record<string, unknown>;
function write(level: string, msg: string, f?: Fields) {
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...f });
  if (level === 'error') console.error(line);
  else console.log(line);
}
export const log = {
  info: (m: string, f?: Fields) => write('info', m, f),
  warn: (m: string, f?: Fields) => write('warn', m, f),
  error: (m: string, f?: Fields) => write('error', m, f),
};
