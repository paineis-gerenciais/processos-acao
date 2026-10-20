// Datas e períodos. Funções puras, sem DOM e sem Firebase.
// Fuso de referência: America/Sao_Paulo, deslocamento fixo de -3 h (a mesma conta das regras de `retratos`).
// Modelo de dados, seções 4.1 e 4.7; arquitetura, seção 3.3.

export const DESLOCAMENTO_SP_MS = -3 * 60 * 60 * 1000;
const MS_DIA = 86400000;

/** Converte Date, número (ms), Timestamp do Firestore ({toMillis}) ou {seconds} em milissegundos; senão null. */
export function paraMs(valor) {
  if (valor === null || valor === undefined) return null;
  if (valor instanceof Date) return valor.getTime();
  if (typeof valor === 'number') return valor;
  if (typeof valor.toMillis === 'function') return valor.toMillis();
  if (typeof valor.seconds === 'number') return valor.seconds * 1000 + Math.floor((valor.nanoseconds ?? 0) / 1e6);
  return null;
}

/** Data de calendário (AAAA-MM-DD) em São Paulo. Única função de "hoje" do app e dos testes. */
export function dataSaoPaulo(agora = new Date()) {
  const ms = paraMs(agora);
  if (ms === null) return null;
  return new Date(ms + DESLOCAMENTO_SP_MS).toISOString().slice(0, 10);
}

/** Hora (hh:mm) em São Paulo. */
export function horaSaoPaulo(agora) {
  const ms = paraMs(agora);
  if (ms === null) return null;
  return new Date(ms + DESLOCAMENTO_SP_MS).toISOString().slice(11, 16);
}

/** "dd/mm/aaaa hh:mm" em São Paulo, ou null. */
export function dataHoraBR(agora) {
  const d = dataSaoPaulo(agora);
  if (!d) return null;
  return `${formatarDataBR(d)} ${horaSaoPaulo(agora)}`;
}

