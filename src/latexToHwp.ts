/** Strict, recursive translation. Unknown commands fail rather than changing the mathematics. */
export function latexToHwp(source: string): string {
  const tokens = source.match(/\\(?:[a-zA-Z]+|.)|\s+|[^\\\s]/g) ?? [];
  let i = 0;
  const skip = () => {
    while (tokens[i] && /^\s+$/.test(tokens[i])) i++;
  };
  const group = (): string => {
    skip();
    if (tokens[i] === '{') {
      i++;
      const value = sequence('}');
      if (tokens[i++] !== '}') throw Error('닫히지 않은 수식 괄호');
      return value;
    }
    if (i >= tokens.length) throw Error('수식의 인수가 없습니다');
    return atom();
  };
  const word = () => {
    skip();
    if (tokens[i++] !== '{') throw Error('환경 이름이 없습니다');
    let v = '';
    while (i < tokens.length && tokens[i] !== '}') v += tokens[i++];
    if (tokens[i++] !== '}') throw Error('닫히지 않은 환경 이름');
    return v;
  };
  const symbols: Record<string, string> = {
    times: 'times',
    cdot: 'cdot',
    div: 'div',
    pm: '+-',
    mp: '-+',
    le: '<=',
    leq: '<=',
    ge: '>=',
    geq: '>=',
    ne: '!=',
    neq: '!=',
    approx: 'approx',
    equiv: 'equiv',
    in: 'in',
    notin: 'notin',
    subset: 'subset',
    subseteq: 'subseteq',
    supset: 'supset',
    supseteq: 'supseteq',
    cup: 'cup',
    cap: 'cap',
    emptyset: 'emptyset',
    infty: 'inf',
    to: '->',
    rightarrow: '->',
    leftarrow: '<-',
    leftrightarrow: '<->',
    Rightarrow: '⇒',
    Leftarrow: '⇐',
    Leftrightarrow: '⇔',
    therefore: 'therefore',
    because: 'because',
    forall: 'forall',
    exists: 'exists',
    partial: 'partial',
    nabla: 'nabla',
    angle: 'angle',
    perp: 'bot',
    parallel: 'parallel',
    ldots: 'ldots',
    cdots: 'cdots',
    vdots: 'vdots',
    ddots: 'ddots',
    prime: "'",
    circ: 'CIRC',
    lbrace: 'LBRACE',
    rbrace: 'RBRACE',
    langle: 'LANGLE',
    rangle: 'RANGLE',
    vert: 'vert',
    mid: 'vert',
    sin: 'sin',
    cos: 'cos',
    tan: 'tan',
    cot: 'cot',
    sec: 'sec',
    csc: 'csc',
    log: 'log',
    ln: 'ln',
    exp: 'exp',
    lim: 'lim',
    limsup: 'limsup',
    liminf: 'liminf',
    max: 'max',
    min: 'min',
    sup: 'sup',
    inf: 'inf',
    sum: 'sum',
    prod: 'prod',
    int: 'int',
    iint: 'dint',
    iiint: 'tint',
    oint: 'oint',
    det: 'det',
    gcd: 'gcd',
    mod: 'mod',
    quad: '~~',
    qquad: '~~~~',
    enspace: '~',
    space: '~',
    alpha: 'alpha',
    beta: 'beta',
    gamma: 'gamma',
    delta: 'delta',
    epsilon: 'epsilon',
    varepsilon: 'varepsilon',
    zeta: 'zeta',
    eta: 'eta',
    theta: 'theta',
    vartheta: 'vartheta',
    iota: 'iota',
    kappa: 'kappa',
    lambda: 'lambda',
    mu: 'mu',
    nu: 'nu',
    xi: 'xi',
    pi: 'pi',
    rho: 'rho',
    sigma: 'sigma',
    tau: 'tau',
    upsilon: 'upsilon',
    phi: 'phi',
    varphi: 'varphi',
    chi: 'chi',
    psi: 'psi',
    omega: 'omega',
    Gamma: 'GAMMA',
    Delta: 'DELTA',
    Theta: 'THETA',
    Lambda: 'LAMBDA',
    Xi: 'XI',
    Pi: 'PI',
    Sigma: 'SIGMA',
    Upsilon: 'UPSILON',
    Phi: 'PHI',
    Psi: 'PSI',
    Omega: 'OMEGA',
  };
  const atom = (): string => {
    const t = tokens[i++];
    if (t === undefined) throw Error('완성되지 않은 수식');
    if (t === '{') {
      const v = sequence('}');
      if (tokens[i++] !== '}') throw Error('닫히지 않은 수식 괄호');
      return `{${v}}`;
    }
    if (t === '}') throw Error('짝이 맞지 않는 수식 괄호');
    if (t === '^' || t === '_') return `${t === '^' ? 'sup' : 'sub'} {${group()}}`;
    if (!t.startsWith('\\')) return t;
    const command = t.slice(1);
    if (['displaystyle', 'textstyle', 'scriptstyle', 'limits', 'nolimits'].includes(command)) return '';
    if (['frac', 'dfrac', 'tfrac'].includes(command)) {
      const a = group(),
        b = group();
      return `{${a}} over {${b}}`;
    }
    if (command === 'sqrt') {
      skip();
      if (tokens[i] === '[') {
        i++;
        const n = sequence(']');
        if (tokens[i++] !== ']') throw Error('닫히지 않은 제곱근');
        return `root {${n}} of {${group()}}`;
      }
      return `sqrt {${group()}}`;
    }
    if (
      [
        'text',
        'textrm',
        'mathrm',
        'operatorname',
        'mathbf',
        'mathit',
        'overline',
        'underline',
        'vec',
        'hat',
        'bar',
        'dot',
        'ddot',
      ].includes(command)
    ) {
      const value = group();
      if (['text', 'textrm'].includes(command)) {
        if(value.includes('"')) throw Error('큰따옴표를 포함한 수식 텍스트는 직접 변환할 수 없습니다');
        return `"${value}"`;
      }
      const prefix: Record<string, string> = {
        mathrm: 'rm',
        operatorname: 'rm',
        mathbf: 'bold',
        mathit: 'it',
        overline: 'overline',
        underline: 'underline',
        vec: 'vec',
        hat: 'hat',
        bar: 'bar',
        dot: 'dot',
        ddot: 'ddot',
      };
      return `${prefix[command]} {${value}}`;
    }
    if (command === 'left' || command === 'right') {
      skip();
      const d = tokens[i++];
      if (!d) throw Error('괄호가 없습니다');
      const delimiters: Record<string, string> = {
        '\\{': 'LBRACE',
        '\\}': 'RBRACE',
        '\\lbrace': 'LBRACE',
        '\\rbrace': 'RBRACE',
        '\\langle': 'LANGLE',
        '\\rangle': 'RANGLE',
        '\\vert': '|',
        '\\|': '||',
      };
      return `${command.toUpperCase()} ${delimiters[d] ?? d}`;
    }
    if (command === 'begin') {
      const env = word();
      if (!['cases', 'matrix', 'pmatrix', 'bmatrix', 'vmatrix', 'aligned'].includes(env))
        throw Error(`지원하지 않는 수식 환경: ${env}`);
      const body = sequence(undefined, true);
      if (tokens[i++] !== '\\end' || word() !== env) throw Error(`수식 환경의 짝이 맞지 않습니다: ${env}`);
      if (env === 'cases') return `cases {${body}}`;
      if (env === 'aligned') return `eqalign {${body}}`;
      const matrix = `matrix {${body}}`;
      return env === 'matrix'
        ? matrix
        : `LEFT ${env === 'pmatrix' ? '(' : env === 'bmatrix' ? '[' : '|'} ${matrix} RIGHT ${env === 'pmatrix' ? ')' : env === 'bmatrix' ? ']' : '|'}`;
    }
    if (command === '\\') return '#';
    if ([',', ';', ':', ' ', '!'].includes(command)) return command === '!' ? '' : '~';
    if (['{', '}', '%', '$', '_', '#', '&'].includes(command))
      return command === '{' ? 'LBRACE' : command === '}' ? 'RBRACE' : `"${command}"`;
    if (symbols[command]) return symbols[command];
    throw Error(`변환할 수 없는 LaTeX 명령: \\${command}`);
  };
  function sequence(stop?: string, environment = false): string {
    let value = '';
    while (i < tokens.length && tokens[i] !== stop && !(environment && tokens[i] === '\\end')) {
      if (/^\s+$/.test(tokens[i])) {
        value += ' ';
        i++;
      } else {
        const command = tokens[i].startsWith('\\') || ['^', '_'].includes(tokens[i]);
        const part = atom();
        value += command ? ` ${part} ` : part;
      }
    }
    return value.replace(/\s+/g, ' ').trim();
  }
  const result = sequence();
  if (!result) throw Error('비어 있는 수식');
  return result;
}
