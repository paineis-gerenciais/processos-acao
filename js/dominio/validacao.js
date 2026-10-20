// Validação de campos, medições e limites (modelo de dados, seções 2 a 5). Funções puras.
import {
  analisarNumero, calcularValor, STATUS, POLARIDADES, UNIDADES, paraCentesimos,
} from './calculos.js';
import {
  parseDataBR, formatarDataBR, frequenciaValida, FREQUENCIAS, periodoFormatoValido, periodoIniciado,
} from './periodos.js';

export const LIMITES_ITENS = { melhorias: 30, acoes: 100, indicadores: 20, medicoes: 120 };

// Controles C0/DEL e, por R10, os de largura zero e de direção do texto (U+200B-U+200F, U+202A-U+202E, U+2066-U+2069),
// que permitiriam disfarçar o texto exibido.
// eslint-disable-next-line no-control-regex
export const RE_CONTROLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/;

/** Comparação de nomes sem maiúsculas, acentos e espaços repetidos. */
export function normalizarNome(texto) {
  return String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Especificação dos campos editáveis, por entidade. */
export const CAMPOS = {
  processo: {
    nome: { tipo: 'texto', max: 120, obrigatorio: true, unico: 'processo' },
    dono: { tipo: 'texto', max: 120 },
    embaixador: { tipo: 'texto', max: 120 },
  },
  melhoria: {
    nome: { tipo: 'texto', max: 200, obrigatorio: true, unico: 'melhoria' },
  },
  acao: {
    acao: { tipo: 'texto', max: 500, obrigatorio: true },
    responsavel: { tipo: 'texto', max: 120 },
    prazo: { tipo: 'data' },
    comoSeVerifica: { tipo: 'texto', max: 500 },
    status: { tipo: 'lista', valores: STATUS },
  },
  indicador: {
    nome: { tipo: 'texto', max: 200, obrigatorio: true },
    formula: { tipo: 'texto', max: 500 },
    oQueMede: { tipo: 'texto', max: 500 },
    responsavel: { tipo: 'texto', max: 120 },
    fonte: { tipo: 'texto', max: 300 },
    polaridade: { tipo: 'lista', valores: POLARIDADES },
    frequencia: { tipo: 'lista', valores: Object.keys(FREQUENCIAS), travaComMedicoes: true },
    unidade: { tipo: 'lista', valores: UNIDADES, travaComMedicoes: true },
    linhaBase: { tipo: 'numero' },
    linhaBaseReferencia: { tipo: 'data', naoFutura: true },
    meta: { tipo: 'numero' },
    prazoMeta: { tipo: 'data' },
  },
};

/**
 * Valida o texto digitado de um campo.
 * ctx: { hoje, outrosNomes: string[] (para unicidade), medicoesAtivas: number }
 * Retorna { ok, valor } com o valor a gravar (null quando vazio), ou { ok:false, erro }.
 */
export function validarCampo(entidade, campo, textoBruto, ctx = {}) {
  const def = CAMPOS[entidade]?.[campo];
  if (!def) return { ok: false, erro: 'Campo desconhecido.' };
  const texto = typeof textoBruto === 'string' ? textoBruto.trim() : '';

  if (def.travaComMedicoes && (ctx.medicoesAtivas ?? 0) > 0) {
    return { ok: false, erro: `Exclua as medições antes de mudar ${campo === 'frequencia' ? 'a frequência' : 'a unidade'}.` };
  }

  if (def.tipo === 'texto') {
    if (texto === '') {
      return def.obrigatorio ? { ok: false, erro: 'Informe o nome.' } : { ok: true, valor: null };
    }
    if (RE_CONTROLE.test(texto)) return { ok: false, erro: 'O texto tem caracteres que o painel não aceita.' };
    if (texto.length > def.max) return { ok: false, erro: `Máximo de ${def.max} caracteres. Você usou ${texto.length}.` };
    if (def.unico) {
      const alvo = normalizarNome(texto);
      if ((ctx.outrosNomes ?? []).some((n) => normalizarNome(n) === alvo)) {
        return {
          ok: false,
          erro: def.unico === 'processo'
            ? 'Já existe um processo com este nome.'
            : 'Já existe uma melhoria com este nome neste processo.',
        };
      }
    }
    return { ok: true, valor: texto };
  }

  if (def.tipo === 'data') {
    if (texto === '') return { ok: true, valor: null };
    const iso = parseDataBR(texto);
    if (!iso) return { ok: false, erro: 'Data inválida. Use dia/mês/ano, por exemplo 31/12/2026.' };
    if (def.naoFutura && ctx.hoje && iso > ctx.hoje) return { ok: false, erro: 'A data não pode ser no futuro.' };
    return { ok: true, valor: iso };
  }

  if (def.tipo === 'numero') {
    const r = analisarNumero(texto);
    if (!r.ok) return { ok: false, erro: r.erro };
    return { ok: true, valor: r.vazio ? null : r.valor };
  }

  if (def.tipo === 'lista') {
    if (texto === '') return { ok: true, valor: null };
    if (!def.valores.includes(texto)) return { ok: false, erro: 'Escolha uma das opções da lista.' };
    return { ok: true, valor: texto };
  }
  return { ok: false, erro: 'Campo desconhecido.' };
}

/** Texto exibido (e comparado) de um valor armazenado, por tipo de campo. */
export function textoDoValor(def, valor) {
  if (valor === null || valor === undefined) return '';
  if (def.tipo === 'data') return formatarDataBR(valor);
  if (def.tipo === 'numero') return (paraCentesimos(valor) / 100).toFixed(2).replace('.', ',');
  return String(valor);
}

/** Verifica se cabe mais um item no mapa (limites por documento; itens excluídos ocupam vaga até a purga). */
export function podeAdicionar(tipo, ocupados) {
  const limite = LIMITES_ITENS[tipo];
  if (ocupados < limite) return { ok: true };
  const nomes = { melhorias: 'melhorias', acoes: 'ações', indicadores: 'indicadores', medicoes: 'medições' };
  return {
    ok: false,
    erro: `Limite de ${limite} ${nomes[tipo]} atingido. Itens excluídos ocupam vaga por até 35 dias.`,
  };
}

/** Valida a criação ou edição de uma medição. */
export function validarMedicao(entrada, ctx) {
  const erros = {};
  const avisos = [];
  const { frequencia, unidade, hoje } = ctx;
  const existentes = ctx.existentes ?? [];

  if (!frequenciaValida(frequencia)) {
    erros.periodo = 'Escolha a frequência na ficha para registrar medições.';
  } else if (!periodoFormatoValido(frequencia, entrada.periodo)) {
    erros.periodo = 'Escolha um período.';
  } else if (!periodoIniciado(frequencia, entrada.periodo, hoje)) {
    erros.periodo = 'Este período ainda não começou.';
  } else if (!ctx.edicao && existentes.includes(entrada.periodo)) {
    erros.periodo = 'Já existe medição para este período. Edite a existente.';
  }

  const calculado = unidade === 'percentual' && entrada.modo === 'calculado';
  let dados = { numerador: null, denominador: null, valor: null };
  if (calculado) {
    const n = analisarNumero(entrada.numerador);
    const d = analisarNumero(entrada.denominador);
    if (!n.ok) erros.numerador = n.erro;
    if (!d.ok) erros.denominador = d.erro;
    if (n.ok && d.ok) {
      if (n.vazio || d.vazio) {
        if (n.vazio) erros.numerador = 'Informe numerador e denominador, ou use o valor direto.';
        if (d.vazio) erros.denominador = 'O denominador precisa ser maior que zero.';
      } else if (d.valor <= 0) {
        erros.denominador = 'O denominador precisa ser maior que zero.';
      } else {
        dados = { numerador: n.valor, denominador: d.valor, valor: calcularValor(n.valor, d.valor) };
      }
    }
  } else {
    const v = analisarNumero(entrada.valor);
    if (!v.ok) erros.valor = v.erro;
    else if (v.vazio) erros.valor = 'Informe o valor.';
    else dados = { numerador: null, denominador: null, valor: v.valor };
  }
  if (!Object.keys(erros).length && unidade === 'percentual' && dados.valor > 100) {
    avisos.push('O valor passa de 100%. Confira se digitou 82,5 e não 0,825, ou se o numerador é maior que o denominador.');
  }
  return { ok: Object.keys(erros).length === 0, erros, dados, avisos };
}

/** Avisos que não bloqueiam (QD-09 a QD-11), sobre os valores gravados do indicador. */
export function avisosIndicador(ind) {
  const avisos = [];
  const percentual = ind.unidade === 'percentual';
  if (percentual && ((ind.linhaBase ?? 0) > 100 || (ind.meta ?? 0) > 100)) {
    avisos.push('Linha de base ou meta acima de 100% em indicador percentual. Confira os valores.');
  }
  if (ind.linhaBase !== null && ind.linhaBase !== undefined && ind.meta !== null && ind.meta !== undefined) {
    const b = paraCentesimos(ind.linhaBase);
    const m = paraCentesimos(ind.meta);
    if ((ind.polaridade === 'maior_melhor' && m <= b) || (ind.polaridade === 'menor_melhor' && m >= b)) {
      avisos.push('A meta é igual ou pior que a linha de base na polaridade escolhida. Atingi-la não demonstraria ganho.');
    }
  }
  if (ind.prazoMeta && ind.linhaBaseReferencia && ind.prazoMeta < ind.linhaBaseReferencia) {
    avisos.push('O prazo da meta é anterior à referência da linha de base.');
  }
  return avisos;
}
