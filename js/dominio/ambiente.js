// Escolha do ambiente de dados (R5). Funções puras: recebem o `location` e devolvem a decisão.
// Regra: fora de produção (máquina local) o painel nunca usa a configuração de produção por padrão. Ou conecta ao
// emulador, pedido de forma explícita com ?emulador=host:porta, ou não conecta.

/** Nome de host que aponta para a máquina local (inclui IPv6 e 0.0.0.0, que o navegador também aceita). */
export function ehHostLocal(hostname) {
  // Minúsculas, sem colchetes e sem ponto final (FQDN: "localhost." é o mesmo host).
  const h = String(hostname ?? '').trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/\.+$/, '');
  if (h === '' || h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h.includes(':')) return ipv6Local(h);
  return ipv4Local(h);
}

function ipv4Local(h) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (!m) return false;
  const p = m.slice(1).map(Number);
  if (p.some((n) => n > 255)) return false;
  return p[0] === 127 || p.every((n) => n === 0);
}

/** IPv6: ::1, :: e ::ffff:127.x.x.x (mapeado, em decimal ou hexadecimal), em qualquer grafia de zeros. */
function ipv6Local(h) {
  let s = h.split('%')[0];
  const fim = /^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/.exec(s);
  if (fim) {
    const p = fim[2].split('.').map(Number);
    if (p.some((n) => n > 255)) return false;
    s = fim[1] + ((p[0] << 8) | p[1]).toString(16) + ':' + ((p[2] << 8) | p[3]).toString(16);
  }
  if (!/^[0-9a-f:]+$/.test(s) || (s.match(/::/g) ?? []).length > 1) return false;
  const [a, b] = s.split('::');
  const esq = a ? a.split(':') : [];
  const dir = b === undefined ? [] : b ? b.split(':') : [];
  if (b === undefined && esq.length !== 8) return false;
  if (esq.length + dir.length > (b === undefined ? 8 : 7)) return false;
  const g = [...esq, ...Array(8 - esq.length - dir.length).fill('0'), ...dir];
  if (g.some((x) => x.length === 0 || x.length > 4)) return false;
  const n = g.map((x) => parseInt(x, 16));
  const zeros = (k) => n.slice(0, k).every((x) => x === 0);
  if (zeros(7) && (n[7] === 0 || n[7] === 1)) return true; // :: e ::1
  return zeros(5) && n[5] === 0xffff && (n[6] >> 8) === 127; // ::ffff:127.x.x.x
}

/** { host, porta } do emulador pedido por ?emulador=host:porta; null se ausente, mal formado ou fora da máquina local. */
export function parametroEmulador(localizacao) {
  const bruto = new URLSearchParams(localizacao.search).get('emulador');
  if (!bruto) return null;
  if (!['localhost', '127.0.0.1'].includes(localizacao.hostname)) return null;
  const m = /^(localhost|127\.0\.0\.1):(\d{2,5})$/.exec(bruto);
  return m ? { host: m[1], porta: Number(m[2]) } : null;
}

/**
 * Decide o ambiente: { tipo: 'emulador', host, porta } | { tipo: 'producao' } | { tipo: 'bloqueado' }.
 * 'bloqueado' = máquina local sem emulador explícito (ou com parâmetro inválido): não conecta a nada.
 */
export function escolherAmbiente(localizacao) {
  const emu = parametroEmulador(localizacao);
  if (emu) return { tipo: 'emulador', ...emu };
  if (ehHostLocal(localizacao.hostname)) return { tipo: 'bloqueado' };
  return { tipo: 'producao' };
}