export function diasNoMes(ano, mes) {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

export function dataExiste(ano, mes, dia) {
  if (!Number.isInteger(ano) || !Number.isInteger(mes) || !Number.isInteger(dia)) return false;
  if (ano < 2000 || ano > 2100 || mes < 1 || mes > 12 || dia < 1) return false;
  return dia <= diasNoMes(ano, mes);
}

const RE_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isoValido(iso) {
  const m = typeof iso === 'string' ? RE_ISO.exec(iso) : null;
  return Boolean(m) && dataExiste(Number(m[1]), Number(m[2]), Number(m[3]));
}

/** "31/12/2026" -> "2026-12-31"; null se não for data de calendário (30/02 é recusada). */
export function parseDataBR(texto) {
  if (typeof texto !== 'string') return null;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(texto.trim());
  if (!m) return null;
  const dia = Number(m[1]);
  const mes = Number(m[2]);
  const ano = Number(m[3]);
  if (!dataExiste(ano, mes, dia)) return null;
  return `${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/** "2026-12-31" -> "31/12/2026". */
export function formatarDataBR(iso) {
  if (!isoValido(iso)) return '';
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

function diaNumero(iso) {
  const m = RE_ISO.exec(iso);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / MS_DIA;
}

/** Dias de a até b (b - a). */
export function diasEntre(a, b) {
  return Math.round(diaNumero(b) - diaNumero(a));
}

export function somarDias(iso, n) {
  return new Date((diaNumero(iso) + n) * MS_DIA).toISOString().slice(0, 10);
}

// ----- Períodos por frequência (ano civil) -----

export const FREQUENCIAS = {
  mensal: { meses: 1, rotulo: 'Mensal' },
  bimestral: { meses: 2, rotulo: 'Bimestral', letra: 'B' },
  trimestral: { meses: 3, rotulo: 'Trimestral', letra: 'T' },
};

export function frequenciaValida(f) {
  return Object.hasOwn(FREQUENCIAS, f);
}

/** Decompõe o id do período: { ano, n } ou null se fora do formato da frequência. */
export function lerPeriodo(freq, id) {
  if (!frequenciaValida(freq) || typeof id !== 'string') return null;
  const def = FREQUENCIAS[freq];
  const re = freq === 'mensal' ? /^(\d{4})-(\d{2})$/ : new RegExp(`^(\\d{4})-${def.letra}(\\d)$`);
  const m = re.exec(id);
  if (!m) return null;
  const ano = Number(m[1]);
  const n = Number(m[2]);
  if (ano < 2000 || ano > 2100) return null;
  if (n < 1 || n > 12 / def.meses) return null;
  return { ano, n };
}

export function montarPeriodo(freq, ano, n) {
  if (freq === 'mensal') return `${ano}-${String(n).padStart(2, '0')}`;
  return `${ano}-${FREQUENCIAS[freq].letra}${n}`;
}

export function periodoFormatoValido(freq, id) {
  return lerPeriodo(freq, id) !== null;
}

/** { inicio, fim } em ISO, ou null. */
export function limitesPeriodo(freq, id) {
  const p = lerPeriodo(freq, id);
  if (!p) return null;
  const { meses } = FREQUENCIAS[freq];
  const mesIni = (p.n - 1) * meses + 1;
  const mesFim = p.n * meses;
  const pad = (x) => String(x).padStart(2, '0');
  return {
    inicio: `${p.ano}-${pad(mesIni)}-01`,
    fim: `${p.ano}-${pad(mesFim)}-${pad(diasNoMes(p.ano, mesFim))}`,
  };
}

/** Id do período que contém a data ISO. */
export function periodoDaData(freq, iso) {
  if (!frequenciaValida(freq) || !isoValido(iso)) return null;
  const ano = Number(iso.slice(0, 4));
  const mes = Number(iso.slice(5, 7));
  return montarPeriodo(freq, ano, Math.ceil(mes / FREQUENCIAS[freq].meses));
}

export function proximoPeriodo(freq, id) {
  const p = lerPeriodo(freq, id);
  if (!p) return null;
  const max = 12 / FREQUENCIAS[freq].meses;
  return p.n < max ? montarPeriodo(freq, p.ano, p.n + 1) : montarPeriodo(freq, p.ano + 1, 1);
}

/** Um período iniciou quando seu início é menor ou igual a hoje. */
export function periodoIniciado(freq, id, hoje) {
  const l = limitesPeriodo(freq, id);
  return Boolean(l) && l.inicio <= hoje;
}

/** Um período encerrou quando hoje é maior que seu último dia. */
export function periodoEncerrado(freq, id, hoje) {
  const l = limitesPeriodo(freq, id);
  return Boolean(l) && hoje > l.fim;
}

/** Períodos de `de` a `ate` (inclusive), em ordem cronológica. */
export function periodosEntre(freq, de, ate) {
  const saida = [];
  let atual = de;
  let guarda = 0;
  while (atual && atual <= ate && guarda++ < 1000) {
    saida.push(atual);
    atual = proximoPeriodo(freq, atual);
  }
  return saida;
}

/** Períodos já iniciados, do mais recente ao mais antigo (para a lista do formulário). */
export function periodosPermitidos(freq, hoje, quantidade = 24) {
  const saida = [];
  let p = lerPeriodo(freq, periodoDaData(freq, hoje));
  if (!p) return saida;
  const max = 12 / FREQUENCIAS[freq].meses;
  while (saida.length < quantidade && p.ano >= 2000) {
    saida.push(montarPeriodo(freq, p.ano, p.n));
    p = p.n > 1 ? { ano: p.ano, n: p.n - 1 } : { ano: p.ano - 1, n: max };
  }
  return saida;
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** Rótulo para a tela: "nov/2026", "3º bim./2026", "2º tri./2026". */
export function rotuloPeriodo(freq, id) {
  const p = lerPeriodo(freq, id);
  if (!p) return String(id);
  if (freq === 'mensal') return `${MESES[p.n - 1]}/${p.ano}`;
  if (freq === 'bimestral') return `${p.n}º bim./${p.ano}`;
  return `${p.n}º tri./${p.ano}`;
}
